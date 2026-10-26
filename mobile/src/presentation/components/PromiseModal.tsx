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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Customer, Loan } from '../../core/domain/types';
import { formatCOP, addDays, getNextMonday, getNextWeekend } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { CalendarClock, X, Check } from 'lucide-react-native';

interface PromiseModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  todayStr?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PromiseModal: React.FC<PromiseModalProps> = ({
  visible,
  customer,
  loan,
  todayStr = '2026-09-19',
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [amountStr, setAmountStr] = useState('');
  const [promisedDate, setPromisedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Atajos de fecha de 1 toque (Mejora #4: Mañana, En 2 días, Próximo Lunes, Fin de semana)
  const tomorrowStr = addDays(todayStr, 1);
  const inTwoDaysStr = addDays(todayStr, 2);
  const nextMondayStr = getNextMonday(todayStr);
  const weekendStr = getNextWeekend(todayStr);

  useEffect(() => {
    if (visible && loan) {
      setAmountStr(loan.installmentAmount.toString());
      setPromisedDate(tomorrowStr);
      setNotes('');
    }
  }, [visible, loan?.id, todayStr]);

  if (!customer || !loan) return null;

  const quickDates = [
    { label: 'Mañana', date: tomorrowStr },
    { label: 'En 2 días', date: inTwoDaysStr },
    { label: 'Próximo Lunes', date: nextMondayStr },
    { label: 'Fin de semana', date: weekendStr },
  ];

  const handleSavePromise = async () => {
    const amount = parseInt(amountStr.replace(/\D/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingrese un monto prometido mayor a $0 COP.');
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
        todayStr,
        notes: notes.trim() || undefined,
      });

      Alert.alert(
        'Promesa Agendada',
        `Promesa registrada para el ${promisedDate} por ${formatCOP(amount)}.`
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar la promesa');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { paddingTop: Math.max(insets.top, 12) }]}
      >
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          {/* Drag Handle Superior (Patrón #4 de Gemini Share) */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Acuerdo / Promesa de Pago</Text>
              <Text style={styles.subtitle}>
                {customer.fullName} • Crédito {loan.loanNumber}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Filled Input con Floating Label interno para Monto Prometido */}
            <View style={styles.filledAmountBlock}>
              <Text style={styles.floatingInternalLabel}>
                MONTO COMPROMETIDO ($ COP)
              </Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={amountStr}
                onChangeText={setAmountStr}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Atajos de Fecha en 1 Toque */}
            <Text style={styles.sectionLabel}>Seleccionar Fecha en 1 Toque</Text>
            <View style={styles.quickDatesGrid}>
              {quickDates.map((qd) => {
                const isSelected = promisedDate === qd.date;
                return (
                  <TouchableOpacity
                    key={qd.label}
                    style={[
                      styles.datePill,
                      isSelected && styles.datePillActive,
                    ]}
                    onPress={() => setPromisedDate(qd.date)}
                  >
                    <Text
                      style={[
                        styles.datePillLabel,
                        isSelected && styles.datePillLabelActive,
                      ]}
                    >
                      {qd.label}
                    </Text>
                    <Text
                      style={[
                        styles.datePillValue,
                        isSelected && styles.datePillValueActive,
                      ]}
                    >
                      {qd.date}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Filled Input con Floating Label para Fecha Exacta */}
            <View style={styles.filledInputBlock}>
              <Text style={styles.floatingInternalLabel}>
                FECHA EXACTA ACORDADA (YYYY-MM-DD)
              </Text>
              <View style={styles.dateRow}>
                <CalendarClock size={18} color={COLORS.warning} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.textInput}
                  value={promisedDate}
                  onChangeText={setPromisedDate}
                  placeholder="2026-09-20"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            {/* Filled Input con Floating Label para Observación */}
            <View style={styles.filledInputBlock}>
              <Text style={styles.floatingInternalLabel}>
                COMPROMISO / OBSERVACIÓN EN RUTA
              </Text>
              <TextInput
                style={[styles.textInput, { height: 48 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Ej. Paga mañana a las 3 PM tras cierre de caja del negocio..."
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
            </View>
          </ScrollView>

          {/* Footer */}
          <TouchableOpacity
            style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
            onPress={handleSavePromise}
            disabled={isSubmitting}
          >
            <Check size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>
              {isSubmitting ? 'Guardando...' : `Confirmar Promesa (${promisedDate})`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '90%',
    flexShrink: 1,
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
    fontSize: 12,
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
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  filledAmountBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 12,
  },
  floatingInternalLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  amountInput: {
    height: 38,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  quickDatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  datePill: {
    width: '48%',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  datePillActive: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warning,
  },
  datePillLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  datePillLabelActive: {
    color: COLORS.warning,
  },
  datePillValue: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  datePillValueActive: {
    color: COLORS.warning,
  },
  filledInputBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    height: 30,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  confirmBtn: {
    backgroundColor: COLORS.dockBg,
    flexDirection: 'row',
    height: 52,
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
});
