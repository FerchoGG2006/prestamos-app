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
import {
  calculateRenewalDisbursement,
  calculateLoanSummary,
} from '../../core/domain/calculator';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { RefreshCw, X, AlertCircle } from 'lucide-react-native';

interface RenewalModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  installments: Installment[];
  todayStr?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const RenewalModal: React.FC<RenewalModalProps> = ({
  visible,
  customer,
  loan,
  installments,
  todayStr = '2026-09-19',
  onClose,
  onSuccess,
}) => {
  const [newPrincipalStr, setNewPrincipalStr] = useState('200000');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!customer || !loan) return null;

  // Saldo pendiente del crédito anterior
  const previousRemainingBalance = installments
    .filter((i) => i.loanId === loan.id)
    .reduce((sum, i) => sum + i.pendingAmount, 0);

  const newPrincipal = parseInt(newPrincipalStr.replace(/\D/g, ''), 10) || 0;

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

  const newSummary =
    newPrincipal > 0
      ? calculateLoanSummary(newPrincipal, loan.interestRate, loan.installmentCount)
      : null;

  const quickPrincipals = [150000, 200000, 300000, 400000, 500000];

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
      await localStore.recordRenewal({
        previousLoanId: loan.id,
        newPrincipal,
        collectorId: loan.collectorId,
        todayStr,
      });

      Alert.alert(
        '¡Renovación Exitosa!',
        `Nuevo Crédito: ${formatCOP(newPrincipal)}\nEfectivo neto a entregar en mano: ${formatCOP(
          renewalCalc.actualCashDisbursed
        )}`
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
        <View style={styles.sheet}>
          {/* Drag Handle Superior */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Renovación / Refinanciación</Text>
              <Text style={styles.subtitle}>
                {customer.fullName} • Liquida {loan.loanNumber}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Bloque Lavanda Suave con Saldo a Descontar */}
            <View style={styles.lavenderSummaryCard}>
              <Text style={styles.lavenderCardTitle}>
                CRÉDITO ACTUAL A LIQUIDAR ({loan.loanNumber})
              </Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Capital original:</Text>
                <Text style={styles.infoVal}>{formatCOP(loan.principal)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Saldo pendiente a descontar:</Text>
                <Text style={[styles.infoVal, { color: COLORS.danger }]}>
                  - {formatCOP(previousRemainingBalance)}
                </Text>
              </View>
            </View>

            {/* Filled Input con Floating Label interno para el Nuevo Capital */}
            <View style={styles.filledAmountBlock}>
              <Text style={styles.floatingInternalLabel}>
                NUEVO CAPITAL DEL CRÉDITO ($ COP)
              </Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={newPrincipalStr}
                onChangeText={setNewPrincipalStr}
                placeholder="200000"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* Atajos de Capital */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {quickPrincipals.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[
                    styles.quickAmtPill,
                    newPrincipal === amt && styles.quickAmtPillActive,
                  ]}
                  onPress={() => setNewPrincipalStr(amt.toString())}
                >
                  <Text
                    style={[
                      styles.quickAmtText,
                      newPrincipal === amt && { color: COLORS.purple, fontWeight: '800' },
                    ]}
                  >
                    {formatCOP(amt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {calculationError ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color={COLORS.danger} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{calculationError}</Text>
              </View>
            ) : (
              /* Ticket de Liquidación Neta con Línea Punteada (Esqueumorfismo Ligero) */
              <View style={styles.ticketCard}>
                <Text style={styles.ticketTitle}>DESGLOSE DE DESEMBOLSO NETO</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Nuevo capital aprobado:</Text>
                  <Text style={styles.infoVal}>{formatCOP(newPrincipal)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>(-) Saldo crédito anterior:</Text>
                  <Text style={[styles.infoVal, { color: COLORS.danger }]}>
                    - {formatCOP(renewalCalc.previousBalanceDeducted)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>
                    (-) Papelería ({formatCOP(DEFAULT_BUSINESS_CONFIG.paperwork.rate)} / $100k):
                  </Text>
                  <Text style={[styles.infoVal, { color: COLORS.warning }]}>
                    - {formatCOP(renewalCalc.paperworkDeducted)}
                  </Text>
                </View>

                <View style={styles.dashedDivider} />

                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { fontWeight: '800', color: COLORS.textPrimary }]}>
                    Efectivo Neto a Entregar Hoy:
                  </Text>
                  <Text style={styles.netAmountText}>
                    {formatCOP(renewalCalc.actualCashDisbursed)}
                  </Text>
                </View>

                {newSummary && (
                  <View style={[styles.infoRow, { marginTop: 4 }]}>
                    <Text style={styles.infoLabel}>
                      Nueva cuota diaria ({newSummary.installmentCount} días):
                    </Text>
                    <Text style={[styles.infoVal, { color: COLORS.primary }]}>
                      {formatCOP(newSummary.installmentAmount)} / día
                    </Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (isSubmitting || !!calculationError) && styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirmRenewal}
            disabled={isSubmitting || !!calculationError}
          >
            <RefreshCw size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>
              {isSubmitting ? 'Procesando...' : 'Confirmar Renovación'}
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
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '92%',
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
  lavenderSummaryCard: {
    backgroundColor: COLORS.surfaceLavender,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  lavenderCardTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.purple,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  filledAmountBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 10,
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
  quickAmtPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginRight: 8,
  },
  quickAmtPillActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  quickAmtText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  ticketCard: {
    backgroundColor: COLORS.receiptPaper,
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  ticketTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  netAmountText: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.success,
    letterSpacing: -0.4,
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
