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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Customer, Loan, NonPaymentReason } from '../../core/domain/types';
import { localStore } from '../../infrastructure/storage/local-store';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { AlertCircle, X, Check } from 'lucide-react-native';

interface NonPaymentModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  todayStr: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const NonPaymentModal: React.FC<NonPaymentModalProps> = ({
  visible,
  customer,
  loan,
  todayStr,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedReason, setSelectedReason] = useState<NonPaymentReason>('NO_ESTABA');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!customer || !loan) return null;

  const reasons: Array<{ key: NonPaymentReason; label: string; icon: string }> = [
    { key: 'NO_ESTABA', label: 'No estaba en el domicilio', icon: '🏠' },
    { key: 'LOCAL_CERRADO', label: 'Negocio / local cerrado', icon: '🔒' },
    { key: 'PASAR_TARDE', label: 'Pidió pasar más tarde', icon: '⏰' },
    { key: 'SIN_DINERO', label: 'Sin dinero hoy', icon: '💸' },
    { key: 'OTRO', label: 'Otro motivo', icon: '📝' },
  ];

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const match = reasons.find((r) => r.key === selectedReason);
      await localStore.recordNonPaymentVisit({
        customerId: customer.id,
        loanId: loan.id,
        reason: selectedReason,
        reasonLabel: match ? match.label : 'No pagó',
        notes: notes.trim() || undefined,
        date: todayStr,
      });

      Alert.alert(
        'Novedad Registrada',
        `Se registró la visita no efectiva a ${customer.fullName}.`
      );
      setNotes('');
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar la novedad');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={[styles.card, { maxHeight: '90%', flexShrink: 1 }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Novedad de No Pago</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {customer.fullName} • #{loan.loanNumber}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 4 }}
          >
          <Text style={styles.label}>MOTIVO DE LA VISITA NO EFECTIVA</Text>
          <View style={styles.reasonsList}>
            {reasons.map((r) => {
              const isSelected = selectedReason === r.key;
              return (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.reasonOption, isSelected && styles.reasonOptionSelected]}
                  onPress={() => setSelectedReason(r.key)}
                >
                  <Text style={styles.reasonIcon}>{r.icon}</Text>
                  <Text
                    style={[
                      styles.reasonText,
                      isSelected && styles.reasonTextSelected,
                    ]}
                  >
                    {r.label}
                  </Text>
                  {isSelected && <Check size={16} color={COLORS.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>NOTA ADICIONAL (OPCIONAL)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Ej: Dice que regresa a las 5pm..."
            placeholderTextColor={COLORS.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
          />
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, isSubmitting && { opacity: 0.6 }]}
              disabled={isSubmitting}
              onPress={handleSave}
            >
              <AlertCircle size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Guardar Novedad</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  reasonsList: {
    gap: 6,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  reasonOptionSelected: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  reasonIcon: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    marginRight: 10,
  },
  reasonText: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  reasonTextSelected: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textPrimary,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
  },
  cancelBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: COLORS.danger,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
