import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Customer, Loan, Installment, PaymentPromise } from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { COLORS } from '../../theme/colors';
import {
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronRight,
  Phone,
  RefreshCw,
  Calendar,
} from 'lucide-react-native';

type FilterType = 'TODOS' | 'PENDIENTES' | 'PAGADOS' | 'MORA' | 'PROMESAS';

interface TodayCollectionsViewProps {
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  promises: PaymentPromise[];
  todayStr: string;
  onSelectCustomerToPay: (customer: Customer, loan: Loan) => void;
  onSelectCustomerToRenew: (customer: Customer, loan: Loan) => void;
  onSelectCustomerPromise: (customer: Customer, loan: Loan) => void;
  onViewCustomerDetail: (customer: Customer) => void;
}

export const TodayCollectionsView: React.FC<TodayCollectionsViewProps> = ({
  customers,
  loans,
  installments,
  promises,
  todayStr,
  onSelectCustomerToPay,
  onSelectCustomerToRenew,
  onSelectCustomerPromise,
  onViewCustomerDetail,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');

  // Construir datos enriquecidos para cada cliente
  const customerCardsData = customers.map((customer) => {
    const activeLoan = loans.find((l) => l.customerId === customer.id && l.status === 'ACTIVE');
    const customerInstallments = activeLoan
      ? installments.filter((i) => i.loanId === activeLoan.id)
      : [];

    // Cuota de hoy
    const todayInstallment = customerInstallments.find((i) => i.dueDate === todayStr);

    // Métricas de mora
    const delinquency = calculateDelinquencyMetrics(customerInstallments, todayStr);

    // Promesa de pago de hoy
    const todayPromise = promises.find(
      (p) => p.customerId === customer.id && p.status === 'PENDIENTE'
    );

    // Estado para filtros
    const isPaidToday = todayInstallment?.status === 'PAGADA' || todayInstallment?.status === 'ADELANTADA';
    const isOverdue = delinquency.hasDelinquency;
    const hasPromise = !!todayPromise;
    const isPending = !!todayInstallment && (todayInstallment.status === 'PENDIENTE' || todayInstallment.status === 'PARCIAL');

    // Total a cobrar hoy sugerido
    const expectedToday = todayInstallment
      ? todayInstallment.pendingAmount + delinquency.overdueAmount
      : delinquency.overdueAmount;

    return {
      customer,
      activeLoan,
      customerInstallments,
      todayInstallment,
      delinquency,
      todayPromise,
      isPaidToday,
      isOverdue,
      hasPromise,
      isPending,
      expectedToday: expectedToday > 0 ? expectedToday : (activeLoan?.installmentAmount || 0),
    };
  });

  // Filtrado
  const filteredCards = customerCardsData.filter((item) => {
    if (!item.activeLoan) return false;

    // Búsqueda por texto
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.customer.fullName.toLowerCase().includes(q);
      const matchDoc = item.customer.documentNumber.includes(q);
      const matchBiz = item.customer.businessName?.toLowerCase().includes(q);
      if (!matchName && !matchDoc && !matchBiz) return false;
    }

    // Filtro por tab
    if (activeFilter === 'PENDIENTES') return item.isPending;
    if (activeFilter === 'PAGADOS') return item.isPaidToday;
    if (activeFilter === 'MORA') return item.isOverdue;
    if (activeFilter === 'PROMESAS') return item.hasPromise;

    return true; // TODOS
  });

  return (
    <View style={styles.container}>
      {/* Barra de Búsqueda */}
      <View style={styles.searchBar}>
        <Search size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente, cédula o negocio..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Tabs de Filtro */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterTabs}>
        {(['TODOS', 'PENDIENTES', 'PAGADOS', 'MORA', 'PROMESAS'] as FilterType[]).map((tab) => {
          const isActive = activeFilter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              onPress={() => setActiveFilter(tab)}
            >
              <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                {tab === 'TODOS' && 'Todos'}
                {tab === 'PENDIENTES' && 'Pendientes'}
                {tab === 'PAGADOS' && 'Pagados'}
                {tab === 'MORA' && 'En Mora'}
                {tab === 'PROMESAS' && 'Promesas'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Lista Operativa de Clientes */}
      <ScrollView style={styles.cardsList} showsVerticalScrollIndicator={false}>
        {filteredCards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay cobros con este filtro</Text>
          </View>
        ) : (
          filteredCards.map((item) => {
            const { customer, activeLoan, delinquency, todayInstallment, todayPromise } = item;
            if (!activeLoan) return null;

            return (
              <View key={customer.id} style={styles.customerCard}>
                {/* Cabecera del Cliente */}
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => onViewCustomerDetail(customer)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.customerName}>{customer.fullName}</Text>
                    <Text style={styles.customerDetails}>
                      {customer.businessName ? `${customer.businessName} • ` : ''}
                      {customer.neighborhood}
                    </Text>
                  </View>
                  <ChevronRight size={20} color={COLORS.textMuted} />
                </TouchableOpacity>

                {/* Monto de Cuota y Estado de Cobro */}
                <View style={styles.cardFinancials}>
                  <View>
                    <Text style={styles.amountLabel}>Cobro esperado hoy:</Text>
                    <Text style={styles.amountValue}>{formatCOP(item.expectedToday)}</Text>
                  </View>

                  {/* Badges de Estado */}
                  <View style={styles.badgeContainer}>
                    {delinquency.hasDelinquency ? (
                      <View style={styles.dangerBadge}>
                        <AlertCircle size={14} color={COLORS.danger} style={{ marginRight: 4 }} />
                        <Text style={styles.dangerBadgeText}>
                          {delinquency.overdueDays} días mora ({formatCOP(delinquency.overdueAmount)})
                        </Text>
                      </View>
                    ) : item.isPaidToday ? (
                      <View style={styles.successBadge}>
                        <CheckCircle size={14} color={COLORS.success} style={{ marginRight: 4 }} />
                        <Text style={styles.successBadgeText}>Pagado hoy</Text>
                      </View>
                    ) : todayInstallment?.status === 'PARCIAL' ? (
                      <View style={styles.warningBadge}>
                        <Clock size={14} color={COLORS.warning} style={{ marginRight: 4 }} />
                        <Text style={styles.warningBadgeText}>
                          Abono parcial ({formatCOP(todayInstallment.paidAmount)})
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.neutralBadge}>
                        <Text style={styles.neutralBadgeText}>🟢 Al día</Text>
                      </View>
                    )}

                    {todayPromise && (
                      <View style={styles.promiseBadge}>
                        <Calendar size={12} color={COLORS.warning} style={{ marginRight: 4 }} />
                        <Text style={styles.promiseBadgeText}>
                          Promesa: {formatCOP(todayPromise.promisedAmount)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Acciones Rápidas del Cobrador */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.payBtn}
                    onPress={() => onSelectCustomerToPay(customer, activeLoan)}
                  >
                    <Text style={styles.payBtnText}>[ COBRAR ]</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => onSelectCustomerPromise(customer, activeLoan)}
                  >
                    <Text style={styles.secondaryActionText}>Promesa</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => onSelectCustomerToRenew(customer, activeLoan)}
                  >
                    <RefreshCw size={14} color={COLORS.purple} style={{ marginRight: 4 }} />
                    <Text style={[styles.secondaryActionText, { color: COLORS.purple }]}>Renovar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  filterTabs: {
    paddingHorizontal: 16,
    marginBottom: 12,
    maxHeight: 44,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.bgSecondary,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  tabBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  tabBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#ffffff',
  },
  cardsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  customerCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  customerDetails: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardFinancials: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: COLORS.bgPrimary,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  amountValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  badgeContainer: {
    alignItems: 'flex-end',
    gap: 4,
  },
  dangerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dangerBadgeText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: 'bold',
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  successBadgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  warningBadgeText: {
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: 'bold',
  },
  neutralBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  neutralBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  promiseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  promiseBadgeText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '600',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  payBtn: {
    flex: 2,
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.bgTertiary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
