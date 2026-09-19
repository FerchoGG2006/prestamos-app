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
import { Customer, Loan, Installment } from '../../core/domain/types';
import { formatCOP, DEFAULT_BUSINESS_CONFIG } from '../../core/config/business-rules';
import { calculateRenewalDisbursement, calculateLoanSummary } from '../../core/domain/calculator';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { RefreshCw, X, AlertCircle } from 'lucide-react-native';

interface RenewalModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  installments: Installment[];
  onClose: () => void;
  onSuccess: () => void;
}

export const RenewalModal: React.FC<RenewalModalProps> = ({
  visible,
  customer,
  loan,
  installments,
  onClose,
  onSuccess,
}) => {
  if (!customer || !loan) return null;

  // Saldo pendiente del crédito anterior
  const previousRemainingBalance = installments
    .filter((i) => i.loanId === loan.id)
    .reduce((sum, i) => sum + i.pendingAmount, 0);

  const [newPrincipalStr, setNewPrincipalStr] = useState('200000');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const newPrincipal = parseInt(newPrincipalStr.replace(/\D/g, ''), 10) || 0;

  // Cálculo en vivo del desembolso
  let calculationError: string | null = null;
  let renewalCalc = {
    newPrincipal: 0,
    previousBalanceDeducted: previousRemainingBalance,
    paperworkDeducted: 0,
    actualCashDisbursed: 0,
  };

  try {
    if (newPrincipal > 0) {
      renewalCalc = calculateRenewalDisbursement(newPrincipal, previousRemainingBalance);
    }
  } catch (err: any) {
    calculationError = err.message;
  }

  const handleConfirmRenewal = async () => {
    if (newPrincipal <= 0) {
      Alert.alert('Error', 'Ingrese un capital nuevo válido');
      return;
    }
    if (calculationError) {
      Alert.alert('Monto insuficiente', calculationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await localStore.recordRenewal({
        previousLoanId: loan.id,
        newPrincipal,
        collectorId: loan.collectorId,
        todayStr,
      });

      Alert.alert(
        '¡Renovación Exitosa!',
        `Nuevo Crédito: ${formatCOP(newPrincipal)}\nDinero a entregar en mano: ${formatCOP(renewalCalc.actualCashDisbursed)}`
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo procesar la renovación');
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
              <Text style={styles.title}>Renovación de Crédito</Text>
              <Text style={styles.subtitle}>{customer.fullName} • Crédito {loan.loanNumber}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Estado del crédito anterior */}
            <View style={styles.infoCard}>
              <Text style={styles.cardHeaderTitle}>Crédito Actual a Renovar</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Capital original:</Text>
                <Text style={styles.infoVal}>{formatCOP(loan.principal)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Saldo pendiente por pagar:</Text>
                <Text style={[styles.infoVal, { color: COLORS.warning }]}>
                  {formatCOP(previousRemainingBalance)}
                </Text>
              </View>
            </View>

            {/* Input de nuevo capital */}
            <Text style={styles.fieldLabel}>Nuevo Capital Solicitado ($ COP):</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={newPrincipalStr}
                onChangeText={setNewPrincipalStr}
                placeholder="200000"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Desglose estricto del desembolso */}
            <View style={styles.breakdownCard}>
              <Text style={styles.cardHeaderTitle}>Liquidación del Desembolso</Text>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>(+) Capital Nuevo Colocado:</Text>
                <Text style={styles.breakdownValueBold}>{formatCOP(newPrincipal)}</Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>(-) Menos Saldo Anterior:</Text>
                <Text style={[styles.breakdownValue, { color: COLORS.danger }]}>
                  - {formatCOP(renewalCalc.previousBalanceDeducted)}
                </Text>
              </View>

              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>(-) Menos Papelería ($5k/$100k):</Text>
                <Text style={[styles.breakdownValue, { color: COLORS.danger }]}>
                  - {formatCOP(renewalCalc.paperworkDeducted)}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.disbursedHighlight}>
                <Text style={styles.disbursedLabel}>DINERO REAL A ENTREGAR EN MANO:</Text>
                <Text style={styles.disbursedAmount}>
                  {formatCOP(renewalCalc.actualCashDisbursed)}
                </Text>
              </View>
            </View>

            {calculationError && (
              <View style={styles.errorCard}>
                <AlertCircle size={18} color={COLORS.danger} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{calculationError}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                (isSubmitting || !!calculationError || newPrincipal <= 0) && styles.confirmBtnDisabled,
              ]}
              onPress={handleConfirmRenewal}
              disabled={isSubmitting || !!calculationError || newPrincipal <= 0}
            >
              <RefreshCw size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>
                {isSubmitting ? 'Procesando Renovación...' : 'Confirmar y Desembolsar'}
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
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  input: {
    height: 50,
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  breakdownCard: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  breakdownLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  breakdownValue: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  breakdownValueBold: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.bgTertiary,
    marginVertical: 10,
  },
  disbursedHighlight: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  disbursedLabel: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  disbursedAmount: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
    marginBottom: 16,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
  },
  footer: {
    paddingTop: 8,
  },
  confirmBtn: {
    backgroundColor: COLORS.purple,
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
