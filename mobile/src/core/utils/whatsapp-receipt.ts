import { Linking, Share, Alert, Platform } from 'react-native';
import { Customer, Loan, Installment, Payment } from '../domain/types';
import { formatCOP, getFrequencyLabel } from '../config/business-rules';

export const PUBLIC_RECEIPT_BASE_URL = 'https://cartera-movil.expo.app';

export type OfficialReceiptType = 'PAYMENT' | 'LOAN' | 'RENEWAL';
export type OfficialReceiptStatus = 'APPROVED' | 'REVERSED' | 'CANCELLED';

export interface OfficialReceiptDetailRow {
  label: string;
  value: string;
  highlight?: boolean;
  danger?: boolean;
}

export interface OfficialReceiptPayload {
  subtitle?: string;
  paymentMethod?: string;
  installmentLabel?: string;
  installmentAmount?: number;
  remainingBalance?: number;
  isPaidOff?: boolean;
  overdueAmount?: number;
  overdueDays?: number;
  principal?: number;
  totalAgreed?: number;
  installmentCount?: number;
  frequencyLabel?: string;
  paperworkFee?: number;
  netCashDelivered?: number;
  previousBalanceDeducted?: number;
  previousLoanNumber?: string;
  firstDueDate?: string;
  fixedDueDate?: string;
  collectorName?: string;
  footerMessage?: string;
  notes?: string;
}

export interface OfficialReceiptData {
  receiptCode: string;
  receiptType: OfficialReceiptType;
  entityId: string;
  companyName: string;
  routeName?: string;
  customerName: string;
  customerDocument?: string;
  customerPhone?: string;
  loanNumber?: string;
  amount: number;
  status: OfficialReceiptStatus;
  issuedAtDisplay: string;
  payload: OfficialReceiptPayload;
  isCloudVerified: boolean;
}

export interface ReceiptFormatContext {
  companyConfig?: any;
  companyName?: string;
  receiptFooterMessage?: string;
  customer: Customer;
  loan: Loan;
  payment: Payment;
  remainingBalance: number;
  installments?: Installment[];
  nextDueDate?: string;
  paidInstallmentsCount?: number;
  totalInstallmentsCount?: number;
}

export interface AccountStatementContext {
  companyConfig?: any;
  companyName?: string;
  supportPhone?: string;
  receiptFooterMessage?: string;
  customer: Customer;
  loan: Loan;
  installments: Installment[];
  remainingBalance?: number;
  overdueDays?: number;
  overdueAmount?: number;
  todayStr?: string;
}

export interface ShortCuadreContext {
  companyName?: string;
  routeName?: string;
  collectorName?: string;
  dateStr: string;
  isSealed: boolean;
  folio?: string;
  totalCollected: number;
  collectedCash: number;
  collectedDigital: number;
  openingRouteBase: number;
  salidasCount: number;
  disbursedNet: number;
  expenses: number;
  cashToHandOver: number;
  cashHandedOver: number;
  cashDifference: number;
  withdrawnToOffice?: number;
  overdueCustomersCount: number;
  overdueTotalAmount: number;
  visitedCount?: number;
  expectedCount?: number;
  notes?: string;
}

/**
 * Formatea moneda COP usando espacio ASCII estándar (evita \u00A0 que rompe negritas en WhatsApp y PDF).
 */
export function formatCOPPlain(amount: number): string {
  return formatCOP(amount).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Normaliza un número telefónico colombiano agregando el prefijo 57 si tiene 10 dígitos.
 */
export function normalizeWhatsAppPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `57${digits}`;
  return digits;
}

/**
 * Construye la URL pública oficial e inalterable de verificación del comprobante Kredia.
 */
export function buildOfficialReceiptUrl(receiptCode: string): string {
  const clean = (receiptCode || '').trim().toUpperCase();
  return `${PUBLIC_RECEIPT_BASE_URL}/?r=${encodeURIComponent(clean)}`;
}

/**
 * Formatea fecha/hora local de Colombia estilo fintech: "26/11/26 07:15:04"
 */
export function formatColombiaTimestamp(input?: string | Date): string {
  let d: Date;
  if (input instanceof Date) {
    d = input;
  } else if (typeof input === 'string' && input.trim()) {
    const raw = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, day] = raw.split('-');
      return `${day}/${m}/${y.slice(-2)}`;
    }
    const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    d = new Date();
  }

  try {
    const parts = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '00';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

export function getPaymentMethodLabel(method?: string): string {
  switch (String(method || 'CASH').toUpperCase()) {
    case 'NEQUI':
      return 'Nequi';
    case 'TRANSFER':
    case 'TRANSFERENCIA':
      return 'Transferencia';
    case 'OTHER':
    case 'OTRO':
      return 'Otro';
    case 'CASH':
    case 'EFECTIVO':
    default:
      return 'Efectivo';
  }
}

export function getReceiptTitle(type: OfficialReceiptType): string {
  switch (type) {
    case 'LOAN':
      return 'Comprobante de préstamo';
    case 'RENEWAL':
      return 'Comprobante de renovación';
    case 'PAYMENT':
    default:
      return 'Comprobante de pago';
  }
}

/**
 * Calcula el saldo restante HISTÓRICO exacto inmediatamente después de `targetPayment`.
 * Corrige el bug donde un pago anterior de un crédito renovado o liquidado posteriormente mostraba "$ 0".
 */
export function calculateHistoricalRemainingBalance(params: {
  loan: Loan;
  installments: Installment[];
  allLoanPayments: Payment[];
  targetPayment: Payment;
}): number {
  const { loan, installments, allLoanPayments, targetPayment } = params;
  const loanInsts = installments
    .filter((i) => i.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const completedPayments = allLoanPayments
    .filter((p) => p.loanId === loan.id && p.status !== 'REVERSED' && p.status !== 'ANNULLED')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));

  const targetIdx = completedPayments.findIndex((p) => p.id === targetPayment.id);

  // Caso 1: Crédito renovado o cancelado posteriormente (las cuotas fueron puestas en 0 por la renovación)
  if (loan.status === 'RENEWED' || loan.status === 'CANCELLED') {
    const breakdown = targetPayment.installmentsBreakdown || [];
    if (breakdown.length > 0) {
      const byInstNum = new Map<number, number>();
      let maxNum = 0;
      for (const b of breakdown) {
        const num = Number(b.installmentNumber) || 0;
        if (num > maxNum) maxNum = num;
        const prev = byInstNum.get(num);
        const np = Math.max(0, Number(b.newPending) || 0);
        byInstNum.set(num, prev === undefined ? np : Math.min(prev, np));
      }
      let rem = 0;
      for (const val of byInstNum.values()) rem += val;
      if (loanInsts.length > 0) {
        for (const inst of loanInsts) {
          if (inst.installmentNumber > maxNum) {
            rem += Math.max(0, Number(inst.expectedAmount) || 0);
          }
        }
      } else {
        const totalCount = loan.installmentCount || 0;
        const remainingCount = Math.max(0, totalCount - maxNum);
        rem += remainingCount * Math.max(0, loan.installmentAmount || 0);
      }
      return Math.max(0, Math.min(loan.totalAgreed || rem, Math.round(rem)));
    }

    // Sin breakdown: descontar pagos completados hasta targetPayment del totalAgreed
    const paidUpToTarget =
      targetIdx >= 0
        ? completedPayments.slice(0, targetIdx + 1).reduce((s, p) => s + (p.amountReceived || 0), 0)
        : targetPayment.amountReceived || 0;
    return Math.max(0, Math.round((loan.totalAgreed || 0) - paidUpToTarget));
  }

  // Caso 2: Crédito ACTIVE o PAID — usar saldo actual + pagos posteriores (preserva cuotas pre-pagadas de migración)
  const currentRemaining =
    loanInsts.length > 0
      ? loanInsts.reduce((sum, i) => sum + Math.max(0, i.pendingAmount || 0), 0)
      : Math.max(
          0,
          (loan.totalAgreed || 0) - completedPayments.reduce((s, p) => s + (p.amountReceived || 0), 0)
        );

  const laterPaymentsSum =
    targetIdx >= 0
      ? completedPayments.slice(targetIdx + 1).reduce((sum, p) => sum + (p.amountReceived || 0), 0)
      : 0;

  const historical = currentRemaining + laterPaymentsSum;
  return Math.max(0, Math.min(loan.totalAgreed || historical, Math.round(historical)));
}

/**
 * Construye etiqueta de cuota pagada para un pago (ej. "Cuota 17 de 40").
 */
export function resolvePaymentInstallmentLabel(
  loan: Loan,
  payment: Payment,
  installments?: Installment[]
): string {
  const totalCount = loan.installmentCount || installments?.length || 1;
  const breakdown = payment.installmentsBreakdown || [];
  if (breakdown.length === 1) {
    return `Cuota ${breakdown[0].installmentNumber} de ${totalCount}`;
  }
  if (breakdown.length > 1) {
    const nums = breakdown.map((b) => b.installmentNumber).sort((a, b) => a - b);
    const first = nums[0];
    const last = nums[nums.length - 1];
    return `Cuotas ${first}-${last} de ${totalCount}`;
  }
  if (installments && installments.length > 0) {
    const paidSoFar = installments.filter((i) => i.pendingAmount <= 0).length;
    return `Cuota ${Math.max(1, Math.min(paidSoFar, totalCount))} de ${totalCount}`;
  }
  return `Cuota 1 de ${totalCount}`;
}

/**
 * Construye un objeto OfficialReceiptData a partir de un Pago.
 */
export function buildPaymentOfficialReceipt(params: {
  companyName: string;
  routeName?: string;
  collectorName?: string;
  footerMessage?: string;
  customer: Customer;
  loan: Loan;
  payment: Payment;
  remainingBalance: number;
  installments?: Installment[];
  overdueAmount?: number;
  overdueDays?: number;
}): OfficialReceiptData {
  const instLabel = resolvePaymentInstallmentLabel(params.loan, params.payment, params.installments);
  const cleanRem = Math.max(0, Math.round(params.remainingBalance));
  const isPaidOff = cleanRem <= 0;
  const shortEntity = params.payment.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'LOCAL';

  return {
    receiptCode: `LOCAL-${shortEntity}`,
    receiptType: 'PAYMENT',
    entityId: params.payment.id,
    companyName: params.companyName || 'Mi Oficina',
    routeName: params.routeName || '',
    customerName: params.customer.fullName,
    customerDocument: params.customer.documentNumber || '',
    customerPhone: params.customer.whatsappPhone || params.customer.phone || '',
    loanNumber: params.loan.loanNumber || '',
    amount: Math.max(0, Math.round(params.payment.amountReceived)),
    status: params.payment.status === 'REVERSED' || params.payment.status === 'ANNULLED' ? 'REVERSED' : 'APPROVED',
    issuedAtDisplay: formatColombiaTimestamp(params.payment.createdAt),
    isCloudVerified: false,
    payload: {
      subtitle: `Pago de cuota · ${instLabel}`,
      paymentMethod: getPaymentMethodLabel(params.payment.paymentMethod),
      installmentLabel: instLabel,
      installmentAmount: Math.round(params.loan.installmentAmount || 0),
      remainingBalance: cleanRem,
      isPaidOff,
      overdueAmount: params.overdueAmount && params.overdueAmount > 0 ? Math.round(params.overdueAmount) : 0,
      overdueDays: params.overdueDays && params.overdueDays > 0 ? params.overdueDays : 0,
      collectorName: params.collectorName || '',
      footerMessage: params.footerMessage || '',
      notes: params.payment.notes || '',
    },
  };
}

/**
 * Construye un objeto OfficialReceiptData a partir de un Nuevo Préstamo.
 */
export function buildLoanOfficialReceipt(params: {
  companyName: string;
  routeName?: string;
  collectorName?: string;
  footerMessage?: string;
  customer: Customer;
  loan: Loan;
  paperworkFee: number;
  firstDueDate?: string;
}): OfficialReceiptData {
  const freqLabel = getFrequencyLabel(params.loan.frequency);
  const netDelivered = Math.max(0, Math.round(params.loan.principal - (params.paperworkFee || 0)));
  const shortEntity = params.loan.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'LOCAL';
  const subtitle =
    params.loan.frequency === 'FIXED_DATE'
      ? `Nuevo préstamo · Fecha fija`
      : `Nuevo préstamo · ${params.loan.installmentCount} cuotas (${freqLabel})`;

  return {
    receiptCode: `LOCAL-${shortEntity}`,
    receiptType: 'LOAN',
    entityId: params.loan.id,
    companyName: params.companyName || 'Mi Oficina',
    routeName: params.routeName || '',
    customerName: params.customer.fullName,
    customerDocument: params.customer.documentNumber || '',
    customerPhone: params.customer.whatsappPhone || params.customer.phone || '',
    loanNumber: params.loan.loanNumber || '',
    amount: Math.round(params.loan.principal),
    status: params.loan.status === 'CANCELLED' ? 'CANCELLED' : 'APPROVED',
    issuedAtDisplay: formatColombiaTimestamp(params.loan.createdAt),
    isCloudVerified: false,
    payload: {
      subtitle,
      principal: Math.round(params.loan.principal),
      totalAgreed: Math.round(params.loan.totalAgreed),
      installmentAmount: Math.round(params.loan.installmentAmount),
      installmentCount: params.loan.installmentCount,
      frequencyLabel: freqLabel,
      paperworkFee: Math.max(0, Math.round(params.paperworkFee || 0)),
      netCashDelivered: netDelivered,
      firstDueDate: params.firstDueDate || '',
      fixedDueDate: params.loan.fixedDueDate || '',
      collectorName: params.collectorName || '',
      footerMessage: params.footerMessage || '',
    },
  };
}

/**
 * Construye un objeto OfficialReceiptData a partir de una Renovación.
 */
export function buildRenewalOfficialReceipt(params: {
  companyName: string;
  routeName?: string;
  collectorName?: string;
  footerMessage?: string;
  customer: Customer;
  previousLoanNumber?: string;
  newLoan: Loan;
  renewalId: string;
  previousBalanceDeducted: number;
  paperworkDeducted: number;
  actualCashDisbursed: number;
  createdAt?: string;
}): OfficialReceiptData {
  const freqLabel = getFrequencyLabel(params.newLoan.frequency);
  const shortEntity = params.renewalId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase() || 'LOCAL';
  const subtitle =
    params.newLoan.frequency === 'FIXED_DATE'
      ? `Renovación · Fecha fija`
      : `Renovación · ${params.newLoan.installmentCount} cuotas (${freqLabel})`;

  return {
    receiptCode: `LOCAL-${shortEntity}`,
    receiptType: 'RENEWAL',
    entityId: params.renewalId,
    companyName: params.companyName || 'Mi Oficina',
    routeName: params.routeName || '',
    customerName: params.customer.fullName,
    customerDocument: params.customer.documentNumber || '',
    customerPhone: params.customer.whatsappPhone || params.customer.phone || '',
    loanNumber: params.newLoan.loanNumber || '',
    amount: Math.max(0, Math.round(params.actualCashDisbursed)),
    status: 'APPROVED',
    issuedAtDisplay: formatColombiaTimestamp(params.createdAt || params.newLoan.createdAt),
    isCloudVerified: false,
    payload: {
      subtitle,
      principal: Math.round(params.newLoan.principal),
      totalAgreed: Math.round(params.newLoan.totalAgreed),
      installmentAmount: Math.round(params.newLoan.installmentAmount),
      installmentCount: params.newLoan.installmentCount,
      frequencyLabel: freqLabel,
      previousLoanNumber: params.previousLoanNumber || '',
      previousBalanceDeducted: Math.max(0, Math.round(params.previousBalanceDeducted)),
      paperworkFee: Math.max(0, Math.round(params.paperworkDeducted)),
      netCashDelivered: Math.max(0, Math.round(params.actualCashDisbursed)),
      fixedDueDate: params.newLoan.fixedDueDate || '',
      collectorName: params.collectorName || '',
      footerMessage: params.footerMessage || '',
    },
  };
}

/**
 * Fuente única de verdad para las filas mostradas en la tarjeta visual y en el ticket PDF.
 */
export function buildReceiptDetailRows(receipt: OfficialReceiptData): OfficialReceiptDetailRow[] {
  const p = receipt.payload || {};
  const rows: OfficialReceiptDetailRow[] = [
    { label: 'Fecha y hora', value: receipt.issuedAtDisplay || formatColombiaTimestamp() },
    { label: 'Cliente', value: receipt.customerName || 'Cliente' },
  ];

  if (receipt.routeName) {
    rows.push({ label: 'Ruta', value: receipt.routeName });
  }
  if (receipt.loanNumber) {
    rows.push({ label: 'Crédito', value: receipt.loanNumber });
  }

  if (receipt.receiptType === 'PAYMENT') {
    if (p.installmentLabel) {
      rows.push({ label: 'Cuota', value: p.installmentLabel });
    }
    if (p.installmentAmount !== undefined && p.installmentAmount > 0) {
      rows.push({ label: 'Valor cuota', value: formatCOPPlain(p.installmentAmount) });
    }
    if (p.paymentMethod) {
      rows.push({ label: 'Medio de pago', value: p.paymentMethod });
    }
    const rem = Math.max(0, Number(p.remainingBalance ?? 0));
    rows.push({
      label: 'Saldo pendiente',
      value: rem <= 0 ? '$ 0 (Cancelado)' : formatCOPPlain(rem),
      highlight: true,
    });
    if ((p.overdueAmount || 0) > 0 && (p.overdueDays || 0) > 0) {
      rows.push({
        label: 'Mora actual',
        value: `${formatCOPPlain(p.overdueAmount || 0)} (${p.overdueDays}d)`,
        danger: true,
      });
    }
  } else if (receipt.receiptType === 'LOAN') {
    if (p.frequencyLabel) {
      const plazo =
        p.fixedDueDate
          ? `Fecha fija (${p.fixedDueDate})`
          : `${p.installmentCount || 1} cuotas (${p.frequencyLabel})`;
      rows.push({ label: 'Modalidad', value: plazo });
    }
    if (p.principal !== undefined) {
      rows.push({ label: 'Capital prestado', value: formatCOPPlain(p.principal) });
    }
    if ((p.paperworkFee || 0) > 0) {
      rows.push({ label: 'Papelería', value: `- ${formatCOPPlain(p.paperworkFee || 0)}` });
    }
    if (p.netCashDelivered !== undefined) {
      rows.push({
        label: 'Efectivo entregado',
        value: formatCOPPlain(p.netCashDelivered),
        highlight: true,
      });
    }
    if (p.totalAgreed !== undefined) {
      rows.push({ label: 'Total a pagar', value: formatCOPPlain(p.totalAgreed), highlight: true });
    }
    if (p.installmentAmount !== undefined && p.installmentAmount > 0) {
      rows.push({ label: 'Valor cuota', value: formatCOPPlain(p.installmentAmount) });
    }
    if (p.firstDueDate) {
      rows.push({ label: 'Primer cobro', value: p.firstDueDate });
    }
  } else if (receipt.receiptType === 'RENEWAL') {
    if (p.principal !== undefined) {
      rows.push({ label: 'Nuevo capital', value: formatCOPPlain(p.principal) });
    }
    if ((p.previousBalanceDeducted || 0) > 0) {
      rows.push({
        label: 'Saldo anterior liquidado',
        value: `- ${formatCOPPlain(p.previousBalanceDeducted || 0)}`,
      });
    }
    if ((p.paperworkFee || 0) > 0) {
      rows.push({ label: 'Papelería', value: `- ${formatCOPPlain(p.paperworkFee || 0)}` });
    }
    rows.push({
      label: 'Efectivo entregado',
      value: formatCOPPlain(p.netCashDelivered ?? receipt.amount),
      highlight: true,
    });
    if (p.totalAgreed !== undefined) {
      rows.push({ label: 'Nuevo total a pagar', value: formatCOPPlain(p.totalAgreed), highlight: true });
    }
    if (p.installmentAmount !== undefined && p.installmentAmount > 0) {
      const plazo = p.fixedDueDate
        ? `Fecha fija (${p.fixedDueDate})`
        : `${formatCOPPlain(p.installmentAmount)} (${p.installmentCount || 1} ${p.frequencyLabel || ''})`.trim();
      rows.push({ label: 'Nueva cuota', value: plazo });
    }
  }

  rows.push({
    label: 'Código verificación',
    value: receipt.receiptCode,
  });

  return rows;
}

/**
 * Genera el mensaje corto antifraude para WhatsApp (1 toque al chat exacto del cliente).
 * Si existe enlace oficial en la nube, NO incluye montos editables en el texto: el cliente abre la tarjeta oficial + PDF.
 */
export function formatOfficialReceiptWhatsAppMessage(receipt: OfficialReceiptData): string {
  const office = (receipt.companyName || 'Kredia').trim();
  const title = getReceiptTitle(receipt.receiptType);

  if (receipt.isCloudVerified && receipt.receiptCode.startsWith('KRD-')) {
    const url = buildOfficialReceiptUrl(receipt.receiptCode);
    return [
      `*${title} — ${office}*`,
      `Ver comprobante oficial y descargar PDF:`,
      url,
    ].join('\n');
  }

  // Respaldo offline corto cuando no hubo señal al momento de emitir
  const p = receipt.payload || {};
  const lines = [
    `*${title} — ${office}*`,
    `Fecha: ${receipt.issuedAtDisplay}`,
  ];
  if (receipt.receiptType === 'PAYMENT') {
    lines.push(`Pagó: ${formatCOPPlain(receipt.amount)}`);
    lines.push(`Saldo: ${formatCOPPlain(Math.max(0, Number(p.remainingBalance ?? 0)))}`);
    if (p.installmentLabel) lines.push(p.installmentLabel);
    if (p.isPaidOff) lines.push('*Crédito cancelado. ¡Gracias!*');
  } else if (receipt.receiptType === 'LOAN') {
    lines.push(`Capital: ${formatCOPPlain(p.principal ?? receipt.amount)}`);
    lines.push(`Total a pagar: ${formatCOPPlain(p.totalAgreed ?? receipt.amount)}`);
    if (p.installmentAmount) lines.push(`Cuota: ${formatCOPPlain(p.installmentAmount)}`);
  } else {
    lines.push(`Nuevo capital: ${formatCOPPlain(p.principal ?? 0)}`);
    lines.push(`Entregado neto: ${formatCOPPlain(p.netCashDelivered ?? receipt.amount)}`);
    lines.push(`Nuevo total: ${formatCOPPlain(p.totalAgreed ?? 0)}`);
  }
  lines.push(`Ref: ${receipt.receiptCode} (Verificado por Kredia)`);
  return lines.join('\n');
}

/**
 * Formatea un Recibo Digital de Abono corto (retrocompatible para pruebas/respaldo).
 */
export function formatDigitalPaymentReceipt(ctx: ReceiptFormatContext): string {
  const cleanRem = Math.max(0, Math.round(ctx.remainingBalance));
  const isPaidOff = cleanRem <= 0;
  const instLabel = resolvePaymentInstallmentLabel(ctx.loan, ctx.payment, ctx.installments);
  const company = (ctx.companyName || ctx.companyConfig?.companyName || '').trim();
  const header = company ? `*Comprobante de pago — ${company}*` : '*Comprobante de pago*';

  const lines: string[] = [
    header,
    `Fecha: ${ctx.payment.createdAt}`,
    `Pagó: ${formatCOPPlain(ctx.payment.amountReceived)}`,
    `Saldo: ${formatCOPPlain(cleanRem)}`,
    `${instLabel} (${formatCOPPlain(ctx.loan.installmentAmount)})`,
  ];

  if (isPaidOff) {
    lines.push('*¡Crédito cancelado! Gracias por su pago.*');
  }

  const footer = (ctx.receiptFooterMessage || ctx.companyConfig?.receiptFooterMessage || '').trim();
  if (footer) {
    lines.push(`_${footer}_`);
  }

  return lines.join('\n');
}

/**
 * Formatea un Resumen corto y limpio de Crédito para enviar por WhatsApp al cliente.
 */
export function formatAccountStatementReminder(ctx: AccountStatementContext): string {
  const sortedInsts = [...(ctx.installments || [])].sort(
    (a, b) => a.installmentNumber - b.installmentNumber
  );
  const paidCount = sortedInsts.filter((i) => i.pendingAmount <= 0).length;
  const totalCount = sortedInsts.length || ctx.loan.installmentCount || 1;
  const computedRemaining =
    sortedInsts.length > 0
      ? sortedInsts.reduce((sum, i) => sum + Math.max(0, i.pendingAmount || 0), 0)
      : Math.max(0, ctx.loan.totalAgreed || 0);
  const currentRemaining =
    ctx.remainingBalance !== undefined ? Math.max(0, ctx.remainingBalance) : computedRemaining;
  const hasOverdue = (ctx.overdueDays || 0) > 0 && (ctx.overdueAmount || 0) > 0;
  const company = (ctx.companyName || ctx.companyConfig?.companyName || '').trim();

  const lines: string[] = [
    company ? `*Resumen de crédito — ${company}*` : '*Resumen de tu crédito*',
    `Cuota: ${formatCOPPlain(ctx.loan.installmentAmount)} (${paidCount}/${totalCount} pagadas)`,
    `*Saldo pendiente:* ${formatCOPPlain(currentRemaining)}`,
  ];

  if (hasOverdue) {
    lines.push(`*Mora:* ${formatCOPPlain(ctx.overdueAmount || 0)} (${ctx.overdueDays} día(s))`);
  }

  const footer = (ctx.receiptFooterMessage || ctx.companyConfig?.receiptFooterMessage || '').trim();
  if (footer) {
    lines.push(`_${footer}_`);
  }

  return lines.join('\n');
}

/**
 * Formatea un reporte de Cuadre Diario corto y fácil de leer en WhatsApp.
 */
export function formatShortCuadreWhatsApp(ctx: ShortCuadreContext): string {
  const office = (ctx.companyName || 'Kredia').trim();
  const route = (ctx.routeName || 'Ruta').trim();
  const estado = ctx.isSealed ? 'Cerrado' : 'En curso';
  const lines: string[] = [
    `*Cuadre ${route} — ${office}*`,
    `Fecha: ${ctx.dateStr} · ${estado}`,
    `Cobrador: ${ctx.collectorName || 'Cobrador'}`,
    `Cobrado: ${formatCOPPlain(ctx.totalCollected)} (Efec ${formatCOPPlain(ctx.collectedCash)} · Dig ${formatCOPPlain(ctx.collectedDigital)})`,
    `Base inicio: ${formatCOPPlain(ctx.openingRouteBase)} · Salidas: ${formatCOPPlain(ctx.disbursedNet)} (${ctx.salidasCount})`,
    `Gastos: ${formatCOPPlain(ctx.expenses)}`,
    `*A entregar:* ${formatCOPPlain(ctx.cashToHandOver)}${ctx.isSealed ? ` (Entregado ${formatCOPPlain(ctx.cashHandedOver)} · Dif ${formatCOPPlain(ctx.cashDifference)})` : ''}`,
  ];
  if ((ctx.withdrawnToOffice || 0) > 0) {
    lines.push(`Retiro a oficina: ${formatCOPPlain(ctx.withdrawnToOffice || 0)}`);
  }
  if (ctx.visitedCount !== undefined && ctx.expectedCount !== undefined && ctx.expectedCount > 0) {
    lines.push(`Visitados: ${ctx.visitedCount}/${ctx.expectedCount} · Mora: ${ctx.overdueCustomersCount} (${formatCOPPlain(ctx.overdueTotalAmount)})`);
  } else {
    lines.push(`Mora: ${ctx.overdueCustomersCount} cliente(s) (${formatCOPPlain(ctx.overdueTotalAmount)})`);
  }
  if (ctx.notes && ctx.notes.trim()) {
    lines.push(`Obs: ${ctx.notes.trim()}`);
  }
  if (ctx.folio) {
    lines.push(`Folio: ${ctx.folio}`);
  }
  return lines.join('\n');
}

/**
 * Abre WhatsApp directamente en el chat exacto del cliente (1 toque) o usa Share como respaldo.
 */
export async function openWhatsAppReceipt(phone: string, message: string): Promise<void> {
  const fullPhone = normalizeWhatsAppPhone(phone);
  if (fullPhone) {
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(waUrl);
      return;
    } catch {
      // Fallback a Share.share
    }
  }

  try {
    await Share.share({
      title: 'Comprobante Oficial Kredia',
      message,
    });
  } catch {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(message);
    } else {
      Alert.alert('Comprobante Oficial', message);
    }
  }
}
