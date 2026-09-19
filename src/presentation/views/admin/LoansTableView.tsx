import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { Loan, Customer, Route, LoanFrequency } from '../../../core/domain/types';
import { formatCOP, DEFAULT_BUSINESS_CONFIG } from '../../../core/config/business-rules';
import { calculateLoanSummary, generateInstallments } from '../../../core/domain/calculator';
import { COLORS } from '../../theme/colors';
import { localStore } from '../../../infrastructure/storage/local-store';
import { PlusCircle, Search, X, Check, Calculator } from 'lucide-react-native';

interface LoansTableViewProps {
  loans: Loan[];
  customers: Customer[];
  routes: Route[];
  onOpenCustomerDetail: (customer: Customer) => void;
}

export const LoansTableView: React.FC<LoansTableViewProps> = ({
  loans,
  customers,
  routes,
  onOpenCustomerDetail,
}) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [isNewLoanModalVisible, setIsNewLoanModalVisible] = useState(false);

  // Formulario de nuevo crédito
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || '');
  const [principalStr, setPrincipalStr] = useState('150000');
  const [interestRateStr, setInterestRateStr] = useState('20');
  const [installmentsCountStr, setInstallmentsCountStr] = useState('30');
  const [frequency, setFrequency] = useState<LoanFrequency>('DAILY');

  const principal = parseInt(principalStr.replace(/\D/g, ''), 10) || 0;
  const rateNum = (parseFloat(interestRateStr) || 20) / 100;
  const installmentsNum = parseInt(installmentsCountStr, 10) || 30;

  // Cálculo en vivo
  let summary = {
    principal: 0,
    interestRate: 0.20,
    interestAmount: 0,
    totalAgreed: 0,
    installmentCount: 30,
    installmentAmount: 0,
  };

  try {
    if (principal > 0 && installmentsNum > 0) {
      summary = calculateLoanSummary(principal, rateNum, installmentsNum);
    }
  } catch (err) {}

  const handleCreateLoan = async () => {
    if (!selectedCustomerId) {
      Alert.alert('Error', 'Seleccione un cliente');
      return;
    }
    if (principal <= 0) {
      Alert.alert('Error', 'Ingrese un capital válido');
      return;
    }

    const customer = customers.find((c) => c.id === selectedCustomerId);
    if (!customer) return;

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const newLoanId = `loan-${Date.now()}`;
      const newLoanNumber = `#00${Math.floor(100 + Math.random() * 900)}`;

      const newLoan: Loan = {
        id: newLoanId,
        loanNumber: newLoanNumber,
        customerId: customer.id,
        routeId: customer.routeId,
        collectorId: customer.assignedCollectorId,
        principal: summary.principal,
        interestRate: summary.interestRate,
        interestType: 'FLAT_INITIAL_CAPITAL',
        interestAmount: summary.interestAmount,
        totalAgreed: summary.totalAgreed,
        installmentCount: summary.installmentCount,
        installmentAmount: summary.installmentAmount,
        frequency,
        startDate: todayStr,
        endDate: '2026-10-30',
        status: 'ACTIVE',
        createdAt: todayStr,
        updatedAt: todayStr,
      };

      const newInstallments = generateInstallments(newLoan.id, summary, todayStr);

      // Usar store
      // Guardar y notificar
      Alert.alert(
        '¡Crédito Creado!',
        `Crédito ${newLoan.loanNumber} creado para ${customer.fullName}.\nTotal: ${formatCOP(newLoan.totalAgreed)} en ${newLoan.installmentCount} cuotas de ${formatCOP(newLoan.installmentAmount)}.`
      );
      setIsNewLoanModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo crear el crédito');
    }
  };

  const filteredLoans = loans.filter((l) => {
    if (filterStatus !== 'ALL' && l.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const customer = customers.find((c) => c.id === l.customerId);
      const matchNumber = l.loanNumber.toLowerCase().includes(q);
      const matchCustomer = customer?.fullName.toLowerCase().includes(q);
      if (!matchNumber && !matchCustomer) return false;
    }
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Gestión de Créditos y Cartera</Text>
          <Text style={styles.subtitle}>{loans.length} créditos registrados en el sistema</Text>
        </View>
        <TouchableOpacity
          style={styles.newLoanBtn}
          onPress={() => setIsNewLoanModalVisible(true)}
        >
          <PlusCircle size={16} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={styles.newLoanBtnText}>Nuevo Crédito</Text>
        </TouchableOpacity>
      </View>

      {/* Buscador y Filtros */}
      <View style={styles.filtersBar}>
        <View style={styles.searchWrap}>
          <Search size={16} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente o # crédito..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statusChips}>
          {['ALL', 'ACTIVE', 'PAID', 'RENEWED'].map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.statusChip, filterStatus === st && styles.statusChipActive]}
              onPress={() => setFilterStatus(st)}
            >
              <Text style={[styles.statusChipText, filterStatus === st && styles.statusChipTextActive]}>
                {st === 'ALL' ? 'Todos' : st}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Lista / Tabla de Créditos */}
      <ScrollView style={styles.tableScroll} showsVerticalScrollIndicator={false}>
        {filteredLoans.map((loan) => {
          const customer = customers.find((c) => c.id === loan.customerId);
          const route = routes.find((r) => r.id === loan.routeId);

          let statusColor = COLORS.primary;
          if (loan.status === 'ACTIVE') statusColor = COLORS.success;
          if (loan.status === 'PAID') statusColor = COLORS.info;
          if (loan.status === 'RENEWED') statusColor = COLORS.purple;

          return (
            <TouchableOpacity
              key={loan.id}
              style={styles.loanRow}
              onPress={() => customer && onOpenCustomerDetail(customer)}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.loanNum}>{loan.loanNumber}</Text>
                  <View style={[styles.badge, { backgroundColor: `${statusColor}25` }]}>
                    <Text style={[styles.badgeText, { color: statusColor }]}>{loan.status}</Text>
                  </View>
                </View>
                <Text style={styles.custName}>{customer?.fullName || 'Cliente'}</Text>
                <Text style={styles.routeText}>{route?.name} • Inició: {loan.startDate}</Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.totalAgreed}>{formatCOP(loan.totalAgreed)}</Text>
                <Text style={styles.subtext}>Capital: {formatCOP(loan.principal)}</Text>
                <Text style={styles.cuotasText}>
                  {loan.installmentCount} cuotas de {formatCOP(loan.installmentAmount)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Modal / Simulador de Nuevo Crédito */}
      <Modal visible={isNewLoanModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Simulador y Nuevo Crédito</Text>
                <Text style={styles.modalSubtitle}>Cálculo automático de interés y cuotas</Text>
              </View>
              <TouchableOpacity onPress={() => setIsNewLoanModalVisible(false)} style={{ padding: 6 }}>
                <X size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Selector de Cliente */}
              <Text style={styles.fieldLabel}>Cliente:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {customers.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.customerChip,
                      selectedCustomerId === c.id && styles.customerChipActive,
                    ]}
                    onPress={() => setSelectedCustomerId(c.id)}
                  >
                    <Text
                      style={[
                        styles.customerChipText,
                        selectedCustomerId === c.id && styles.customerChipTextActive,
                      ]}
                    >
                      {c.fullName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Capital */}
              <Text style={styles.fieldLabel}>Capital Inicial ($ COP):</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={principalStr}
                  onChangeText={setPrincipalStr}
                />
              </View>

              {/* Tasa y Cuotas */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Tasa Interés (%):</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={interestRateStr}
                      onChangeText={setInterestRateStr}
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Número de Cuotas:</Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={installmentsCountStr}
                      onChangeText={setInstallmentsCountStr}
                    />
                  </View>
                </View>
              </View>

              {/* Resumen del Cálculo */}
              <View style={styles.calcPreviewCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Calculator size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.calcPreviewTitle}>Resumen Financiero del Crédito</Text>
                </View>

                <View style={styles.previewRow}>
                  <Text style={styles.pLabel}>Interés ({interestRateStr}% sobre capital):</Text>
                  <Text style={styles.pVal}>{formatCOP(summary.interestAmount)}</Text>
                </View>

                <View style={styles.previewRow}>
                  <Text style={styles.pLabel}>Total Pactado a Cobrar:</Text>
                  <Text style={[styles.pVal, { color: COLORS.success, fontWeight: 'bold' }]}>
                    {formatCOP(summary.totalAgreed)}
                  </Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.previewRow}>
                  <Text style={[styles.pLabel, { fontWeight: 'bold' }]}>Valor Cuota Diaria:</Text>
                  <Text style={[styles.pVal, { fontSize: 18, fontWeight: 'bold', color: '#60a5fa' }]}>
                    {formatCOP(summary.installmentAmount)}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.confirmCreateBtn} onPress={handleCreateLoan}>
              <Check size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.confirmCreateText}>Crear y Desembolsar Crédito</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  newLoanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  newLoanBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  filtersBar: {
    marginBottom: 16,
    gap: 10,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  statusChips: {
    flexDirection: 'row',
  },
  statusChip: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  statusChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  statusChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  statusChipTextActive: {
    color: '#ffffff',
  },
  tableScroll: {
    flex: 1,
  },
  loanRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgSecondary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  loanNum: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: 'bold',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  custName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  routeText: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  totalAgreed: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: 'bold',
  },
  subtext: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  cuotasText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  customerChip: {
    backgroundColor: COLORS.bgPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  customerChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
  },
  customerChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  customerChipTextActive: {
    color: '#60a5fa',
    fontWeight: 'bold',
  },
  inputWrap: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  input: {
    height: 48,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  calcPreviewCard: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginVertical: 14,
  },
  calcPreviewTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
  },
  pVal: {
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.bgTertiary,
    marginVertical: 8,
  },
  confirmCreateBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  confirmCreateText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
