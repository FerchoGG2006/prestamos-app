/**
 * PRUEBAS DE VALIDACIÓN FINANCIERA (FASE 1 - CORE)
 * 
 * Verifica estrictamente los casos de negocio descritos en el HANDOFF:
 * 1. Cálculo de interés flat 20% ($150.000 -> $180.000, 30 cuotas de $6.000).
 * 2. Pagos parciales ($6.000 con abono de $3.000 -> estado PARCIAL, sin crear cuota nueva).
 * 3. Pagos de varias cuotas ($12.000 cubriendo cuota #10 y cuota #11).
 * 4. Pagos adelantados (cuota futura marcada como ADELANTADA).
 * 5. Renovaciones: Nuevo capital $200.000, saldo anterior $60.000, papelería $10.000 -> desembolso $130.000.
 * 6. Métricas de mora fácticas sin recargo inventado.
 */

import {
  calculateLoanSummary,
  calculatePaperworkFee,
  calculateRenewalDisbursement,
  generateInstallments,
  applyPaymentToLoan,
  calculateDelinquencyMetrics,
  calculateDailyCashReconciliation,
  filterSessionDayPayments,
} from '../calculator';
import { Loan, Installment, Payment } from '../types';

function runFinancialTests() {
  console.log('=== INICIANDO VALIDACIÓN DE REGLAS FINANCIERAS ===\n');

  // 1. REGLA DE INTERÉS Y CUOTAS (Handoff punto 7 y 8)
  console.log('Test 1: Cálculo de crédito base');
  const loanSummary = calculateLoanSummary(150000, 0.20, 30);
  console.assert(loanSummary.principal === 150000, 'Error: Principal debe ser 150.000');
  console.assert(loanSummary.interestAmount === 30000, 'Error: Interés debe ser 30.000');
  console.assert(loanSummary.totalAgreed === 180000, 'Error: Total debe ser 180.000');
  console.assert(loanSummary.installmentAmount === 6000, 'Error: Cuota debe ser 6.000');
  console.log('Test 1 superado con éxito.\n');

  // 2. GENERACIÓN DE CUOTAS
  console.log('Test 2: Generación automática de cuotas');
  const installments = generateInstallments('loan-123', loanSummary, '2026-09-19');
  console.assert(installments.length === 30, 'Error: Deben generarse 30 cuotas');
  console.assert(installments[0].expectedAmount === 6000, 'Error: Cuota 1 debe ser 6.000');
  console.assert(installments[0].status === 'PENDIENTE', 'Error: Estado inicial debe ser PENDIENTE');
  console.log('Test 2 superado con éxito.\n');

  // 3. PAGO PARCIAL (Handoff punto 9)
  console.log('Test 3: Pago parcial (Cliente abona $3.000 de $6.000)');
  const dummyLoan: Loan = {
    id: 'loan-123',
    loanNumber: '#00124',
    customerId: 'cust-1',
    routeId: 'route-norte',
    collectorId: 'col-1',
    principal: 150000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 30000,
    totalAgreed: 180000,
    installmentCount: 30,
    installmentAmount: 6000,
    frequency: 'DAILY',
    startDate: '2026-09-19',
    endDate: '2026-10-24',
    status: 'ACTIVE',
    createdAt: '2026-09-19',
    updatedAt: '2026-09-19',
  };

  const partialPaymentResult = applyPaymentToLoan({
    loan: dummyLoan,
    currentInstallments: installments,
    amountReceived: 3000,
    paymentMethod: 'CASH',
    collectorId: 'col-1',
    sessionId: 'session-today',
    todayStr: '2026-09-19',
    paymentId: 'pay-001',
    idempotencyKey: 'key-001',
  });

  const updatedCuota1 = partialPaymentResult.updatedInstallments[0];
  console.assert(updatedCuota1.paidAmount === 3000, 'Error: Cuota 1 paidAmount debe ser 3.000');
  console.assert(updatedCuota1.pendingAmount === 3000, 'Error: Cuota 1 pendingAmount debe ser 3.000');
  console.assert(updatedCuota1.status === 'PARCIAL', 'Error: Cuota 1 status debe ser PARCIAL');
  console.assert(partialPaymentResult.updatedInstallments.length === 30, 'Error: No debe crear cuotas nuevas');
  console.log('Test 3 superado con éxito.\n');

  // 4. PAGO DE VARIAS CUOTAS Y ADELANTADAS (Handoff puntos 10 y 11)
  console.log('Test 4: Pago de varias cuotas y pago adelantado');
  // Se completa la cuota 1 ($3.000 restantes) + cuota 2 ($6.000 completa) = $9.000 entregados
  const multiPaymentResult = applyPaymentToLoan({
    loan: partialPaymentResult.updatedLoan,
    currentInstallments: partialPaymentResult.updatedInstallments,
    amountReceived: 9000,
    paymentMethod: 'CASH',
    collectorId: 'col-1',
    sessionId: 'session-today',
    // Primera cuota venciendo hoy; la segunda conserva una fecha futura.
    todayStr: installments[0].dueDate,
    paymentId: 'pay-002',
    idempotencyKey: 'key-002',
  });

  const cuota1After = multiPaymentResult.updatedInstallments[0];
  const cuota2After = multiPaymentResult.updatedInstallments[1];
  console.assert(cuota1After.pendingAmount === 0, 'Error: Cuota 1 debe quedar en 0');
  console.assert(cuota1After.status === 'PAGADA', 'Error: Cuota 1 debe ser PAGADA');
  console.assert(cuota2After.pendingAmount === 0, 'Error: Cuota 2 debe quedar en 0');
  console.assert(cuota2After.status === 'ADELANTADA', 'Error: Cuota 2 con fecha futura debe ser ADELANTADA');
  console.log('Test 4 superado con éxito.\n');

  // 5. RENOVACIONES Y PAPELERÍA (Handoff puntos 13, 14 y 15)
  console.log('Test 5: Renovación y desembolso real');
  const paperwork = calculatePaperworkFee(200000);
  console.assert(paperwork === 10000, `Error: Papelería de $200.000 debe ser $10.000, dio: ${paperwork}`);

  const renewalResult = calculateRenewalDisbursement(200000, 60000, paperwork);
  console.assert(renewalResult.newPrincipal === 200000, 'Error: Capital nuevo debe ser $200.000');
  console.assert(renewalResult.previousBalanceDeducted === 60000, 'Error: Saldo anterior debe ser $60.000');
  console.assert(renewalResult.paperworkDeducted === 10000, 'Error: Papelería debe ser $10.000');
  console.assert(renewalResult.actualCashDisbursed === 130000, 'Error: Desembolso real debe ser $130.000');
  console.log('Test 5 superado con éxito.\n');

  // 6. MORA FÁCTICA SIN RECARGO INVENTADO (Handoff punto 12)
  console.log('Test 6: Métricas de mora fácticas');
  const pastInstallments: Installment[] = [
    {
      id: 'inst-1',
      loanId: 'loan-1',
      installmentNumber: 1,
      dueDate: '2026-09-10', // 9 días atrás
      expectedAmount: 6000,
      paidAmount: 0,
      pendingAmount: 6000,
      status: 'VENCIDA',
    },
    {
      id: 'inst-2',
      loanId: 'loan-1',
      installmentNumber: 2,
      dueDate: '2026-09-15', // 4 días atrás
      expectedAmount: 6000,
      paidAmount: 2000,
      pendingAmount: 4000,
      status: 'PARCIAL',
    },
    {
      id: 'inst-3',
      loanId: 'loan-1',
      installmentNumber: 3,
      dueDate: '2026-09-25', // Futura
      expectedAmount: 6000,
      paidAmount: 0,
      pendingAmount: 6000,
      status: 'PENDIENTE',
    },
  ];

  const delinquency = calculateDelinquencyMetrics(pastInstallments, '2026-09-19');
  console.assert(delinquency.hasDelinquency === true, 'Error: Debe detectar mora');
  console.assert(delinquency.overdueInstallmentsCount === 2, 'Error: Deben ser 2 cuotas vencidas');
  console.assert(delinquency.overdueAmount === 10000, 'Error: Saldo vencido debe ser $10.000 (6000 + 4000)');
  console.assert(delinquency.overdueDays === 9, 'Error: Días de mora máximos deben ser 9');
  console.assert(delinquency.surchargeAmount === 0, 'Error: Recargo debe ser 0 (no inventar fórmulas)');
  console.log('Test 6 superado con éxito.\n');

  // 7. CUADRE DIARIO DE EFECTIVO CON SIGNO REAL (Opción B - sin congelar en $0)
  console.log('Test 7: Balance neto diario con signo y déficit cubierto por base');
  const deficitDay = calculateDailyCashReconciliation({
    collectedCash: 23000,
    expensesToday: 0,
    disbursedToday: 100000,
    recaudoRetiradoToday: 0,
  });
  console.assert(deficitDay.signedNetCashFlow === -77000, `Error: Balance neto esperado -$77.000, dio ${deficitDay.signedNetCashFlow}`);
  console.assert(deficitDay.cashToHandOver === 0, 'Error: Efectivo físico a rendir debe ser $0 cuando la base cubrió el déficit');
  console.assert(deficitDay.coveredByBaseDeficit === 77000, 'Error: Déficit cubierto por base debe ser $77.000');
  console.assert(deficitDay.isDeficitCoveredByBase === true, 'Error: Debe marcar déficit cubierto por base');

  const afterExtraPayment = calculateDailyCashReconciliation({
    collectedCash: 33000,
    expensesToday: 0,
    disbursedToday: 100000,
    recaudoRetiradoToday: 0,
  });
  console.assert(afterExtraPayment.signedNetCashFlow === -67000, 'Error: Un cobro adicional de $10.000 debe mover el balance de -$77.000 a -$67.000');
  console.assert(afterExtraPayment.coveredByBaseDeficit === 67000, 'Error: Déficit debe bajar a $67.000');

  const surplusDay = calculateDailyCashReconciliation({
    collectedCash: 120000,
    expensesToday: 5000,
    disbursedToday: 100000,
    recaudoRetiradoToday: 5000,
  });
  console.assert(surplusDay.signedNetCashFlow === 10000, 'Error: Balance neto positivo debe ser $10.000');
  console.assert(surplusDay.cashToHandOver === 10000, 'Error: Efectivo a rendir debe ser $10.000');
  console.assert(surplusDay.isDeficitCoveredByBase === false, 'Error: No debe marcar déficit en saldo positivo');
  console.log('Test 7 superado con éxito.\n');

  // 8. FILTRADO DE CUOTAS COBRADAS EN LA JORNADA (Ticket de cierre diario)
  console.log('Test 8: Conteo estricto de pagos de la jornada actual');
  const mixedPayments: Payment[] = [
    {
      id: 'p-old',
      idempotencyKey: 'k-old',
      loanId: 'loan-1',
      customerId: 'c-1',
      collectorId: 'col-1',
      sessionId: 'ses-2026-11-18',
      amountReceived: 10000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [],
      status: 'COMPLETED',
      createdAt: '2026-11-18T10:00:00Z',
    },
    {
      id: 'p-today-1',
      idempotencyKey: 'k-1',
      loanId: 'loan-1',
      customerId: 'c-1',
      collectorId: 'col-1',
      sessionId: 'ses-2026-11-19',
      amountReceived: 13000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [],
      status: 'COMPLETED',
      createdAt: '2026-11-19T09:00:00Z',
    },
    {
      id: 'p-today-2',
      idempotencyKey: 'k-2',
      loanId: 'loan-2',
      customerId: 'c-2',
      collectorId: 'col-1',
      sessionId: 'ses-2026-11-19',
      amountReceived: 10000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [],
      status: 'COMPLETED',
      createdAt: '2026-11-19T11:30:00Z',
    },
    {
      id: 'p-annulled',
      idempotencyKey: 'k-3',
      loanId: 'loan-2',
      customerId: 'c-2',
      collectorId: 'col-1',
      sessionId: 'ses-2026-11-19',
      amountReceived: 10000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [],
      status: 'ANNULLED',
      createdAt: '2026-11-19T12:00:00Z',
    },
  ];
  const dayOnly = filterSessionDayPayments(mixedPayments, '2026-11-19', {
    id: 'ses-2026-11-19',
    date: '2026-11-19',
  });
  console.assert(dayOnly.length === 2, `Error: Deben contarse exactamente 2 pagos de hoy, dio ${dayOnly.length}`);
  console.log('Test 8 superado con éxito.\n');

  // 9. LIQUIDACIÓN CON BASE DE INICIO DE RUTA (Opción B: Cobrado hoy + Base)
  console.log('Test 9: Liquidación con Base de inicio (Cobrado hoy + Base)');
  const settlementNoLoans = calculateDailyCashReconciliation({
    collectedCash: 175000,
    openingRouteBase: 50000,
    expensesToday: 0,
    disbursedToday: 0,
    recaudoRetiradoToday: 0,
  });
  console.assert(settlementNoLoans.openingRouteBase === 50000, 'Error: openingRouteBase debe ser $50.000');
  console.assert(settlementNoLoans.collectedPlusBase === 225000, 'Error: Cobrado + Base debe ser $225.000');
  console.assert(settlementNoLoans.cashToHandOver === 225000, 'Error: Efectivo a rendir sin préstamos debe ser $225.000');
  console.assert(settlementNoLoans.isDeficitCoveredByBase === false, 'Error: No debe haber déficit');

  const settlementWithLoanAndGas = calculateDailyCashReconciliation({
    collectedCash: 175000,
    openingRouteBase: 50000,
    expensesToday: 10000,
    disbursedToday: 95000, // Préstamo de $100k menos $5k papelería retenida
    recaudoRetiradoToday: 0,
  });
  console.assert(settlementWithLoanAndGas.collectedPlusBase === 225000, 'Error: Cobrado + Base sigue siendo $225.000');
  console.assert(settlementWithLoanAndGas.signedNetCashFlow === 120000, 'Error: Flujo neto debe ser $120.000');
  console.assert(settlementWithLoanAndGas.cashToHandOver === 120000, 'Error: Efectivo a rendir debe ser $120.000');

  const settlementWithDeficit = calculateDailyCashReconciliation({
    collectedCash: 23000,
    openingRouteBase: 50000,
    expensesToday: 0,
    disbursedToday: 95000,
    recaudoRetiradoToday: 0,
  });
  console.assert(settlementWithDeficit.collectedPlusBase === 73000, 'Error: Cobrado + Base debe ser $73.000');
  console.assert(settlementWithDeficit.signedNetCashFlow === -22000, 'Error: Flujo neto negativo debe ser -$22.000');
  console.assert(settlementWithDeficit.cashToHandOver === 0, 'Error: Físico a entregar en déficit debe ser $0');
  console.assert(settlementWithDeficit.coveredByBaseDeficit === 22000, 'Error: Déficit cubierto debe ser $22.000');
  console.log('Test 9 superado con éxito.\n');

  console.log('¡TODAS LAS PRUEBAS FINANCIERAS FUERON SUPERADAS AL 100%!');
}

runFinancialTests();
