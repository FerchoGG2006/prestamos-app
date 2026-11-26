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
import { formatCOP, DEFAULT_BUSINESS_CONFIG, addDays as addDaysToDate } from '../../core/config/business-rules';
import {
  calculateRenewalDisbursement,
  calculateLoanSummary,
  calculatePaperworkFee,
  getLocalTodayStr,
} from '../../core/domain/calculator';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { supabaseSyncService } from '../../infrastructure/sync/supabase-client';
import {
  OfficialReceiptModal,
  ConfirmationStepItem,
} from './OfficialReceiptModal';
import {
  OfficialReceiptData,
  buildRenewalOfficialReceipt,
} from '../../core/utils/whatsapp-receipt';
import { RefreshCw, X, AlertCircle, Lock, Percent, Calendar, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react-native';

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
  const [fixedDueDateStr, setFixedDueDateStr] = useState<string>(() => addDaysToDate(todayStr, 7));
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarYear, setCalendarYear] = useState<number>(() => {
    try {
      return parseInt(todayStr.split('-')[0], 10) || new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  });
  const [calendarMonth, setCalendarMonth] = useState<number>(() => {
    try {
      return parseInt(todayStr.split('-')[1], 10) - 1 || new Date().getMonth();
    } catch {
      return new Date().getMonth();
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renewalOfficialReceipt, setRenewalOfficialReceipt] = useState<OfficialReceiptData | null>(null);
  const [showRenewalReceiptFlow, setShowRenewalReceiptFlow] = useState(false);
  const [renewalProcessingSteps, setRenewalProcessingSteps] = useState<ConfirmationStepItem[]>([]);

  // Inicializar valores al abrir el modal o cambiar el crédito
  useEffect(() => {
    if (visible && loan) {
      setShowRenewalReceiptFlow(false);
      setRenewalOfficialReceipt(null);
      setRenewalProcessingSteps([]);
      setNewPrincipalStr(String(loan.principal || 200000));
      const defaultRate = loan.interestRate ? Math.round(loan.interestRate * 100) : 20;
      setInterestPercentStr(String(defaultRate));

      const initialFreq: LoanFrequency =
        loan.frequency === 'WEEKLY' ||
        loan.frequency === 'BIWEEKLY' ||
        loan.frequency === 'MONTHLY' ||
        loan.frequency === 'FIXED_DATE'
          ? loan.frequency
          : 'DAILY';
      setFrequency(initialFreq);

      if (initialFreq === 'FIXED_DATE') {
        setInstallmentCountStr('1');
        setFixedDueDateStr(
          loan.fixedDueDate && loan.fixedDueDate > todayStr
            ? loan.fixedDueDate
            : addDaysToDate(todayStr, 7)
        );
      } else {
        setFixedDueDateStr(addDaysToDate(todayStr, 7));
        if (initialFreq === 'WEEKLY') {
          setInstallmentCountStr(String(loan.installmentCount || 4));
        } else if (initialFreq === 'BIWEEKLY') {
          setInstallmentCountStr(String(loan.installmentCount || 2));
        } else if (initialFreq === 'MONTHLY') {
          setInstallmentCountStr(String(loan.installmentCount || 1));
        } else {
          setInstallmentCountStr(String(loan.installmentCount || 30));
        }
      }
    }
  }, [visible, loan, todayStr]);

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
  const isFixedDate = frequency === 'FIXED_DATE';
  const parsedInstallmentCount = parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 0;
  const effectiveInstallmentCount = isFixedDate ? 1 : parsedInstallmentCount;

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
    newPrincipal > 0 && effectiveInstallmentCount > 0
      ? calculateLoanSummary(newPrincipal, effectiveInterestRate, effectiveInstallmentCount)
      : null;

  const freqOptions: Array<{
    key: LoanFrequency;
    label: string;
    unitLabel: string;
    singularUnit: string;
    defaultCount: number;
    quickCounts: number[];
  }> = [
    {
      key: 'DAILY',
      label: 'Diario',
      unitLabel: 'días',
      singularUnit: 'día',
      defaultCount: 30,
      quickCounts: [20, 24, 30, 36],
    },
    {
      key: 'WEEKLY',
      label: 'Semanal',
      unitLabel: 'semanas',
      singularUnit: 'semana',
      defaultCount: 4,
      quickCounts: [4, 6, 8, 10],
    },
    {
      key: 'BIWEEKLY',
      label: 'Quincenal',
      unitLabel: 'quincenas',
      singularUnit: 'quincena',
      defaultCount: 2,
      quickCounts: [2, 4, 6],
    },
    {
      key: 'MONTHLY',
      label: 'Mensual',
      unitLabel: 'meses',
      singularUnit: 'mes',
      defaultCount: 1,
      quickCounts: [1, 2, 3, 6],
    },
    {
      key: 'FIXED_DATE',
      label: 'Fecha Fija',
      unitLabel: 'pago único',
      singularUnit: 'pago único',
      defaultCount: 1,
      quickCounts: [],
    },
  ];

  const currentFreqConfig =
    freqOptions.find((f) => f.key === frequency) || freqOptions[0];

  const handleSelectFrequency = (selectedFreq: LoanFrequency, defaultCount: number) => {
    setFrequency(selectedFreq);
    setInstallmentCountStr(String(defaultCount));
    if (selectedFreq === 'FIXED_DATE' && !fixedDueDateStr) {
      setFixedDueDateStr(addDaysToDate(todayStr, 7));
    }
  };

  const openFixedCalendar = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(fixedDueDateStr)) {
      const [y, m] = fixedDueDateStr.split('-');
      setCalendarYear(parseInt(y, 10));
      setCalendarMonth(parseInt(m, 10) - 1);
    }
    setCalendarModalVisible(true);
  };

  const quickPrincipals = [150000, 200000, 300000, 400000, 500000];
  const quickInterestRates = [10, 15, 20, 25];

  const handleConfirmRenewal = async () => {
    if (newPrincipal <= 0) {
      Alert.alert('Error', 'Ingrese un capital nuevo válido');
      return;
    }
    if (effectiveInstallmentCount <= 0) {
      Alert.alert('Plazo inválido', `Ingrese una cantidad de ${currentFreqConfig.unitLabel} mayor a 0.`);
      return;
    }
    if (isFixedDate && !/^\d{4}-\d{2}-\d{2}$/.test(fixedDueDateStr.trim())) {
      Alert.alert('Fecha inválida', 'Seleccione o ingrese una fecha fija de vencimiento válida (YYYY-MM-DD).');
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
    setShowRenewalReceiptFlow(true);
    setRenewalOfficialReceipt(null);
    setRenewalProcessingSteps([
      { label: 'Validando saldo a liquidar', state: 'done' },
      { label: 'Registrando renovación y nuevo crédito', state: 'active' },
      { label: 'Publicando comprobante oficial', state: 'pending' },
      { label: 'Comprobante listo', state: 'pending' },
    ]);
    try {
      const res = await localStore.recordRenewal({
        previousLoanId: loan.id,
        newPrincipal,
        interestRate: effectiveInterestRate,
        installmentCount: effectiveInstallmentCount,
        frequency,
        fixedDueDate: isFixedDate ? fixedDueDateStr.trim() : undefined,
        collectorId: loan.collectorId,
        todayStr,
        paperworkFee: renewalCalc.paperworkDeducted,
      });

      setRenewalProcessingSteps([
        { label: 'Validando saldo a liquidar', state: 'done' },
        { label: 'Registrando renovación y nuevo crédito', state: 'done' },
        { label: 'Publicando comprobante oficial', state: 'active' },
        { label: 'Comprobante listo', state: 'pending' },
      ]);

      const draftReceipt = buildRenewalOfficialReceipt({
        companyName: officeConfig.companyName || 'Mi Oficina',
        routeName: localStore.getRouteDisplayName(res.newLoan.routeId),
        collectorName: localStore.getCollectorDisplayName(res.newLoan.collectorId),
        footerMessage: officeConfig.receiptFooterMessage,
        customer,
        previousLoanNumber: loan.loanNumber,
        newLoan: res.newLoan,
        renewalId: res.renewal.id,
        previousBalanceDeducted: res.renewal.previousBalanceDeducted,
        paperworkDeducted: res.renewal.paperworkDeducted,
        actualCashDisbursed: res.renewal.actualCashDisbursed,
        createdAt: res.renewal.createdAt,
      });

      const published = await supabaseSyncService.issueOfficialReceipt(draftReceipt);
      setRenewalProcessingSteps([
        { label: 'Validando saldo a liquidar', state: 'done' },
        { label: 'Registrando renovación y nuevo crédito', state: 'done' },
        { label: 'Publicando comprobante oficial', state: 'done' },
        { label: 'Comprobante listo', state: 'done' },
      ]);
      await new Promise((r) => setTimeout(r, 120));

      setRenewalOfficialReceipt(published.receipt);
      onSuccess();
    } catch (error: any) {
      setShowRenewalReceiptFlow(false);
      Alert.alert('Error', error.message || 'No se pudo procesar la renovación');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showRenewalReceiptFlow) {
    return (
      <OfficialReceiptModal
        visible={visible}
        receipt={renewalOfficialReceipt}
        isProcessing={isSubmitting || !renewalOfficialReceipt}
        processingTitle="Confirmando renovación"
        processingAmount={renewalCalc.actualCashDisbursed}
        processingSubtitle={`${customer.fullName} · Neto a entregar`}
        processingSteps={renewalProcessingSteps}
        closeLabel="Finalizar"
        onClose={() => {
          setShowRenewalReceiptFlow(false);
          setRenewalOfficialReceipt(null);
          onClose();
        }}
      />
    );
  }

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
            <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
              <Text style={styles.title}>Renovación de Crédito</Text>
              <Text style={styles.subtitle}>
                {customer.fullName} • Liquida {loan.loanNumber}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { flexShrink: 0 }]}>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginBottom: 10 }}
                contentContainerStyle={styles.freqTabsRow}
              >
                {freqOptions.map((f) => {
                  const isSelected = frequency === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.freqTabBtn, isSelected && styles.freqTabBtnActive]}
                      onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                    >
                      <Text
                        numberOfLines={1}
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
              </ScrollView>

              {/* Selector de Tiempo / Cuotas o Fecha Fija */}
              {isFixedDate ? (
                <View style={styles.countSelectorContainer}>
                  <Text style={styles.countSelectorLabel}>
                    Fecha fija de pago único acordada:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.fixedDateRow}
                  >
                    <View style={styles.fixedDateBadgeBox}>
                      <Calendar size={13} color={COLORS.purple} style={{ marginRight: 4 }} />
                      <TextInput
                        style={styles.fixedDateInlineInput}
                        value={fixedDueDateStr}
                        onChangeText={setFixedDueDateStr}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.btnOpenCalendarPill}
                      activeOpacity={0.8}
                      onPress={openFixedCalendar}
                    >
                      <Text style={styles.btnOpenCalendarPillText}>Calendario</Text>
                    </TouchableOpacity>

                    {[7, 15, 30].map((days) => {
                      const target = addDaysToDate(todayStr, days);
                      const active = fixedDueDateStr === target;
                      return (
                        <TouchableOpacity
                          key={days}
                          style={[
                            styles.quickDaysPillInline,
                            active && styles.quickDaysPillInlineActive,
                          ]}
                          onPress={() => setFixedDueDateStr(target)}
                        >
                          <Text
                            style={[
                              styles.quickDaysPillInlineText,
                              active && { color: '#ffffff', fontWeight: '800' },
                            ]}
                          >
                            +{days}d
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <View style={styles.countSelectorContainer}>
                  <Text style={styles.countSelectorLabel}>
                    Duración ({currentFreqConfig.unitLabel}):
                  </Text>
                  <View style={styles.quickCountsRow}>
                    {/* Campo editable libre de primero (Diario / Semanal / Quincenal / Mensual) */}
                    <View
                      style={[
                        styles.customCountPill,
                        effectiveInstallmentCount > 0 &&
                          !currentFreqConfig.quickCounts.includes(effectiveInstallmentCount) &&
                          styles.customCountPillActive,
                      ]}
                    >
                      <TextInput
                        style={styles.customCountInput}
                        keyboardType="number-pad"
                        maxLength={3}
                        value={installmentCountStr}
                        onChangeText={(val) =>
                          setInstallmentCountStr(val.replace(/\D/g, '').slice(0, 3))
                        }
                        placeholder="#"
                        placeholderTextColor="#94A3B8"
                        selectTextOnFocus
                      />
                      <Text style={styles.customCountUnit} numberOfLines={1}>
                        {currentFreqConfig.unitLabel}
                      </Text>
                    </View>

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
                          numberOfLines={1}
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
              )}
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
                        {isFixedDate
                          ? `Fecha Fija (Vence ${fixedDueDateStr}):`
                          : `Valor a Cobrar (${newSummary.installmentCount} cuotas):`}
                      </Text>
                      <Text
                        style={[
                          styles.infoVal,
                          { fontWeight: '800', color: COLORS.primary },
                        ]}
                      >
                        {isFixedDate
                          ? `${formatCOP(newSummary.totalAgreed)} (Pago único)`
                          : `${formatCOP(newSummary.installmentAmount)} / ${currentFreqConfig.singularUnit}`}
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

      {/* Modal de Calendario Interactivo para Renovación a Fecha Fija */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View style={styles.calendarModalBackdrop}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarModalHeader}>
              <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                <Text style={styles.calendarModalTitle}>Fecha Fija de Pago</Text>
                <Text style={styles.calendarModalSubtitle}>Selecciona el día acordado para el pago único</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(false)}
                style={[styles.calendarCloseBtn, { flexShrink: 0 }]}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarMonthRow}>
              <TouchableOpacity
                onPress={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear(calendarYear - 1);
                  } else {
                    setCalendarMonth(calendarMonth - 1);
                  }
                }}
                style={styles.monthNavBtn}
              >
                <ChevronLeft size={18} color="#1E293B" />
              </TouchableOpacity>

              <Text style={styles.monthNameText}>
                {[
                  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
                ][calendarMonth]}{' '}{calendarYear}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear(calendarYear + 1);
                  } else {
                    setCalendarMonth(calendarMonth + 1);
                  }
                }}
                style={styles.monthNavBtn}
              >
                <ChevronRight size={18} color="#1E293B" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekdaysRow}>
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((d, idx) => (
                <Text key={idx} style={styles.calendarWeekdayText}>{d}</Text>
              ))}
            </View>

            <View style={styles.calendarDaysGrid}>
              {(() => {
                const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
                const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const cells = [];
                for (let i = 0; i < firstDayIndex; i++) {
                  cells.push(<View key={`empty-${i}`} style={styles.calendarDayCellEmpty} />);
                }
                for (let day = 1; day <= daysInMonth; day++) {
                  const mStr = String(calendarMonth + 1).padStart(2, '0');
                  const dStr = String(day).padStart(2, '0');
                  const cellDate = `${calendarYear}-${mStr}-${dStr}`;
                  const isSelected = fixedDueDateStr === cellDate;
                  const isToday = todayStr === cellDate;
                  cells.push(
                    <TouchableOpacity
                      key={`day-${day}`}
                      style={[
                        styles.calendarDayCell,
                        isSelected && styles.calendarDayCellSelected,
                        isToday && !isSelected && styles.calendarDayCellToday,
                      ]}
                      onPress={() => setFixedDueDateStr(cellDate)}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          isSelected && styles.calendarDayTextSelected,
                          isToday && !isSelected && styles.calendarDayTextToday,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                return cells;
              })()}
            </View>

            <View style={styles.calendarQuickRow}>
              {[
                { label: '+7 días', days: 7 },
                { label: '+15 días', days: 15 },
                { label: '+20 días', days: 20 },
                { label: '+30 días', days: 30 },
              ].map((item) => {
                const target = addDaysToDate(todayStr, item.days);
                return (
                  <TouchableOpacity
                    key={item.days}
                    style={[
                      styles.calendarQuickPill,
                      fixedDueDateStr === target && styles.calendarQuickPillActive,
                    ]}
                    onPress={() => {
                      setFixedDueDateStr(target);
                      const [y, m] = target.split('-');
                      setCalendarYear(parseInt(y, 10));
                      setCalendarMonth(parseInt(m, 10) - 1);
                    }}
                  >
                    <Text
                      style={[
                        styles.calendarQuickPillText,
                        fixedDueDateStr === target && styles.calendarQuickPillTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.calendarFooterRow}>
              <Text style={styles.calendarFooterPreview}>
                Fecha fija: <Text style={{ fontWeight: '800', color: COLORS.purple }}>{fixedDueDateStr}</Text>
              </Text>
              <TouchableOpacity
                style={styles.calendarConfirmBtn}
                onPress={() => setCalendarModalVisible(false)}
              >
                <Text style={styles.calendarConfirmBtnText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingRight: 8,
  },
  freqTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'center',
    gap: 6,
  },
  customCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 10,
    minHeight: 34,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    gap: 4,
  },
  customCountPillActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  customCountInput: {
    width: 38,
    paddingVertical: 3,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  customCountUnit: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.purple,
  },
  countPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
  fixedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  fixedDateBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    paddingHorizontal: 8,
    height: 36,
  },
  fixedDateInlineInput: {
    width: 90,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  btnOpenCalendarPill: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 11,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOpenCalendarPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  quickDaysPillInline: {
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDaysPillInlineActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  quickDaysPillInlineText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  calendarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  calendarModalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  calendarModalSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  calendarCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNameText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calendarWeekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  calendarDayCellEmpty: {
    width: '14.28%',
    height: 36,
  },
  calendarDayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  calendarDayCellSelected: {
    backgroundColor: COLORS.purple,
  },
  calendarDayCellToday: {
    backgroundColor: '#EDE9FE',
  },
  calendarDayText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  calendarDayTextSelected: {
    color: '#ffffff',
    fontWeight: '900',
  },
  calendarDayTextToday: {
    color: COLORS.purple,
    fontWeight: '900',
  },
  calendarQuickRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  calendarQuickPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  calendarQuickPillActive: {
    backgroundColor: COLORS.purple,
    borderColor: COLORS.purple,
  },
  calendarQuickPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  calendarQuickPillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  calendarFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  calendarFooterPreview: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  calendarConfirmBtn: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 12,
  },
  calendarConfirmBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#ffffff',
  },
});
