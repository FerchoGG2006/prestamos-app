import { Customer, Loan, Installment, Payment } from './types';

export type RepaymentRatingType = 'BUEN_PAGADOR' | 'REGULAR' | 'EN_MORA' | 'SIN_HISTORIAL';

export interface RepaymentRatingInfo {
  type: RepaymentRatingType;
  label: string;
  explanation: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
}

export interface LoanHistoryRecord {
  loan: Loan;
  totalAgreed: number;
  totalPaid: number;
  remainingBalance: number;
  totalInstallments: number;
  paidInstallments: number;
  overdueInstallments: number;
  maxDelayDays: number;
  behaviorVerdict: string;
  behaviorColor: string;
  installments: Installment[];
}

export interface CreditHistoryReport {
  customer: Customer;
  rating: RepaymentRatingInfo;
  totalLoansCount: number;
  completedLoansCount: number;
  activeLoansCount: number;
  totalBorrowed: number;
  totalAgreed: number;
  totalPaid: number;
  currentRemainingBalance: number;
  currentOverdueAmount: number;
  maxOverdueDaysRecorded: number;
  loans: LoanHistoryRecord[];
}

/**
 * Calcula de forma determinista y objetiva el historial de préstamos
 * y califica si el cliente "pagó bien o pagó mal" según sus cuotas y fechas de exigibilidad.
 */
export function calculateCustomerCreditHistory(
  customer: Customer,
  loans: Loan[],
  installments: Installment[],
  _payments: Payment[],
  todayStr: string
): CreditHistoryReport {
  const customerLoans = loans
    .filter((l) => l.customerId === customer.id)
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  const today = new Date(todayStr + 'T00:00:00');

  let totalBorrowed = 0;
  let totalAgreed = 0;
  let totalPaid = 0;
  let currentRemainingBalance = 0;
  let currentOverdueAmount = 0;
  let maxOverdueDaysRecorded = 0;

  let completedLoansCount = 0;
  let activeLoansCount = 0;
  let hasActiveOverdueLoans = false;
  let hasPastLoansWithDelay = false;

  const loanRecords: LoanHistoryRecord[] = [];

  for (const loan of customerLoans) {
    totalBorrowed += loan.principal;
    totalAgreed += loan.totalAgreed;

    const isActive = loan.status === 'ACTIVE';
    const isCompleted = loan.status === 'PAID';

    if (isActive) activeLoansCount++;
    if (isCompleted) completedLoansCount++;

    const loanInsts = installments
      .filter((i) => i.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    let loanPaid = 0;
    let loanPending = 0;
    let loanOverdueAmount = 0;
    let paidInstCount = 0;
    let overdueInstCount = 0;
    let maxLoanDelayDays = 0;

    for (const inst of loanInsts) {
      loanPaid += inst.paidAmount;
      loanPending += inst.pendingAmount;

      if (inst.pendingAmount <= 0) {
        paidInstCount++;
      }

      if (inst.dueDate) {
        const dueDate = new Date(inst.dueDate + 'T00:00:00');
        const diffDays = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays > 0 && inst.pendingAmount > 0) {
          overdueInstCount++;
          loanOverdueAmount += inst.pendingAmount;
          if (diffDays > maxLoanDelayDays) {
            maxLoanDelayDays = diffDays;
          }
        } else if (inst.pendingAmount <= 0) {
          // Verificar si la cuota ya pagada se canceló con atraso respecto a su fecha de vencimiento
          const paidDateRaw =
            inst.lastPaymentDate ||
            _payments.find(
              (p) =>
                p.status === 'COMPLETED' &&
                p.installmentsBreakdown?.some((b) => b.installmentId === inst.id)
            )?.createdAt;
          const paidDateStr = paidDateRaw ? paidDateRaw.split('T')[0] : undefined;
          if (paidDateStr && paidDateStr > inst.dueDate) {
            const paidDate = new Date(paidDateStr + 'T00:00:00');
            const paidDiffDays = Math.floor(
              (paidDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (paidDiffDays > 0) {
              if (paidDiffDays > maxLoanDelayDays) {
                maxLoanDelayDays = paidDiffDays;
              }
            }
          }
        }
      }
    }

    totalPaid += loanPaid;

    if (isActive) {
      currentRemainingBalance += loanPending;
      if (overdueInstCount > 0) {
        hasActiveOverdueLoans = true;
        currentOverdueAmount += loanOverdueAmount;
      } else if (maxLoanDelayDays > 0) {
        hasPastLoansWithDelay = true;
      }
    }

    if (maxLoanDelayDays > maxOverdueDaysRecorded) {
      maxOverdueDaysRecorded = maxLoanDelayDays;
    }

    // Dictamen fáctico de comportamiento en este préstamo
    let behaviorVerdict: string;
    let behaviorColor: string;

    if (isCompleted) {
      if (maxLoanDelayDays === 0) {
        behaviorVerdict = '✓ Pagó Excelente (Puntual)';
        behaviorColor = '#059669';
      } else {
        hasPastLoansWithDelay = true;
        behaviorVerdict = `⚠ Pagó con Atraso (${maxLoanDelayDays} días máx)`;
        behaviorColor = '#D97706';
      }
    } else if (isActive) {
      if (overdueInstCount > 0) {
        behaviorVerdict = `🚨 En Mora (${overdueInstCount} cuotas vencidas - ${maxLoanDelayDays} días)`;
        behaviorColor = '#DC2626';
      } else {
        behaviorVerdict = '✓ Al Día (Al corriente)';
        behaviorColor = '#2563EB';
      }
    } else {
      if (maxLoanDelayDays > 0) {
        hasPastLoansWithDelay = true;
        behaviorVerdict = `• Renovado con Atraso previo (${maxLoanDelayDays} días máx)`;
        behaviorColor = '#D97706';
      } else {
        behaviorVerdict = '• Renovado / Liquidado';
        behaviorColor = '#64748B';
      }
    }

    loanRecords.push({
      loan,
      totalAgreed: loan.totalAgreed,
      totalPaid: loanPaid,
      remainingBalance: loanPending,
      totalInstallments: loanInsts.length,
      paidInstallments: paidInstCount,
      overdueInstallments: overdueInstCount,
      maxDelayDays: maxLoanDelayDays,
      behaviorVerdict,
      behaviorColor,
      installments: loanInsts,
    });
  }

  // Calificación del cliente en base a hechos
  let rating: RepaymentRatingInfo;

  if (customerLoans.length === 0) {
    rating = {
      type: 'SIN_HISTORIAL',
      label: 'ℹ CLIENTE NUEVO (SIN HISTORIAL)',
      explanation: 'No registra préstamos anteriores en cartera. Perfil limpio sin antecedentes.',
      textColor: '#2563EB',
      bgColor: '#EFF6FF',
      borderColor: '#BFDBFE',
    };
  } else if (hasActiveOverdueLoans) {
    rating = {
      type: 'EN_MORA',
      label: '🚨 MAL PAGADOR / EN MORA',
      explanation: `Presenta cuotas vencidas e impagas en su crédito activo (${maxOverdueDaysRecorded} días de atraso). Riesgo financiero alto.`,
      textColor: '#DC2626',
      bgColor: '#FEF2F2',
      borderColor: '#FECACA',
    };
  } else if (hasPastLoansWithDelay) {
    rating = {
      type: 'REGULAR',
      label: '⚠ REGULAR (CON ATRASOS)',
      explanation: `Ha cancelado sus compromisos pero incurrió en demoras en las cuotas (${maxOverdueDaysRecorded} días máx registrados).`,
      textColor: '#D97706',
      bgColor: '#FFFBEB',
      borderColor: '#FDE68A',
    };
  } else {
    rating = {
      type: 'BUEN_PAGADOR',
      label: '★ BUEN PAGADOR / PUNTUAL',
      explanation: 'Excelente récord financiero. Canceló o lleva sus cuotas al día sin morosidad registrada.',
      textColor: '#059669',
      bgColor: '#ECFDF5',
      borderColor: '#A7F3D0',
    };
  }

  return {
    customer,
    rating,
    totalLoansCount: customerLoans.length,
    completedLoansCount,
    activeLoansCount,
    totalBorrowed,
    totalAgreed,
    totalPaid,
    currentRemainingBalance,
    currentOverdueAmount,
    maxOverdueDaysRecorded,
    loans: loanRecords,
  };
}
