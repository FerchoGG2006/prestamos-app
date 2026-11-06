import { Linking, Share, Alert, Platform } from 'react-native';
import { Customer, Loan, Installment, Payment } from '../domain/types';
import { formatCOP } from '../config/business-rules';

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
  customer: Customer;
  loan: Loan;
  installments: Installment[];
  remainingBalance?: number;
  overdueDays?: number;
  overdueAmount?: number;
  todayStr?: string;
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
 * Formatea un Recibo Digital de Abono listo para enviar por WhatsApp (SIN tecnicismos ni datos personales innecesarios).
 */
export function formatDigitalPaymentReceipt(ctx: ReceiptFormatContext): string {
  const isPaidOff = ctx.remainingBalance <= 0 || ctx.loan.status === 'PAID';

  // Calcular número de cuota que va y total
  const totalCount =
    ctx.totalInstallmentsCount ||
    ctx.loan.installmentCount ||
    ctx.installments?.length ||
    30;

  const breakdown = ctx.payment.installmentsBreakdown || [];
  let currentInstLabel = '';
  if (breakdown.length > 0) {
    currentInstLabel = breakdown.map((b) => `Cuota ${b.installmentNumber}`).join(', ');
  } else if (ctx.paidInstallmentsCount !== undefined) {
    currentInstLabel = `Cuota ${ctx.paidInstallmentsCount}`;
  } else if (ctx.installments && ctx.installments.length > 0) {
    const paidSoFar = ctx.installments.filter((i) => i.pendingAmount <= 0).length;
    currentInstLabel = `Cuota ${Math.min(paidSoFar + 1, totalCount)}`;
  } else {
    currentInstLabel = 'Cuota 1';
  }

  const lines: string[] = [
    '*COMPROBANTE DE PAGO*',
    `*Fecha:* ${ctx.payment.createdAt}`,
    `*Pagó:* ${formatCOP(ctx.payment.amountReceived)}`,
    `*Queda debiendo:* ${formatCOP(Math.max(0, ctx.remainingBalance))}`,
    `*Cuota que va:* ${currentInstLabel} de ${totalCount}`,
    `*Valor cuota:* ${formatCOP(ctx.loan.installmentAmount)}`,
  ];

  if (isPaidOff) {
    lines.push('*¡Crédito totalmente cancelado! Gracias por su pago.*');
  }

  return lines.join('\n');
}

/**
 * Formatea un Resumen corto de Crédito para enviar por WhatsApp al cliente (sin datos personales).
 */
export function formatAccountStatementReminder(ctx: AccountStatementContext): string {
  const sortedInsts = [...ctx.installments].sort(
    (a, b) => a.installmentNumber - b.installmentNumber
  );
  const paidCount = sortedInsts.filter((i) => i.pendingAmount <= 0).length;
  const totalCount = sortedInsts.length || ctx.loan.installmentCount || 1;
  const currentRemaining =
    ctx.remainingBalance !== undefined
      ? ctx.remainingBalance
      : sortedInsts.reduce((sum, i) => sum + i.pendingAmount, 0);
  const hasOverdue = (ctx.overdueDays || 0) > 0 && (ctx.overdueAmount || 0) > 0;

  const lines: string[] = [
    '*RESUMEN DE TU CRÉDITO*',
    `*Valor cuota:* ${formatCOP(ctx.loan.installmentAmount)}`,
    `*Cuotas pagadas:* ${paidCount} de ${totalCount}`,
    `*Saldo pendiente:* *${formatCOP(Math.max(0, currentRemaining))}*`,
  ];

  if (hasOverdue) {
    lines.push(`*Mora:* ${formatCOP(ctx.overdueAmount || 0)} (${ctx.overdueDays} día(s))`);
  }

  return lines.join('\n');
}

/**
 * Abre WhatsApp con el mensaje formateado o usa Share.share como respaldo si WhatsApp no está disponible.
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
      title: 'Comprobante Digital',
      message,
    });
  } catch {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(message);
    } else {
      Alert.alert('Comprobante Digital', message);
    }
  }
}
