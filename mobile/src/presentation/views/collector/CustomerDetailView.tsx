import React, { useState } from 'react';
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
  FileText,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
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
  onPromiseLoan?: (customer: Customer, loan: Loan) => void;
  onNonPayment?: (customer: Customer, loan: Loan) => void;
  onOpenCreditHistory?: (customer: Customer) => void;
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
  onPromiseLoan,
  onNonPayment,
  onOpenCreditHistory,
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

  const [showAllInstallments, setShowAllInstallments] = useState(false);

  const getInstallmentPaymentDetails = (inst: Installment) => {
    const isPaid = inst.pendingAmount <= 0;
    const isPartial = inst.paidAmount > 0 && inst.pendingAmount > 0;

    // Buscar pago en customerPayments que contenga esta cuota
    const matchingPayment = customerPayments.find(
      (p) =>
        p.status === 'COMPLETED' &&
        p.installmentsBreakdown?.some((b) => b.installmentId === inst.id)
    );

    const paymentDate = inst.lastPaymentDate || (matchingPayment ? matchingPayment.createdAt.split('T')[0] : null);

    let delayDays = 0;
    if (paymentDate && inst.dueDate) {
      const due = new Date(inst.dueDate + 'T00:00:00');
      const paid = new Date(paymentDate + 'T00:00:00');
      delayDays = Math.round((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    }

    let overduePendingDays = 0;
    if (!isPaid && inst.dueDate < todayStr) {
      const due = new Date(inst.dueDate + 'T00:00:00');
      const today = new Date(todayStr + 'T00:00:00');
      overduePendingDays = Math.max(0, Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
    }

    return {
      isPaid,
      isPartial,
      paymentDate,
      delayDays,
      isDelayed: isPaid && delayDays > 0,
      isOnTime: isPaid && delayDays === 0,
      isEarly: isPaid && delayDays < 0,
      overduePendingDays,
    };
  };

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
                { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.border },
              ]}
              onPress={handleOpenMap}
            >
              <Navigation size={14} color={COLORS.textSecondary} />
              <Text style={[styles.contactPillText, { color: COLORS.textPrimary }]}>
                Mapa GPS
              </Text>
            </TouchableOpacity>

            {onOpenCreditHistory && (
              <TouchableOpacity
                style={[
                  styles.contactPillBtn,
                  { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryBorder },
                ]}
                onPress={() => onOpenCreditHistory(customer)}
              >
                <FileText size={14} color={COLORS.primary} />
                <Text style={[styles.contactPillText, { color: COLORS.primary, fontWeight: '800' }]}>
                  Historial
                </Text>
              </TouchableOpacity>
            )}
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

          <View style={[styles.bentoBox, { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.border }]}>
            <Text style={[styles.bentoLabel, { color: COLORS.textSecondary }]}>
              TOTAL ABONADO HISTÓRICO
            </Text>
            <Text
              style={[styles.bentoAmountDark, { color: COLORS.textPrimary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCOP(totalPaid)}
            </Text>
            <Text style={[styles.bentoSub, { color: COLORS.textSecondary }]}>
              Capital prestado: {formatCOP(totalBorrowed)}
            </Text>
          </View>
        </View>

        {/* 3. Crédito Activo y Plan de Amortización */}
        {activeLoan && (
          <View style={styles.loanDetailCard}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Text style={styles.cardSectionTag}>CRÉDITO ACTIVO #{activeLoan.loanNumber}</Text>
                  <View style={styles.frequencyTag}>
                    <Text style={styles.frequencyTagText}>
                      {activeLoan.frequency === 'WEEKLY'
                        ? 'Semanal'
                        : activeLoan.frequency === 'BIWEEKLY'
                        ? 'Quincenal'
                        : activeLoan.frequency === 'MONTHLY'
                        ? 'Mensual'
                        : activeLoan.frequency === 'FIXED_DATE'
                        ? `Fecha Fija (${activeLoan.fixedDueDate || activeLoan.endDate})`
                        : 'Diario'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.loanNumberBig}>
                  Cuota {formatCOP(activeLoan.installmentAmount)}
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

                {onPromiseLoan && (
                  <TouchableOpacity
                    style={styles.actionIconBtn}
                    onPress={() => onPromiseLoan(customer, activeLoan)}
                  >
                    <Clock size={14} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}

                {onNonPayment && (
                  <TouchableOpacity
                    style={[styles.actionIconBtn, { borderColor: '#FDE68A', backgroundColor: '#FEF3C7' }]}
                    onPress={() => onNonPayment(customer, activeLoan)}
                  >
                    <AlertCircle size={14} color="#D97706" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.renewNowBtn}
                  onPress={() => onRenewLoan(customer, activeLoan)}
                >
                  <RefreshCw size={14} color={COLORS.purple} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Micro-bloque de estado de cobro */}
            <View style={styles.financialMiniBox}>
              <View style={styles.financialMiniCol}>
                <Text style={styles.financialMiniLabel}>MODALIDAD</Text>
                <Text style={styles.financialMiniVal}>
                  {activeLoan.frequency === 'WEEKLY'
                    ? 'Semanal'
                    : activeLoan.frequency === 'BIWEEKLY'
                    ? 'Quincenal'
                    : activeLoan.frequency === 'MONTHLY'
                    ? 'Mensual'
                    : 'Diario'}
                </Text>
              </View>
              <View style={styles.financialMiniDivider} />
              <View style={styles.financialMiniCol}>
                <Text style={styles.financialMiniLabel}>SALDO RESTANTE</Text>
                <Text style={styles.financialMiniVal}>
                  {formatCOP(currentRemainingBalance)}
                </Text>
              </View>
              <View style={styles.financialMiniDivider} />
              <View style={styles.financialMiniCol}>
                <Text style={styles.financialMiniLabel}>MORA ACUMULADA</Text>
                <Text
                  style={[
                    styles.financialMiniVal,
                    delinquency.hasDelinquency && { color: COLORS.danger },
                  ]}
                >
                  {delinquency.hasDelinquency
                    ? `${formatCOP(delinquency.overdueAmount)} (${delinquency.overdueDays}d)`
                    : 'Al día'}
                </Text>
              </View>
            </View>

            <View style={styles.dashedDivider} />

            <View style={styles.planHeaderRow}>
              <Text style={styles.subHeaderLabel}>
                PLAN DE CUOTAS ({activeInstallments.filter((i) => i.pendingAmount === 0).length} /{' '}
                {activeInstallments.length} PAGADAS)
              </Text>
              {activeInstallments.length > 6 && (
                <TouchableOpacity
                  onPress={() => setShowAllInstallments(!showAllInstallments)}
                  style={styles.expandToggleBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.expandToggleText}>
                    {showAllInstallments ? 'Ver menos' : `Ver todas (${activeInstallments.length})`}
                  </Text>
                  {showAllInstallments ? (
                    <ChevronUp size={13} color={COLORS.primary} />
                  ) : (
                    <ChevronDown size={13} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.installmentsList}>
              {(showAllInstallments ? activeInstallments : activeInstallments.slice(0, 8)).map((inst) => {
                const details = getInstallmentPaymentDetails(inst);
                const isOverdue = !details.isPaid && inst.dueDate < todayStr;
                return (
                  <View
                    key={inst.id}
                    style={[
                      styles.instCardItem,
                      details.isPaid && styles.instCardItemPaid,
                      isOverdue && styles.instCardItemOverdue,
                      details.isPartial && styles.instCardItemPartial,
                    ]}
                  >
                    {/* Fila Superior: Cuota, Vencimiento y Monto */}
                    <View style={styles.instCardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={[
                            styles.instNumBadge,
                            details.isPaid && { backgroundColor: '#dcfce7' },
                            isOverdue && { backgroundColor: '#fee2e2' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.instNumBadgeText,
                              details.isPaid && { color: '#15803d' },
                              isOverdue && { color: '#b91c1c' },
                            ]}
                          >
                            #{inst.installmentNumber}
                          </Text>
                        </View>
                        <Text style={styles.instCardDueDate}>
                          Vence: <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{inst.dueDate}</Text>
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.instCardAmount,
                          details.isPaid && { color: '#15803d' },
                          isOverdue && { color: '#dc2626' },
                        ]}
                      >
                        {formatCOP(inst.expectedAmount)}
                      </Text>
                    </View>

                    {/* Fila Inferior: Detalles de Pago y Retraso */}
                    {details.isPaid ? (
                      <View style={styles.instPaymentMetaBox}>
                        <View style={styles.paidDateBadge}>
                          <CheckCircle size={12} color="#15803d" style={{ marginRight: 4 }} />
                          <Text style={styles.paidDateBadgeText}>
                            Pagada el: <Text style={{ fontWeight: '800' }}>{details.paymentDate || 'Registrado'}</Text>
                          </Text>
                        </View>

                        {details.isDelayed ? (
                          <View style={styles.delayBadge}>
                            <Clock size={11} color="#b45309" style={{ marginRight: 3 }} />
                            <Text style={styles.delayBadgeText}>
                              ⚠️ {details.delayDays} {details.delayDays === 1 ? 'día' : 'días'} de retraso
                            </Text>
                          </View>
                        ) : details.isEarly ? (
                          <View style={styles.earlyBadge}>
                            <Text style={styles.earlyBadgeText}>
                              ⚡ Adelantada ({Math.abs(details.delayDays)}d antes)
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.onTimeBadge}>
                            <Text style={styles.onTimeBadgeText}>✓ A tiempo</Text>
                          </View>
                        )}
                      </View>
                    ) : details.isPartial ? (
                      <View style={styles.instPartialMetaBox}>
                        <Text style={styles.instPartialText}>
                          Abonado: {formatCOP(inst.paidAmount)} • Saldo: {formatCOP(inst.pendingAmount)}
                        </Text>
                        {details.paymentDate && (
                          <Text style={styles.instPartialDateText}>
                            Último abono: {details.paymentDate}
                          </Text>
                        )}
                      </View>
                    ) : isOverdue ? (
                      <View style={styles.instOverdueMetaBox}>
                        <AlertCircle size={12} color="#dc2626" style={{ marginRight: 4 }} />
                        <Text style={styles.instOverdueText}>
                          Vencida hace {details.overduePendingDays} {details.overduePendingDays === 1 ? 'día' : 'días'} (Mora activa)
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.instPendingMetaBox}>
                        <Text style={styles.instPendingText}>
                          {inst.dueDate === todayStr ? '🔔 Cobro programado para hoy' : 'Pendiente de cobro'}
                        </Text>
                      </View>
                    )}
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
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frequencyTag: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  frequencyTagText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  financialMiniBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  financialMiniCol: {
    flex: 1,
  },
  financialMiniLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  financialMiniVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  financialMiniDivider: {
    width: 1,
    height: 24,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
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
  planHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSoft,
  },
  expandToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  installmentsList: {
    gap: 8,
  },
  instCardItem: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  instCardItemPaid: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  instCardItemOverdue: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  instCardItemPartial: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  instCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  instNumBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  instNumBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  instCardDueDate: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    flex: 1,
    marginLeft: 8,
  },
  instCardAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  instPaymentMetaBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  paidDateBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  paidDateBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
  },
  delayBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  delayBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309',
  },
  earlyBadge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  earlyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4338ca',
  },
  onTimeBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  onTimeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803d',
  },
  instPartialMetaBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  instPartialText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
  },
  instPartialDateText: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  instOverdueMetaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  instOverdueText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  instPendingMetaBox: {
    marginTop: 6,
    paddingTop: 4,
  },
  instPendingText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
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
