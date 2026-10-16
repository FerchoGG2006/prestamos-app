import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  Linking,
} from 'react-native';
import {
  Customer,
  Loan,
  Installment,
  PaymentMethod,
  Payment,
} from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../core/domain/calculator';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import {
  CheckCircle2,
  DollarSign,
  X,
  MessageCircle,
  Sparkles,
  Receipt,
} from 'lucide-react-native';

interface PaymentModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  installments: Installment[];
  todayStr?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  customer,
  loan,
  installments,
  todayStr = '2026-09-19',
  onClose,
  onSuccess,
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [completedPayment, setCompletedPayment] = useState<Payment | null>(null);

  const loanInstallments = loan
    ? installments
        .filter((i) => i.loanId === loan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
    : [];

  const pendingInstallments = loanInstallments.filter((i) => i.pendingAmount > 0);
  const nextInstallment = pendingInstallments[0];
  const totalRemainingBalance = pendingInstallments.reduce(
    (sum, i) => sum + i.pendingAmount,
    0
  );

  const delinquency = calculateDelinquencyMetrics(loanInstallments, todayStr);
  const todayInstallment = loanInstallments.find((i) => i.dueDate === todayStr);

  // 4 Píldoras de Monto Precalculadas (Figma Transfer / Add Expense Bottom Sheet)
  const exactInstallmentAmount = nextInstallment
    ? nextInstallment.pendingAmount
    : loan?.installmentAmount || 0;
  const twoInstallmentsAmount = Math.min(
    exactInstallmentAmount * 2,
    totalRemainingBalance || exactInstallmentAmount * 2
  );
  const catchUpAmount = Math.min(
    totalRemainingBalance,
    delinquency.overdueAmount +
      (todayInstallment ? todayInstallment.pendingAmount : exactInstallmentAmount)
  );
  const fullPayoffAmount = totalRemainingBalance || exactInstallmentAmount;

  useEffect(() => {
    if (visible && loan) {
      const initialSuggestion =
        catchUpAmount > 0 ? catchUpAmount : exactInstallmentAmount;
      setAmountStr(initialSuggestion.toString());
      setMethod('CASH');
      setNotes('');
      setCompletedPayment(null);
      setIdempotencyKey(`idem-${loan.id}-${Date.now()}`);
    }
  }, [visible, loan?.id]);

  if (!customer || !loan) return null;

  const currentNumericAmount = parseInt(amountStr.replace(/\D/g, ''), 10) || 0;

  const handleConfirmPayment = async () => {
    if (currentNumericAmount <= 0) {
      Alert.alert('Monto inválido', 'Ingrese un valor mayor a $0 COP.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await localStore.recordPayment({
        loanId: loan.id,
        amountReceived: currentNumericAmount,
        paymentMethod: method,
        collectorId: loan.collectorId,
        todayStr,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });

      setCompletedPayment(result.payment);
      onSuccess();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo registrar el abono');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendWhatsAppReceipt = () => {
    if (!completedPayment) return;
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
    const newRemaining = Math.max(
      0,
      totalRemainingBalance - completedPayment.amountReceived
    );
    const methodLabel =
      completedPayment.paymentMethod === 'CASH'
        ? 'Efectivo'
        : completedPayment.paymentMethod === 'NEQUI'
        ? 'Nequi'
        : 'Transferencia';

    const receiptText =
      `✅ *COMPROBANTE DE ABONO — CARTERA MÓVIL*\n` +
      `• Cliente: *${customer.fullName}*\n` +
      `• Crédito: *${loan.loanNumber}*\n` +
      `• Valor abonado: *${formatCOP(completedPayment.amountReceived)}*\n` +
      `• Medio de pago: *${methodLabel}*\n` +
      `• Cuotas aplicadas: *${completedPayment.installmentsBreakdown.length}*\n` +
      `• Nuevo saldo pendiente: *${formatCOP(newRemaining)}*\n` +
      `• Ref: ${completedPayment.id}`;

    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(receiptText)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Comprobante Listo', receiptText);
    });
  };

  const amountPills = [
    { label: 'Cuota exacta', amount: exactInstallmentAmount },
    { label: '2 Cuotas', amount: twoInstallmentsAmount },
    { label: 'Ponerse al día', amount: catchUpAmount },
    { label: 'Liquidar saldo', amount: fullPayoffAmount },
  ];

  const paymentMethods: Array<{ key: PaymentMethod; label: string }> = [
    { key: 'CASH', label: '💵 Efectivo' },
    { key: 'NEQUI', label: '🟣 Nequi' },
    { key: 'TRANSFER', label: '🏦 Transferencia' },
  ];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheetContainer}>
          {/* Handle superior estilo Bottom Sheet (Patrón #4 de Gemini Share) */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {completedPayment ? 'Comprobante de Cobro' : 'Abono Rápido'}
              </Text>
              <Text style={styles.subtitle}>
                {customer.fullName} • Crédito {loan.loanNumber}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {completedPayment ? (
            /* PATRÓN #7 DE GEMINI SHARE: ESQUEUMORFISMO LIGERO EN EL RECIBO (TIRILLA TIPO DATÁFONO CON BORDER-STYLE: DASHED) */
            <View style={styles.receiptTicketCard}>
              {/* Píldora Semántica (borderRadius: 9999) */}
              <View style={styles.semanticApprovedPill}>
                <Sparkles size={13} color={COLORS.success} />
                <Text style={styles.semanticApprovedPillText}>
                  ✓ TRANSACCIÓN APROBADA
                </Text>
              </View>

              {/* Jerarquía Tipográfica Agresiva en el Monto */}
              <Text style={styles.receiptAmountText}>
                {formatCOP(completedPayment.amountReceived)}
              </Text>
              <Text style={styles.receiptSubText}>
                Medio: {completedPayment.paymentMethod} • Ref: {completedPayment.id}
              </Text>

              {/* Línea Punteada Perforada Estilo Recibo Físico / Datáfono */}
              <View style={styles.perforatedDividerWrap}>
                <View style={styles.ticketNotchLeft} />
                <View style={styles.dashedLine} />
                <View style={styles.ticketNotchRight} />
              </View>

              {/* Detalle de cuotas aplicadas */}
              <View style={styles.breakdownList}>
                <View style={styles.receiptMetaRow}>
                  <Receipt size={14} color={COLORS.textMuted} />
                  <Text style={styles.receiptMetaTitle}>
                    DESGLOSE CONTABLE ({completedPayment.installmentsBreakdown.length} CUOTA/S)
                  </Text>
                </View>
                {completedPayment.installmentsBreakdown.map((b) => (
                  <View key={b.installmentId} style={styles.breakdownRow}>
                    <Text style={styles.breakdownLabel}>
                      Cuota #{b.installmentNumber} ({b.resultingStatus})
                    </Text>
                    <Text style={styles.breakdownValue}>
                      {formatCOP(b.amountApplied)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Segunda línea punteada inferior */}
              <View style={styles.dashedLineSimple} />

              <TouchableOpacity
                style={styles.whatsappReceiptBtn}
                onPress={handleSendWhatsAppReceipt}
              >
                <MessageCircle size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.whatsappReceiptBtnText}>
                  Enviar Comprobante por WhatsApp
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Volver a la Ruta</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* FORMULARIO DE ABONO RÁPIDO CON FILLED INPUTS + FLOATING LABELS INTERNOS (Patrón #5 + Mejora IA #3) */
            <>
              <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                {/* Resumen compacto del crédito */}
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Cuota pactada:</Text>
                    <Text style={styles.infoVal}>
                      {formatCOP(loan.installmentAmount)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Saldo total pendiente:</Text>
                    <Text style={[styles.infoVal, { color: COLORS.primary }]}>
                      {formatCOP(totalRemainingBalance)}
                    </Text>
                  </View>
                  {delinquency.hasDelinquency && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>
                        Mora acumulada ({delinquency.overdueDays}d):
                      </Text>
                      <Text style={[styles.infoVal, { color: COLORS.danger }]}>
                        {formatCOP(delinquency.overdueAmount)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Filled Input con Floating Label interno para el Monto */}
                <View style={styles.filledAmountBlock}>
                  <Text style={styles.floatingInternalLabel}>
                    MONTO A ABONAR ($ COP)
                  </Text>
                  <View style={styles.filledAmountRow}>
                    <DollarSign size={24} color={COLORS.success} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={amountStr}
                      onChangeText={setAmountStr}
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>

                {/* 4 Píldoras de Monto Precalculadas */}
                <Text style={styles.fieldLabel}>Atajos de Monto en 1 Toque</Text>
                <View style={styles.pillsGrid}>
                  {amountPills.map((pill) => {
                    const isSelected = currentNumericAmount === pill.amount;
                    return (
                      <TouchableOpacity
                        key={pill.label}
                        style={[
                          styles.amountPill,
                          isSelected && styles.amountPillActive,
                        ]}
                        onPress={() => setAmountStr(pill.amount.toString())}
                      >
                        <Text
                          style={[
                            styles.amountPillTitle,
                            isSelected && styles.amountPillTitleActive,
                          ]}
                        >
                          {pill.label}
                        </Text>
                        <Text
                          style={[
                            styles.amountPillValue,
                            isSelected && styles.amountPillValueActive,
                          ]}
                        >
                          {formatCOP(pill.amount)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Selector de Medio de Pago (Efectivo / Nequi / Transferencia) */}
                <Text style={styles.fieldLabel}>Medio de Pago</Text>
                <View style={styles.methodsRow}>
                  {paymentMethods.map((m) => {
                    const isSelected = method === m.key;
                    return (
                      <TouchableOpacity
                        key={m.key}
                        style={[
                          styles.methodBtn,
                          isSelected && styles.methodBtnActive,
                        ]}
                        onPress={() => setMethod(m.key)}
                      >
                        <Text
                          style={[
                            styles.methodBtnText,
                            isSelected && styles.methodBtnTextActive,
                          ]}
                        >
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Filled Input con Floating Label interno para Observaciones */}
                <View style={styles.filledNotesBlock}>
                  <Text style={styles.floatingInternalLabel}>
                    OBSERVACIONES DEL COBRO (OPCIONAL)
                  </Text>
                  <TextInput
                    style={styles.notesInput}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Ej. Pagó puntual, comprobante Nequi verificado..."
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
                  onPress={handleConfirmPayment}
                  disabled={isSubmitting}
                >
                  <CheckCircle2 size={20} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.confirmBtnText}>
                    {isSubmitting
                      ? 'Aplicando Abono...'
                      : `Confirmar Cobro (${formatCOP(currentNumericAmount)})`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: COLORS.microBorder,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 9999,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  infoVal: {
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  fieldLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // FILLED INPUT CON FLOATING LABEL INTERNO (Patrón #5 + Mejora IA #3)
  filledAmountBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  floatingInternalLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  filledAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: {
    marginRight: 4,
  },
  input: {
    flex: 1,
    height: 42,
    color: COLORS.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
    paddingVertical: 0,
  },
  pillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  amountPill: {
    width: '48%',
    backgroundColor: COLORS.surfaceSoft,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  amountPillActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  amountPillTitle: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  amountPillTitleActive: {
    color: COLORS.purple,
  },
  amountPillValue: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  amountPillValueActive: {
    color: '#2E1065',
  },
  methodsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  methodBtn: {
    flex: 1,
    backgroundColor: COLORS.surfaceSoft,
    paddingVertical: 11,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
  },
  methodBtnActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  methodBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  methodBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filledNotesBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 8,
  },
  notesInput: {
    height: 30,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  footer: {
    paddingTop: 6,
  },
  confirmBtn: {
    backgroundColor: COLORS.dockBg,
    flexDirection: 'row',
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  // PATRÓN #7: ESQUEUMORFISMO LIGERO EN EL RECIBO (TIRILLA TIPO DATÁFONO CON BORDER-STYLE: DASHED)
  receiptTicketCard: {
    backgroundColor: COLORS.receiptPaper,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  semanticApprovedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    marginBottom: 10,
  },
  semanticApprovedPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.success,
    letterSpacing: 0.5,
  },
  receiptAmountText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: COLORS.textPrimary,
  },
  receiptSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 4,
    marginBottom: 14,
  },
  perforatedDividerWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
    position: 'relative',
  },
  ticketNotchLeft: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginLeft: -27,
  },
  ticketNotchRight: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginRight: -27,
  },
  dashedLine: {
    flex: 1,
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginHorizontal: 8,
  },
  dashedLineSimple: {
    width: '100%',
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginBottom: 14,
  },
  breakdownList: {
    width: '100%',
    paddingVertical: 10,
  },
  receiptMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  receiptMetaTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  breakdownLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  whatsappReceiptBtn: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  whatsappReceiptBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  doneBtn: {
    width: '100%',
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
});
