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
import { CollectionSession, Payment } from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { Landmark, X, AlertTriangle, CheckCircle } from 'lucide-react-native';

interface SettlementModalProps {
  visible: boolean;
  session: CollectionSession | null;
  payments: Payment[];
  onClose: () => void;
  onSuccess: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  visible,
  session,
  payments,
  onClose,
  onSuccess,
}) => {
  if (!session) return null;

  // Filtrar pagos de esta jornada
  const sessionPayments = payments.filter((p) => p.sessionId === session.id);
  const collectedCash = sessionPayments
    .filter((p) => p.paymentMethod === 'CASH')
    .reduce((sum, p) => sum + p.amountReceived, 0);
  const collectedTransfers = sessionPayments
    .filter((p) => p.paymentMethod === 'TRANSFER')
    .reduce((sum, p) => sum + p.amountReceived, 0);
  const totalCollected = collectedCash + collectedTransfers;

  const [cashHandedOverStr, setCashHandedOverStr] = useState(collectedCash.toString());
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cashHandedOver = parseInt(cashHandedOverStr.replace(/\D/g, ''), 10) || 0;
  const cashDifference = collectedCash - cashHandedOver; // Positivo: falta dinero en mano. Negativo: sobra.

  const handleCloseSettlement = async () => {
    if (cashDifference !== 0 && !justification.trim()) {
      Alert.alert(
        'Justificación Requerida',
        'Existe una diferencia en el arqueo de efectivo. Es obligatorio ingresar un motivo o explicación.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.closeDailySettlement({
        cashHandedOver,
        differenceJustification: justification.trim() || undefined,
      });

      Alert.alert('¡Jornada Cerrada!', 'La liquidación diaria ha sido guardada en el historial inmutable.');
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cerrar la liquidación');
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
              <Text style={styles.title}>Cierre y Liquidación Diaria</Text>
              <Text style={styles.subtitle}>Jornada {session.date} • {session.routeId}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Resumen de cobros */}
            <View style={styles.summaryCard}>
              <Text style={styles.cardHeaderTitle}>Resumen del Recaudo</Text>

              <View style={styles.row}>
                <Text style={styles.label}>Cobro esperado hoy:</Text>
                <Text style={styles.val}>{formatCOP(session.expectedCollection)}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>💵 Recaudado en Efectivo:</Text>
                <Text style={[styles.val, { color: COLORS.success }]}>{formatCOP(collectedCash)}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.label}>📲 Recaudado en Transferencias:</Text>
                <Text style={[styles.val, { color: COLORS.info }]}>{formatCOP(collectedTransfers)}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <Text style={[styles.label, { fontWeight: 'bold' }]}>Total Cobrado:</Text>
                <Text style={[styles.val, { fontSize: 18, fontWeight: 'bold' }]}>
                  {formatCOP(totalCollected)}
                </Text>
              </View>
            </View>

            {/* Arqueo Físico de Efectivo */}
            <View style={styles.reconciliationCard}>
              <Text style={styles.cardHeaderTitle}>Arqueo Físico de Caja</Text>
              <Text style={styles.reconciliationDesc}>
                Ingrese el dinero en efectivo que entrega físicamente el cobrador:
              </Text>

              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={cashHandedOverStr}
                  onChangeText={setCashHandedOverStr}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {/* Indicador de descuadre o cuadre perfecto */}
              {cashDifference === 0 ? (
                <View style={styles.balancedBadge}>
                  <CheckCircle size={18} color={COLORS.success} style={{ marginRight: 6 }} />
                  <Text style={styles.balancedText}>Caja cuadrada perfectamente ($0 diferencia)</Text>
                </View>
              ) : (
                <View style={styles.unbalancedBadge}>
                  <AlertTriangle size={18} color={COLORS.danger} style={{ marginRight: 6 }} />
                  <Text style={styles.unbalancedText}>
                    Diferencia detectada: {cashDifference > 0 ? `Faltan ${formatCOP(cashDifference)}` : `Sobran ${formatCOP(Math.abs(cashDifference))}`}
                  </Text>
                </View>
              )}

              {cashDifference !== 0 && (
                <View style={{ marginTop: 14 }}>
                  <Text style={styles.fieldLabel}>Justificación obligatoria de la diferencia:</Text>
                  <TextInput
                    style={[styles.inputWrap, styles.justificationInput]}
                    value={justification}
                    onChangeText={setJustification}
                    placeholder="Explique el motivo del descuadre (ej. cliente entregó billete falso, gasto de gasolina no reportado...)"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                  />
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
              onPress={handleCloseSettlement}
              disabled={isSubmitting}
            >
              <Landmark size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>
                {isSubmitting ? 'Cerrando Liquidación...' : 'Cerrar Jornada y Liquidar'}
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
  cardHeaderTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  summaryCard: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  val: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.bgTertiary,
    marginVertical: 10,
  },
  reconciliationCard: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
  },
  reconciliationDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputWrap: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    paddingHorizontal: 14,
  },
  input: {
    height: 50,
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  justificationInput: {
    height: 70,
    textAlignVertical: 'top',
    fontSize: 13,
    padding: 10,
  },
  balancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  balancedText: {
    color: COLORS.success,
    fontSize: 13,
    fontWeight: '600',
  },
  unbalancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
  },
  unbalancedText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    paddingTop: 8,
  },
  confirmBtn: {
    backgroundColor: COLORS.primary,
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
