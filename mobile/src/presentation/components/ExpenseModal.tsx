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
import { localStore } from '../../infrastructure/storage/local-store';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { Fuel, X } from 'lucide-react-native';

interface ExpenseModalProps {
  visible: boolean;
  todayStr: string;
  routeId?: string;
  collectorId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  visible,
  todayStr,
  routeId,
  collectorId,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('PINCHAZO');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = [
    { key: 'PINCHAZO', label: '🛠️ Pinchazo / Taller Moto', quickAmount: 10000 },
    { key: 'DATOS', label: '📱 Recarga / Plan Celular', quickAmount: 5000 },
    { key: 'GASOLINA', label: '⛽ Gasolina / Combustible', quickAmount: 15000 },
    { key: 'PARQUEADERO', label: '🅿️ Peaje / Parqueadero', quickAmount: 3000 },
    { key: 'OTRO', label: '💼 Otro gasto operativo', quickAmount: 10000 },
  ];

  const numericAmount = parseInt(amountStr.replace(/\D/g, ''), 10) || 0;

  const handleSelectCategory = (cat: string, quickVal: number) => {
    setCategory(cat);
    if (numericAmount === 0) {
      setAmountStr(String(quickVal));
    }
  };

  const handleSaveExpense = async () => {
    if (numericAmount <= 0) {
      Alert.alert('Monto requerido', 'Ingrese un valor de gasto mayor a $0 COP.');
      return;
    }

    if (numericAmount > 250000) {
      Alert.alert(
        'Límite Excedido',
        'El gasto supera el tope operativo permitido en calle ($250.000 COP). Gastos mayores deben ser autorizados y registrados directamente por la administración de la oficina.'
      );
      return;
    }

    if (numericAmount > 50000 && description.trim().length < 5) {
      Alert.alert(
        'Justificación Requerida',
        'Para gastos superiores a $50.000 COP, es obligatorio especificar el detalle o motivo concreto en la nota para la auditoría de caja.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.recordRouteExpense({
        amount: numericAmount,
        category,
        description: description.trim() || category,
        todayStr,
        routeId,
        collectorId,
      });

      Alert.alert(
        'Gasto Operativo Registrado',
        `Se registró gasto de ${formatCOP(numericAmount)} (${category}). Se descuenta del efectivo que la ruta rinde a la caja.`
      );
      setAmountStr('');
      setDescription('');
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'No se pudo guardar el gasto');
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
              <Text style={styles.title}>Registrar Gasto de Ruta</Text>
              <Text style={styles.subtitle}>
                Gastos operativos (pinchazo, datos, gasolina). Se descuentan de la ruta.
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
          {/* Valor */}
          <Text style={styles.label}>VALOR DEL GASTO ($ COP)</Text>
          <View style={styles.amountInputRow}>
            <TextInput
              style={styles.amountInput}
              keyboardType="numeric"
              placeholder="$ 0"
              placeholderTextColor={COLORS.textMuted}
              value={numericAmount > 0 ? formatCOP(numericAmount) : ''}
              onChangeText={(t) => setAmountStr(t.replace(/\D/g, ''))}
            />
          </View>

          {/* Categoría */}
          <Text style={[styles.label, { marginTop: 12 }]}>CATEGORÍA</Text>
          <View style={styles.catGrid}>
            {categories.map((c) => {
              const isSelected = category === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catChip, isSelected && styles.catChipSelected]}
                  onPress={() => handleSelectCategory(c.key, c.quickAmount)}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      isSelected && styles.catChipTextSelected,
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Nota */}
          <Text style={[styles.label, { marginTop: 12 }]}>DETALLE O NOTA (OPCIONAL)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Ej: Estación Terpel, cambio de neumático..."
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
          />
          {numericAmount > 50000 && (
            <View style={styles.highExpenseNotice}>
              <Text style={styles.highExpenseNoticeText}>
                ⚠️ Gasto mayor a $50.000 COP. Por control de auditoría, es obligatorio detallar el motivo específico en la nota anterior.
              </Text>
            </View>
          )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, isSubmitting && { opacity: 0.6 }]}
              disabled={isSubmitting}
              onPress={handleSaveExpense}
            >
              <Fuel size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>Guardar Gasto</Text>
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
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
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
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  amountInputRow: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    padding: 0,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  catChipSelected: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  catChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  textInput: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.dockBg,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  highExpenseNotice: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
  },
  highExpenseNoticeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400E',
    lineHeight: 16,
  },
});
