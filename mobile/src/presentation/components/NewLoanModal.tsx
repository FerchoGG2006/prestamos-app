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
import { Customer, Loan, LoanFrequency } from '../../core/domain/types';
import { formatCOP, addDays as addDaysToDate } from '../../core/config/business-rules';
import {
  calculateLoanSummary,
  calculatePaperworkFee,
} from '../../core/domain/calculator';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { FilePlus2, X, Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';

interface NewLoanModalProps {
  visible: boolean;
  customers: Customer[];
  loans: Loan[];
  todayStr: string;
  baseAvailable?: number;
  preselectedCustomerId?: string;
  initialFrequency?: LoanFrequency;
  initialFixedDueDate?: string;
  isCollector?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewLoanModal: React.FC<NewLoanModalProps> = ({
  visible,
  customers,
  loans,
  todayStr,
  baseAvailable,
  preselectedCustomerId,
  initialFrequency,
  initialFixedDueDate,
  isCollector = false,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(preselectedCustomerId || '');
  const [isCardMigration, setIsCardMigration] = useState<boolean>(false);
  const [paidInstallmentNums, setPaidInstallmentNums] = useState<number[]>([]);
  const [quickPaidCountStr, setQuickPaidCountStr] = useState<string>('');
  const [principalStr, setPrincipalStr] = useState('200000');
  const [frequency, setFrequency] = useState<LoanFrequency>(initialFrequency || 'DAILY');
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [fixedDueDateStr, setFixedDueDateStr] = useState<string>(
    () => initialFixedDueDate || addDaysToDate(todayStr, 7)
  );
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
  const officeConfig = localStore.getOfficeConfig();
  const defaultInterestRate = officeConfig.defaultInterestRate || 0.2;
  const [interestPercentStr, setInterestPercentStr] = useState<string>(() =>
    String(Math.round((localStore.getOfficeConfig().defaultInterestRate || 0.2) * 100))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (preselectedCustomerId) {
        setSelectedCustomerId(preselectedCustomerId);
      }
      if (initialFrequency) {
        setFrequency(initialFrequency);
      }
      if (initialFixedDueDate) {
        setFixedDueDateStr(initialFixedDueDate);
      }
      const cfgRate = localStore.getOfficeConfig().defaultInterestRate || 0.2;
      setInterestPercentStr(String(Math.round(cfgRate * 100)));
    }
  }, [visible, preselectedCustomerId, initialFrequency, initialFixedDueDate]);

  const togglePaidInstallment = (num: number) => {
    setPaidInstallmentNums((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort((a, b) => a - b)
    );
  };

  const applyQuickPaidCount = (rawCount: string) => {
    setQuickPaidCountStr(rawCount);
    const n = parseInt(rawCount.replace(/\D/g, ''), 10) || 0;
    const clamped = Math.max(0, Math.min(installmentCount, n));
    const arr: number[] = [];
    for (let i = 1; i <= clamped; i++) {
      arr.push(i);
    }
    setPaidInstallmentNums(arr);
  };

  const principal = parseInt(principalStr.replace(/\D/g, ''), 10) || 0;
  const isFixedDate = frequency === 'FIXED_DATE';
  const installmentCount = isFixedDate ? 1 : (parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 30);

  const getFirstDueDate = (): string => {
    if (isFixedDate) return fixedDueDateStr;
    if (frequency === 'DAILY') return addDaysToDate(todayStr, 1);
    if (frequency === 'WEEKLY') return addDaysToDate(todayStr, 7);
    if (frequency === 'BIWEEKLY') return addDaysToDate(todayStr, 15);
    if (frequency === 'MONTHLY') return addDaysToDate(todayStr, 30);
    return addDaysToDate(todayStr, 1);
  };
  const firstDueDateStr = getFirstDueDate();

  const effectiveInterestRate = Math.max(0, (parseFloat(interestPercentStr.replace(',', '.')) || 0) / 100);
  const summary =
    principal > 0 && installmentCount > 0
      ? calculateLoanSummary(principal, effectiveInterestRate, installmentCount)
      : null;
  const isPaperworkEnabled = officeConfig.paperworkFeeEnabled ?? true;
  const isMigration = isCardMigration;
  const paperwork =
    principal > 0 && isPaperworkEnabled && !isMigration
      ? calculatePaperworkFee(principal, {
          rate: officeConfig.paperworkRate || 5000,
          base: 100000,
          calculationMode: 'PROPORTIONAL',
        })
      : 0;
  const netCashToDeliver = isMigration ? 0 : Math.max(0, principal - paperwork);

  const quickPrincipals = [100000, 150000, 200000, 300000, 500000];

  const frequencies: Array<{
    key: LoanFrequency;
    label: string;
    shortLabel: string;
    unitLabel: string;
    questionLabel: string;
    defaultCount: number;
    options: number[];
  }> = [
    { key: 'FIXED_DATE', label: 'Fecha Fija', shortLabel: '📅 Fecha Fija', unitLabel: 'pago único', questionLabel: 'Fecha de Pago Único Acordada', defaultCount: 1, options: [] },
    { key: 'DAILY', label: 'Diario', shortLabel: '☀️ Pago Diario', unitLabel: 'días', questionLabel: '¿A cuántos días hábiles? (Recomendado: 30 días)', defaultCount: 30, options: [20, 24, 30, 36, 40] },
    { key: 'WEEKLY', label: 'Semanal', shortLabel: '📆 Pago Semanal', unitLabel: 'semanas', questionLabel: '¿A cuántas semanas?', defaultCount: 4, options: [4, 6, 8, 10, 12] },
    { key: 'BIWEEKLY', label: 'Quincenal', shortLabel: '🗓️ Pago Quincenal', unitLabel: 'quincenas', questionLabel: '¿A cuántas quincenas?', defaultCount: 2, options: [2, 4, 6, 8] },
    { key: 'MONTHLY', label: 'Mensual', shortLabel: '🏛️ Pago Mensual', unitLabel: 'meses', questionLabel: '¿A cuántos meses?', defaultCount: 1, options: [1, 2, 3, 6] },
  ];

  const currentFreqConfig = frequencies.find((f) => f.key === frequency) || frequencies[0];

  const handleSelectFrequency = (freq: LoanFrequency, defaultCount: number) => {
    setFrequency(freq);
    setInstallmentCountStr(String(defaultCount));
    if (freq === 'FIXED_DATE' && !fixedDueDateStr) {
      setFixedDueDateStr(addDaysToDate(todayStr, 7));
    }
  };

  const handleCreateLoan = async () => {
    if (!selectedCustomerId) {
      Alert.alert('Seleccione un cliente', 'Elija el cliente para desembolsar el préstamo.');
      return;
    }
    if (principal <= 0) {
      Alert.alert('Capital inválido', 'Ingrese un monto de capital mayor a $0.');
      return;
    }
    if (isFixedDate && !fixedDueDateStr) {
      Alert.alert('Fecha inválida', 'Seleccione o ingrese la fecha fija de vencimiento.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await localStore.createLoan({
        customerId: selectedCustomerId,
        principal,
        interestRate: effectiveInterestRate,
        installmentCount,
        frequency,
        fixedDueDate: isFixedDate ? fixedDueDateStr : undefined,
        todayStr,
        isCardMigration,
        paidInstallmentNumbers: isCardMigration ? paidInstallmentNums : undefined,
      });

      if (isCardMigration) {
        const paidTotal = res.loan.installmentAmount * paidInstallmentNums.length;
        const pendingTotal = Math.max(0, res.loan.totalAgreed - paidTotal);
        Alert.alert(
          '¡Cartulina Pasada a Digital!',
          `Crédito ${res.loan.loanNumber} digitalizado con éxito.\n\n` +
          `• Cuotas ya pagadas en cartulina: ${paidInstallmentNums.length} de ${installmentCount} (${formatCOP(paidTotal)})\n` +
          `• Saldo pendiente por cobrar: ${formatCOP(pendingTotal)}\n` +
          `• Impacto en caja de hoy: $0 (Caja protegida)`
        );
      } else {
        Alert.alert(
          '¡Crédito Desembolsado!',
          `Crédito ${res.loan.loanNumber} creado exitosamente.\n\n` +
          `• Modalidad: ${isFixedDate ? `Fecha Fija (Vence: ${fixedDueDateStr})` : `${installmentCount} ${currentFreqConfig.unitLabel}`}\n` +
          `• Total a cobrar: ${formatCOP(res.loan.totalAgreed)}\n` +
          `• Cuota: ${formatCOP(res.loan.installmentAmount)}\n` +
          `• Cartulina / Papelería: ${formatCOP(paperwork)}\n` +
          `• Efectivo neto a entregar: ${formatCOP(netCashToDeliver)}`
        );
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('No se pudo crear', err.message || 'Error al crear préstamo');
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
          <View style={styles.sheetHandle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Originación de Crédito</Text>
              <Text style={styles.subtitle}>
                Tasa pactada ({interestPercentStr || '0'}%) sobre capital • {isPaperworkEnabled ? `Papelería $${(officeConfig.paperworkRate || 5000).toLocaleString('es-CO')} / $100k` : 'Sin cobro de papelería (Desactivada)'}
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
            {/* Selector de Modo: Nuevo Desembolso vs Pasar Cartulina Física a Digital */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <TouchableOpacity
                style={[
                  {
                    flex: 1,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: !isCardMigration ? '#0D9488' : '#E2E8F0',
                    backgroundColor: !isCardMigration ? '#E6F7F5' : '#F8FAFC',
                    alignItems: 'center',
                  },
                ]}
                onPress={() => setIsCardMigration(false)}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: !isCardMigration ? '#0F766E' : '#64748B',
                  }}
                >
                  💵 Nuevo Préstamo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  {
                    flex: 1.2,
                    paddingVertical: 10,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: isCardMigration ? '#0D9488' : '#E2E8F0',
                    backgroundColor: isCardMigration ? '#E6F7F5' : '#F8FAFC',
                    alignItems: 'center',
                  },
                ]}
                onPress={() => setIsCardMigration(true)}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '800',
                    color: isCardMigration ? '#0F766E' : '#64748B',
                  }}
                >
                  📋 Cartulina Física a Digital
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>1. Seleccionar Titular</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
            >
              {customers.map((c) => {
                const hasActive = loans.some(
                  (l) => l.customerId === c.id && l.status === 'ACTIVE'
                );
                const isSelected = selectedCustomerId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.customerChip,
                      isSelected && styles.customerChipActive,
                      hasActive && { opacity: 0.55 },
                    ]}
                    onPress={() => setSelectedCustomerId(c.id)}
                  >
                    <Text
                      style={[
                        styles.customerChipName,
                        isSelected && { color: COLORS.purple },
                      ]}
                    >
                      {c.fullName}
                    </Text>
                    <Text style={styles.customerChipSub}>
                      {hasActive ? 'Con crédito activo' : '✓ Disponible'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Patrón #5 de Gemini Share: Filled Input con Floating Label interno para Capital */}
            <View style={styles.filledAmountBlock}>
              <Text style={styles.floatingInternalLabel}>
                2. CAPITAL INICIAL A DESEMBOLSAR ($ COP)
              </Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={principalStr}
                onChangeText={setPrincipalStr}
              />
            </View>

            {baseAvailable !== undefined && (
              <View style={[styles.baseAvailableBox, principal > baseAvailable && styles.baseExceededBox]}>
                <Text style={styles.baseAvailableText}>
                  💵 Base disponible para prestar: <Text style={{ fontWeight: '800' }}>{formatCOP(baseAvailable)}</Text>
                </Text>
                {principal > baseAvailable && (
                  <Text style={styles.baseExceededWarning}>
                    ⚠️ El monto supera la Base disponible en caja ({formatCOP(baseAvailable)})
                  </Text>
                )}
              </View>
            )}

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
                    principal === amt && styles.quickAmtPillActive,
                  ]}
                  onPress={() => setPrincipalStr(amt.toString())}
                >
                  <Text
                    style={[
                      styles.quickAmtText,
                      principal === amt && { color: COLORS.primary, fontWeight: '800' },
                    ]}
                  >
                    {formatCOP(amt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>3. Modalidad de Pago</Text>
            {/* Modalidades en una sola línea horizontal: botones compactos de 2 palabras con emoji */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ flexDirection: 'row', gap: 6 }}
            >
              {frequencies.map((f) => {
                const isSelected = frequency === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.modalitySingleLineBtn,
                      isSelected && styles.modalitySingleLineBtnActive,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                  >
                    <Text
                      style={[
                        styles.modalitySingleLineBtnText,
                        isSelected && styles.modalitySingleLineBtnTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {f.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 4. Selector de Plazo o Fecha Fija adaptativo */}
            {isFixedDate ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>
                  4. Fecha fija de pago acordada
                </Text>
                {/* Todo en una misma línea de párrafo: caja con fecha fija, botón de calendario y atajos */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.fixedDateSingleLineRow}
                >
                  <View style={styles.fixedDateBadgeBox}>
                    <Calendar size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
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
                    onPress={() => setCalendarModalVisible(true)}
                  >
                    <Text style={styles.btnOpenCalendarPillText}>🗓️ Calendario</Text>
                  </TouchableOpacity>

                  {[7, 15, 30].map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={[
                        styles.quickDaysPillInline,
                        fixedDueDateStr === addDaysToDate(todayStr, days) && styles.quickDaysPillInlineActive,
                      ]}
                      onPress={() => setFixedDueDateStr(addDaysToDate(todayStr, days))}
                    >
                      <Text
                        style={[
                          styles.quickDaysPillInlineText,
                          fixedDueDateStr === addDaysToDate(todayStr, days) && { color: '#ffffff', fontWeight: '800' },
                        ]}
                      >
                        +{days}d
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>
                  4. {currentFreqConfig.questionLabel} ({installmentCount} {currentFreqConfig.unitLabel})
                </Text>
                <View style={styles.installmentsRow}>
                  {currentFreqConfig.options.map((cnt) => (
                    <TouchableOpacity
                      key={cnt}
                      style={[
                        styles.cntPill,
                        installmentCount === cnt && styles.cntPillActive,
                      ]}
                      onPress={() => setInstallmentCountStr(cnt.toString())}
                    >
                      <Text
                        style={[
                          styles.cntPillText,
                          installmentCount === cnt && { color: '#ffffff' },
                        ]}
                      >
                        {cnt} {currentFreqConfig.unitLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 5. Tasa de Interés Pactada por Contrato */}
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.label}>5. Tasa de Interés Pactada (% sobre operación)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={{
                    width: 90,
                    height: 40,
                    backgroundColor: isCollector ? '#F1F5F9' : '#F8FAFC',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    paddingHorizontal: 12,
                    fontSize: 15,
                    fontWeight: '800',
                    color: isCollector ? '#475569' : COLORS.textPrimary,
                  }}
                  keyboardType="numeric"
                  value={interestPercentStr}
                  editable={!isCollector}
                  onChangeText={setInterestPercentStr}
                />
                <Text style={{ flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 }}>
                  {isCollector
                    ? 'Tasa comercial configurada por la administración de la oficina.'
                    : 'La tasa pactada queda congelada en este contrato y no modifica préstamos anteriores. Verifique siempre que la tasa cumpla los topes vigentes según la modalidad legal.'}
                </Text>
              </View>
            </View>

            {/* Cartulina Física Interactiva cuando está en modo Migración */}
            {isCardMigration && !isFixedDate && summary && (
              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#99F6E4',
                  marginBottom: 14,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0F766E' }}>
                    📋 Toca las cuotas ya pagadas en la cartulina física
                  </Text>
                  <View
                    style={{
                      backgroundColor: '#DCFCE7',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#166534' }}>
                      🛡️ Caja hoy: $0
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#475569' }}>
                    Cuotas ya pagadas:
                  </Text>
                  <TextInput
                    style={{
                      width: 64,
                      height: 34,
                      backgroundColor: '#FFFFFF',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: '800',
                      color: '#0F172A',
                    }}
                    keyboardType="numeric"
                    value={quickPaidCountStr}
                    onChangeText={applyQuickPaidCount}
                    placeholder="Ej. 12"
                    placeholderTextColor="#94A3B8"
                  />
                  <TouchableOpacity
                    onPress={() => applyQuickPaidCount('0')}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>
                      Limpiar
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: installmentCount }, (_, i) => i + 1).map((num) => {
                    const isPaid = paidInstallmentNums.includes(num);
                    return (
                      <TouchableOpacity
                        key={num}
                        onPress={() => togglePaidInstallment(num)}
                        style={{
                          minWidth: 42,
                          height: 32,
                          borderRadius: 7,
                          borderWidth: 1,
                          borderColor: isPaid ? '#10B981' : '#CBD5E1',
                          backgroundColor: isPaid ? '#DCFCE7' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: isPaid ? '#065F46' : '#64748B',
                          }}
                        >
                          {num}
                          {isPaid ? ' ✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View
                  style={{
                    backgroundColor: '#ECFDF5',
                    borderRadius: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                  }}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#065F46' }}>
                    Pagado en cartulina: {formatCOP(summary.installmentAmount * paidInstallmentNums.length)} ({paidInstallmentNums.length}/{installmentCount})
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E', marginTop: 2 }}>
                    Saldo pendiente por cobrar en digital:{' '}
                    {formatCOP(Math.max(0, summary.totalAgreed - summary.installmentAmount * paidInstallmentNums.length))}
                  </Text>
                </View>
              </View>
            )}

            {/* Calculadora Financiera en Vivo con línea punteada tipo ticket */}
            {summary && (
              <View style={styles.calcCard}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Capital pactado:</Text>
                  <Text style={styles.calcVal}>{formatCOP(summary.principal)}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Interés pactado ({interestPercentStr || '0'}%):</Text>
                  <Text style={styles.calcVal}>+ {formatCOP(summary.interestAmount)}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Total a cobrar:</Text>
                  <Text style={[styles.calcVal, { color: COLORS.primary }]}>
                    {formatCOP(summary.totalAgreed)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.calcLabel}>
                      {isFixedDate
                        ? 'Modalidad: Pago único'
                        : `Valor Cuota (${installmentCount} cuotas ${currentFreqConfig.unitLabel}):`}
                    </Text>
                    <Text style={styles.calcDateUnderAmount}>
                      📅 {isFixedDate ? `Vence: ${fixedDueDateStr}` : `1ª cuota: ${firstDueDateStr} • Cobro ${currentFreqConfig.label.toLowerCase()}`}
                    </Text>
                  </View>
                  <Text style={[styles.calcVal, { color: COLORS.textPrimary, fontSize: 16 }]}>
                    {formatCOP(summary.installmentAmount)}
                  </Text>
                </View>
                <View style={styles.dashedDivider} />
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>
                    {isMigration
                      ? 'Impacto Caja Hoy:'
                      : isPaperworkEnabled
                      ? `Cartulina / Papelería (${formatCOP(officeConfig.paperworkRate || 5000)} / $100k):`
                      : 'Cartulina / Papelería:'}
                  </Text>
                  <Text
                    style={[
                      styles.calcVal,
                      isMigration
                        ? { color: COLORS.primary }
                        : isPaperworkEnabled && paperwork > 0
                        ? { color: COLORS.danger }
                        : { color: COLORS.textMuted },
                    ]}
                  >
                    {isMigration
                      ? '$ 0 (Cartulina física migrada)'
                      : isPaperworkEnabled && paperwork > 0
                      ? `- ${formatCOP(paperwork)}`
                      : '$ 0 (Desactivada por administración)'}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={[styles.calcLabel, { fontWeight: '800', color: COLORS.textPrimary }]}>
                    💵 Efectivo Neto a Entregar:
                  </Text>
                  <Text style={[styles.calcVal, { fontSize: 17, color: COLORS.success }]}>
                    {formatCOP(netCashToDeliver)}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.confirmBtn, isSubmitting && { opacity: 0.5 }]}
            onPress={handleCreateLoan}
            disabled={isSubmitting}
          >
            <FilePlus2 size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>
              {isSubmitting
                ? 'Guardando...'
                : isCardMigration
                ? 'Pasar Cartulina a Digital'
                : 'Confirmar y Desembolsar'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Modal de Calendario Interactivo para Fecha Fija */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View style={styles.calendarModalBackdrop}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarModalHeader}>
              <View>
                <Text style={styles.calendarModalTitle}>📅 Fecha Fija de Pago</Text>
                <Text style={styles.calendarModalSubtitle}>Selecciona el día acordado para el cobro</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(false)}
                style={styles.calendarCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Selector de Mes */}
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
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
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

            {/* Cabecera de Días de Semana */}
            <View style={styles.calendarWeekdaysRow}>
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((d, idx) => (
                <Text key={idx} style={styles.calendarWeekdayText}>{d}</Text>
              ))}
            </View>

            {/* Cuadrícula de Días */}
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
                      onPress={() => {
                        setFixedDueDateStr(cellDate);
                      }}
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

            {/* Atajos Rápidos */}
            <View style={styles.calendarQuickRow}>
              {[
                { label: '+7 días', days: 7 },
                { label: '+15 días', days: 15 },
                { label: '+20 días', days: 20 },
                { label: '+30 días', days: 30 },
              ].map((item) => (
                <TouchableOpacity
                  key={item.days}
                  style={[
                    styles.calendarQuickPill,
                    fixedDueDateStr === addDaysToDate(todayStr, item.days) && styles.calendarQuickPillActive,
                  ]}
                  onPress={() => {
                    const target = addDaysToDate(todayStr, item.days);
                    setFixedDueDateStr(target);
                    const [y, m] = target.split('-');
                    setCalendarYear(parseInt(y, 10));
                    setCalendarMonth(parseInt(m, 10) - 1);
                  }}
                >
                  <Text
                    style={[
                      styles.calendarQuickPillText,
                      fixedDueDateStr === addDaysToDate(todayStr, item.days) && styles.calendarQuickPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fecha seleccionada en una sola línea y botón aceptar */}
            <View style={styles.calendarFooterRow}>
              <Text style={styles.calendarFooterPreview}>
                Fecha fija: <Text style={{ fontWeight: '800', color: COLORS.primary }}>{fixedDueDateStr}</Text>
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
    maxHeight: '92%',
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
  label: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  customerChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginRight: 8,
  },
  customerChipActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  customerChipName: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  customerChipSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
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
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  modalityContainer: {
    gap: 8,
    marginBottom: 16,
  },
  modalityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalityBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  modalityBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  modalityBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  modalityBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '900',
  },
  installmentsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  cntPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
  },
  cntPillActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  cntPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  calcCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calcLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  calcVal: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  confirmBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.dockBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  fixedDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  fixedDateInput: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
  },
  fixedDateHint: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '800',
  },
  quickDaysPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDaysPillActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  quickDaysText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  baseAvailableBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  baseExceededBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  baseAvailableText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#0369a1',
    fontWeight: '600',
  },
  baseExceededWarning: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '700',
    marginTop: 4,
  },
  calcDateUnderAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  modalitySingleLineBtn: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 9999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalitySingleLineBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  modalitySingleLineBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  modalitySingleLineBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  fixedDateSingleLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
    marginBottom: 4,
  },
  fixedDateBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fixedDateInlineInput: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    width: 95,
    padding: 0,
  },
  btnOpenCalendarPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOpenCalendarPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  quickDaysPillInline: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDaysPillInlineActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  quickDaysPillInlineText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  calendarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  calendarModalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  calendarModalSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  calendarCloseBtn: {
    padding: 4,
  },
  calendarMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  monthNameText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  calendarWeekdayText: {
    width: 38,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  calendarDayCellEmpty: {
    width: `${100 / 7}%`,
    height: 36,
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarDayCellSelected: {
    backgroundColor: '#2563EB',
  },
  calendarDayCellToday: {
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  calendarDayText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarDayTextToday: {
    color: '#2563EB',
    fontWeight: '800',
  },
  calendarQuickRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarQuickPill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarQuickPillActive: {
    backgroundColor: '#0F172A',
  },
  calendarQuickPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  calendarQuickPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarFooterPreview: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#475569',
  },
  calendarConfirmBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  calendarConfirmBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
