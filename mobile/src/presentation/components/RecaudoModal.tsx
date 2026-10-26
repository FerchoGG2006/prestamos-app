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
import { localStore } from '../../infrastructure/storage/local-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { Landmark, X, Check, ArrowDownCircle, AlertCircle } from 'lucide-react-native';

interface RecaudoModalProps {
  visible: boolean;
  baseDisponible: number;
  todayStr: string;
  routeId?: string;
  authorizedBy?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecaudoModal: React.FC<RecaudoModalProps> = ({
  visible,
  baseDisponible,
  todayStr,
  routeId,
  authorizedBy,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [amountStr, setAmountStr] = useState('');
  const [destination, setDestination] = useState('RETIRO_OFICINA');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numericAmount = parseInt(amountStr.replace(/\D/g, ''), 10) || 0;
  const isOverBase = numericAmount > baseDisponible;
  const remainingBase = Math.max(0, baseDisponible - numericAmount);

  const quickPercentages = [
    { label: '$100.000', value: 100000 },
    { label: '$200.000', value: 200000 },
    { label: '$300.000', value: 300000 },
    { label: 'Toda la Base', value: baseDisponible },
  ];

  const destinationOptions = [
    { key: 'RETIRO_OFICINA', label: '🏢 Entrega a Oficina Central' },
    { key: 'UTILIDAD_DUENO', label: '💼 Retiro Utilidad / Dueño' },
    { key: 'CONSIGNACION', label: '🏦 Consignación Bancaria / Nequi' },
    { key: 'FONDEO_OTRA_RUTA', label: '🔄 Traslado a Otra Ruta' },
  ];

  const handleSaveRecaudo = async () => {
    if (numericAmount <= 0) {
      Alert.alert('Monto requerido', 'Ingrese un valor a recaudar mayor a $0 COP.');
      return;
    }

    if (isOverBase) {
      Alert.alert(
        'Base Insuficiente',
        `No puedes retirar más de lo que hay en la base disponible (${formatCOP(baseDisponible)}). Si no hay base, no hay dinero para retirar.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedDest = destinationOptions.find(d => d.key === destination)?.label || destination;
      const fullReason = notes.trim()
        ? `${selectedDest}: ${notes.trim()}`
        : selectedDest;

      await localStore.recordRecaudoWithdrawal({
        amount: numericAmount,
        destinationOrReason: fullReason,
        routeId,
        authorizedBy,
        todayStr,
      });

      Alert.alert(
        'Recaudo Registrado Exitosamente',
        `Se retiraron ${formatCOP(numericAmount)} de la base.\n\nNueva Base en Efectivo: ${formatCOP(remainingBase)}.`
      );
      setAmountStr('');
      setNotes('');
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Error al registrar recaudo', e.message || 'No se pudo registrar el recaudo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.modalOverlay,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={[styles.modalCard, { flexShrink: 1 }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.iconCircle}>
                <Landmark size={20} color="#0284c7" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Retiro de Recaudo</Text>
                <Text style={styles.modalSubtitle}>Saca dinero de la base hacia la oficina</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Tarjeta de Estado de la Base (Explicado en Audio 3) */}
            <View style={styles.baseCard}>
              <View style={styles.baseCardHeader}>
                <Text style={styles.baseCardLabel}>BASE DISPONIBLE EN CAJA</Text>
                <View style={styles.baseBadge}>
                  <Text style={styles.baseBadgeText}>Efectivo Líquido</Text>
                </View>
              </View>
              <Text style={styles.baseCardAmount}>{formatCOP(baseDisponible)}</Text>
              <Text style={styles.baseCardHelp}>
                Plata disponible en la ruta para nuevos préstamos o retiro a oficina.
              </Text>
            </View>

            {/* Input de Monto a Recaudar */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>VALOR A RECAUDAR / RETIRAR</Text>
              <View style={[styles.amountInputWrap, isOverBase && styles.amountInputError]}>
                <Text style={styles.currencyPrefix}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  value={amountStr ? parseInt(amountStr.replace(/\D/g, ''), 10).toLocaleString('es-CO') : ''}
                  onChangeText={(val) => setAmountStr(val.replace(/\D/g, ''))}
                />
              </View>

              {/* Botones de Monto Rápido */}
              <View style={styles.quickGrid}>
                {quickPercentages.map((q, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.quickBtn,
                      numericAmount === q.value && styles.quickBtnActive,
                    ]}
                    onPress={() => setAmountStr(String(q.value))}
                  >
                    <Text
                      style={[
                        styles.quickBtnText,
                        numericAmount === q.value && styles.quickBtnTextActive,
                      ]}
                    >
                      {q.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Simulación en Tiempo Real: Base Resultante */}
              {numericAmount > 0 && (
                <View style={[styles.livePreviewCard, isOverBase && styles.livePreviewError]}>
                  {isOverBase ? (
                    <View style={styles.errorRow}>
                      <AlertCircle size={16} color="#dc2626" style={{ marginRight: 6 }} />
                      <Text style={styles.errorText}>
                        Supera la base disponible ({formatCOP(baseDisponible)}). Si no hay base, no hay dinero para retirar.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.successRow}>
                      <ArrowDownCircle size={16} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.successText}>
                        La base quedará en: <Text style={{ fontWeight: '800' }}>{formatCOP(remainingBase)}</Text>
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Selector de Destino */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>DESTINO DEL RECAUDO</Text>
              <View style={styles.destList}>
                {destinationOptions.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={[
                      styles.destItem,
                      destination === item.key && styles.destItemActive,
                    ]}
                    onPress={() => setDestination(item.key)}
                  >
                    <Text
                      style={[
                        styles.destItemText,
                        destination === item.key && styles.destItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {destination === item.key && <Check size={16} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Observación / Detalle */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>OBSERVACIÓN O COMPROBANTE (OPCIONAL)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Ej. Recibido por dueño Don Carlos en efectivo"
                placeholderTextColor="#94a3b8"
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </ScrollView>

          {/* Footer de Acciones */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                (numericAmount <= 0 || isOverBase || isSubmitting) && styles.submitBtnDisabled,
              ]}
              disabled={numericAmount <= 0 || isOverBase || isSubmitting}
              onPress={handleSaveRecaudo}
            >
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Procesando...' : `Confirmar Recaudo (-${formatCOP(numericAmount)})`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  baseCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  baseCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  baseCardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  baseBadge: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  baseBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
  },
  baseCardAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: '#38bdf8',
    letterSpacing: 0.5,
  },
  baseCardHelp: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    backgroundColor: '#f8fafc',
  },
  amountInputError: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0284c7',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickBtnActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  quickBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  quickBtnTextActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  livePreviewCard: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  livePreviewError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
    flex: 1,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  destList: {
    gap: 6,
  },
  destItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  destItemActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#22c55e',
  },
  destItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  destItemTextActive: {
    color: '#15803d',
    fontWeight: '700',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 12,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  submitBtn: {
    flex: 2,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
  },
  submitBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
});
