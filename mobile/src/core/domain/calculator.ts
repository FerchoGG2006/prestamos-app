/**
 * CALCULADORA FINANCIERA Y MOTOR DE CARTERA
 * 
 * Reglas deterministas, auditables y sin efectos secundarios.
 * Toda la lógica financiera está desacoplada de la UI.
 */

import {
  Loan,
  Installment,
  InstallmentStatus,
  Payment,
  PaymentBreakdownItem,
  PaymentMethod,
  Renewal,
} from './types';
import {
  DEFAULT_BUSINESS_CONFIG,
  LoanBusinessConfig,
  PaperworkConfig,
  DelinquencyStrategyConfig,
} from '../config/business-rules';

export interface LoanCalculationSummary {
  principal: number;
  interestRate: number;
  interestAmount: number;
  totalAgreed: number;
  installmentCount: number;
  installmentAmount: number;
}

/**
 * Calcula el total pactado y el valor de cada cuota.
 * Regla actual: Interés = Capital Inicial × Tasa (ej. $150.000 × 20% = $30.000).
 * Total = $180.000. Cuota (ej. 30 días) = $6.000/día.
 */
export function calculateLoanSummary(
  principal: number,
  interestRate: number = DEFAULT_BUSINESS_CONFIG.loan.defaultInterestRate,
  installmentCount: number = DEFAULT_BUSINESS_CONFIG.loan.defaultInstallmentsCount
): LoanCalculationSummary {
  if (principal <= 0) throw new Error('El capital debe ser mayor a 0');
  if (installmentCount <= 0) throw new Error('El número de cuotas debe ser mayor a 0');

  const interestAmount = Math.round(principal * interestRate);
  const totalAgreed = principal + interestAmount;
  const installmentAmount = Math.round(totalAgreed / installmentCount);

  return {
    principal,
    interestRate,
    interestAmount,
    totalAgreed,
    installmentCount,
    installmentAmount,
  };
}

/**
 * Calcula el valor de papelería para un crédito o renovación.
 * Regla actual: $5.000 por cada $100.000.
 */
export function calculatePaperworkFee(
  principal: number,
  config: PaperworkConfig = DEFAULT_BUSINESS_CONFIG.paperwork
): number {
  if (principal <= 0) return 0;
  
  switch (config.calculationMode) {
    case 'PROPORTIONAL':
      return Math.round((principal / config.base) * config.rate);
    case 'STEP_CEIL':
      return Math.ceil(principal / config.base) * config.rate;
    case 'STEP_FLOOR':
      return Math.floor(principal / config.base) * config.rate;
    default:
      return Math.round((principal / config.base) * config.rate);
  }
}

/**
 * Calcula el desglose financiero de una renovación.
 * REGLA CRÍTICA:
 * Capital nuevo: $200.000 (NO $130.000)
 * Menos saldo anterior: $60.000
 * Menos papelería: $10.000
 * Desembolso real entregado en mano: $130.000
 */
export function calculateRenewalDisbursement(
  newPrincipal: number,
  previousLoanRemainingBalance: number,
  paperworkFee?: number,
  paperworkConfig: PaperworkConfig = DEFAULT_BUSINESS_CONFIG.paperwork
) {
  const calculatedPaperwork = paperworkFee !== undefined 
    ? paperworkFee 
    : calculatePaperworkFee(newPrincipal, paperworkConfig);

  const actualCashDisbursed = newPrincipal - previousLoanRemainingBalance - calculatedPaperwork;

  if (actualCashDisbursed < 0) {
    throw new Error(
      `El desembolso resultante es negativo ($${actualCashDisbursed}). El nuevo crédito no cubre el saldo anterior y los gastos.`
    );
  }

  return {
    newPrincipal,
    previousBalanceDeducted: previousLoanRemainingBalance,
    paperworkDeducted: calculatedPaperwork,
    actualCashDisbursed,
  };
}

/**
 * Genera el plan de cuotas para un crédito.
 * Excluye domingos si excludeSundays está habilitado.
 */
export function generateInstallments(
  loanId: string,
  summary: LoanCalculationSummary,
  startDateStr: string, // YYYY-MM-DD
  config: LoanBusinessConfig = DEFAULT_BUSINESS_CONFIG.loan
): Installment[] {
  const installments: Installment[] = [];
  const currentDate = new Date(startDateStr + 'T00:00:00');

  let count = 0;
  while (count < summary.installmentCount) {
    // Si excludeSundays es true y es domingo (getDay() === 0), saltar al lunes
    if (config.excludeSundays && currentDate.getDay() === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    count++;
    const dueDateStr = currentDate.toISOString().split('T')[0];

    // Ajuste de redondeo en la última cuota si existieran diferencias de centavos
    const isLast = count === summary.installmentCount;
    const accumulatedPrevious = summary.installmentAmount * (summary.installmentCount - 1);
    const expectedAmount = isLast
      ? summary.totalAgreed - accumulatedPrevious
      : summary.installmentAmount;

    installments.push({
      id: `${loanId}-cuota-${count}`,
      loanId,
      installmentNumber: count,
      dueDate: dueDateStr,
      expectedAmount,
      paidAmount: 0,
      pendingAmount: expectedAmount,
      status: 'PENDIENTE',
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return installments;
}

/**
 * Aplica un pago entregado por el cliente sobre las cuotas del crédito.
 * 
 * Reglas de aplicación estricta:
 * 1. Orden cronológico de cuotas pendientes (cuotas vencidas o parciales primero).
 * 2. Si el pago es parcial: actualiza paidAmount y pendingAmount, estado = 'PARCIAL'. No crea cuotas nuevas.
 * 3. Si el pago cubre varias cuotas: distribuye el dinero secuencialmente.
 * 4. Si se paga una cuota con fecha futura: queda como 'ADELANTADA' con pendingAmount = 0.
 * 5. Genera el registro inmutable de Payment con su desglose exacto (installmentsBreakdown).
 */
export function applyPaymentToLoan(params: {
  loan: Loan;
  currentInstallments: Installment[];
  amountReceived: number;
  paymentMethod: PaymentMethod;
  collectorId: string;
  sessionId: string;
  todayStr: string; // YYYY-MM-DD
  paymentId: string;
  idempotencyKey: string;
  notes?: string;
}): {
  updatedLoan: Loan;
  updatedInstallments: Installment[];
  payment: Payment;
} {
  const {
    loan,
    currentInstallments,
    amountReceived,
    paymentMethod,
    collectorId,
    sessionId,
    todayStr,
    paymentId,
    idempotencyKey,
    notes,
  } = params;

  if (amountReceived <= 0) {
    throw new Error('El monto a pagar debe ser mayor a 0');
  }

  // Copia profunda para inmutabilidad
  const updatedInstallments: Installment[] = currentInstallments.map((inst) => ({ ...inst }));

  // Ordenar cuotas por número para aplicación cronológica estricta
  updatedInstallments.sort((a, b) => a.installmentNumber - b.installmentNumber);

  let remainingMoney = amountReceived;
  const breakdown: PaymentBreakdownItem[] = [];

  for (const inst of updatedInstallments) {
    if (remainingMoney <= 0) break;
    if (inst.pendingAmount <= 0) continue; // Ya pagada completamente

    const previousPending = inst.pendingAmount;
    const amountToApply = Math.min(remainingMoney, inst.pendingAmount);

    inst.paidAmount += amountToApply;
    inst.pendingAmount -= amountToApply;
    inst.lastPaymentDate = todayStr;
    remainingMoney -= amountToApply;

    // Determinar nuevo estado de la cuota
    let resultingStatus: InstallmentStatus;
    if (inst.pendingAmount > 0) {
      // Pago parcial
      resultingStatus = 'PARCIAL';
    } else {
      // Totalmente saldada
      if (inst.dueDate > todayStr) {
        resultingStatus = 'ADELANTADA';
      } else {
        resultingStatus = 'PAGADA';
      }
    }
    inst.status = resultingStatus;

    breakdown.push({
      installmentId: inst.id,
      installmentNumber: inst.installmentNumber,
      amountApplied: amountToApply,
      previousPending,
      newPending: inst.pendingAmount,
      resultingStatus,
    });
  }

  // Verificar si todo el crédito quedó pagado
  const allPaid = updatedInstallments.every((inst) => inst.pendingAmount === 0);
  const updatedLoan: Loan = {
    ...loan,
    status: allPaid ? 'PAID' : loan.status,
    updatedAt: todayStr,
  };

  const payment: Payment = {
    id: paymentId,
    idempotencyKey,
    loanId: loan.id,
    customerId: loan.customerId,
    collectorId,
    sessionId,
    amountReceived,
    paymentMethod,
    installmentsBreakdown: breakdown,
    notes,
    status: 'COMPLETED',
    createdAt: todayStr,
  };

  return {
    updatedLoan,
    updatedInstallments,
    payment,
  };
}

/**
 * Métricas de mora deterministas fácticas.
 * Registra días, cuotas y saldo vencido SIN inventar fórmulas no autorizadas.
 */
export interface DelinquencySummary {
  hasDelinquency: boolean;
  overdueDays: number;
  overdueInstallmentsCount: number;
  overdueAmount: number;
  surchargeAmount: number; // Siempre 0 si la estrategia de mora no está definida
}

export function calculateDelinquencyMetrics(
  installments: Installment[],
  todayStr: string,
  config: DelinquencyStrategyConfig = DEFAULT_BUSINESS_CONFIG.delinquency
): DelinquencySummary {
  const today = new Date(todayStr + 'T00:00:00');
  
  let overdueDays = 0;
  let overdueInstallmentsCount = 0;
  let overdueAmount = 0;

  for (const inst of installments) {
    if (inst.pendingAmount <= 0) continue;

    const dueDate = new Date(inst.dueDate + 'T00:00:00');
    const diffTime = today.getTime() - dueDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > config.graceDays) {
      overdueInstallmentsCount++;
      overdueAmount += inst.pendingAmount;
      if (diffDays > overdueDays) {
        overdueDays = diffDays;
      }
    }
  }

  let surchargeAmount = 0;
  if (config.isSurchargeEnabled) {
    // Si en el futuro el negocio activa recargo, se aplica aquí
    if (config.surchargeType === 'PERCENTAGE_DAILY') {
      surchargeAmount = Math.round(overdueAmount * config.surchargeValue * overdueDays);
    } else if (config.surchargeType === 'FIXED') {
      surchargeAmount = config.surchargeValue;
    }
    if (config.maxSurchargeCap && surchargeAmount > config.maxSurchargeCap) {
      surchargeAmount = config.maxSurchargeCap;
    }
  }

  return {
    hasDelinquency: overdueInstallmentsCount > 0,
    overdueDays,
    overdueInstallmentsCount,
    overdueAmount,
    surchargeAmount,
  };
}
