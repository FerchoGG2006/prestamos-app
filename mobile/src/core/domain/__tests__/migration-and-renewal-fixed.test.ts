import {
  calculateDelinquencyMetrics,
  calculateLoanSummary,
  generateAnchoredMigrationSchedule,
  getUpcomingWeekdayDate,
} from '../calculator';
import { localStore } from '../../../infrastructure/storage/local-store';

const assert = {
  equal<T>(actual: T, expected: T, msg?: string) {
    if (actual !== expected) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual: unknown, expected: unknown, msg?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
};

export const migrationAndRenewalFixedTests = (async () => {
  // 1. Caso real del usuario: cliente semanal de los VIERNES, crédito de 6 semanas, 2 cuotas pagadas, ingresado el MARTES 2026-11-24
  assert.equal(getUpcomingWeekdayDate('2026-11-24', 5), '2026-11-27', 'Próximo viernes desde martes debe ser 2026-11-27');
  assert.equal(getUpcomingWeekdayDate('2026-11-24', 2), '2026-11-24', 'Mismo día (martes) debe retornar hoy');
  assert.equal(getUpcomingWeekdayDate('2026-11-24', 1), '2026-11-30', 'Próximo lunes desde martes debe ser 2026-11-30');

  const weeklySummary = calculateLoanSummary(300000, 0.2, 6);
  const weeklySchedule = generateAnchoredMigrationSchedule({
    loanId: 'loan-fri',
    summary: weeklySummary,
    frequency: 'WEEKLY',
    nextDueDateStr: '2026-11-27',
    paidInstallmentNumbers: [1, 2],
  });

  assert.equal(weeklySchedule.anchorInstallmentNumber, 3);
  assert.equal(weeklySchedule.startDate, '2026-11-06');
  assert.equal(weeklySchedule.endDate, '2026-12-18');
  assert.deepEqual(
    weeklySchedule.installments.map((i) => ({ num: i.installmentNumber, due: i.dueDate, st: i.status, pend: i.pendingAmount })),
    [
      { num: 1, due: '2026-11-13', st: 'PAGADA', pend: 0 },
      { num: 2, due: '2026-11-20', st: 'PAGADA', pend: 0 },
      { num: 3, due: '2026-11-27', st: 'PENDIENTE', pend: 60000 },
      { num: 4, due: '2026-12-04', st: 'PENDIENTE', pend: 60000 },
      { num: 5, due: '2026-12-11', st: 'PENDIENTE', pend: 60000 },
      { num: 6, due: '2026-12-18', st: 'PENDIENTE', pend: 60000 },
    ]
  );

  // Evaluar mora: Martes = Al día, Viernes = Cobra hoy (sin mora), Sábado = En mora (1 día)
  const delinqTue = calculateDelinquencyMetrics(weeklySchedule.installments, '2026-11-24');
  assert.equal(delinqTue.hasDelinquency, false, 'El martes debe estar al día (paz y salvo)');
  const delinqFri = calculateDelinquencyMetrics(weeklySchedule.installments, '2026-11-27');
  assert.equal(delinqFri.hasDelinquency, false, 'El viernes es día de cobro hoy, aún no es mora');
  const delinqSat = calculateDelinquencyMetrics(weeklySchedule.installments, '2026-11-28');
  assert.equal(delinqSat.hasDelinquency, true, 'El sábado ya debe entrar en mora');
  assert.equal(delinqSat.overdueDays, 1);
  assert.equal(delinqSat.overdueInstallmentsCount, 1);

  // 2. Cartulina atrasada: eligiendo viernes pasado (2026-11-20) como Día de pago entra en mora inmediatamente
  const overdueSchedule = generateAnchoredMigrationSchedule({
    loanId: 'loan-overdue',
    summary: weeklySummary,
    frequency: 'WEEKLY',
    nextDueDateStr: '2026-11-20',
    paidInstallmentNumbers: [1],
  });
  assert.equal(overdueSchedule.installments[0].dueDate, '2026-11-13');
  assert.equal(overdueSchedule.installments[0].status, 'PAGADA');
  assert.equal(overdueSchedule.installments[1].dueDate, '2026-11-20');
  assert.equal(overdueSchedule.installments[1].status, 'PENDIENTE');
  const delinqPast = calculateDelinquencyMetrics(overdueSchedule.installments, '2026-11-24');
  assert.equal(delinqPast.hasDelinquency, true);
  assert.equal(delinqPast.overdueDays, 4);

  // 3. Diario saltando domingos
  const dailySummary = calculateLoanSummary(100000, 0.2, 5);
  const dailySchedule = generateAnchoredMigrationSchedule({
    loanId: 'loan-daily',
    summary: dailySummary,
    frequency: 'DAILY',
    nextDueDateStr: '2026-11-24', // Martes
    paidInstallmentNumbers: [1, 2],
  });
  assert.deepEqual(
    dailySchedule.installments.map((i) => i.dueDate),
    ['2026-11-21', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26'],
    'Diario debe saltar el domingo 2026-11-22 al proyectar hacia atrás'
  );
  assert.equal(dailySchedule.startDate, '2026-11-20');

  // 4. Quincenal y Mensual con clamping fin de mes
  const biweeklySchedule = generateAnchoredMigrationSchedule({
    loanId: 'loan-biw',
    summary: calculateLoanSummary(200000, 0.2, 4),
    frequency: 'BIWEEKLY',
    nextDueDateStr: '2026-11-30',
    paidInstallmentNumbers: [1],
  });
  assert.deepEqual(
    biweeklySchedule.installments.map((i) => i.dueDate),
    ['2026-11-15', '2026-11-30', '2026-12-15', '2026-12-30']
  );

  const monthlySchedule = generateAnchoredMigrationSchedule({
    loanId: 'loan-mon',
    summary: calculateLoanSummary(200000, 0.2, 3),
    frequency: 'MONTHLY',
    nextDueDateStr: '2026-03-31',
    paidInstallmentNumbers: [1, 2],
  });
  assert.deepEqual(
    monthlySchedule.installments.map((i) => i.dueDate),
    ['2026-01-31', '2026-02-28', '2026-03-31']
  );

  // 5. Flujo completo en localStore: createLoan con migración anclada + recordRenewal con FIXED_DATE
  await localStore.initialize();
  await localStore.applyLinkedOfficeBundle({
    officeId: 'off-test-012',
    activationCode: 'TEST-012',
    companyName: 'Oficina Test 012',
    licenseStatus: 'ACTIVE',
    users: [
      {
        id: 'usr-col-1',
        name: 'Cobrador 1',
        username: 'col1',
        email: 'col1@test.local',
        role: 'COLLECTOR',
        assignedRouteIds: ['route-1'],
        isActive: true,
        createdAt: '2026-11-24',
      },
    ],
    routes: [
      { id: 'route-1', name: 'Ruta 1', code: 'R1', collectorId: 'usr-col-1', isActive: true, createdAt: '2026-11-24' },
    ],
    portfolio: {
      customers: [],
      loans: [],
      installments: [],
      payments: [],
      renewals: [],
      settlements: [],
      cashMovements: [],
    },
    preserveLocalPortfolio: false,
  });

  const cust = await localStore.createCustomer({
    fullName: 'Cliente Viernes',
    documentNumber: '900123456',
    phone: '3000000000',
    whatsappPhone: '3000000000',
    address: 'Calle 1',
    neighborhood: 'Centro',
    businessName: 'Tienda',
    referenceName: '',
    referencePhone: '',
    routeId: 'route-1',
    todayStr: '2026-11-24',
  });

  const created = await localStore.createLoan({
    customerId: cust.id,
    principal: 300000,
    interestRate: 0.2,
    installmentCount: 6,
    frequency: 'WEEKLY',
    routeId: 'route-1',
    collectorId: 'usr-col-1',
    todayStr: '2026-11-24',
    isCardMigration: true,
    paidInstallmentNumbers: [1, 2],
    nextDueDate: '2026-11-27',
  });
  assert.equal(created.loan.startDate, '2026-11-06');
  assert.equal(created.loan.endDate, '2026-12-18');
  assert.equal(created.installments[2].dueDate, '2026-11-27');
  assert.equal(created.installments[1].status, 'PAGADA');
  assert.equal(created.installments[2].status, 'PENDIENTE');

  // Renovación a Fecha Fija debe validar formato de fecha cuando se envía un valor inválido
  let fixedValidationFailed = false;
  try {
    await localStore.recordRenewal({
      previousLoanId: created.loan.id,
      newPrincipal: 400000,
      interestRate: 0.2,
      installmentCount: 1,
      frequency: 'FIXED_DATE',
      fixedDueDate: '2026/12/15-invalida',
      collectorId: 'usr-col-1',
      todayStr: '2026-11-24',
    });
  } catch {
    fixedValidationFailed = true;
  }
  assert.equal(fixedValidationFailed, true, 'Renovación a FIXED_DATE con fecha inválida debe fallar');

  const renResult = await localStore.recordRenewal({
    previousLoanId: created.loan.id,
    newPrincipal: 400000,
    interestRate: 0.2,
    installmentCount: 1,
    frequency: 'FIXED_DATE',
    fixedDueDate: '2026-12-15',
    collectorId: 'usr-col-1',
    todayStr: '2026-11-24',
  });
  assert.equal(renResult.newLoan.frequency, 'FIXED_DATE');
  assert.equal(renResult.newLoan.installmentCount, 1);
  assert.equal(renResult.newLoan.fixedDueDate, '2026-12-15');
  assert.equal(renResult.newLoan.endDate, '2026-12-15');
  const newInsts = localStore.getInstallments().filter((i) => i.loanId === renResult.newLoan.id);
  assert.equal(newInsts.length, 1);
  assert.equal(newInsts[0].dueDate, '2026-12-15');
  assert.equal(newInsts[0].expectedAmount, 480000);

  // 6. Invariante relacional en mergeCloudPortfolio: renovación siempre fuerza previousLoanId -> RENEWED + cuotas pagadas
  await localStore.mergeCloudPortfolio({
    users: [],
    routes: [],
    customers: [],
    loans: [
      {
        ...created.loan,
        status: 'ACTIVE', // Remoto viejo intentando revertir el crédito renovado
      },
    ],
    installments: [
      {
        ...created.installments[2],
        paidAmount: 0,
        pendingAmount: 60000,
        status: 'PENDIENTE',
      },
    ],
    payments: [],
    renewals: [renResult.renewal],
    settlements: [],
    cashMovements: [],
  });
  const mergedPrev = localStore.getLoans().find((l) => l.id === created.loan.id)!;
  assert.equal(mergedPrev.status, 'RENEWED', 'Invariante de renovación debe forzar RENEWED');
  const mergedPrevInsts = localStore.getInstallments().filter((i) => i.loanId === created.loan.id);
  assert.equal(
    mergedPrevInsts.every((i) => i.pendingAmount === 0 && i.status === 'PAGADA'),
    true,
    'Todas las cuotas del crédito renovado deben permanecer saldadas (pendingAmount = 0)'
  );

  console.log('PASS migration-and-renewal-fixed.test.ts (all assertions)');
})();
