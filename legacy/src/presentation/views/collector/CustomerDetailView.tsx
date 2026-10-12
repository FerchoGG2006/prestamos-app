import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { Customer, Loan, Installment, Payment, Renewal, PaymentPromise } from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { COLORS } from '../../theme/colors';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  CreditCard,
} from 'lucide-react-native';

interface CustomerDetailViewProps {
  customer: Customer;
  loans: Loan[];
  installments: Installment[];
  payments: Payment[];
  renewals: Renewal[];
  promises: PaymentPromise[];
  todayStr: string;
  onBack: () => void;
  onPayLoan: (customer: Customer, loan: Loan) => void;
  onRenewLoan: (customer: Customer, loan: Loan) => void;
}

export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({
  customer,
  loans,
  installments,
  payments,
  renewals,
  promises,
  todayStr,
  onBack,
  onPayLoan,
  onRenewLoan,
}) => {
  // Créditos del cliente
  const customerLoans = loans.filter((l) => l.customerId === customer.id);
  const activeLoan = customerLoans.find((l) => l.status === 'ACTIVE');
  const pastLoans = customerLoans.filter((l) => l.status !== 'ACTIVE');

  // Cuotas del crédito activo
  const activeInstallments = activeLoan
    ? installments.filter((i) => i.loanId === activeLoan.id)
    : [];

  // Métricas financieras globales del cliente
  const totalBorrowed = customerLoans.reduce((sum, l) => sum + l.principal, 0);
  const totalAgreed = customerLoans.reduce((sum, l) => sum + l.totalAgreed, 0);
  const totalPaid = payments
    .filter((p) => p.customerId === customer.id && p.status === 'COMPLETED')
    .reduce((sum, p) => sum + p.amountReceived, 0);
  
  const currentRemainingBalance = activeInstallments.reduce((sum, i) => sum + i.pendingAmount, 0);

  // Mora fáctica
  const delinquency = calculateDelinquencyMetrics(activeInstallments, todayStr);

  // Pagos del cliente
  const customerPayments = payments
    .filter((p) => p.customerId === customer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Promesas
  const customerPromises = promises.filter((p) => p.customerId === customer.id);

  const handleCall = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {});
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Ficha 360° del Cliente</Text>
          <Text style={styles.headerSubtitle}>{customer.fullName}</Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Datos Personales y de Contacto */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.customerName}>{customer.fullName}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{customer.status}</Text>
            </View>
          </View>
          <Text style={styles.metaText}>Cédula: {customer.documentNumber}</Text>

          <View style={styles.divider} />

          <View style={styles.contactRow}>
            <MapPin size={16} color={COLORS.textSecondary} />
            <Text style={styles.contactText}>
              {customer.address} • Barrio {customer.neighborhood}, {customer.city}
            </Text>
          </View>

          {customer.businessName && (
            <View style={styles.contactRow}>
              <Briefcase size={16} color={COLORS.textSecondary} />
              <Text style={styles.contactText}>
                {customer.businessName} ({customer.occupation})
              </Text>
            </View>
          )}

          <View style={styles.contactRow}>
            <Phone size={16} color={COLORS.primary} />
            <TouchableOpacity onPress={() => handleCall(customer.phone)}>
              <Text style={[styles.contactText, { color: COLORS.primary, fontWeight: 'bold' }]}>
                {customer.phone} (Llamar)
              </Text>
            </TouchableOpacity>
            {customer.altPhone && (
              <TouchableOpacity onPress={() => handleCall(customer.altPhone!)} style={{ marginLeft: 12 }}>
                <Text style={[styles.contactText, { color: COLORS.primary }]}>
                  {customer.altPhone}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Referencias */}
          {customer.references.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.subTitle}>Referencias:</Text>
              {customer.references.map((ref) => (
                <Text key={ref.id} style={styles.refText}>
                  • {ref.fullName} ({ref.relationship}) - Tel: {ref.phone}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Métricas Globales de Cartera del Cliente */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Prestado</Text>
            <Text style={styles.metricVal}>{formatCOP(totalBorrowed)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Total Pagado</Text>
            <Text style={[styles.metricVal, { color: COLORS.success }]}>{formatCOP(totalPaid)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Saldo Actual</Text>
            <Text style={[styles.metricVal, { color: COLORS.warning }]}>
              {formatCOP(currentRemainingBalance)}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Días Mora</Text>
            <Text style={[styles.metricVal, { color: delinquency.hasDelinquency ? COLORS.danger : COLORS.success }]}>
              {delinquency.overdueDays} días
            </Text>
          </View>
        </View>

        {/* Crédito Activo */}
        {activeLoan ? (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.subTitle}>Crédito Activo ({activeLoan.loanNumber})</Text>
                <Text style={styles.metaText}>
                  Inició: {activeLoan.startDate} • {activeLoan.installmentCount} cuotas de {formatCOP(activeLoan.installmentAmount)}
                </Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>ACTIVO</Text>
              </View>
            </View>

            <View style={styles.loanProgressRow}>
              <Text style={styles.loanProgressText}>
                Saldo: {formatCOP(currentRemainingBalance)} de {formatCOP(activeLoan.totalAgreed)}
              </Text>
            </View>

            {/* Acciones para el crédito */}
            <View style={styles.loanActionsRow}>
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => onPayLoan(customer, activeLoan)}
              >
                <CreditCard size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.payBtnText}>Registrar Cobro</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.renewBtn}
                onPress={() => onRenewLoan(customer, activeLoan)}
              >
                <RefreshCw size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.renewBtnText}>Renovar</Text>
              </TouchableOpacity>
            </View>

            {/* Lista de Cuotas Recientes */}
            <Text style={[styles.subTitle, { marginTop: 14 }]}>Plan de Cuotas:</Text>
            <View style={styles.installmentsList}>
              {activeInstallments.map((inst) => {
                let badgeColor = COLORS.textSecondary;
                if (inst.status === 'PAGADA') badgeColor = COLORS.success;
                if (inst.status === 'ADELANTADA') badgeColor = COLORS.info;
                if (inst.status === 'PARCIAL') badgeColor = COLORS.warning;
                if (inst.status === 'VENCIDA') badgeColor = COLORS.danger;

                return (
                  <View key={inst.id} style={styles.installmentItem}>
                    <Text style={styles.instNumber}>#{inst.installmentNumber}</Text>
                    <Text style={styles.instDate}>{inst.dueDate}</Text>
                    <Text style={styles.instAmount}>{formatCOP(inst.expectedAmount)}</Text>
                    <View style={[styles.instBadge, { backgroundColor: `${badgeColor}25` }]}>
                      <Text style={[styles.instBadgeText, { color: badgeColor }]}>
                        {inst.status}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.metaText}>Este cliente no tiene créditos activos actualmente.</Text>
          </View>
        )}

        {/* Historial de Pagos */}
        <View style={styles.card}>
          <Text style={styles.subTitle}>Historial de Pagos Recientes</Text>
          {customerPayments.length === 0 ? (
            <Text style={styles.metaText}>No hay pagos registrados aún.</Text>
          ) : (
            customerPayments.map((p) => (
              <View key={p.id} style={styles.paymentItem}>
                <View>
                  <Text style={styles.paymentAmount}>{formatCOP(p.amountReceived)}</Text>
                  <Text style={styles.paymentDate}>{p.createdAt} • {p.paymentMethod === 'CASH' ? 'Efectivo' : 'Transferencia'}</Text>
                </View>
                <CheckCircle size={18} color={COLORS.success} />
              </View>
            ))
          )}
        </View>

        {/* Promesas de Pago */}
        {customerPromises.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.subTitle}>Promesas de Pago</Text>
            {customerPromises.map((pr) => (
              <View key={pr.id} style={styles.promiseItem}>
                <View>
                  <Text style={styles.promiseAmount}>{formatCOP(pr.promisedAmount)}</Text>
                  <Text style={styles.metaText}>Para el: {pr.promisedDate}</Text>
                  {pr.notes && <Text style={styles.notesText}>{pr.notes}</Text>}
                </View>
                <View style={styles.warningBadge}>
                  <Text style={styles.warningBadgeText}>{pr.status}</Text>
                </View>
              </View>
            ))}
          </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: 'bold',
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.bgTertiary,
    marginVertical: 12,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  contactText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    marginLeft: 8,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  refText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.bgSecondary,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metricVal: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  activeBadge: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: 'bold',
  },
  loanProgressRow: {
    backgroundColor: COLORS.bgPrimary,
    padding: 10,
    borderRadius: 8,
    marginVertical: 10,
  },
  loanProgressText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  loanActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.success,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  renewBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.purple,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renewBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  installmentsList: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 10,
    padding: 8,
  },
  installmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  instNumber: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    width: 35,
  },
  instDate: {
    color: COLORS.textSecondary,
    fontSize: 12,
    flex: 1,
  },
  instAmount: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 10,
  },
  instBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  instBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  paymentAmount: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  paymentDate: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  promiseItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  promiseAmount: {
    color: COLORS.warning,
    fontSize: 14,
    fontWeight: 'bold',
  },
  notesText: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  warningBadge: {
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  warningBadgeText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
