import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import {
  Customer,
  Loan,
  Installment,
  Payment,
  Renewal,
  PaymentPromise,
} from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { COLORS } from '../../theme/colors';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Briefcase,
  CheckCircle,
  RefreshCw,
  MessageCircle,
  Navigation,
  Receipt,
  Calendar,
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
  promises,
  todayStr,
  onBack,
  onPayLoan,
  onRenewLoan,
}) => {
  const customerLoans = loans.filter((l) => l.customerId === customer.id);
  const activeLoan = customerLoans.find((l) => l.status === 'ACTIVE');

  const activeInstallments = activeLoan
    ? installments
        .filter((i) => i.loanId === activeLoan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
    : [];

  const totalBorrowed = customerLoans.reduce((sum, l) => sum + l.principal, 0);
  const totalPaid = payments
    .filter((p) => p.customerId === customer.id && p.status === 'COMPLETED')
    .reduce((sum, p) => sum + p.amountReceived, 0);

  const currentRemainingBalance = activeInstallments.reduce(
    (sum, i) => sum + i.pendingAmount,
    0
  );

  const delinquency = calculateDelinquencyMetrics(activeInstallments, todayStr);

  const customerPayments = payments
    .filter((p) => p.customerId === customer.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const customerPromises = promises.filter((p) => p.customerId === customer.id);

  const handleCall = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {});
  };

  const handleWhatsApp = () => {
    const cleanPhone = customer.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
    const msg = activeLoan
      ? `Hola *${customer.fullName}*, estado de tu crédito *${activeLoan.loanNumber}*: Saldo pendiente *${formatCOP(
          currentRemainingBalance
        )}*.`
      : `Hola *${customer.fullName}*, te escribimos de Cartera Móvil.`;
    Linking.openURL(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`).catch(
      () => Alert.alert('WhatsApp', msg)
    );
  };

  const handleOpenMap = () => {
    const q = encodeURIComponent(
      `${customer.address}, ${customer.neighborhood}, ${customer.city}`
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(
      () => {}
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Clean Fintech UI */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Ficha 360° del Cliente</Text>
          <Text style={styles.headerSubtitle}>
            Cédula {customer.documentNumber} • {customer.neighborhood}
          </Text>
        </View>
        <View
          style={[
            styles.semanticStatusPill,
            delinquency.hasDelinquency ? styles.pillMora : styles.pillAlDia,
          ]}
        >
          <Text
            style={[
              styles.semanticStatusText,
              delinquency.hasDelinquency
                ? { color: COLORS.danger }
                : { color: COLORS.success },
            ]}
          >
            {delinquency.hasDelinquency
              ? `Mora ${delinquency.overdueDays}d`
              : '✓ Al día'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Tarjeta Principal del Titular + Píldoras de Contacto en 1 Toque */}
        <View style={styles.profileCard}>
          <Text style={styles.customerName}>{customer.fullName}</Text>

          <View style={styles.contactMetaRow}>
            <MapPin size={14} color={COLORS.textMuted} />
            <Text style={styles.contactText}>
              {customer.address} • {customer.neighborhood}, {customer.city}
            </Text>
          </View>

          {customer.businessName && (
            <View style={styles.contactMetaRow}>
              <Briefcase size={14} color={COLORS.textMuted} />
              <Text style={styles.contactText}>
                {customer.businessName} ({customer.occupation})
              </Text>
            </View>
          )}

          {/* Píldoras de Contacto Directo */}
          <View style={styles.quickContactRow}>
            <TouchableOpacity
              style={styles.contactPillBtn}
              onPress={() => handleCall(customer.phone)}
            >
              <Phone size={14} color={COLORS.primary} />
              <Text style={styles.contactPillText}>Llamar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.contactPillBtn,
                { backgroundColor: COLORS.successLight, borderColor: COLORS.successBorder },
              ]}
              onPress={handleWhatsApp}
            >
              <MessageCircle size={14} color={COLORS.success} />
              <Text style={[styles.contactPillText, { color: COLORS.success }]}>
                WhatsApp
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.contactPillBtn,
                { backgroundColor: COLORS.surfaceLavender, borderColor: COLORS.purpleBorder },
              ]}
              onPress={handleOpenMap}
            >
              <Navigation size={14} color={COLORS.purple} />
              <Text style={[styles.contactPillText, { color: COLORS.purple }]}>
                Mapa GPS
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. Cuadrícula Bento Financiera del Cliente */}
        <View style={styles.bentoRow}>
          <View style={styles.bentoBox}>
            <Text style={styles.bentoLabel}>SALDO PENDIENTE</Text>
            <Text style={styles.bentoAmountDark} numberOfLines={1} adjustsFontSizeToFit>
              {formatCOP(currentRemainingBalance)}
            </Text>
            <Text style={styles.bentoSub}>
              {activeLoan ? `Crédito ${activeLoan.loanNumber}` : 'Sin deuda activa'}
            </Text>
          </View>

          <View style={[styles.bentoBox, { backgroundColor: COLORS.surfaceLavender, borderColor: COLORS.purpleBorder }]}>
            <Text style={[styles.bentoLabel, { color: COLORS.purple }]}>
              TOTAL ABONADO HISTÓRICO
            </Text>
            <Text
              style={[styles.bentoAmountDark, { color: '#2E1065' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCOP(totalPaid)}
            </Text>
            <Text style={[styles.bentoSub, { color: COLORS.purple }]}>
              Capital prestado: {formatCOP(totalBorrowed)}
            </Text>
          </View>
        </View>

        {/* 3. Crédito Activo y Plan de Amortización */}
        {activeLoan && (
          <View style={styles.loanDetailCard}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.cardSectionTag}>CRÉDITO EN CURSO</Text>
                <Text style={styles.loanNumberBig}>
                  {activeLoan.loanNumber} • Cuota {formatCOP(activeLoan.installmentAmount)}
                </Text>
              </View>
              <View style={styles.actionBtnsInline}>
                <TouchableOpacity
                  style={styles.payNowBtn}
                  onPress={() => onPayLoan(customer, activeLoan)}
                >
                  <CheckCircle size={14} color="#ffffff" style={{ marginRight: 5 }} />
                  <Text style={styles.payNowBtnText}>Cobrar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.renewNowBtn}
                  onPress={() => onRenewLoan(customer, activeLoan)}
                >
                  <RefreshCw size={14} color={COLORS.purple} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.dashedDivider} />

            <Text style={styles.subHeaderLabel}>
              PLAN DE CUOTAS ({activeInstallments.filter((i) => i.pendingAmount === 0).length} /{' '}
              {activeInstallments.length} PAGADAS)
            </Text>

            <View style={styles.installmentsGrid}>
              {activeInstallments.slice(0, 12).map((inst) => {
                const isPaid = inst.pendingAmount === 0;
                const isOverdue = !isPaid && inst.dueDate < todayStr;
                return (
                  <View
                    key={inst.id}
                    style={[
                      styles.instChip,
                      isPaid && styles.instChipPaid,
                      isOverdue && styles.instChipOverdue,
                    ]}
                  >
                    <Text style={styles.instNum}>#{inst.installmentNumber}</Text>
                    <Text
                      style={[
                        styles.instAmt,
                        isPaid && { color: COLORS.success },
                        isOverdue && { color: COLORS.danger },
                      ]}
                    >
                      {isPaid ? '✓ Pagada' : formatCOP(inst.pendingAmount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 4. Historial de Comprobantes de Abono (Estilo Tirilla con borderStyle: 'dashed') */}
        <View style={styles.receiptHistoryCard}>
          <View style={styles.receiptHeaderRow}>
            <Receipt size={16} color={COLORS.textPrimary} />
            <Text style={styles.receiptSectionTitle}>
              HISTORIAL DE COMPROBANTES ({customerPayments.length})
            </Text>
          </View>

          {customerPayments.length === 0 ? (
            <Text style={styles.emptyHistoryText}>
              Aún no se han registrado abonos para este cliente en la sesión.
            </Text>
          ) : (
            customerPayments.map((pay) => (
              <View key={pay.id} style={styles.paymentTicketItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.paymentTicketAmount}>
                    {formatCOP(pay.amountReceived)}
                  </Text>
                  <View style={styles.methodPill}>
                    <Text style={styles.methodPillText}>{pay.paymentMethod}</Text>
                  </View>
                </View>
                <Text style={styles.paymentTicketMeta}>
                  Fecha: {pay.createdAt} • {pay.installmentsBreakdown.length} cuota(s) • Ref:{' '}
                  {pay.id}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* 5. Promesas de Pago */}
        {customerPromises.length > 0 && (
          <View style={styles.receiptHistoryCard}>
            <View style={styles.receiptHeaderRow}>
              <Calendar size={16} color={COLORS.warning} />
              <Text style={styles.receiptSectionTitle}>
                ACUERDOS Y PROMESAS ({customerPromises.length})
              </Text>
            </View>
            {customerPromises.map((pr) => (
              <View key={pr.id} style={styles.paymentTicketItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.paymentTicketAmount}>
                    {formatCOP(pr.promisedAmount)}
                  </Text>
                  <Text style={styles.promiseStatusTag}>{pr.status}</Text>
                </View>
                <Text style={styles.paymentTicketMeta}>
                  Para el {pr.promisedDate} {pr.notes ? `• "${pr.notes}"` : ''}
                </Text>
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
    borderBottomColor: COLORS.microBorder,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  semanticStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pillAlDia: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  pillMora: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  semanticStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  profileCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 12,
  },
  customerName: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  contactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  contactText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  quickContactRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  contactPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9999,
    backgroundColor: COLORS.infoLight,
    borderWidth: 1,
    borderColor: COLORS.infoBorder,
  },
  contactPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  bentoBox: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    overflow: 'hidden',
  },
  bentoLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  bentoAmountDark: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginVertical: 4,
  },
  bentoSub: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  loanDetailCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSectionTag: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  loanNumberBig: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  actionBtnsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dockBg,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9999,
  },
  payNowBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  renewNowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceLavender,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  subHeaderLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  installmentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  instChip: {
    width: '31%',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  instChipPaid: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  instChipOverdue: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  instNum: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  instAmt: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  receiptHistoryCard: {
    backgroundColor: COLORS.receiptPaper,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 12,
  },
  receiptHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  receiptSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  emptyHistoryText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  paymentTicketItem: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderStrong,
    borderStyle: 'dashed',
  },
  paymentTicketAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  methodPill: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  methodPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
  },
  paymentTicketMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  promiseStatusTag: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.warning,
  },
});
