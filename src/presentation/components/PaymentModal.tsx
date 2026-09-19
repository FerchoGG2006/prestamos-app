import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Customer, Loan, Installment, PaymentMethod } from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { CheckCircle2, DollarSign, X } from 'lucide-react-native';

interface PaymentModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  installments: Installment[];
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  customer,
  loan,
  installments,
  onClose,
  onSuccess,
}) => {
  if (!customer || !loan) return null;

  // Cuotas pendientes
  const pendingInstallments = installments
    .filter((i) => i.pendingAmount > 0)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  const nextInstallment = pendingInstallments[0];
  const defaultAmount = nextInstallment ? nextInstallment.pendingAmount : loan.installmentAmount;

  const [amountStr, setAmountStr] = useState(defaultAmount.toString());
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Atajos rápidos
  const setExact = () => setAmountStr(defaultAmount.toString());
  const setDouble = () => setAmountStr((defaultAmount * 2).toString());

  const handleConfirmPayment = async () => {
    const amount = parseInt(amountStr.replace(/\D/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Ingrese un monto válido a cobrar');
      return;
    }

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await localStore.recordPayment({
        loanId: loan.id,
        amountReceived: amount,
        paymentMethod: method,
        collectorId: loan.collectorId,
        todayStr,
        notes: notes.trim() || undefined,
      });

      Alert.alert('¡Pago Registrado!', `Se registraron ${formatCOP(amount)} exitosamente.`);
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo registrar el pago');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Registrar Cobro</Text>
              <Text style={styles.subtitle}>{customer.fullName} • {loan.loanNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Info de la cuota */}
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Cuota pactada:</Text>
                <Text style={styles.infoVal}>{formatCOP(loan.installmentAmount)}</Text>
              </View>
              {nextInstallment && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Próxima cuota (# {nextInstallment.installmentNumber}):</Text>
                  <Text style={[styles.infoVal, { color: COLORS.warning }]}>
                    Pendiente: {formatCOP(nextInstallment.pendingAmount)}
                  </Text>
                </View>
              )}
            </View>

            {/* Input de monto */}
            <Text style={styles.fieldLabel}>Monto Recibido ($ COP):</Text>
            <View style={styles.inputWrap}>
              <DollarSign size={20} color={COLORS.success} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Botones rápidos */}
            <View style={styles.quickButtonsRow}>
              <TouchableOpacity style={styles.quickBtn} onPress={setExact}>
                <Text style={styles.quickBtnText}>1 Cuota ({formatCOP(defaultAmount)})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickBtn} onPress={setDouble}>
                <Text style={styles.quickBtnText}>2 Cuotas ({formatCOP(defaultAmount * 2)})</Text>
              </TouchableOpacity>
            </View>

            {/* Método de pago */}
            <Text style={styles.fieldLabel}>Método de Pago:</Text>
            <View style={styles.methodsRow}>
              {(['CASH', 'TRANSFER'] as PaymentMethod[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodBtn, method === m && styles.methodBtnActive]}
                  onPress={() => setMethod(m)}
                >
                  <Text style={[styles.methodBtnText, method === m && styles.methodBtnTextActive]}>
                    {m === 'CASH' ? '💵 Efectivo' : '📲 Transferencia'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notas opcionales */}
            <Text style={styles.fieldLabel}>Observaciones (Opcional):</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ej. Pagó completo, abonó antes de mediodía..."
              placeholderTextColor={COLORS.textMuted}
              multiline
            />
          </ScrollView>

          {/* Footer con Confirmación */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
              onPress={handleConfirmPayment}
              disabled={isSubmitting}
            >
              <CheckCircle2 size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>
                {isSubmitting ? 'Registrando...' : 'Confirmar Cobro'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  body: {
    marginBottom: 16,
  },
  infoCard: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  infoLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  infoVal: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 50,
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
    fontSize: 14,
    fontWeight: 'normal',
    padding: 12,
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
  },
  quickButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: COLORS.bgTertiary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickBtnText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  methodsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    alignItems: 'center',
  },
  methodBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  methodBtnText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: 14,
  },
  methodBtnTextActive: {
    color: '#60a5fa',
  },
  footer: {
    paddingTop: 8,
  },
  confirmBtn: {
    backgroundColor: COLORS.success,
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
