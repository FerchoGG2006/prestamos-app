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
  LoanFrequency,
  CollectionSession,
} from './types';
import {
  DEFAULT_BUSINESS_CONFIG,
  LoanBusinessConfig,
  PaperworkConfig,
  DelinquencyStrategyConfig,
  addDays,
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
 * Calcula el valor de papelería / cartulina para un crédito o renovación.
 * Regla de negocio oficial: $5.000 por cada $100.000.
 * Si el resultado contiene fracciones intermedias (ej. $13.500, $15.500, $17.500),
 * se aproxima hacia arriba al valor siguiente en millares ($1.000):
 * $350.000 -> 5% = $17.500 -> $18.000
 * $270.000 -> 5% = $13.500 -> $14.000
 * $310.000 -> 5% = $15.500 -> $16.000
 * $200.000 -> 5% = $10.000 -> $10.000
 */
export function calculatePaperworkFee(
  principal: number,
  config: PaperworkConfig = DEFAULT_BUSINESS_CONFIG.paperwork
): number {
  if (principal <= 0) return 0;
  
  const rawFee = (principal / config.base) * config.rate;
  // Redondeo hacia arriba al siguiente millar ($1.000)
  return Math.ceil(rawFee / 1000) * 1000;
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
 * Genera el plan de cuotas para un crédito según su modalidad (DIARIO, SEMANAL, QUINCENAL, MENSUAL).
 * Excluye domingos si excludeSundays está habilitado.
 */
export function generateInstallments(
  loanId: string,
  summary: LoanCalculationSummary,
  startDateStr: string, // YYYY-MM-DD
  frequency: LoanFrequency = 'DAILY',
  config: LoanBusinessConfig = DEFAULT_BUSINESS_CONFIG.loan,
  fixedDueDate?: string
): Installment[] {
  // Modalidad Pago Único a Fecha Fija
  if (frequency === 'FIXED_DATE') {
    const finalDueDate = fixedDueDate || startDateStr;
    return [
      {
        id: `${loanId}-cuota-1`,
        loanId,
        installmentNumber: 1,
        dueDate: finalDueDate,
        expectedAmount: summary.totalAgreed,
        paidAmount: 0,
        pendingAmount: summary.totalAgreed,
        status: 'PENDIENTE',
      },
    ];
  }

  const installments: Installment[] = [];
  const currentDate = new Date(startDateStr + 'T00:00:00');

  // Regla de Negocio: La primera fecha de cobro se genera desde el día siguiente (DIARIO),
  // semana siguiente (SEMANAL), quincena siguiente (QUINCENAL) o mes siguiente (MENSUAL)
  // respecto al día en que se originó el crédito (startDateStr).
  switch (frequency) {
    case 'WEEKLY':
      currentDate.setDate(currentDate.getDate() + 7);
      break;
    case 'BIWEEKLY':
      currentDate.setDate(currentDate.getDate() + 15);
      break;
    case 'MONTHLY':
      currentDate.setMonth(currentDate.getMonth() + 1);
      break;
    case 'DAILY':
    default:
      currentDate.setDate(currentDate.getDate() + 1);
      break;
  }

  const formatLocalDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  let count = 0;
  while (count < summary.installmentCount) {
    // Si excludeSundays es true y es domingo (getDay() === 0), saltar al lunes
    if (config.excludeSundays && currentDate.getDay() === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
      continue;
    }

    count++;
    const dueDateStr = formatLocalDate(currentDate);

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

    // Avanzar a la siguiente fecha según la frecuencia acordada
    switch (frequency) {
      case 'WEEKLY':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case 'BIWEEKLY':
        currentDate.setDate(currentDate.getDate() + 15);
        break;
      case 'MONTHLY':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case 'DAILY':
      default:
        currentDate.setDate(currentDate.getDate() + 1);
        break;
    }
  }

  return installments;
}

const formatIsoDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addMonthsClamped = (dateStr: string, monthsDelta: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const totalMonths = y * 12 + (m - 1) + monthsDelta;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthZero = ((totalMonths % 12) + 12) % 12;
  const maxDay = new Date(targetYear, targetMonthZero + 1, 0).getDate();
  const clampedDay = Math.min(d, maxDay);
  return `${targetYear}-${String(targetMonthZero + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
};

/**
 * Retorna la próxima ocurrencia (>= todayStr) del día de semana solicitado.
 * targetDayOfWeek: 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado.
 */
export function getUpcomingWeekdayDate(todayStr: string, targetDayOfWeek: number): string {
  const base = new Date(todayStr + 'T00:00:00');
  const currentDow = base.getDay(); // 0=Dom..6=Sáb
  const diff = (targetDayOfWeek - currentDow + 7) % 7;
  base.setDate(base.getDate() + diff);
  return formatIsoDate(base);
}

/**
 * Avanza o retrocede una fecha exactamente un periodo según la modalidad.
 */
export function stepScheduleDate(
  dateStr: string,
  frequency: LoanFrequency,
  direction: 1 | -1,
  excludeSundays: boolean = true
): string {
  if (frequency === 'MONTHLY') {
    return addMonthsClamped(dateStr, direction);
  }
  const cursor = new Date(dateStr + 'T00:00:00');
  if (frequency === 'WEEKLY') {
    cursor.setDate(cursor.getDate() + 7 * direction);
    return formatIsoDate(cursor);
  }
  if (frequency === 'BIWEEKLY') {
    cursor.setDate(cursor.getDate() + 15 * direction);
    return formatIsoDate(cursor);
  }
  // DAILY
  cursor.setDate(cursor.getDate() + direction);
  if (excludeSundays && cursor.getDay() === 0) {
    cursor.setDate(cursor.getDate() + direction);
  }
  return formatIsoDate(cursor);
}

/**
 * Genera el plan de cuotas para una migración de cartulina física anclada al "Día de pago"
 * de la próxima cuota pendiente (anchorNum). Las cuotas ya pagadas se proyectan hacia atrás
 * como PAGADA (paz y salvo) y las cuotas futuras hacia adelante como PENDIENTE.
 */
export function generateAnchoredMigrationSchedule(params: {
  loanId: string;
  summary: LoanCalculationSummary;
  frequency: LoanFrequency;
  nextDueDateStr: string;
  paidInstallmentNumbers: number[];
  config?: LoanBusinessConfig;
}): {
  startDate: string;
  endDate: string;
  anchorInstallmentNumber: number;
  installments: Installment[];
} {
  const {
    loanId,
    summary,
    frequency,
    nextDueDateStr,
    paidInstallmentNumbers,
    config = DEFAULT_BUSINESS_CONFIG.loan,
  } = params;
  const excludeSundays = config.excludeSundays ?? true;
  const count = summary.installmentCount;
  const paidSet = new Set<number>(paidInstallmentNumbers);

  let anchorNum = count;
  for (let i = 1; i <= count; i++) {
    if (!paidSet.has(i)) {
      anchorNum = i;
      break;
    }
  }

  const dueDates: string[] = new Array(count);
  dueDates[anchorNum - 1] = nextDueDateStr;

  if (frequency === 'MONTHLY') {
    for (let i = 1; i <= count; i++) {
      if (i === anchorNum) continue;
      dueDates[i - 1] = addMonthsClamped(nextDueDateStr, i - anchorNum);
    }
  } else {
    let backCursor = nextDueDateStr;
    for (let i = anchorNum - 1; i >= 1; i--) {
      backCursor = stepScheduleDate(backCursor, frequency, -1, excludeSundays);
      dueDates[i - 1] = backCursor;
    }
    let fwdCursor = nextDueDateStr;
    for (let i = anchorNum + 1; i <= count; i++) {
      fwdCursor = stepScheduleDate(fwdCursor, frequency, 1, excludeSundays);
      dueDates[i - 1] = fwdCursor;
    }
  }

  const startDate =
    frequency === 'MONTHLY'
      ? addMonthsClamped(nextDueDateStr, -anchorNum)
      : stepScheduleDate(dueDates[0], frequency, -1, excludeSundays);

  const accumulatedPrevious = summary.installmentAmount * (count - 1);
  const installments: Installment[] = dueDates.map((dueDate, idx) => {
    const num = idx + 1;
    const expectedAmount =
      num === count ? summary.totalAgreed - accumulatedPrevious : summary.installmentAmount;
    const isPaid = paidSet.has(num);
    return {
      id: `${loanId}-cuota-${num}`,
      loanId,
      installmentNumber: num,
      dueDate,
      expectedAmount,
      paidAmount: isPaid ? expectedAmount : 0,
      pendingAmount: isPaid ? 0 : expectedAmount,
      status: isPaid ? 'PAGADA' : 'PENDIENTE',
      ...(isPaid ? { lastPaymentDate: dueDate } : {}),
    };
  });

  return {
    startDate,
    endDate: dueDates[dueDates.length - 1] || nextDueDateStr,
    anchorInstallmentNumber: anchorNum,
    installments,
  };
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

  // Copia profunda para inmutabilidad y validación de saldo pendiente
  const totalPending = currentInstallments.reduce((sum, inst) => sum + inst.pendingAmount, 0);
  if (amountReceived > totalPending) {
    throw new Error('El monto ingresado supera el saldo total pendiente del crédito');
  }
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

/**
 * Resultado del cuadre diario de efectivo (Opción B: balance neto real con signo + base de inicio).
 * - collectedPlusBase = collectedCash + openingRouteBase
 * - signedNetCashFlow conserva el signo real (ej. ($175.000 + $50.000) - $95.000 - $10.000 = $120.000)
 *   para que cada cobro nuevo se refleje de inmediato en el flujo del día sin congelarse en $0.
 * - cashToHandOver representa el efectivo físico esperado a entregar a oficina (mínimo $0).
 * - coveredByBaseDeficit indica cuánto del desembolso/gasto del día fue cubierto por la oficina.
 */
export interface DailyCashReconciliation {
  openingRouteBase: number;
  collectedPlusBase: number;
  signedNetCashFlow: number;
  cashToHandOver: number;
  coveredByBaseDeficit: number;
  isDeficitCoveredByBase: boolean;
}

export function calculateDailyCashReconciliation(params: {
  collectedCash: number;
  openingRouteBase?: number;
  expensesToday: number;
  disbursedToday: number;
  recaudoRetiradoToday?: number;
}): DailyCashReconciliation {
  const collected = Math.round(params.collectedCash || 0);
  const openingBase = Math.max(0, Math.round(params.openingRouteBase || 0));
  const expenses = Math.round(params.expensesToday || 0);
  const disbursed = Math.round(params.disbursedToday || 0);
  const recaudoRetirado = Math.round(params.recaudoRetiradoToday || 0);

  const collectedPlusBase = collected + openingBase;
  const signedNetCashFlow = collectedPlusBase - expenses - disbursed - recaudoRetirado;
  const cashToHandOver = Math.max(0, signedNetCashFlow);
  const coveredByBaseDeficit = signedNetCashFlow < 0 ? Math.abs(signedNetCashFlow) : 0;

  return {
    openingRouteBase: openingBase,
    collectedPlusBase,
    signedNetCashFlow,
    cashToHandOver,
    coveredByBaseDeficit,
    isDeficitCoveredByBase: signedNetCashFlow < 0,
  };
}

/**
 * Filtra exclusivamente los pagos completados correspondientes a la jornada activa (`todayStr`).
 * Mantiene paridad exacta con el cálculo diario de `localStore.getDailyRouteMetrics`.
 */
export function filterSessionDayPayments(
  payments: Payment[],
  todayStr: string,
  session?: Pick<CollectionSession, 'id' | 'date'> | null
): Payment[] {
  const sessionId = session?.id;
  const isCurrentSessionDate = Boolean(sessionId && session?.date === todayStr);
  return (payments || []).filter(
    (p) =>
      p.status === 'COMPLETED' &&
      (Boolean(p.createdAt?.startsWith(todayStr)) ||
        (isCurrentSessionDate && p.sessionId === sessionId))
  );
}

/**
 * Utilidades de fecha para control operativo y renovación automática a las 00:00 horas
 */
export const APP_TIMEZONE = 'America/Bogota';

export function getLocalTodayStr(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return y + '-' + m + '-' + d;
  } catch {
    // Fallback al reloj local
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Alias histórico: la implementación única vive en business-rules.addDays. */
export const addDaysToDate = addDays;
export const getLocalDateStr = getLocalTodayStr;

export function getMsUntilNextMidnight(): number {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: APP_TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? now.getHours()) % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? now.getMinutes());
    const s = Number(parts.find((p) => p.type === 'second')?.value ?? now.getSeconds());
    const elapsedMs = (h * 3600 + m * 60 + s) * 1000 + now.getMilliseconds();
    return Math.max(1000, 86400000 - elapsedMs + 1000);
  } catch {
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    return Math.max(1000, nextMidnight.getTime() - now.getTime());
  }
}

