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
import { Customer, Loan, Installment, LoanFrequency } from '../../core/domain/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCOP, DEFAULT_BUSINESS_CONFIG } from '../../core/config/business-rules';
import {
  calculateRenewalDisbursement,
  calculateLoanSummary,
  calculatePaperworkFee,
  getLocalTodayStr,
} from '../../core/domain/calculator';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { RefreshCw, X, AlertCircle, Lock, Percent, Calendar, DollarSign } from 'lucide-react-native';

interface RenewalModalProps {
  visible: boolean;
  customer: Customer | null;
  loan: Loan | null;
  installments: Installment[];
  todayStr?: string;
  isAdmin?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RenewalModal: React.FC<RenewalModalProps> = ({
  visible,
  customer,
  loan,
  installments,
  todayStr = getLocalTodayStr(),
  isAdmin = false,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [newPrincipalStr, setNewPrincipalStr] = useState('200000');
  const [interestPercentStr, setInterestPercentStr] = useState('20');
  const [frequency, setFrequency] = useState<LoanFrequency>('DAILY');
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inicializar valores al abrir el modal o cambiar el crédito
  useEffect(() => {
    if (visible && loan) {
      setNewPrincipalStr(String(loan.principal || 200000));
      const defaultRate = loan.interestRate ? Math.round(loan.interestRate * 100) : 20;
      setInterestPercentStr(String(defaultRate));

      const initialFreq: LoanFrequency =
        loan.frequency === 'WEEKLY' || loan.frequency === 'BIWEEKLY'
          ? loan.frequency
          : 'DAILY';
      setFrequency(initialFreq);

      if (initialFreq === 'WEEKLY') {
        setInstallmentCountStr(String(loan.installmentCount || 4));
      } else if (initialFreq === 'BIWEEKLY') {
        setInstallmentCountStr(String(loan.installmentCount || 2));
      } else {
        setInstallmentCountStr(String(loan.installmentCount || 30));
      }
    }
  }, [visible, loan]);

  if (!customer || !loan) return null;

  const officeConfig = localStore.getOfficeConfig();
  const isPaperworkEnabled = officeConfig.paperworkFeeEnabled ?? true;
  const effectivePaperworkRate =
    officeConfig.paperworkRate || DEFAULT_BUSINESS_CONFIG.paperwork.rate;

  // Saldo pendiente del crédito anterior
  const previousRemainingBalance = installments
    .filter((i) => i.loanId === loan.id)
    .reduce((sum, i) => sum + i.pendingAmount, 0);

  const newPrincipal = parseInt(newPrincipalStr.replace(/\D/g, ''), 10) || 0;
  const effectiveInterestRate = Math.max(
    0,
    (parseFloat(interestPercentStr.replace(',', '.')) || 0) / 100
  );
  const effectiveInstallmentCount = Math.max(
    1,
    parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 1
  );

  let calculationError: string | null = null;
  let renewalCalc = {
    newPrincipal: 0,
    previousBalanceDeducted: previousRemainingBalance,
    paperworkDeducted: 0,
    actualCashDisbursed: 0,
  };

  try {
    if (newPrincipal > 0) {
      const customPaperworkFee = isPaperworkEnabled
        ? calculatePaperworkFee(newPrincipal, {
            rate: effectivePaperworkRate,
            base: 100000,
            calculationMode: 'PROPORTIONAL',
          })
        : 0;
      renewalCalc = calculateRenewalDisbursement(
        newPrincipal,
        previousRemainingBalance,
        customPaperworkFee
      );
      if (renewalCalc.actualCashDisbursed <= 0) {
        calculationError =
          'El desembolso neto debe ser mayor a $0 COP. El nuevo capital debe superar el saldo anterior a liquidar.';
      }
    }
  } catch (err: any) {
    calculationError = err.message;
  }

  const newSummary =
    newPrincipal > 0
      ? calculateLoanSummary(newPrincipal, effectiveInterestRate, effectiveInstallmentCount)
      : null;

  const freqOptions: Array<{
    key: LoanFrequency;
    label: string;
    unitLabel: string;
    defaultCount: number;
    quickCounts: number[];
  }> = [
    {
      key: 'DAILY',
      label: '☀️ Diario',
      unitLabel: 'días',
      defaultCount: 30,
      quickCounts: [20, 24, 30, 36],
    },
    {
      key: 'WEEKLY',
      label: '📆 Semanal',
      unitLabel: 'semanas',
      defaultCount: 4,
      quickCounts: [4, 6, 8, 10],
    },
    {
      key: 'BIWEEKLY',
      label: '🗓️ Quincenal',
      unitLabel: 'quincenas',
      defaultCount: 2,
      quickCounts: [2, 4, 6],
    },
  ];

  const currentFreqConfig =
    freqOptions.find((f) => f.key === frequency) || freqOptions[0];

  const handleSelectFrequency = (selectedFreq: LoanFrequency, defaultCount: number) => {
    setFrequency(selectedFreq);
    setInstallmentCountStr(String(defaultCount));
  };

  const quickPrincipals = [150000, 200000, 300000, 400000, 500000];
  const quickInterestRates = [10, 15, 20, 25];

  const handleConfirmRenewal = async () => {
    if (newPrincipal <= 0) {
      Alert.alert('Error', 'Ingrese un capital nuevo válido');
      return;
    }
    if (calculationError || renewalCalc.actualCashDisbursed <= 0) {
      Alert.alert(
        'Monto insuficiente',
        calculationError || 'El desembolso neto debe ser mayor a $0 COP.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.recordRenewal({
        previousLoanId: loan.id,
        newPrincipal,
        interestRate: effectiveInterestRate,
        installmentCount: effectiveInstallmentCount,
        frequency,
        collectorId: loan.collectorId,
        todayStr,
        paperworkFee: renewalCalc.paperworkDeducted,
      });

      Alert.alert(
        '¡Renovación Exitosa!',
        `Nuevo Crédito: ${formatCOP(newPrincipal)}\nTotal de la Deuda: ${formatCOP(
          newSummary?.totalAgreed || newPrincipal
        )}\nEfectivo neto a entregar en mano: ${formatCOP(
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
          {/* Drag Handle Superior */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Renovación de Crédito</Text>
              <Text style={styles.subtitle}>
                {customer.fullName} • Liquida {loan.loanNumber}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Bloque Saldo a Descontar */}
            <View style={styles.lavenderSummaryCard}>
              <Text style={styles.lavenderCardTitle}>
                CRÉDITO ACTUAL A LIQUIDAR ({loan.loanNumber})
              </Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Capital original:</Text>
                <Text style={styles.infoVal}>{formatCOP(loan.principal)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Saliente (Saldo a descontar):</Text>
                <Text style={[styles.infoVal, { color: COLORS.danger }]}>
                  - {formatCOP(previousRemainingBalance)}
                </Text>
              </View>
            </View>

            {/* 1. NUEVO CAPITAL DEL CRÉDITO */}
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
              style={{ marginBottom: 14 }}
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

            {/* 2. PORCENTAJE DE INTERÉS (MODIFICABLE SOLO POR ADMINISTRADOR) */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <Percent size={14} color={isAdmin ? COLORS.purple : COLORS.textMuted} />
                <Text style={styles.sectionTitle}>
                  PORCENTAJE DE INTERÉS (%)
                  {isAdmin ? ' • MODO ADMINISTRADOR' : ' • TASA DE RUTA'}
                </Text>
              </View>

              {isAdmin ? (
                <>
                  <View style={styles.rateInputRow}>
                    <TextInput
                      style={styles.rateInput}
                      keyboardType="numeric"
                      value={interestPercentStr}
                      onChangeText={setInterestPercentStr}
                      placeholder="20"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.ratePercentSymbol}>%</Text>
                  </View>
                  <View style={styles.quickRatePillsRow}>
                    {quickInterestRates.map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.ratePill,
                          parseFloat(interestPercentStr) === r && styles.ratePillActive,
                        ]}
                        onPress={() => setInterestPercentStr(String(r))}
                      >
                        <Text
                          style={[
                            styles.ratePillText,
                            parseFloat(interestPercentStr) === r && styles.ratePillTextActive,
                          ]}
                        >
                          {r}%
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.readOnlyRateBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Lock size={15} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
                    <Text style={styles.readOnlyRateText}>
                      Tasa fija:{' '}
                      <Text style={{ fontWeight: '900', color: COLORS.textPrimary }}>
                        {interestPercentStr}%
                      </Text>
                    </Text>
                  </View>
                  <Text style={styles.readOnlyRateHelp}>
                    Solo modificable desde la vista de administrador.
                  </Text>
                </View>
              )}
            </View>

            {/* 3. TIEMPO Y MODALIDAD (DIARIO, SEMANAL, QUINCENAL) */}
            <View style={styles.sectionBox}>
              <View style={styles.sectionHeaderRow}>
                <Calendar size={14} color={COLORS.purple} />
                <Text style={styles.sectionTitle}>TIEMPO Y MODALIDAD DE PAGO</Text>
              </View>

              {/* Selector de Modalidad */}
              <View style={styles.freqTabsRow}>
                {freqOptions.map((f) => {
                  const isSelected = frequency === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.freqTabBtn, isSelected && styles.freqTabBtnActive]}
                      onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                    >
                      <Text
                        style={[
                          styles.freqTabBtnText,
                          isSelected && styles.freqTabBtnTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Selector de Tiempo / Cuotas */}
              <View style={styles.countSelectorContainer}>
                <Text style={styles.countSelectorLabel}>
                  Duración ({currentFreqConfig.unitLabel}):
                </Text>
                <View style={styles.quickCountsRow}>
                  {currentFreqConfig.quickCounts.map((cnt) => (
                    <TouchableOpacity
                      key={cnt}
                      style={[
                        styles.countPill,
                        effectiveInstallmentCount === cnt && styles.countPillActive,
                      ]}
                      onPress={() => setInstallmentCountStr(String(cnt))}
                    >
                      <Text
                        style={[
                          styles.countPillText,
                          effectiveInstallmentCount === cnt && styles.countPillTextActive,
                        ]}
                      >
                        {cnt} {currentFreqConfig.unitLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* ERROR O RESUMEN FINANCIERO COMPLETO */}
            {calculationError ? (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color={COLORS.danger} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{calculationError}</Text>
              </View>
            ) : (
              /* TICKET UNIFICADO DE LIQUIDACIÓN Y DEUDA */
              <View style={styles.ticketCard}>
                <Text style={styles.ticketTitle}>DESGLOSE DE DESEMBOLSO NETO EN MANO</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Nuevo capital aprobado:</Text>
                  <Text style={styles.infoVal}>{formatCOP(newPrincipal)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>(-) Saliente (Saldo anterior):</Text>
                  <Text style={[styles.infoVal, { color: COLORS.danger }]}>
                    - {formatCOP(renewalCalc.previousBalanceDeducted)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>
                    {isPaperworkEnabled
                      ? `(-) Papelería (${formatCOP(effectivePaperworkRate)} / $100k):`
                      : '(-) Papelería (Exento):'}
                  </Text>
                  <Text style={[styles.infoVal, { color: COLORS.warning }]}>
                    - {formatCOP(renewalCalc.paperworkDeducted)}
                  </Text>
                </View>

                <View style={styles.dashedDivider} />

                <View style={styles.infoRow}>
                  <Text
                    style={[
                      styles.infoLabel,
                      { fontWeight: '800', color: COLORS.textPrimary },
                    ]}
                  >
                    Efectivo Neto a Entregar Hoy:
                  </Text>
                  <Text style={styles.netAmountText}>
                    {formatCOP(renewalCalc.actualCashDisbursed)}
                  </Text>
                </View>

                {newSummary && (
                  <>
                    <View style={styles.dashedDivider} />

                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>
                        (+) Interés ({Math.round(effectiveInterestRate * 100)}%):
                      </Text>
                      <Text style={[styles.infoVal, { color: COLORS.purple }]}>
                        +{formatCOP(newSummary.interestAmount)}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text
                        style={[
                          styles.infoLabel,
                          { fontWeight: '800', color: COLORS.textPrimary },
                        ]}
                      >
                        Total de la Deuda a Cobrar:
                      </Text>
                      <Text
                        style={[
                          styles.infoVal,
                          { fontSize: 16, fontWeight: '900', color: COLORS.purple },
                        ]}
                      >
                        {formatCOP(newSummary.totalAgreed)}
                      </Text>
                    </View>

                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>
                        Valor a Cobrar ({newSummary.installmentCount} cuotas):
                      </Text>
                      <Text
                        style={[
                          styles.infoVal,
                          { fontWeight: '800', color: COLORS.primary },
                        ]}
                      >
                        {formatCOP(newSummary.installmentAmount)} / {currentFreqConfig.unitLabel.replace(/s$/, '')}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[
              styles.confirmBtn,
              (isSubmitting || !!calculationError || renewalCalc.actualCashDisbursed <= 0) &&
                styles.confirmBtnDisabled,
            ]}
            onPress={handleConfirmRenewal}
            disabled={isSubmitting || !!calculationError || renewalCalc.actualCashDisbursed <= 0}
          >
            <RefreshCw size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>
              {isSubmitting ? 'Procesando...' : 'Confirmar Renovación'}
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
    maxHeight: '94%',
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
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
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
    borderRadius: 16,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  lavenderCardTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.purple,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  infoVal: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  filledAmountBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 8,
  },
  floatingInternalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  amountInput: {
    fontFamily: FONT_FAMILY,
    height: 38,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  quickAmtPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  sectionBox: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  rateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    height: 42,
    marginBottom: 8,
  },
  rateInput: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  ratePercentSymbol: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  quickRatePillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ratePill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceLavender,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  ratePillActive: {
    borderColor: COLORS.purple,
    backgroundColor: '#ede9fe',
  },
  ratePillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  ratePillTextActive: {
    color: COLORS.purple,
    fontWeight: '800',
  },
  readOnlyRateBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  readOnlyRateText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  readOnlyRateHelp: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 3,
  },
  freqTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  freqTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
  },
  freqTabBtnActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  freqTabBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  freqTabBtnTextActive: {
    color: COLORS.purple,
    fontWeight: '800',
  },
  countSelectorContainer: {
    marginTop: 4,
  },
  countSelectorLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  quickCountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  countPillActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  countPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  countPillTextActive: {
    color: COLORS.purple,
    fontWeight: '800',
  },
  totalDebtCard: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.purple,
    marginBottom: 12,
  },
  totalDebtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  totalDebtHeaderTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.purple,
    letterSpacing: 0.6,
  },
  totalDebtAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.purple,
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  totalDebtDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  totalDebtDetailText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  totalDebtCuotaBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
  },
  totalDebtCuotaBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textPrimary,
    textAlign: 'center',
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
    fontFamily: FONT_FAMILY,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
  ticketCard: {
    backgroundColor: COLORS.receiptPaper,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  ticketTitle: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
