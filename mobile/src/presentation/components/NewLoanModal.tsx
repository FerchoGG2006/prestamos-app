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
import { FilePlus2, X, Calendar } from 'lucide-react-native';

interface NewLoanModalProps {
  visible: boolean;
  customers: Customer[];
  loans: Loan[];
  todayStr: string;
  baseAvailable?: number;
  preselectedCustomerId?: string;
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
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(preselectedCustomerId || '');
  const [isCardMigration, setIsCardMigration] = useState<boolean>(false);
  const [paidInstallmentNums, setPaidInstallmentNums] = useState<number[]>([]);
  const [quickPaidCountStr, setQuickPaidCountStr] = useState<string>('');
  const [principalStr, setPrincipalStr] = useState('200000');
  const [frequency, setFrequency] = useState<LoanFrequency>('DAILY');
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [fixedDueDateStr, setFixedDueDateStr] = useState<string>(() => addDaysToDate(todayStr, 7));
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
      const cfgRate = localStore.getOfficeConfig().defaultInterestRate || 0.2;
      setInterestPercentStr(String(Math.round(cfgRate * 100)));
    }
  }, [visible, preselectedCustomerId]);

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
  const paperwork =
    principal > 0 && isPaperworkEnabled
      ? calculatePaperworkFee(principal, {
          rate: officeConfig.paperworkRate || 5000,
          base: 100000,
          calculationMode: 'PROPORTIONAL',
        })
      : 0;
  const netCashToDeliver = Math.max(0, principal - paperwork);

  const quickPrincipals = [100000, 150000, 200000, 300000, 500000];

  const frequencies: Array<{
    key: LoanFrequency;
    label: string;
    unitLabel: string;
    questionLabel: string;
    defaultCount: number;
    options: number[];
  }> = [
    { key: 'DAILY', label: 'Diario (30d)', unitLabel: 'días', questionLabel: '¿A cuántos días hábiles? (Recomendado: 30 días)', defaultCount: 30, options: [20, 24, 30, 36, 40] },
    { key: 'WEEKLY', label: 'Semanal', unitLabel: 'semanas', questionLabel: '¿A cuántas semanas?', defaultCount: 4, options: [4, 6, 8, 10, 12] },
    { key: 'BIWEEKLY', label: 'Quincenal', unitLabel: 'quincenas', questionLabel: '¿A cuántas quincenas?', defaultCount: 2, options: [2, 4, 6, 8] },
    { key: 'MONTHLY', label: 'Mensual', unitLabel: 'meses', questionLabel: '¿A cuántos meses?', defaultCount: 1, options: [1, 2, 3, 6] },
    { key: 'FIXED_DATE', label: '📅 Fecha Fija', unitLabel: 'pago único', questionLabel: 'Fecha de Pago Único Acordada', defaultCount: 1, options: [] },
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { paddingTop: Math.max(insets.top, 12) }]}
      >
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.sheetHandle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Originación de Crédito</Text>
              <Text style={styles.subtitle}>
                Tasa pactada ({interestPercentStr || '0'}%) sobre capital • {isPaperworkEnabled ? `Papelería $${(officeConfig.paperworkRate || 5000).toLocaleString('es-CO')} / $100k` : 'Sin descuento de papelería'}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ gap: 6 }}
            >
              {frequencies.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.cntPill,
                    { paddingHorizontal: 12, paddingVertical: 8 },
                    frequency === f.key && styles.cntPillActive,
                  ]}
                  onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                >
                  <Text
                    style={[
                      styles.cntPillText,
                      frequency === f.key && { color: '#ffffff', fontWeight: '800' },
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* 4. Selector de Plazo o Fecha Fija adaptativo */}
            {isFixedDate ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>
                  4. Fecha de Pago Único Acordada
                </Text>
                <View style={styles.fixedDateBox}>
                  <Calendar size={16} color={COLORS.primary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.fixedDateInput}
                    value={fixedDueDateStr}
                    onChangeText={setFixedDueDateStr}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.fixedDateHint}>Vencimiento</Text>
                </View>
                {/* Atajos de días para fecha fija */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                  {[
                    { label: '7 días', days: 7 },
                    { label: '15 días', days: 15 },
                    { label: '20 días', days: 20 },
                    { label: '30 días', days: 30 },
                  ].map((item) => (
                    <TouchableOpacity
                      key={item.days}
                      style={[
                        styles.quickDaysPill,
                        fixedDueDateStr === addDaysToDate(todayStr, item.days) && styles.quickDaysPillActive,
                      ]}
                      onPress={() => setFixedDueDateStr(addDaysToDate(todayStr, item.days))}
                    >
                      <Text
                        style={[
                          styles.quickDaysText,
                          fixedDueDateStr === addDaysToDate(todayStr, item.days) && { color: '#ffffff', fontWeight: '800' },
                        ]}
                      >
                        +{item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
                    backgroundColor: '#F8FAFC',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    paddingHorizontal: 12,
                    fontSize: 15,
                    fontWeight: '800',
                    color: COLORS.textPrimary,
                  }}
                  keyboardType="numeric"
                  value={interestPercentStr}
                  onChangeText={setInterestPercentStr}
                />
                <Text style={{ flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 }}>
                  La tasa pactada queda congelada en este contrato y no modifica préstamos anteriores. Verifique siempre que la tasa cumpla los topes vigentes certificados por la Superintendencia Financiera según la modalidad legal.
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
                  <Text style={styles.calcLabel}>Cartulina / Papelería (aprox. $1.000):</Text>
                  <Text style={[styles.calcVal, { color: COLORS.danger }]}>
                    - {formatCOP(paperwork)}
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
});
