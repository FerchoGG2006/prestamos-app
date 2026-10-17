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
import { Customer, Loan, LoanFrequency } from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import {
  calculateLoanSummary,
  calculatePaperworkFee,
} from '../../core/domain/calculator';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { FilePlus2, X } from 'lucide-react-native';

interface NewLoanModalProps {
  visible: boolean;
  customers: Customer[];
  loans: Loan[];
  todayStr: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewLoanModal: React.FC<NewLoanModalProps> = ({
  visible,
  customers,
  loans,
  todayStr,
  onClose,
  onSuccess,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [principalStr, setPrincipalStr] = useState('200000');
  const [frequency, setFrequency] = useState<LoanFrequency>('DAILY');
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const principal = parseInt(principalStr.replace(/\D/g, ''), 10) || 0;
  const installmentCount = parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 30;

  const summary =
    principal > 0 && installmentCount > 0
      ? calculateLoanSummary(principal, 0.2, installmentCount)
      : null;
  const paperwork = principal > 0 ? calculatePaperworkFee(principal) : 0;
  const netCashToDeliver = Math.max(0, principal - paperwork);

  const quickPrincipals = [100000, 150000, 200000, 300000, 500000];

  const frequencies: Array<{ key: LoanFrequency; label: string; defaultCount: number }> = [
    { key: 'DAILY', label: 'Diario', defaultCount: 24 },
    { key: 'WEEKLY', label: 'Semanal', defaultCount: 4 },
    { key: 'BIWEEKLY', label: 'Quincenal', defaultCount: 2 },
    { key: 'MONTHLY', label: 'Mensual', defaultCount: 1 },
  ];

  const handleSelectFrequency = (freq: LoanFrequency, defaultCount: number) => {
    setFrequency(freq);
    setInstallmentCountStr(String(defaultCount));
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

    setIsSubmitting(true);
    try {
      const res = await localStore.createLoan({
        customerId: selectedCustomerId,
        principal,
        interestRate: 0.2,
        installmentCount,
        frequency,
        todayStr,
      });

      Alert.alert(
        '¡Crédito Desembolsado!',
        `Crédito ${res.loan.loanNumber} creado exitosamente.\n\n` +
        `• Modalidad: ${frequency}\n` +
        `• Cuota: ${formatCOP(res.loan.installmentAmount)}\n` +
        `• Cartulina / Papelería: ${formatCOP(paperwork)}\n` +
        `• Efectivo neto a entregar: ${formatCOP(netCashToDeliver)}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('No se pudo crear', err.message || 'Error al crear préstamo');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Originación de Crédito</Text>
              <Text style={styles.subtitle}>
                Interés 20% sobre capital inicial • Papelería $5.000 / $100k
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
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
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
              {frequencies.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[
                    styles.cntPill,
                    { flex: 1, paddingVertical: 8 },
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
            </View>

            <Text style={styles.label}>4. Plazo de Amortización ({installmentCount} cuotas {frequency.toLowerCase()}s)</Text>
            <View style={styles.installmentsRow}>
              {[12, 20, 24, 30, 40].map((cnt) => (
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
                    {cnt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Calculadora Financiera en Vivo con línea punteada tipo ticket */}
            {summary && (
              <View style={styles.calcCard}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Capital pactado:</Text>
                  <Text style={styles.calcVal}>{formatCOP(summary.principal)}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Interés (20%):</Text>
                  <Text style={styles.calcVal}>+ {formatCOP(summary.interestAmount)}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Total a recaudar:</Text>
                  <Text style={[styles.calcVal, { color: COLORS.primary }]}>
                    {formatCOP(summary.totalAgreed)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>
                    Valor Cuota ({installmentCount} cuotas {frequency.toLowerCase()}s):
                  </Text>
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
              {isSubmitting ? 'Desembolsando...' : 'Confirmar y Desembolsar'}
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
  label: {
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
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  customerChipSub: {
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
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  calcVal: {
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
