/**
 * Prueba de regresión para métricas de renovación:
 * Verifica que al registrar una renovación:
 * - Base en Mano descuenta (efectivo neto + papelería = newPrincipal - previousBalanceDeducted)
 * - Cartera en Calle refleja (T_nuevo - S_ant)
 * - Administrativo sube únicamente el interés nuevo (I_nuevo)
 */

import { localStore } from '../local-store';
import { Customer, Loan, Installment, Route } from '../../../core/domain/types';

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
  }
}

async function runRenewalMetricsTest(newPrincipal = 780000, interestRate = 280000 / 780000) {
  const todayStr = '2026-11-16';
  const routeId = 'route-test-renewal';

  const testRoute: Route = {
    id: routeId,
    name: 'Ruta Test Renovación',
    code: 'RTR-01',
    collectorId: 'col-1',
    isActive: true,
    initialCashBase: 0,
    targetAdministrative: 0,
    expectedCustomersCount: 1,
    createdAt: todayStr,
  };

  const testCustomer: Customer = {
    id: 'cust-1',
    fullName: 'Cliente Prueba Renovación',
    documentNumber: '123456',
    phone: '3000000000',
    address: 'Calle 1',
    neighborhood: 'Centro',
    city: 'Medellín',
    references: [],
    occupation: 'Comerciante',
    status: 'ACTIVE',
    routeId,
    assignedCollectorId: 'col-1',
    createdAt: todayStr,
    updatedAt: todayStr,
  };

  // Cartulina migrada: Total pactado 1.120.000, cobrado previo 500.000, pendiente 620.000
  // Estado inicial esperado: Base = 500.000, Cartera = 620.000, Admin = 1.120.000
  const migratedLoan: Loan = {
    id: 'loan-migrated-1',
    loanNumber: '#00100',
    customerId: testCustomer.id,
    routeId,
    collectorId: 'col-1',
    principal: 933333,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 186667,
    totalAgreed: 1120000,
    installmentCount: 20,
    installmentAmount: 56000,
    frequency: 'DAILY',
    startDate: '2026-10-01',
    endDate: '2026-10-25',
    status: 'ACTIVE',
    notes: 'Migrado de cartulina física',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };

  const migratedInstallments: Installment[] = [
    {
      id: 'inst-1',
      loanId: migratedLoan.id,
      installmentNumber: 1,
      dueDate: '2026-10-02',
      expectedAmount: 500000,
      paidAmount: 500000,
      pendingAmount: 0,
      status: 'PAGADA',
      lastPaymentDate: '2026-10-15',
    },
    {
      id: 'inst-2',
      loanId: migratedLoan.id,
      installmentNumber: 2,
      dueDate: '2026-11-17',
      expectedAmount: 620000,
      paidAmount: 0,
      pendingAmount: 620000,
      status: 'PENDIENTE',
    },
  ];

  await localStore.restoreFullBackupJSON(
    JSON.stringify({
      routes: [testRoute],
      customers: [testCustomer],
      loans: [migratedLoan],
      installments: migratedInstallments,
      payments: [],
      renewals: [],
      cashMovements: [],
      promises: [],
      nonPaymentVisits: [],
    })
  );

  // 1. Verificar estado inicial exacto
  const before = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(before.cashAvailableInHand, 500000, 'Base inicial');
  assertEqual(before.activeCapitalInStreet, 620000, 'Cartera inicial');
  assertEqual(before.totalAdministrativeCapital, 1120000, 'Admin inicial');

  // 2. Cubrir tanto el caso previo (780.000) como el real (700.000 al 40%).
  // Ambos tienen saldo anterior 620.000 e interés nuevo 280.000.
  const { renewal, newLoan } = await localStore.recordRenewal({
    previousLoanId: migratedLoan.id,
    newPrincipal,
    interestRate,
    installmentCount: 20,
    frequency: 'DAILY',
    collectorId: 'col-1',
    todayStr,
    paperworkFee: 35000,
  });

  assertEqual(renewal.previousBalanceDeducted, 620000, 'Saldo anterior descontado');
  assertEqual(renewal.paperworkDeducted, 35000, 'Papelería descontada');
  const capitalOut = newPrincipal - 620000;
  assertEqual(renewal.actualCashDisbursed, capitalOut - 35000, 'Efectivo neto entregado');
  assertEqual(newLoan.interestAmount, 280000, 'Interés nuevo');
  assertEqual(newLoan.totalAgreed, newPrincipal + 280000, 'Total nuevo pactado');

  // 3. Verificar estado posterior exacto
  const after = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(after.cashAvailableInHand, 500000 - capitalOut, 'Base después de renovar');
  assertEqual(after.activeCapitalInStreet, newPrincipal + 280000, 'Cartera después de renovar');
  assertEqual(after.totalAdministrativeCapital, 1400000, 'Admin después de renovar');
  assertEqual(after.collectedToday, before.collectedToday, 'La compensación no es recaudo');

  // Reabrir datos ya guardados: corrige métricas sin registrar otra renovación.
  const backup = JSON.parse(localStore.exportFullBackupJSON());
  // La versión antigua guardaba el préstamo renovado al final del arreglo.
  backup.loans.reverse();
  await localStore.restoreFullBackupJSON(JSON.stringify(backup));
  const reopened = localStore.getDailyRouteMetrics(todayStr, routeId);
  assertEqual(reopened.cashAvailableInHand, after.cashAvailableInHand, 'Base tras recargar');
  assertEqual(reopened.activeCapitalInStreet, after.activeCapitalInStreet, 'Cartera tras recargar');
  assertEqual(reopened.totalAdministrativeCapital, 1400000, 'Admin tras recargar');
  const saved = JSON.parse(localStore.exportFullBackupJSON());
  assertEqual(saved.renewals.length, 1, 'No se duplica la renovación');
  assertEqual(saved.loans.length, 2, 'Se conservan ambos créditos');

  console.log('✅ Test de renovación superado:', {
    before: {
      base: before.cashAvailableInHand,
      cartera: before.activeCapitalInStreet,
      admin: before.totalAdministrativeCapital,
    },
    after: {
      base: after.cashAvailableInHand,
      cartera: after.activeCapitalInStreet,
      admin: after.totalAdministrativeCapital,
    },
  });
}

export const renewalMetricsTests = runRenewalMetricsTest().then(() => runRenewalMetricsTest(700000, 0.4)).catch((err) => {
  console.error('❌ Error en test de renovación:', err);
  throw err;
});
