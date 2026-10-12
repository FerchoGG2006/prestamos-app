import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { Customer, Loan } from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { CalendarClock, X, Check } from 'lucide-react-native';

interface PromiseModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PromiseModal: React.FC<PromiseModalProps> = ({
  visible,
  customer,
  loan,
  onClose,
  onSuccess,
}) => {
  if (!customer || !loan) return null;

  const [amountStr, setAmountStr] = useState(loan.installmentAmount.toString());
  const [promisedDate, setPromisedDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSavePromise = async () => {
    const amount = parseInt(amountStr.replace(/\D/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Error', 'Ingrese un monto prometido válido');
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.recordPromise({
        customerId: customer.id,
        loanId: loan.id,
        collectorId: loan.collectorId,
        promisedAmount: amount,
        promisedDate,
        notes: notes.trim() || undefined,
      });

      Alert.alert('Promesa Guardada', `Promesa registrada para el ${promisedDate} por ${formatCOP(amount)}.`);
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar la promesa');
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
              <Text style={styles.title}>Registrar Promesa de Pago</Text>
              <Text style={styles.subtitle}>{customer.fullName} • {loan.loanNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Form */}
          <Text style={styles.fieldLabel}>Monto Prometido ($ COP):</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <Text style={styles.fieldLabel}>Fecha Prometida (YYYY-MM-DD):</Text>
          <View style={styles.inputWrap}>
            <CalendarClock size={20} color={COLORS.warning} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              value={promisedDate}
              onChangeText={setPromisedDate}
              placeholder="2026-09-20"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <Text style={styles.fieldLabel}>Observación / Motivo:</Text>
          <TextInput
            style={[styles.inputWrap, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ej. Prometió pagar mañana a las 3 PM después de vender..."
            placeholderTextColor={COLORS.textMuted}
            multiline
          />

          {/* Footer */}
          <TouchableOpacity
            style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
            onPress={handleSavePromise}
            disabled={isSubmitting}
          >
            <Check size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>
              {isSubmitting ? 'Guardando...' : 'Guardar Promesa'}
            </Text>
          </TouchableOpacity>
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
    marginBottom: 14,
  },
  input: {
    flex: 1,
    height: 50,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    fontWeight: 'normal',
    padding: 12,
    marginBottom: 20,
  },
  confirmBtn: {
    backgroundColor: COLORS.warning,
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
    color: '#0f172a',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
