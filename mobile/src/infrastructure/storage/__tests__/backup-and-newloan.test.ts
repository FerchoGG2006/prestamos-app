/**
 * Pruebas de regresión para:
 * 1. Fidelidad 100% de exportación/restauración de respaldo JSON (incluyendo routes + initialCashBase y users).
 * 2. Desembolso de créditos nuevos financiados con recaudo en app (caso fbv-production-reconciliation).
 * 3. Conservación patrimonial tras cobros y desembolsos en la cartera base ($6.126.000 / $5.916.000 / $210.000).
 */

import { localStore, DEFAULT_OFFICE_CONFIG } from '../local-store';
import type { Customer, Installment, Loan, Payment, Route, User } from '../../../core/domain/types';

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
  }
}

async function testFullBackupRoundTripWithRoutesAndBase() {
  const today = '2026-11-19';
  const routeId = 'route-fbv-backup';

  const route: Route = {
    id: routeId,
    name: 'Ruta Principal FBV',
    code: 'FBV-01',
    collectorId: 'usr-col-fbv',
    isActive: true,
    initialCashBase: 210000,
    targetAdministrative: 0,
    expectedCustomersCount: 1,
    createdAt: today,
  };

  const user: User = {
    id: 'usr-col-fbv',
    name: 'Cobrador FBV',
    username: 'cobrador.fbv',
    password: 'hash-test-user',
    email: 'cobrador@fbv.local',
    role: 'COLLECTOR',
    phone: '3001112233',
    isActive: true,
    assignedRouteIds: [routeId],
    createdAt: today,
  };

  const customer: Customer = {
    id: 'cust-fbv-1',
    fullName: 'Cliente Cartera Activa',
    documentNumber: '900100100',
    phone: '3001234567',
    address: 'Calle 10',
    neighborhood: 'Centro',
    city: 'Barranquilla',
    references: [],
    occupation: 'Comerciante',
    status: 'ACTIVE',
    routeId,
    assignedCollectorId: user.id,
    createdAt: today,
    updatedAt: today,
  };

  const loan: Loan = {
    id: 'loan-fbv-1',
    loanNumber: '#00101',
    customerId: customer.id,
    routeId,
    collectorId: user.id,
    principal: 4930000,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 986000,
    totalAgreed: 5916000,
    installmentCount: 30,
    installmentAmount: 197200,
    frequency: 'DAILY',
    startDate: today,
    endDate: '2026-12-24',
    status: 'ACTIVE',
    notes: 'Migrado de cartulina física a digital (0/30 cuotas pagadas en papel)',
    createdAt: today,
    updatedAt: today,
  };

  const installment: Installment = {
    id: 'inst-fbv-1',
    loanId: loan.id,
    installmentNumber: 1,
    dueDate: '2026-11-20',
    expectedAmount: 5916000,
    paidAmount: 0,
    pendingAmount: 5916000,
    status: 'PENDIENTE',
  };

  await localStore.saveUsersAndRoutes([user], [route]);
  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      users: [user],
      routes: [route],
      customers: [customer],
      loans: [loan],
      installments: [installment],
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
      nonPaymentVisits: [],
      auditLogs: [],
      officeConfig: { ...DEFAULT_OFFICE_CONFIG, paperworkFeeEnabled: false },
    })
  );

  const beforeExport = localStore.getDailyRouteMetrics(today, routeId);
  assertEqual(beforeExport.activeCapitalInStreet, 5916000, 'Cartera antes de exportar');
  assertEqual(beforeExport.cashAvailableInHand, 210000, 'Base antes de exportar');
  assertEqual(beforeExport.totalAdministrativeCapital, 6126000, 'Admin antes de exportar');

  // Exportar respaldo completo JSON desde "PC/localhost"
  const exportedJson = localStore.exportFullBackupJSON();

  // Simular dispositivo destino ("iPhone") con base y rutas diferentes
  const emptyRoute: Route = { ...route, initialCashBase: 0 };
  await localStore.saveUsersAndRoutes([], [emptyRoute]);
  await localStore.clearPortfolioToEmpty();

  // Restaurar en el dispositivo destino
  const restored = await localStore.restoreFullBackupJSON(exportedJson);
  assertEqual(restored.customersCount, 1, 'Clientes restaurados');
  assertEqual(restored.loansCount, 1, 'Créditos restaurados');

  const afterRestore = localStore.getDailyRouteMetrics(today, routeId);
  assertEqual(afterRestore.activeCapitalInStreet, 5916000, 'Cartera tras restaurar respaldo');
  assertEqual(afterRestore.cashAvailableInHand, 210000, 'Base tras restaurar respaldo (initialCashBase conservada)');
  assertEqual(afterRestore.totalAdministrativeCapital, 6126000, 'Admin tras restaurar respaldo');
  assertEqual(localStore.getRoutes()[0].initialCashBase || 0, 210000, 'Ruta restaurada conserva initialCashBase');
  assertEqual(localStore.getUsers().length, 1, 'Usuarios restaurados');

  // Cobrar $18.000 y luego $100.000 en efectivo, y después desembolsar préstamo nuevo de $250.000 (para $300.000)
  await localStore.recordPayment({
    loanId: loan.id,
    amountReceived: 18000,
    paymentMethod: 'CASH',
    collectorId: user.id,
    todayStr: today,
    idempotencyKey: 'pay-fbv-18k',
  });
  const afterPay1 = localStore.getDailyRouteMetrics(today, routeId);
  assertEqual(afterPay1.activeCapitalInStreet, 5898000, 'Cartera tras cobro $18.000');
  assertEqual(afterPay1.cashAvailableInHand, 228000, 'Base tras cobro $18.000');
  assertEqual(afterPay1.totalAdministrativeCapital, 6126000, 'Admin intacto tras cobro $18.000');

  await localStore.recordPayment({
    loanId: loan.id,
    amountReceived: 100000,
    paymentMethod: 'CASH',
    collectorId: user.id,
    todayStr: today,
    idempotencyKey: 'pay-fbv-100k',
  });
  const afterPay2 = localStore.getDailyRouteMetrics(today, routeId);
  assertEqual(afterPay2.cashAvailableInHand, 328000, 'Base tras cobro $100.000');
  assertEqual(afterPay2.totalAdministrativeCapital, 6126000, 'Admin intacto tras cobro $100.000');

  const newCust = await localStore.createCustomer({
    fullName: 'Cliente Nuevo Desembolso',
    documentNumber: '900200200',
    phone: '3009998877',
    address: 'Calle 20',
    neighborhood: 'Norte',
    routeId,
    todayStr: today,
  });

  await localStore.createLoan({
    customerId: newCust.id,
    principal: 250000,
    interestRate: 0.2,
    installmentCount: 1,
    frequency: 'MONTHLY',
    routeId,
    collectorId: user.id,
    todayStr: today,
    isCardMigration: false,
  });

  const afterNewLoan = localStore.getDailyRouteMetrics(today, routeId);
  assertEqual(afterNewLoan.cashAvailableInHand, 78000, 'Base descuenta el 100% del crédito nuevo ($328k - $250k)');
  assertEqual(afterNewLoan.activeCapitalInStreet, 6098000, 'Cartera suma $300k del crédito nuevo');
  assertEqual(afterNewLoan.totalAdministrativeCapital, 6176000, 'Admin sube únicamente los $50k de interés');
}

async function testFbvProductionReconciliationScenario() {
  const routeId = 'route-fbv-reconcile';
  const collectorId = 'col-fbv';
  const route: Route = {
    id: routeId,
    name: 'Ruta FBV Conciliación',
    code: 'FBV-R',
    collectorId,
    isActive: true,
    initialCashBase: 0,
    targetAdministrative: 0,
    expectedCustomersCount: 1,
    createdAt: '2026-11-16',
  };

  const customer: Customer = {
    id: 'cust-mig-1',
    fullName: 'Cliente Migrado FBV',
    documentNumber: '111222333',
    phone: '3000000001',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Barranquilla',
    references: [],
    occupation: 'Comerciante',
    status: 'ACTIVE',
    routeId,
    assignedCollectorId: collectorId,
    createdAt: '2026-11-16',
    updatedAt: '2026-11-16',
  };

  // Fixture exacto de fbv-production-reconciliation:
  // Total 5.851.000, pendiente al 17-11: 5.626.000, pagado acumulado: 225.000 (126.000 papel + 99.000 app)
  const migratedLoan: Loan = {
    id: 'loan-mig-fbv',
    loanNumber: '#00100',
    customerId: customer.id,
    routeId,
    collectorId,
    principal: 4875833,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 975167,
    totalAgreed: 5851000,
    installmentCount: 2,
    installmentAmount: 2925500,
    frequency: 'DAILY',
    startDate: '2026-11-01',
    endDate: '2026-12-01',
    status: 'ACTIVE',
    notes: 'Migrado de cartulina física a digital',
    createdAt: '2026-11-16',
    updatedAt: '2026-11-17',
  };

  const installments: Installment[] = [
    {
      id: 'inst-mig-1',
      loanId: migratedLoan.id,
      installmentNumber: 1,
      dueDate: '2026-11-16',
      expectedAmount: 225000,
      paidAmount: 225000,
      pendingAmount: 0,
      status: 'PAGADA',
      lastPaymentDate: '2026-11-17',
    },
    {
      id: 'inst-mig-2',
      loanId: migratedLoan.id,
      installmentNumber: 2,
      dueDate: '2026-11-25',
      expectedAmount: 5626000,
      paidAmount: 0,
      pendingAmount: 5626000,
      status: 'PENDIENTE',
    },
  ];

  const priorPayments: Payment[] = [
    {
      id: 'pay-nov16',
      idempotencyKey: 'idem-nov16',
      loanId: migratedLoan.id,
      customerId: customer.id,
      collectorId,
      sessionId: 'ses-nov16',
      amountReceived: 24000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [],
      status: 'COMPLETED',
      createdAt: '2026-11-16 10:00:00',
    },
    {
      id: 'pay-nov17',
      idempotencyKey: 'idem-nov17',
      loanId: migratedLoan.id,
      customerId: customer.id,
      collectorId,
      sessionId: 'ses-nov17',
      amountReceived: 75000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [],
      status: 'COMPLETED',
      createdAt: '2026-11-17 11:00:00',
    },
  ];

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      routes: [route],
      customers: [customer],
      loans: [migratedLoan],
      installments,
      payments: priorPayments,
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
      nonPaymentVisits: [],
      auditLogs: [],
      officeConfig: { ...DEFAULT_OFFICE_CONFIG, paperworkFeeEnabled: false },
    })
  );

  const nov17 = localStore.getDailyRouteMetrics('2026-11-17', routeId);
  assertEqual(nov17.totalAdministrativeCapital, 5851000, 'Admin 17-11');
  assertEqual(nov17.activeCapitalInStreet, 5626000, 'Cartera 17-11');
  assertEqual(nov17.cashAvailableInHand, 225000, 'Base 17-11');

  // Cobros del 18-11 por $45.000
  for (const [idx, amt] of [8000, 15000, 10000, 12000].entries()) {
    await localStore.recordPayment({
      loanId: migratedLoan.id,
      amountReceived: amt,
      paymentMethod: 'CASH',
      collectorId,
      todayStr: '2026-11-18',
      idempotencyKey: `idem-nov18-${idx}`,
    });
  }

  // Crédito nuevo del 18-11 por $200.000 para cobrar $230.000 (15%)
  const joel = await localStore.createCustomer({
    fullName: 'Cliente Nuevo 18',
    documentNumber: '444555666',
    phone: '3000000002',
    address: 'Calle 2',
    neighborhood: 'Centro',
    routeId,
    todayStr: '2026-11-18',
  });

  await localStore.createLoan({
    customerId: joel.id,
    principal: 200000,
    interestRate: 0.15,
    installmentCount: 1,
    frequency: 'MONTHLY',
    routeId,
    collectorId,
    todayStr: '2026-11-18',
    isCardMigration: false,
  });

  const nov18 = localStore.getDailyRouteMetrics('2026-11-18', routeId);
  assertEqual(nov18.activeCapitalInStreet, 5811000, 'Cartera 18-11 tras $45k cobro y $200k->$230k');
  assertEqual(nov18.cashAvailableInHand, 70000, 'Base 18-11 exacta ($225k + $45k - $200k = $70k, NO $144k)');
  assertEqual(nov18.totalAdministrativeCapital, 5881000, 'Admin 18-11 exacto ($5.851k + $30k = $5.881k, NO $5.955k)');

  // Cobro posterior el 19-11 ($18.000): NO debe ser absorbido por el crédito del 18-11
  await localStore.recordPayment({
    loanId: migratedLoan.id,
    amountReceived: 18000,
    paymentMethod: 'CASH',
    collectorId,
    todayStr: '2026-11-19',
    idempotencyKey: 'idem-nov19-18k',
  });

  const nov19 = localStore.getDailyRouteMetrics('2026-11-19', routeId);
  assertEqual(nov19.activeCapitalInStreet, 5793000, 'Cartera 19-11 tras cobro $18k');
  assertEqual(nov19.cashAvailableInHand, 88000, 'Base 19-11 tras cobro $18k');
  assertEqual(nov19.totalAdministrativeCapital, 5881000, 'Admin 19-11 intacto tras cobro $18k');

  // Reabrir con orden invertido de loans: debe mantener el 100% de exactitud
  const backup = JSON.parse(localStore.exportFullBackupJSON());
  backup.loans.reverse();
  await localStore.restoreFullBackupJSON(JSON.stringify(backup));
  const reopened = localStore.getDailyRouteMetrics('2026-11-19', routeId);
  assertEqual(reopened.activeCapitalInStreet, 5793000, 'Cartera tras reabrir invertido');
  assertEqual(reopened.cashAvailableInHand, 88000, 'Base tras reabrir invertido');
  assertEqual(reopened.totalAdministrativeCapital, 5881000, 'Admin tras reabrir invertido');
}

export const backupAndNewLoanTests = testFullBackupRoundTripWithRoutesAndBase()
  .then(() => testFbvProductionReconciliationScenario())
  .then(() => {
    console.log('✅ Test de respaldo completo (rutas/base) y desembolsos con recaudo superado al 100%');
  });
