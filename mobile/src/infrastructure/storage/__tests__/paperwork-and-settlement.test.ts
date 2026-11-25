/**
 * Suite financiera de regresión para Spec 008:
 * 1) Papelería física dentro de Base en oficina SIN inflar jamás el Administrativo:
 *    - Caso 1A: Préstamo nuevo ($380k base -> préstamo $300k c/ $15k papelería -> Base $95k = $80k + $15k, Admin $440k)
 *    - Caso 1B: Renovación ($380k base + $100k deuda -> renovación $300k c/ $15k papelería -> Base $195k = $180k + $15k, Admin $540k)
 *    - Caso 1C: Retiro de papelería ($15k) baja Papelería a $0 y Base en $15k sin mover Efectivo base ni Administrativo
 *    - Caso 1D: Oficina sin papelería (paperworkFeeEnabled = false) y precisión histórica inmutable al activar/desactivar
 *    - Aislamiento de cartulinas físicas migradas (no inventan papelería en caja)
 * 2) Liquidación Opción B (Cobrado hoy + Base de inicio de ruta):
 *    - $175.000 cobrado + $50.000 base = $225.000 sin préstamos ni gastos
 *    - $175.000 cobrado + $50.000 base - $95.000 desembolso neto - $10.000 gasolina = $120.000
 */

import { localStore } from '../local-store';
import { Customer, Installment, Loan, Route } from '../../../core/domain/types';

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`[Spec 008] ${label}: esperado ${expected}, obtenido ${actual}`);
  }
}

function buildBaseOffice(routeId: string, initialCashBase: number, paperworkFeeEnabled: boolean, todayStr: string) {
  const route: Route = {
    id: routeId,
    name: 'Ruta 1',
    code: 'R-01',
    collectorId: 'col-1',
    isActive: true,
    initialCashBase,
    targetAdministrative: 0,
    expectedCustomersCount: 1,
    createdAt: todayStr,
  };
  const customer: Customer = {
    id: 'cust-008-1',
    fullName: 'Cliente Prueba Spec 008',
    documentNumber: '900100200',
    phone: '3001112233',
    address: 'Calle 10 #20-30',
    neighborhood: 'Centro',
    city: 'Sincelejo',
    references: [],
    occupation: 'Comerciante',
    status: 'ACTIVE',
    routeId,
    assignedCollectorId: 'col-1',
    createdAt: todayStr,
    updatedAt: todayStr,
  };
  return { route, customer };
}

async function testCaso1AAnd1C(): Promise<void> {
  const todayStr = '2026-11-22';
  const routeId = 'route-008-1a';
  const { route, customer } = buildBaseOffice(routeId, 380000, true, todayStr);

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      officeConfig: {
        ...localStore.getOfficeConfig(),
        paperworkFeeEnabled: true,
        paperworkRate: 5000,
        dailyOpeningBaseByRouteDate: {},
        dailyOpeningBaseMeta: {},
      },
      routes: [route],
      customers: [customer],
      loans: [],
      installments: [],
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
    })
  );

  // Estado inicial: Base $380.000, Cartera $0, Admin $380.000
  const before = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(before.cashAvailableInHand, 380000, '1A antes Efectivo base');
  assertEqual(before.paperworkAvailableBalance || 0, 0, '1A antes Papelería');
  assertEqual(before.totalOfficeBaseWithPaperwork || 0, 380000, '1A antes Base oficina');
  assertEqual(before.totalAdministrativeCapital, 380000, '1A antes Administrativo');

  // Préstamo nuevo de $300.000 al 20% (30 cuotas -> $360.000), papelería $15.000, entrega $285.000
  const created = await localStore.createLoan({
    customerId: customer.id,
    principal: 300000,
    interestRate: 0.2,
    installmentCount: 30,
    frequency: 'DAILY',
    collectorId: 'col-1',
    routeId,
    todayStr,
  });
  assertEqual(created.paperworkFee, 15000, '1A papelería cobrada');

  const afterLoan = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(afterLoan.activeCapitalInStreet, 360000, '1A Cartera en calle');
  assertEqual(afterLoan.cashAvailableInHand, 80000, '1A Efectivo base');
  assertEqual(afterLoan.paperworkAvailableBalance || 0, 15000, '1A Papelería disponible');
  assertEqual(afterLoan.totalOfficeBaseWithPaperwork || 0, 95000, '1A Base en oficina total ($80k + $15k)');
  assertEqual(afterLoan.totalAdministrativeCapital, 440000, '1A Administrativo (sube SOLO +$60k, NO papelería)');
  assertEqual(afterLoan.disbursedToday, 285000, '1A Desembolso físico entregado');

  // Caso 1C: Dueño retira los $15.000 de papelería
  await localStore.recordPaperworkWithdrawal({
    amount: 15000,
    routeId,
    todayStr,
    authorizedBy: 'usr-admin-1',
  });

  const afterWithdraw = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(afterWithdraw.paperworkAvailableBalance || 0, 0, '1C(1A) Papelería queda en $0');
  assertEqual(afterWithdraw.cashAvailableInHand, 80000, '1C(1A) Efectivo base intacto');
  assertEqual(afterWithdraw.totalOfficeBaseWithPaperwork || 0, 80000, '1C(1A) Base en oficina baja exacto -$15k');
  assertEqual(afterWithdraw.totalAdministrativeCapital, 440000, '1C(1A) Administrativo intacto');
}

async function testCaso1BAnd1C(): Promise<void> {
  const todayStr = '2026-11-22';
  const routeId = 'route-008-1b';
  const { route, customer } = buildBaseOffice(routeId, 380000, true, todayStr);

  // Cartulina migrada activa con deuda pendiente exacta de $100.000 (0 cobrado previo para aislar base exacta de $380.000)
  // Estado previo: Base $380.000 + Cartera $100.000 = Admin $480.000
  const prevLoan: Loan = {
    id: 'loan-prev-1b',
    loanNumber: '#00010',
    customerId: customer.id,
    routeId,
    collectorId: 'col-1',
    principal: 83333,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 16667,
    totalAgreed: 100000,
    installmentCount: 10,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-11-01',
    endDate: '2026-11-12',
    status: 'ACTIVE',
    notes: 'Migrado de cartulina física',
    createdAt: '2026-11-01',
    updatedAt: '2026-11-01',
  };
  const prevInst: Installment = {
    id: 'inst-prev-1b',
    loanId: prevLoan.id,
    installmentNumber: 1,
    dueDate: '2026-11-23',
    expectedAmount: 100000,
    paidAmount: 0,
    pendingAmount: 100000,
    status: 'PENDIENTE',
  };

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      officeConfig: {
        ...localStore.getOfficeConfig(),
        paperworkFeeEnabled: true,
        paperworkRate: 5000,
        dailyOpeningBaseByRouteDate: {},
        dailyOpeningBaseMeta: {},
      },
      routes: [route],
      customers: [customer],
      loans: [prevLoan],
      installments: [prevInst],
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
    })
  );

  // Verificar que la cartulina migrada NO inventa papelería
  const before = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(before.activeCapitalInStreet, 100000, '1B antes Cartera');
  assertEqual(before.cashAvailableInHand, 380000, '1B antes Efectivo base');
  assertEqual(before.paperworkAvailableBalance || 0, 0, '1B antes Papelería (migrada = $0)');
  assertEqual(localStore.getPaperworkHistory(routeId).length, 0, '1B antes historial papelería vacío');
  assertEqual(before.totalAdministrativeCapital, 480000, '1B antes Administrativo');

  // Renovación de $300.000 al 20% ($360.000), descuenta $100.000 deuda y $15.000 papelería -> entrega física $185.000
  const { renewal } = await localStore.recordRenewal({
    previousLoanId: prevLoan.id,
    newPrincipal: 300000,
    interestRate: 0.2,
    installmentCount: 30,
    frequency: 'DAILY',
    collectorId: 'col-1',
    todayStr,
  });
  assertEqual(renewal.previousBalanceDeducted, 100000, '1B deuda descontada');
  assertEqual(renewal.paperworkDeducted, 15000, '1B papelería deducida');
  assertEqual(renewal.actualCashDisbursed, 185000, '1B efectivo físico entregado');

  const afterRenewal = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(afterRenewal.activeCapitalInStreet, 360000, '1B Cartera en calle');
  assertEqual(afterRenewal.cashAvailableInHand, 180000, '1B Efectivo base');
  assertEqual(afterRenewal.paperworkAvailableBalance || 0, 15000, '1B Papelería disponible');
  assertEqual(afterRenewal.totalOfficeBaseWithPaperwork || 0, 195000, '1B Base en oficina ($380k - $185k = $195k)');
  assertEqual(afterRenewal.totalAdministrativeCapital, 540000, '1B Administrativo ($480k + $60k = $540k, NO $555k)');
  assertEqual(afterRenewal.disbursedToday, 185000, '1B Desembolso físico hoy');

  // Caso 1C sobre 1B: Retirar $15.000 papelería
  await localStore.recordPaperworkWithdrawal({
    amount: 15000,
    routeId,
    todayStr,
    authorizedBy: 'usr-admin-1',
  });
  const afterWithdraw = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(afterWithdraw.paperworkAvailableBalance || 0, 0, '1C(1B) Papelería queda en $0');
  assertEqual(afterWithdraw.cashAvailableInHand, 180000, '1C(1B) Efectivo base intacto');
  assertEqual(afterWithdraw.totalOfficeBaseWithPaperwork || 0, 180000, '1C(1B) Base en oficina baja a $180k');
  assertEqual(afterWithdraw.totalAdministrativeCapital, 540000, '1C(1B) Administrativo intacto ($540k)');
}

async function testCaso1DDisabledAndHistoricalImmutability(): Promise<void> {
  const todayStr = '2026-11-22';
  const routeId = 'route-008-1d';
  const { route, customer } = buildBaseOffice(routeId, 380000, false, todayStr);

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      officeConfig: {
        ...localStore.getOfficeConfig(),
        paperworkFeeEnabled: false,
        paperworkRate: 5000,
        dailyOpeningBaseByRouteDate: {},
        dailyOpeningBaseMeta: {},
      },
      routes: [route],
      customers: [customer],
      loans: [],
      installments: [],
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
    })
  );

  const created = await localStore.createLoan({
    customerId: customer.id,
    principal: 300000,
    interestRate: 0.2,
    installmentCount: 30,
    frequency: 'DAILY',
    collectorId: 'col-1',
    routeId,
    todayStr,
  });
  assertEqual(created.paperworkFee, 0, '1D papelería desactivada = $0');

  const m1 = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(m1.paperworkAvailableBalance || 0, 0, '1D Papelería $0');
  assertEqual(m1.cashAvailableInHand, 80000, '1D Efectivo base $80k');
  assertEqual(m1.totalOfficeBaseWithPaperwork || 0, 80000, '1D Base oficina $80k');
  assertEqual(m1.totalAdministrativeCapital, 440000, '1D Administrativo $440k');
  assertEqual(m1.disbursedToday, 300000, '1D Desembolso físico $300k');

  // Activar papelería después NO debe inventar papelería retroactiva al préstamo viejo
  await localStore.updateOfficeConfig({ paperworkFeeEnabled: true });
  const m2 = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(m2.paperworkAvailableBalance || 0, 0, '1D inmutabilidad histórica: préstamo viejo sigue en $0 papelería');
}

async function testCaso2SettlementOpeningBase(): Promise<void> {
  const todayStr = '2026-11-22';
  const routeId = 'route-008-set';
  const { route, customer } = buildBaseOffice(routeId, 500000, true, todayStr);
  const customer2: Customer = {
    ...customer,
    id: 'cust-008-2',
    fullName: 'Cliente Nuevo Hoy',
    documentNumber: '900100201',
  };

  const activeLoan: Loan = {
    id: 'loan-set-1',
    loanNumber: '#00050',
    customerId: customer.id,
    routeId,
    collectorId: 'col-1',
    principal: 500000,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 3,
    installmentAmount: 200000,
    frequency: 'DAILY',
    startDate: '2026-11-15',
    endDate: '2026-11-25',
    status: 'ACTIVE',
    notes: 'Migrado de cartulina física',
    createdAt: '2026-11-15',
    updatedAt: '2026-11-15',
  };
  const inst1: Installment = {
    id: 'inst-set-1',
    loanId: activeLoan.id,
    installmentNumber: 1,
    dueDate: todayStr,
    expectedAmount: 200000,
    paidAmount: 0,
    pendingAmount: 200000,
    status: 'PENDIENTE',
  };

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      officeConfig: {
        ...localStore.getOfficeConfig(),
        paperworkFeeEnabled: true,
        paperworkRate: 5000,
        dailyOpeningBaseByRouteDate: {},
        dailyOpeningBaseMeta: {},
      },
      routes: [route],
      customers: [customer, customer2],
      loans: [activeLoan],
      installments: [inst1],
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
    })
  );

  // Asegurar fecha de sesión alineada a todayStr
  await localStore.renewCollectionDayAfterSettlement(todayStr);

  // Admin entrega $50.000 de Base de inicio al cobrador
  await localStore.setSessionOpeningBase(50000, todayStr, routeId);

  // Cobrador recauda $175.000 en efectivo hoy
  await localStore.recordPayment({
    loanId: activeLoan.id,
    amountReceived: 175000,
    paymentMethod: 'CASH',
    collectorId: 'col-1',
    todayStr,
  });

  // Escenario 2A: Sin préstamos ni gastos -> debe rendir $175.000 + $50.000 = $225.000
  const metrics2A = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(metrics2A.collectedCashToday, 175000, '2A Cobrado efectivo hoy');
  assertEqual(metrics2A.openingRouteBase || 0, 50000, '2A Base de inicio');

  const st2A = await localStore.closeDailySettlement({
    cashHandedOver: 225000,
    openingRouteBase: 50000,
    routeId,
    collectorId: 'col-1',
  });
  assertEqual(st2A.openingRouteBase || 0, 50000, '2A Settlement openingRouteBase');
  assertEqual(st2A.collectedPlusBase || 0, 225000, '2A Settlement collectedPlusBase');
  assertEqual(st2A.cashDifference, 0, '2A Settlement cuadre exacto ($0 diferencia)');

  // Escenario 2B (jornada limpia con préstamo y gasto):
  // $175.000 cobrado + $50.000 base - $95.000 desembolso neto ($100k - $5k papelería) - $10.000 gasolina = $120.000
  const day2B = '2026-11-23';
  const inst2: Installment = {
    id: 'inst-set-2',
    loanId: activeLoan.id,
    installmentNumber: 2,
    dueDate: day2B,
    expectedAmount: 200000,
    paidAmount: 0,
    pendingAmount: 200000,
    status: 'PENDIENTE',
  };
  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      officeConfig: {
        ...localStore.getOfficeConfig(),
        paperworkFeeEnabled: true,
        paperworkRate: 5000,
        dailyOpeningBaseByRouteDate: {},
        dailyOpeningBaseMeta: {},
      },
      routes: [route],
      customers: [customer, customer2],
      loans: [activeLoan],
      installments: [inst2],
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
    })
  );
  await localStore.renewCollectionDayAfterSettlement(day2B);
  await localStore.setSessionOpeningBase(50000, day2B, routeId);
  await localStore.recordPayment({
    loanId: activeLoan.id,
    amountReceived: 175000,
    paymentMethod: 'CASH',
    collectorId: 'col-1',
    todayStr: day2B,
  });
  await localStore.createLoan({
    customerId: customer2.id,
    principal: 100000,
    interestRate: 0.2,
    installmentCount: 20,
    frequency: 'DAILY',
    collectorId: 'col-1',
    routeId,
    todayStr: day2B,
  });
  await localStore.recordRouteExpense({
    amount: 10000,
    category: 'GASOLINA',
    description: 'Gasolina ruta',
    collectorId: 'col-1',
    routeId,
    todayStr: day2B,
  });

  const metrics2B = localStore.getDailyRouteMetrics(day2B, routeId);
  assertEqual(metrics2B.collectedCashToday, 175000, '2B Cobrado efectivo hoy');
  assertEqual(metrics2B.openingRouteBase || 0, 50000, '2B Base de inicio');
  assertEqual(metrics2B.disbursedToday, 95000, '2B Desembolso físico neto ($100k - $5k papelería)');
  assertEqual(metrics2B.expensesToday, 10000, '2B Gasto gasolina');
  assertEqual(metrics2B.paperworkAvailableBalance || 0, 5000, '2B Papelería retenida en caja ($5k)');

  const st2B = await localStore.closeDailySettlement({
    cashHandedOver: 120000,
    openingRouteBase: 50000,
    routeId,
    collectorId: 'col-1',
  });
  assertEqual(st2B.openingRouteBase || 0, 50000, '2B Settlement openingRouteBase');
  assertEqual(st2B.collectedPlusBase || 0, 225000, '2B Settlement collectedPlusBase');
  assertEqual(st2B.cashDifference, 0, '2B Settlement cuadre exacto ($120.000 -> $0 diferencia)');
}

async function testSpec010AutomaticOpeningBaseAndDispositions(): Promise<void> {
  const day1 = '2026-11-23';
  const day2 = '2026-11-24';
  const day3 = '2026-11-25';
  const day4 = '2026-11-26';
  const routeId = 'route-010-auto';
  const { route, customer } = buildBaseOffice(routeId, 380000, true, day1);
  const customer2: Customer = {
    ...customer,
    id: 'cust-010-2',
    fullName: 'Cliente Prestamo Dia 1',
    documentNumber: '900100302',
  };

  const activeLoan: Loan = {
    id: 'loan-010-1',
    loanNumber: '#00080',
    customerId: customer.id,
    routeId,
    collectorId: 'col-1',
    principal: 500000,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 3,
    installmentAmount: 200000,
    frequency: 'DAILY',
    startDate: '2026-11-15',
    endDate: '2026-11-28',
    status: 'ACTIVE',
    notes: 'Migrado de cartulina física',
    createdAt: '2026-11-15',
    updatedAt: '2026-11-15',
  };
  const insts: Installment[] = [
    { id: 'inst-010-1', loanId: activeLoan.id, installmentNumber: 1, dueDate: day1, expectedAmount: 200000, paidAmount: 0, pendingAmount: 200000, status: 'PENDIENTE' },
    { id: 'inst-010-2', loanId: activeLoan.id, installmentNumber: 2, dueDate: day2, expectedAmount: 200000, paidAmount: 0, pendingAmount: 200000, status: 'PENDIENTE' },
    { id: 'inst-010-3', loanId: activeLoan.id, installmentNumber: 3, dueDate: day3, expectedAmount: 200000, paidAmount: 0, pendingAmount: 200000, status: 'PENDIENTE' },
  ];

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      officeConfig: {
        ...localStore.getOfficeConfig(),
        paperworkFeeEnabled: true,
        paperworkRate: 5000,
        dailyOpeningBaseByRouteDate: {},
        dailyOpeningBaseMeta: {},
      },
      routes: [route],
      customers: [customer, customer2],
      loans: [activeLoan],
      installments: insts,
      payments: [],
      renewals: [],
      settlements: [],
      promises: [],
      cashMovements: [],
    })
  );
  await localStore.renewCollectionDayAfterSettlement(day1);

  // 1. DÍA 1 SIN ASIGNACIÓN MANUAL: Base automática = $380.000
  // Cobra $175.000 efectivo, presta $300.000 ($15.000 papelería -> $285.000 físico), gasta $10.000 gasolina
  await localStore.recordPayment({
    loanId: activeLoan.id,
    amountReceived: 175000,
    paymentMethod: 'CASH',
    collectorId: 'col-1',
    todayStr: day1,
  });
  await localStore.createLoan({
    customerId: customer2.id,
    principal: 300000,
    interestRate: 0.2,
    installmentCount: 30,
    frequency: 'DAILY',
    collectorId: 'col-1',
    routeId,
    todayStr: day1,
  });
  await localStore.recordRouteExpense({
    amount: 10000,
    category: 'GASOLINA',
    description: 'Gasolina Día 1',
    collectorId: 'col-1',
    routeId,
    todayStr: day1,
  });

  const mDay1 = localStore.getDailyRouteMetrics(day1, routeId);
  assertEqual(mDay1.autoOpeningRouteBase || 0, 380000, '010 Día 1 autoOpeningRouteBase');
  assertEqual(mDay1.openingRouteBase || 0, 380000, '010 Día 1 openingRouteBase automático (nunca $0)');
  assertEqual(mDay1.cashAvailableInHand, 245000, '010 Día 1 Efectivo base');
  assertEqual(mDay1.paperworkAvailableBalance || 0, 15000, '010 Día 1 Papelería aparte');

  // Cierre Día 1 DEJANDO EN RUTA (withdrawToOfficeAmount = 0):
  // Efectivo físico en bolsillo = ($175.000 + $380.000) - $285.000 - $10.000 = $260.000
  const stDay1 = await localStore.closeDailySettlement({
    cashHandedOver: 260000,
    withdrawToOfficeAmount: 0,
    routeId,
    collectorId: 'col-1',
  });
  assertEqual(stDay1.cashDifference, 0, '010 Día 1 cuadre exacto');
  assertEqual(stDay1.withdrawnToOffice || 0, 0, '010 Día 1 sin retiro');

  // 2. DÍA 2 (HERENCIA AUTOMÁTICA SOLO EFECTIVO BASE, PAPELERÍA $15.000 APARTE):
  // Base de inicio automática debe ser EXACTAMENTE $245.000 (NO $260.000!)
  const mDay2Morning = localStore.getDailyRouteMetrics(day2, routeId);
  assertEqual(mDay2Morning.openingRouteBase || 0, 245000, '010 Día 2 Base inicio = $245k (SOLO efectivo base, papelería aparte)');
  assertEqual(mDay2Morning.paperworkAvailableBalance || 0, 15000, '010 Día 2 Papelería sigue intacta aparte');

  // Cobrador cobra $100.000 en Día 2 -> cashAvailableInHand = $345.000; Admin retira $295.000 (corte semanal/parcial) dejando $50.000
  await localStore.recordPayment({
    loanId: activeLoan.id,
    amountReceived: 100000,
    paymentMethod: 'CASH',
    collectorId: 'col-1',
    todayStr: day2,
  });
  const mDay2AfterPay = localStore.getDailyRouteMetrics(day2, routeId);
  assertEqual(mDay2AfterPay.openingRouteBase || 0, 245000, '010 Día 2 Base inicio sigue en $245k tras cobrar cuota');
  assertEqual(mDay2AfterPay.cashAvailableInHand, 345000, '010 Día 2 Efectivo base tras cobrar $100k');

  const stDay2 = await localStore.closeDailySettlement({
    cashHandedOver: 345000, // $100k cobrado + $245k base inicio
    withdrawToOfficeAmount: 295000,
    routeId,
    collectorId: 'col-1',
  });
  assertEqual(stDay2.cashDifference, 0, '010 Día 2 cuadre exacto');
  assertEqual(stDay2.withdrawnToOffice || 0, 295000, '010 Día 2 retiro parcial $295k');

  // 3. DÍA 3: Debe amanecer automáticamente en $50.000 ($345k - $295k), y papelería $15k intacta!
  const mDay3 = localStore.getDailyRouteMetrics(day3, routeId);
  assertEqual(mDay3.openingRouteBase || 0, 50000, '010 Día 3 Base inicio automática = $50k tras retiro parcial');
  assertEqual(mDay3.paperworkAvailableBalance || 0, 15000, '010 Día 3 Papelería sigue intacta aparte');

  // 4. RETIRO TOTAL DIARIO ($50.000) -> DÍA 4 amanece en $0 -> Inyección $60.000 sube Base inicio a $60.000
  const stDay3 = await localStore.closeDailySettlement({
    cashHandedOver: 50000,
    withdrawToOfficeAmount: 50000,
    routeId,
    collectorId: 'col-1',
  });
  assertEqual(stDay3.cashDifference, 0, '010 Día 3 cuadre exacto');

  const mDay4BeforeInj = localStore.getDailyRouteMetrics(day4, routeId);
  assertEqual(mDay4BeforeInj.openingRouteBase || 0, 0, '010 Día 4 Base inicio = $0 tras retiro total');

  await localStore.recordCapitalInjection({
    amount: 60000,
    sourceOrReason: 'Fondeo matutino',
    routeId,
    authorizedBy: 'usr-admin-1',
    todayStr: day4,
  });
  const mDay4AfterInj = localStore.getDailyRouteMetrics(day4, routeId);
  assertEqual(mDay4AfterInj.openingRouteBase || 0, 60000, '010 Día 4 Base inicio sube a $60k tras inyección');
}

export const paperworkAndSettlementTests = (async () => {
  await testCaso1AAnd1C();
  await testCaso1BAnd1C();
  await testCaso1DDisabledAndHistoricalImmutability();
  await testCaso2SettlementOpeningBase();
  await testSpec010AutomaticOpeningBaseAndDispositions();
  console.log('✅ Test Spec 008 + Spec 010 (Base automática sin papelería + Dejar/Retirar al cierre) superado al 100%');
})();
