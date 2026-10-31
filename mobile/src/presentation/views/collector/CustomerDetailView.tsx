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
  Image,
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
  LoanFrequency,
} from '../../../core/domain/types';
import { formatCOP, addDays } from '../../../core/config/business-rules';
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
  Video,
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
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit3,
  RotateCcw,
  Ban,
  ShieldAlert,
  X,
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
  onNewLoan?: (customer: Customer, initialFrequency?: LoanFrequency, initialFixedDate?: string) => void;
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
  onNewLoan,
}) => {
  const insets = useSafeAreaInsets();
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [selectedFixedDate, setSelectedFixedDate] = useState<string>(() => addDays(todayStr, 15));
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
  // Solo presentación: el valor financiero ya fue determinado al originar/migrar el crédito.
  const paperworkIsZero =
    !(localStore.getOfficeConfig().paperworkFeeEnabled ?? true) ||
    Boolean(activeLoan?.notes?.startsWith('Migrado de cartulina física'));

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
            onPress: () => { onDeleteCustomer(customer, hasActive); onBack?.(); },
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

          {Boolean(customer.photoUri || customer.videoUri) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, padding: 8, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
              {customer.photoUri ? (
                <Image source={{ uri: customer.photoUri }} style={{ width: 50, height: 50, borderRadius: 8, backgroundColor: '#E2E8F0' }} resizeMode="cover" />
              ) : (
                <View style={{ width: 50, height: 50, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Video size={24} color="#2563EB" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.navy }}>
                  {customer.photoUri ? 'Fotografía Registrada del Cliente' : 'Video Registrado del Cliente'}
                </Text>
                <Text style={{ fontSize: 10, color: COLORS.textMuted }}>
                  Registro audiovisual adjunto al expediente
                </Text>
              </View>
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

        {/* BARRA DE BOTONES EN UNA SOLA LÍNEA (PEQUEÑOS, 2 PALABRAS, CON EMOJI) */}
        <View style={styles.singleLineBarWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.singleLineBarScroll}
          >
            <TouchableOpacity
              style={[styles.smallTwoWordBtn, styles.btnFixedDate]}
              activeOpacity={0.75}
              onPress={() => setCalendarModalVisible(true)}
            >
              <Text style={[styles.smallTwoWordText, { color: '#1D4ED8' }]}>📅 Fecha Fija</Text>
            </TouchableOpacity>

            {onNewLoan && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnNewCredit]}
                activeOpacity={0.75}
                onPress={() => onNewLoan(customer, 'DAILY')}
              >
                <Text style={styles.smallTwoWordText}>➕ Nuevo Crédito</Text>
              </TouchableOpacity>
            )}

            {activeLoan && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnPayInstallment]}
                activeOpacity={0.75}
                onPress={() => onPayLoan(customer, activeLoan)}
              >
                <Text style={styles.smallTwoWordText}>💵 Pagar Cuota</Text>
              </TouchableOpacity>
            )}

            {activeLoan && onPromiseLoan && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnPromise]}
                activeOpacity={0.75}
                onPress={() => onPromiseLoan(customer, activeLoan)}
              >
                <Text style={styles.smallTwoWordText}>⏳ Pactar Promesa</Text>
              </TouchableOpacity>
            )}

            {activeLoan && onNonPayment && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnNoPayment]}
                activeOpacity={0.75}
                onPress={() => onNonPayment(customer, activeLoan)}
              >
                <Text style={styles.smallTwoWordText}>⚠️ Reportar No-Pago</Text>
              </TouchableOpacity>
            )}

            {activeLoan && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnRenew]}
                activeOpacity={0.75}
                onPress={() => onRenewLoan(customer, activeLoan)}
              >
                <Text style={styles.smallTwoWordText}>🔄 Renovar Crédito</Text>
              </TouchableOpacity>
            )}

            {onOpenCreditHistory && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnHistory]}
                activeOpacity={0.75}
                onPress={() => onOpenCreditHistory(customer)}
              >
                <Text style={styles.smallTwoWordText}>📋 Ver Historial</Text>
              </TouchableOpacity>
            )}

            {onEditCustomer && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnEdit]}
                activeOpacity={0.75}
                onPress={() => onEditCustomer(customer)}
              >
                <Text style={styles.smallTwoWordText}>✏️ Editar Datos</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.smallTwoWordBtn, styles.btnWhatsApp]}
              activeOpacity={0.75}
              onPress={handleWhatsApp}
            >
              <Text style={styles.smallTwoWordText}>📲 Enviar WhatsApp</Text>
            </TouchableOpacity>

            {onDeleteCustomer && (
              <TouchableOpacity
                style={[styles.smallTwoWordBtn, styles.btnDelete]}
                activeOpacity={0.75}
                onPress={handleDeletePress}
              >
                <Text style={[styles.smallTwoWordText, { color: '#DC2626' }]}>🗑️ Eliminar Cliente</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
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
            {/* Cabecera del Crédito Activo */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
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
            </View>

            {/* Acciones Ergonómicas: CTA Primario de Cobro + Acciones Secundarias Etiquetadas */}
            <View style={styles.loanActionsContainer}>
              <TouchableOpacity
                style={styles.payPrimaryBtn}
                onPress={() => onPayLoan(customer, activeLoan)}
                activeOpacity={0.85}
              >
                <CheckCircle size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.payPrimaryBtnText}>
                  Registrar Pago • {formatCOP(activeLoan.installmentAmount)}
                </Text>
              </TouchableOpacity>

              <View style={styles.secondaryActionsRow}>
                {onPromiseLoan && (
                  <TouchableOpacity
                    style={styles.secondaryActionChip}
                    onPress={() => onPromiseLoan(customer, activeLoan)}
                  >
                    <Clock size={13} color={COLORS.navy} />
                    <Text style={styles.secondaryActionText}>⏳ Promesa</Text>
                  </TouchableOpacity>
                )}

                {onNonPayment && (
                  <TouchableOpacity
                    style={[styles.secondaryActionChip, styles.noPaymentChip]}
                    onPress={() => onNonPayment(customer, activeLoan)}
                  >
                    <AlertCircle size={13} color="#B45309" />
                    <Text style={[styles.secondaryActionText, { color: '#B45309' }]}>! No Pago</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.secondaryActionChip, styles.renewChip]}
                  onPress={() => onRenewLoan(customer, activeLoan)}
                >
                  <RefreshCw size={13} color={COLORS.ochre} />
                  <Text style={[styles.secondaryActionText, { color: COLORS.ochreDark }]}>↻ Renovar</Text>
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

            <View style={styles.paperworkNote}>
              <Text style={styles.paperworkNoteLabel}>PAPELERÍA / CARTULINA</Text>
              <Text style={styles.paperworkNoteValue}>
                {paperworkIsZero ? '$0' : 'Configurada por oficina'}
              </Text>
              <Text style={styles.paperworkNoteHint}>
                {paperworkIsZero
                  ? 'No descuenta efectivo: desactivada o migración física.'
                  : 'El movimiento original conserva su trazabilidad.'}
              </Text>
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

        {/* 3b. Estado sin crédito: Originar Préstamo o Fijar Fecha Única */}
        {!activeLoan && (
          <View style={styles.noLoanCard}>
            <View style={styles.noLoanHeaderRow}>
              <View style={styles.noLoanDot} />
              <Text style={styles.noLoanTitle}>CLIENTE DISPONIBLE SIN CRÉDITO ACTIVO</Text>
            </View>
            <Text style={styles.noLoanSubtitle}>
              Este cliente no posee deudas activas. Puedes originar un crédito regular o pactar una fecha fija acordada.
            </Text>

            {/* Fila en una misma línea de párrafo para fecha fija */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.singleLineFixedDateBar}
            >
              <View style={styles.fixedDatePillInline}>
                <Calendar size={13} color="#2563EB" style={{ marginRight: 5 }} />
                <Text style={styles.fixedDatePillText}>Fecha fija: {selectedFixedDate}</Text>
              </View>

              <TouchableOpacity
                style={styles.openCalendarSmallBtn}
                activeOpacity={0.8}
                onPress={() => setCalendarModalVisible(true)}
              >
                <Text style={styles.openCalendarSmallText}>🗓️ Calendario</Text>
              </TouchableOpacity>

              {onNewLoan && (
                <TouchableOpacity
                  style={styles.actionNewLoanSmallBtn}
                  activeOpacity={0.8}
                  onPress={() => onNewLoan(customer, 'FIXED_DATE', selectedFixedDate)}
                >
                  <Text style={styles.actionNewLoanSmallText}>➕ Crear Préstamo</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
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

        {/* 6. Zona de Peligro / Gestión de Cliente (EXCLUSIVO ADMINISTRADOR / SUPERVISOR) */}
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
          statusBarTranslucent={false}
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

      {/* Modal de Calendario Interactivo para Fecha Fija del Cliente */}
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
                <Text style={styles.calendarModalTitle}>📅 Fecha Fija de Préstamo</Text>
                <Text style={styles.calendarModalSubtitle}>Selecciona la fecha acordada para el cobro</Text>
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
                  const isSelected = selectedFixedDate === cellDate;
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
                        setSelectedFixedDate(cellDate);
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
                    selectedFixedDate === addDays(todayStr, item.days) && styles.calendarQuickPillActive,
                  ]}
                  onPress={() => {
                    const target = addDays(todayStr, item.days);
                    setSelectedFixedDate(target);
                    const [y, m] = target.split('-');
                    setCalendarYear(parseInt(y, 10));
                    setCalendarMonth(parseInt(m, 10) - 1);
                  }}
                >
                  <Text
                    style={[
                      styles.calendarQuickPillText,
                      selectedFixedDate === addDays(todayStr, item.days) && styles.calendarQuickPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Footer con fecha y botón de confirmación */}
            <View style={styles.calendarFooterRow}>
              <Text style={styles.calendarFooterPreview}>
                Fecha fija: <Text style={{ fontWeight: '800', color: COLORS.primary }}>{selectedFixedDate}</Text>
              </Text>
              <TouchableOpacity
                style={styles.calendarConfirmBtn}
                onPress={() => {
                  setCalendarModalVisible(false);
                  if (onNewLoan) {
                    onNewLoan(customer, 'FIXED_DATE', selectedFixedDate);
                  }
                }}
              >
                <Text style={styles.calendarConfirmBtnText}>✅ Crear Préstamo</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#dc2626',
    letterSpacing: 0.5,
  },
  dangerZoneDesc: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  contactPillBtn: {
    flexGrow: 1,
    flexBasis: '46%',
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  bentoAmountDark: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
    marginVertical: 4,
  },
  bentoSub: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  loanNumberBig: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  loanActionsContainer: {
    marginBottom: 14,
    gap: 8,
  },
  payPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dockBg,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 14,
    shadowColor: COLORS.dockBg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  payPrimaryBtnText: {
    color: '#ffffff',
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  secondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryActionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 38,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  secondaryActionText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.navy,
  },
  noPaymentChip: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  renewChip: {
    backgroundColor: '#FFFBEB',
    borderColor: COLORS.ochreBorder,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.3,
  },
  financialMiniVal: {
    fontFamily: FONT_FAMILY,
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
  paperworkNote: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  paperworkNoteLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  paperworkNoteValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  paperworkNoteHint: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginVertical: 12,
  },
  subHeaderLabel: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  instCardDueDate: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    flex: 1,
    marginLeft: 8,
  },
  instCardAmount: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
  },
  instPartialDateText: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
  },
  instPendingMetaBox: {
    marginTop: 6,
    paddingTop: 4,
  },
  instPendingText: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  emptyHistoryText: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.success,
  },
  paymentTicketMeta: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  promiseStatusTag: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.warning,
  },
  singleLineBarWrapper: {
    marginHorizontal: -16,
    marginBottom: 14,
  },
  singleLineBarScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  smallTwoWordBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallTwoWordText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  btnFixedDate: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  btnNewCredit: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  btnPayInstallment: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  btnPromise: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  btnNoPayment: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  btnRenew: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  btnHistory: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
  },
  btnEdit: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  btnWhatsApp: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  btnDelete: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  noLoanCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
  },
  noLoanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  noLoanDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0D9488',
  },
  noLoanTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '900',
    color: '#0F766E',
    letterSpacing: 0.5,
  },
  noLoanSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 12,
  },
  singleLineFixedDateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
  },
  fixedDatePillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  fixedDatePillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  openCalendarSmallBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openCalendarSmallText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  actionNewLoanSmallBtn: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNewLoanSmallText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  calendarConfirmBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
