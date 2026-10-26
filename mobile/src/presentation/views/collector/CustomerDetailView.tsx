import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Customer,
  Loan,
  Installment,
  Payment,
  Renewal,
  PaymentPromise,
  UserRole,
} from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { localStore } from '../../../infrastructure/storage/local-store';
import {
  formatAccountStatementReminder,
  formatDigitalPaymentReceipt,
  openWhatsAppReceipt,
} from '../../../core/utils/whatsapp-receipt';
import { COLORS, TYPOGRAPHY, FONT_FAMILY } from '../../theme/colors';
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
  Trash2,
  Edit3,
  RotateCcw,
  Ban,
  ShieldAlert,
} from 'lucide-react-native';

interface CustomerDetailViewProps {
  customer: Customer;
  loans: Loan[];
  installments: Installment[];
  payments: Payment[];
  renewals: Renewal[];
  promises: PaymentPromise[];
  todayStr: string;
  userRole?: UserRole;
  currentUserId?: string;
  onDataChanged?: () => void;
  onBack: () => void;
  onPayLoan: (customer: Customer, loan: Loan) => void;
  onRenewLoan: (customer: Customer, loan: Loan) => void;
  onPromiseLoan?: (customer: Customer, loan: Loan) => void;
  onNonPayment?: (customer: Customer, loan: Loan) => void;
  onOpenCreditHistory?: (customer: Customer) => void;
  onDeleteCustomer?: (customer: Customer, force?: boolean) => void;
  onEditCustomer?: (customer: Customer) => void;
}

export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({
  customer,
  loans,
  installments,
  payments,
  promises,
  todayStr,
  userRole = 'COBRADOR',
  currentUserId = 'usr-col-1',
  onDataChanged,
  onBack,
  onPayLoan,
  onRenewLoan,
  onPromiseLoan,
  onNonPayment,
  onOpenCreditHistory,
  onDeleteCustomer,
  onEditCustomer,
}) => {
  const insets = useSafeAreaInsets();
  const isAdminOrSupervisor =
    userRole === 'ADMIN' || userRole === 'SUPERVISOR' || userRole === 'SUPER_ADMIN';
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
  const [auditModalState, setAuditModalState] = useState<{
    visible: boolean;
    mode: 'REVERSE_PAYMENT' | 'CANCEL_LOAN';
    targetPayment?: Payment;
    targetLoan?: Loan;
  }>({ visible: false, mode: 'REVERSE_PAYMENT' });
  const [auditReason, setAuditReason] = useState('');
  const [isProcessingAudit, setIsProcessingAudit] = useState(false);

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

  const handleWhatsApp = async () => {
    const companyConfig = localStore.getOfficeConfig();
    const waPhone = customer.whatsappPhone || customer.phone;
    if (activeLoan) {
      const msg = formatAccountStatementReminder({
        companyConfig,
        customer,
        loan: activeLoan,
        installments: activeInstallments,
        todayStr,
      });
      await openWhatsAppReceipt(waPhone, msg);
    } else {
      const msg = `Hola *${customer.fullName}*, le escribimos de *${companyConfig.companyName}*. Actualmente su cuenta se encuentra a paz y salvo.`;
      await openWhatsAppReceipt(waPhone, msg);
    }
  };

  const handleOpenMap = () => {
    const q = encodeURIComponent(
      `${customer.address}, ${customer.neighborhood}, ${customer.city}`
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(
      () => {}
    );
  };

  const handleSharePaymentWhatsApp = async (pay: Payment) => {
    const companyConfig = localStore.getOfficeConfig();
    const targetLoan =
      customerLoans.find((l) => l.id === pay.loanId) ||
      activeLoan ||
      customerLoans[0];
    if (!targetLoan) return;
    const loanInsts = installments.filter((i) => i.loanId === targetLoan.id);
    const remBal = loanInsts.reduce((s, i) => s + i.pendingAmount, 0);

    const receiptText = formatDigitalPaymentReceipt({
      companyConfig,
      customer,
      loan: targetLoan,
      payment: pay,
      remainingBalance: remBal,
      installments: loanInsts,
    });

    const waPhone = customer.whatsappPhone || customer.phone;
    await openWhatsAppReceipt(waPhone, receiptText);
  };

  const handleOpenReversePaymentModal = (pay: Payment) => {
    if (!isAdminOrSupervisor) return;
    setAuditReason('');
    setAuditModalState({
      visible: true,
      mode: 'REVERSE_PAYMENT',
      targetPayment: pay,
    });
  };

  const handleOpenCancelLoanModal = (loan: Loan) => {
    if (!isAdminOrSupervisor) return;
    setAuditReason('');
    setAuditModalState({
      visible: true,
      mode: 'CANCEL_LOAN',
      targetLoan: loan,
    });
  };

  const handleConfirmAuditAction = async () => {
    if (!isAdminOrSupervisor) {
      Alert.alert('Acceso denegado', 'Operación exclusiva para Administradores y Supervisores.');
      return;
    }
    if (auditReason.trim().length < 5) {
      Alert.alert(
        'Motivo obligatorio',
        'Por favor escriba un motivo de auditoría de al menos 5 caracteres.'
      );
      return;
    }

    setIsProcessingAudit(true);
    try {
      if (auditModalState.mode === 'REVERSE_PAYMENT' && auditModalState.targetPayment) {
        await localStore.reversePayment({
          paymentId: auditModalState.targetPayment.id,
          reason: auditReason.trim(),
          userRole,
          userId: currentUserId,
          todayStr,
        });
        Alert.alert(
          '↩ Abono Anulado',
          'El abono fue revertido de las cuotas y se registró el movimiento compensatorio en caja y auditoría.'
        );
      } else if (auditModalState.mode === 'CANCEL_LOAN' && auditModalState.targetLoan) {
        await localStore.cancelLoan({
          loanId: auditModalState.targetLoan.id,
          reason: auditReason.trim(),
          userRole,
          userId: currentUserId,
          todayStr,
        });
        Alert.alert(
          '🚫 Crédito Anulado',
          'El crédito fue marcado como CANCELLED y su desembolso fue reintegrado a la base de caja con registro en auditoría.'
        );
      }
      setAuditModalState({ visible: false, mode: 'REVERSE_PAYMENT' });
      setAuditReason('');
      onDataChanged?.();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo procesar la anulación.');
    } finally {
      setIsProcessingAudit(false);
    }
  };

  const handleDeletePress = () => {
    if (!onDeleteCustomer) return;
    const hasActive = !!activeLoan;
    const alertTitle = hasActive
      ? '⚠️ Cliente con Crédito Activo'
      : 'Eliminar Cliente';
    const alertMessage = hasActive
      ? `El cliente ${customer.fullName} tiene un crédito activo (${activeLoan?.loanNumber || 'en curso'}). Si lo elimina, el crédito se archivará como cancelado. ¿Desea continuar de todas formas?`
      : `¿Está seguro de eliminar a ${customer.fullName}? Esta acción lo removerá de la ruta y del directorio.`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${alertTitle}\n\n${alertMessage}`);
      if (confirmed) {
        onDeleteCustomer(customer, hasActive);
      }
    } else {
      Alert.alert(
        alertTitle,
        alertMessage,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: hasActive ? 'Eliminar de todas formas' : 'Eliminar',
            style: 'destructive',
            onPress: () => onDeleteCustomer(customer, hasActive),
          },
        ],
        { cancelable: true }
      );
    }
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
          {onEditCustomer && (
            <TouchableOpacity
              onPress={() => onEditCustomer(customer)}
              style={styles.headerEditBtn}
              activeOpacity={0.7}
            >
              <Edit3 size={15} color="#2563eb" />
            </TouchableOpacity>
          )}
          {onDeleteCustomer && (
            <TouchableOpacity
              onPress={handleDeletePress}
              style={styles.headerDeleteBtn}
              activeOpacity={0.7}
            >
              <Trash2 size={16} color="#dc2626" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Tarjeta Principal del Titular + Píldoras de Contacto en 1 Toque */}
        <View style={styles.profileCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={styles.customerName}>{customer.fullName}</Text>
            {onEditCustomer && (
              <TouchableOpacity
                style={styles.editProfileSmallBtn}
                onPress={() => onEditCustomer(customer)}
                activeOpacity={0.7}
              >
                <Edit3 size={12} color="#2563eb" style={{ marginRight: 4 }} />
                <Text style={styles.editProfileSmallBtnText}>Editar Datos</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.contactMetaRow}>
            <Phone size={14} color={COLORS.textMuted} />
            <Text style={styles.contactText}>
              Llamadas: {customer.phone}
              {customer.whatsappPhone && customer.whatsappPhone !== customer.phone
                ? ` • WhatsApp: ${customer.whatsappPhone}`
                : ' • (WhatsApp activo)'}
            </Text>
          </View>

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

            {/* Acciones de Estado de Cuenta por WhatsApp y Anulación Auditada (EXCLUSIVO ADMIN/SUPERVISOR) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  minWidth: 180,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f0fdf4',
                  borderWidth: 1,
                  borderColor: '#bbf7d0',
                  borderRadius: 10,
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                }}
                onPress={handleWhatsApp}
                activeOpacity={0.75}
              >
                <MessageCircle size={14} color="#16a34a" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803d' }}>
                  📲 Enviar Estado de Cuenta por WhatsApp
                </Text>
              </TouchableOpacity>

              {isAdminOrSupervisor && (
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fef2f2',
                    borderWidth: 1,
                    borderColor: '#fecaca',
                    borderRadius: 10,
                    paddingVertical: 9,
                    paddingHorizontal: 12,
                  }}
                  onPress={() => handleOpenCancelLoanModal(activeLoan)}
                  activeOpacity={0.75}
                >
                  <Ban size={14} color="#dc2626" style={{ marginRight: 5 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#dc2626' }}>
                    🚫 Anular Crédito
                  </Text>
                </TouchableOpacity>
              )}
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
            customerPayments.map((pay) => {
              const isReversed = pay.status === 'REVERSED' || pay.status === 'ANNULLED';
              return (
                <View
                  key={pay.id}
                  style={[
                    styles.paymentTicketItem,
                    isReversed && { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <Text
                      style={[
                        styles.paymentTicketAmount,
                        isReversed && {
                          textDecorationLine: 'line-through',
                          color: '#991b1b',
                        },
                      ]}
                    >
                      {formatCOP(pay.amountReceived)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isReversed && (
                        <View
                          style={{
                            backgroundColor: '#fee2e2',
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                            borderRadius: 6,
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#dc2626' }}>
                            ANULADO
                          </Text>
                        </View>
                      )}
                      <View style={styles.methodPill}>
                        <Text style={styles.methodPillText}>{pay.paymentMethod}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.paymentTicketActionRow}>
                    <Text style={[styles.paymentTicketMeta, { flex: 1 }]}>
                      Fecha: {pay.createdAt} • {pay.installmentsBreakdown.length} cuota(s) • Ref:{' '}
                      {pay.id}
                      {pay.notes ? `\n${pay.notes}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {!isReversed && (
                        <TouchableOpacity
                          style={styles.shareTicketWhatsAppBtn}
                          onPress={() => handleSharePaymentWhatsApp(pay)}
                          activeOpacity={0.7}
                        >
                          <MessageCircle size={12} color="#16a34a" style={{ marginRight: 4 }} />
                          <Text style={styles.shareTicketWhatsAppText}>WhatsApp</Text>
                        </TouchableOpacity>
                      )}
                      {isAdminOrSupervisor && !isReversed && (
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: '#fef2f2',
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                          }}
                          onPress={() => handleOpenReversePaymentModal(pay)}
                          activeOpacity={0.7}
                        >
                          <RotateCcw size={11} color="#dc2626" style={{ marginRight: 3 }} />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#dc2626' }}>
                            ↩ Anular Abono
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })
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

        {/* 6. Zona de Peligro / Gestión de Cliente */}
        {onDeleteCustomer && (
          <View style={styles.dangerZoneCard}>
            <View style={styles.dangerZoneHeader}>
              <Trash2 size={16} color="#dc2626" style={{ marginRight: 6 }} />
              <Text style={styles.dangerZoneTitle}>GESTIÓN / ELIMINAR CLIENTE</Text>
            </View>
            <Text style={styles.dangerZoneDesc}>
              Remover este cliente del directorio y la ruta activa. La operación quedará registrada en auditoría.
            </Text>
            <TouchableOpacity
              style={styles.dangerZoneBtn}
              activeOpacity={0.8}
              onPress={handleDeletePress}
            >
              <Trash2 size={15} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.dangerZoneBtnText}>Eliminar este Cliente</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Modal de Reverso / Anulación Auditada (EXCLUSIVO ADMIN Y SUPERVISOR) */}
      {isAdminOrSupervisor && (
        <Modal
          visible={auditModalState.visible}
          transparent
          animationType="fade"
          onRequestClose={() =>
            setAuditModalState({ visible: false, mode: 'REVERSE_PAYMENT' })
          }
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{
              flex: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              justifyContent: 'center',
              paddingHorizontal: 20,
              paddingTop: Math.max(insets.top, 20),
              paddingBottom: Math.max(insets.bottom, 20),
            }}
          >
            <View
              style={{
                backgroundColor: '#ffffff',
                borderRadius: 18,
                padding: 20,
                borderWidth: 1,
                borderColor: '#fecaca',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <ShieldAlert size={20} color="#dc2626" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#991b1b', flex: 1 }}>
                  {auditModalState.mode === 'REVERSE_PAYMENT'
                    ? '↩ Anular Abono (Auditoría)'
                    : '🚫 Anular Crédito (Auditoría)'}
                </Text>
              </View>

              <Text style={{ fontSize: 12, color: '#475569', lineHeight: 18, marginBottom: 12 }}>
                {auditModalState.mode === 'REVERSE_PAYMENT'
                  ? `Se revertirá el abono de ${formatCOP(
                      auditModalState.targetPayment?.amountReceived || 0
                    )} sobre las cuotas del cliente ${
                      customer.fullName
                    } y se descontará de la caja del día.`
                  : `Se anulará el crédito ${
                      auditModalState.targetLoan?.loanNumber || ''
                    } de ${customer.fullName} y se reintegrará el desembolso a la base de caja.`}
              </Text>

              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: '#334155',
                  marginBottom: 6,
                }}
              >
                MOTIVO OBLIGATORIO DE AUDITORÍA (MÍN. 5 CARACTERES):
              </Text>
              <TextInput
                style={{
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 13,
                  color: '#0f172a',
                  minHeight: 72,
                  textAlignVertical: 'top',
                  marginBottom: 14,
                }}
                placeholder="Ej: Error de digitación en monto, abono aplicado al cliente equivocado..."
                placeholderTextColor="#94a3b8"
                multiline
                value={auditReason}
                onChangeText={setAuditReason}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                <TouchableOpacity
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    backgroundColor: '#f1f5f9',
                  }}
                  onPress={() =>
                    setAuditModalState({ visible: false, mode: 'REVERSE_PAYMENT' })
                  }
                  disabled={isProcessingAudit}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    backgroundColor: '#dc2626',
                    opacity: isProcessingAudit ? 0.6 : 1,
                  }}
                  onPress={handleConfirmAuditAction}
                  disabled={isProcessingAudit}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>
                    {isProcessingAudit ? 'Procesando...' : 'Confirmar Anulación'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  headerEditBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  headerDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  editProfileSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  editProfileSmallBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
  },
  paymentTicketActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  shareTicketWhatsAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  shareTicketWhatsAppText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  dangerZoneCard: {
    backgroundColor: '#fff5f5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 16,
    marginTop: 16,
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dangerZoneTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  dangerZoneDesc: {
    fontSize: 12,
    color: '#7f1d1d',
    lineHeight: 18,
    marginBottom: 14,
  },
  dangerZoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dangerZoneBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
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
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
