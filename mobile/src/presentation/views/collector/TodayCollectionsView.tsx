import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  PanResponder,
  Linking,
} from 'react-native';
import {
  Customer,
  Loan,
  Installment,
  PaymentPromise,
  DailyRouteMetrics,
  NonPaymentVisit,
  Payment,
} from '../../../core/domain/types';
import { formatCOP, getFrequencyLabel, getInitials } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { COLORS, TYPOGRAPHY, FONT_FAMILY } from '../../theme/colors';
import { localStore, safeStorage } from '../../../infrastructure/storage/local-store';
import {
  formatAccountStatementReminder,
  openWhatsAppReceipt,
} from '../../../core/utils/whatsapp-receipt';
import { CustomerOptionsModal } from '../../components/CustomerOptionsModal';
import {
  Search,
  CheckCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
  ChevronDown,
  FilePlus2,
  TrendingUp,
  Wallet,
  Eye,
  EyeOff,
  X,
  Fuel,
  MapPin,
  AlertCircle,
  ListOrdered,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Zap,
  Landmark,
  RefreshCw,
  Phone,
  MessageCircle,
  MoreVertical,
} from 'lucide-react-native';

export type FilterType = 'TODOS' | 'COBRAR_HOY' | 'MORA' | 'AL_DIA' | 'PAGADOS' | 'PROMESAS';

interface TodayCollectionsViewProps {
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  promises: PaymentPromise[];
  payments?: Payment[];
  metrics: DailyRouteMetrics;
  todayStr: string;
  nonPaymentVisits?: NonPaymentVisit[];
  onSelectCustomerToPay: (customer: Customer, loan: Loan) => void;
  onViewCustomerDetail: (customer: Customer) => void;
  onOpenNewLoan: () => void;
  onOpenExpense?: () => void;
  onOpenRecaudo?: () => void;
  onOpenSettlement: () => void;
  onOpenDailyReport?: () => void;
  onNonPaymentCustomer?: (customer: Customer, loan: Loan) => void;
  onPromiseCustomer?: (customer: Customer, loan: Loan) => void;
  onRenewCustomer?: (customer: Customer, loan: Loan) => void;
  isAdminMode?: boolean;
  viewMode?: 'DASHBOARD' | 'ROUTE';
  onNavigateToRoute?: () => void;
  activeRouteLabel?: string;
  onOpenRouteSelector?: () => void;
  /** Filtro de estado con el que abre la hoja de ruta (ej. 'PROMESAS' desde la campana). */
  initialFilter?: FilterType;
}

const formatDateLabel = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(year, month - 1, day);
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayName = days[dateObj.getDay()];
      const monthName = months[month - 1];
      return `${dayName} ${day} ${monthName}`;
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
};

export const TodayCollectionsView: React.FC<TodayCollectionsViewProps> = ({
  customers,
  loans,
  installments,
  promises,
  payments = [],
  metrics,
  todayStr,
  nonPaymentVisits = [],
  onSelectCustomerToPay,
  onViewCustomerDetail,
  onOpenNewLoan,
  onOpenExpense,
  onOpenRecaudo,
  onOpenSettlement,
  onOpenDailyReport,
  onNonPaymentCustomer,
  onPromiseCustomer,
  onRenewCustomer,
  isAdminMode = false,
  viewMode = 'ROUTE',
  onNavigateToRoute,
  activeRouteLabel,
  onOpenRouteSelector,
  initialFilter = 'TODOS',
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [frequencyFilter, setFrequencyFilter] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('ALL');
  const [optionsCustomer, setOptionsCustomer] = useState<Customer | null>(null);
  const [collapsedCompleted, setCollapsedCompleted] = useState<boolean>(false);
  const officeConfig = localStore.getOfficeConfig();

  useEffect(() => {
    safeStorage.getItem('@prestamos_privacy_mode_v1').then((val) => {
      if (val !== null) setPrivacyMode(val === 'true');
    });
  }, []);

  const togglePrivacy = () => {
    const next = !privacyMode;
    setPrivacyMode(next);
    safeStorage.setItem('@prestamos_privacy_mode_v1', String(next));
  };

  const maskIfPrivate = (amount: number): string =>
    privacyMode ? '$ •••••••' : formatCOP(amount);

  // Estados y métodos para el Modo "Editar Ruta" (Reorganizar clientes deslizando con el dedo o flechas)
  const [isEditingRoute, setIsEditingRoute] = useState(false);
  const [editingCustomers, setEditingCustomers] = useState<Customer[]>([]);

  const handleStartEditRoute = () => {
    const sorted = [...customers].sort((a, b) => {
      const orderA = a.orderIndex ?? 9999;
      const orderB = b.orderIndex ?? 9999;
      return orderA - orderB;
    });
    setEditingCustomers(sorted);
    setIsEditingRoute(true);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...editingCustomers];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setEditingCustomers(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index >= editingCustomers.length - 1) return;
    const updated = [...editingCustomers];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setEditingCustomers(updated);
  };

  const handleCycleFrequency = () => {
    const sequence: Array<'ALL' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'> = [
      'ALL',
      'DAILY',
      'WEEKLY',
      'BIWEEKLY',
      'MONTHLY',
    ];
    const currentIndex = sequence.indexOf(frequencyFilter);
    const nextIndex = (currentIndex + 1) % sequence.length;
    setFrequencyFilter(sequence[nextIndex]);
  };

  const handleSaveRoute = async () => {
    try {
      const orderedIds = editingCustomers.map((c) => c.id);
      await localStore.updateCustomerOrder(orderedIds);
      setIsEditingRoute(false);
      Alert.alert(
        '¡Ruta Reorganizada!',
        'El orden secuencial de cobro ha quedado guardado exitosamente para la jornada.'
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el orden de la ruta');
    }
  };

  const handleCancelEditRoute = () => {
    setIsEditingRoute(false);
  };

  const handleAutoSortPriority = async () => {
    try {
      await localStore.autoSortRouteByPriority(todayStr, undefined, false);
      const refreshed = localStore
        .getCustomers()
        .filter((c) => customers.some((existing) => existing.id === c.id))
        .sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));
      setEditingCustomers(refreshed);
      Alert.alert(
        '⚡ Ruta Ordenada por Prioridad',
        '1° Clientes en Mora → 2° Cuota de Hoy → 3° Promesas Activas → 4° Al Día / Ya Visitados.'
      );
    } catch (err: any) {
      Alert.alert('Política de Ruta', err?.message || 'No se pudo auto-ordenar la ruta.');
    }
  };

  const handleQuickCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const handleQuickMap = (cust: Customer) => {
    const q = encodeURIComponent(
      `${cust.address}, ${cust.neighborhood}, ${cust.city || 'Barranquilla'}`
    );
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {});
  };

  const handleQuickWhatsApp = async (
    cust: Customer,
    loan: Loan,
    custInsts: Installment[]
  ) => {
    const msg = formatAccountStatementReminder({
      companyConfig: officeConfig,
      customer: cust,
      loan,
      installments: custInsts,
      todayStr,
    });
    await openWhatsAppReceipt(cust.whatsappPhone || cust.phone, msg);
  };

  const createPanResponder = (index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 10,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -20) {
          handleMoveUp(index);
        } else if (gesture.dy > 20) {
          handleMoveDown(index);
        }
      },
    });

  // Construir datos enriquecidos para cada tarjeta de préstamo (.loan-card)
  const customerCardsData = customers
    .map((customer) => {
      const activeLoan = loans.find(
        (l) => l.customerId === customer.id && l.status === 'ACTIVE'
      );
      if (!activeLoan) return null;

      const customerInstallments = installments
        .filter((i) => i.loanId === activeLoan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);

      // Cuota de hoy
      const todayInstallment = customerInstallments.find((i) => i.dueDate === todayStr);

      // Métricas de mora fáctica (sin recargos inventados)
      const delinquency = calculateDelinquencyMetrics(customerInstallments, todayStr);

      // Promesa de pago pendiente
      const todayPromise = promises.find(
        (p) => p.customerId === customer.id && p.status === 'PENDIENTE'
      );

      // Progreso de amortización (Savings Goal pattern del Figma)
      const totalInstallmentsCount =
        activeLoan.installmentCount || customerInstallments.length || 1;
      const paidInstallmentsCount = customerInstallments.filter(
        (i) => i.status === 'PAGADA' || i.status === 'ADELANTADA' || i.pendingAmount === 0
      ).length;
      const remainingBalance = customerInstallments.reduce(
        (sum, i) => sum + i.pendingAmount,
        0
      );
      const totalPaidAmount = Math.max(0, activeLoan.totalAgreed - remainingBalance);
      const amortizationRatio =
        activeLoan.totalAgreed > 0
          ? Math.min(1, Math.max(0, totalPaidAmount / activeLoan.totalAgreed))
          : 0;
      const amortizationPercentage = Math.round(amortizationRatio * 100);

      // Próxima cuota pendiente para saber con exactitud el día de cobro
      const nextPendingInstallment = customerInstallments.find(
        (i) => i.pendingAmount > 0
      );

      // Estados para filtros y píldoras semánticas (borderRadius: 9999)
      const isCreatedToday =
        activeLoan.startDate === todayStr &&
        (!todayInstallment || todayInstallment.dueDate > todayStr);

      const hasPaymentRecordToday = payments && payments.length > 0
        ? payments.some(
            (p) =>
              p.customerId === customer.id &&
              p.status !== 'ANNULLED' &&
              p.createdAt?.startsWith(todayStr)
          )
        : false;

      const isPaidToday =
        hasPaymentRecordToday ||
        todayInstallment?.status === 'PAGADA' ||
        todayInstallment?.status === 'ADELANTADA' ||
        (todayInstallment ? todayInstallment.pendingAmount === 0 : false);

      const todayNonPayment = nonPaymentVisits.find(
        (v) => v.customerId === customer.id && v.date === todayStr
      );
      const hasNonPaymentToday = !!todayNonPayment;

      // El cliente ya fue gestionado hoy (cobrado o novedad de no-pago registrada)
      const isHandledToday = isPaidToday || hasNonPaymentToday;

      const isOverdue = delinquency.hasDelinquency;
      const hasPromise = !!todayPromise;
      const isDueToday =
        !isCreatedToday &&
        ((!!todayInstallment &&
          todayInstallment.pendingAmount > 0 &&
          (todayInstallment.status === 'PENDIENTE' || todayInstallment.status === 'PARCIAL')) ||
          (activeLoan.frequency === 'DAILY' && !!nextPendingInstallment && !isPaidToday));
      const isUpToDate = !isOverdue;

      // Total sugerido a cobrar hoy
      const currentInstallmentForToday = isCreatedToday
        ? undefined
        : todayInstallment || (activeLoan.frequency === 'DAILY' ? nextPendingInstallment : undefined);
      const expectedToday = isCreatedToday
        ? 0
        : currentInstallmentForToday
        ? currentInstallmentForToday.pendingAmount + delinquency.overdueAmount
        : delinquency.overdueAmount > 0
        ? delinquency.overdueAmount
        : activeLoan.installmentAmount;

      let dueDateDisplay = '';
      if (isPaidToday) {
        dueDateDisplay = '✓ Pagado hoy';
      } else if (isCreatedToday) {
        dueDateDisplay = 'CRÉDITO NUEVO (1ª cuota mañana)';
      } else if (todayInstallment && todayInstallment.dueDate === todayStr) {
        dueDateDisplay = 'Cobro: Hoy';
      } else if (activeLoan.frequency === 'DAILY' && nextPendingInstallment) {
        dueDateDisplay = 'Cobro: Hoy';
      } else if (isOverdue) {
        const oldestOverdue = customerInstallments.find(
          (i) => i.pendingAmount > 0 && i.dueDate < todayStr
        );
        dueDateDisplay = oldestOverdue
          ? `Venció: ${formatDateLabel(oldestOverdue.dueDate)}`
          : 'En mora';
      } else if (nextPendingInstallment) {
        dueDateDisplay = `Toca: ${formatDateLabel(nextPendingInstallment.dueDate)}`;
      } else if (activeLoan.frequency === 'FIXED_DATE' && activeLoan.fixedDueDate) {
        dueDateDisplay = `Vence: ${formatDateLabel(activeLoan.fixedDueDate)}`;
      } else {
        dueDateDisplay = 'Al día';
      }

      return {
        customer,
        activeLoan,
        customerInstallments,
        todayInstallment,
        delinquency,
        todayPromise,
        totalInstallmentsCount,
        paidInstallmentsCount,
        remainingBalance,
        totalPaidAmount,
        amortizationRatio,
        amortizationPercentage,
        isCreatedToday,
        isPaidToday,
        hasPaymentRecordToday,
        todayNonPayment,
        hasNonPaymentToday,
        isHandledToday,
        isOverdue,
        hasPromise,
        isDueToday,
        isUpToDate,
        expectedToday,
        dueDateDisplay,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Conteos dinámicos para los Filter Chips (los ya gestionados no inflan 'Cobrar Hoy')
  const counts = {
    TODOS: customerCardsData.length,
    COBRAR_HOY: customerCardsData.filter((i) => !i.isHandledToday && (i.isDueToday || i.isOverdue)).length,
    MORA: customerCardsData.filter((i) => !i.isHandledToday && i.isOverdue).length,
    AL_DIA: customerCardsData.filter((i) => !i.isHandledToday && i.isUpToDate).length,
    PAGADOS: customerCardsData.filter((i) => i.isHandledToday).length,
    PROMESAS: customerCardsData.filter((i) => i.hasPromise).length,
  };

  const freqCounts = {
    ALL: customerCardsData.length,
    DAILY: customerCardsData.filter((i) => (i.activeLoan.frequency || 'DAILY') === 'DAILY').length,
    WEEKLY: customerCardsData.filter((i) => i.activeLoan.frequency === 'WEEKLY').length,
    BIWEEKLY: customerCardsData.filter((i) => i.activeLoan.frequency === 'BIWEEKLY').length,
    MONTHLY: customerCardsData.filter((i) => i.activeLoan.frequency === 'MONTHLY').length,
  };

  // Filtrado combinado (Estado + Modalidad de Pago + Buscador + Ordenamiento)
  const filteredCards = customerCardsData
    .filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.customer.fullName.toLowerCase().includes(q);
        const matchDoc = item.customer.documentNumber.includes(q);
        const matchBiz = item.customer.businessName?.toLowerCase().includes(q);
        const matchNeighborhood = item.customer.neighborhood.toLowerCase().includes(q);
        if (!matchName && !matchDoc && !matchBiz && !matchNeighborhood) return false;
      }

      if (frequencyFilter !== 'ALL') {
        const f = item.activeLoan.frequency || 'DAILY';
        if (f !== frequencyFilter) return false;
      }

      if (activeFilter === 'COBRAR_HOY') return !item.isHandledToday && (item.isDueToday || item.isOverdue);
      if (activeFilter === 'MORA') return !item.isHandledToday && item.isOverdue;
      if (activeFilter === 'AL_DIA') return !item.isHandledToday && item.isUpToDate;
      if (activeFilter === 'PAGADOS') return item.isHandledToday;
      if (activeFilter === 'PROMESAS') return item.hasPromise;

      return true;
    })
    .sort((a, b) => {
      // 1. REGLA CLAVE DE HOJA DE RUTA:
      // Si el cobrador no está filtrando expresamente por 'PAGADOS',
      // los clientes ya gestionados/cobrados hoy pasan automáticamente a lo último de la lista.
      if (activeFilter !== 'PAGADOS') {
        if (a.isHandledToday !== b.isHandledToday) {
          return a.isHandledToday ? 1 : -1;
        }
      }
      // 2. Secuencia exacta fijada por el cobrador (#1, #2, #3...)
      const orderA = a.customer.orderIndex ?? 9999;
      const orderB = b.customer.orderIndex ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      return a.customer.fullName.localeCompare(b.customer.fullName);
    });

  const firstPendingItem =
    customerCardsData.find((c) => !c.isHandledToday && (c.isDueToday || c.isOverdue)) ||
    customerCardsData.find((c) => !c.isHandledToday) ||
    customerCardsData[0];

  const handleQuickPayFirstPending = () => {
    if (firstPendingItem) {
      onSelectCustomerToPay(firstPendingItem.customer, firstPendingItem.activeLoan);
    } else {
      Alert.alert('Sin cobros pendientes', 'Todos los clientes de la ruta están al día.');
    }
  };

  const filterChips: Array<{ key: FilterType; label: string; count: number }> = [
    { key: 'COBRAR_HOY', label: 'Cobrar Hoy', count: counts.COBRAR_HOY },
    { key: 'MORA', label: 'En Mora', count: counts.MORA },
    { key: 'TODOS', label: 'Todos', count: counts.TODOS },
    { key: 'AL_DIA', label: 'Al Día', count: counts.AL_DIA },
    { key: 'PAGADOS', label: 'Gestionados', count: counts.PAGADOS },
    { key: 'PROMESAS', label: 'Promesas', count: counts.PROMESAS },
  ];

  const frequencyChips: Array<{
    key: 'ALL' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
    label: string;
    count: number;
  }> = [
    { key: 'ALL', label: 'Todos', count: freqCounts.ALL },
    { key: 'DAILY', label: 'Diarios', count: freqCounts.DAILY },
    { key: 'WEEKLY', label: 'Semanales', count: freqCounts.WEEKLY },
    { key: 'BIWEEKLY', label: 'Quincenales', count: freqCounts.BIWEEKLY },
    { key: 'MONTHLY', label: 'Mensuales', count: freqCounts.MONTHLY },
  ];

  if (viewMode === 'DASHBOARD') {
    const priorityItems = customerCardsData
      .filter((c) => !c.isHandledToday && (c.isDueToday || c.isOverdue))
      .slice(0, 5);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. HERO FINTECH LIMPIO: COBRO PLENO */}
        <View style={styles.cleanHeroCard}>
          <View style={styles.cleanHeroTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.cleanHeroLabel}>COBRADO HOY</Text>
              <TouchableOpacity onPress={togglePrivacy} style={styles.cleanEyeBtn} activeOpacity={0.7}>
                {privacyMode ? (
                  <EyeOff size={11} color="#94A3B8" />
                ) : (
                  <Eye size={11} color="#94A3B8" />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.cleanPercentPill}>
              <TrendingUp size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
              <Text style={styles.cleanPercentText}>{metrics.progressPercentage}%</Text>
            </View>
          </View>

          <View style={styles.cleanAmountRow}>
            <Text style={styles.cleanMainAmount} numberOfLines={1} adjustsFontSizeToFit>
              {maskIfPrivate(metrics.collectedToday)}
            </Text>
            <Text style={styles.cleanGoalText}>
              de {maskIfPrivate(metrics.expectedDailyGoal)} • {metrics.visitedCustomersCount}/{metrics.expectedCustomersCount} cobrados
            </Text>
          </View>

          <View style={styles.cleanProgressTrack}>
            <View
              style={[
                styles.cleanProgressFill,
                { width: `${Math.min(100, Math.max(4, metrics.progressPercentage))}%` },
              ]}
            />
          </View>

          {isAdminMode && (
            <TouchableOpacity
              style={styles.cleanHeroFooterLink}
              activeOpacity={0.7}
              onPress={onOpenSettlement}
            >
              <Text style={styles.cleanHeroFooterText}>
                Caja actual: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{maskIfPrivate(metrics.cashAvailableInHand)}</Text>
                {metrics.salidasCount > 0 ? ` • ${metrics.salidasCount} salidas` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={styles.cleanHeroLinkAction}>Caja Admin</Text>
                <ChevronRight size={13} color="#38BDF8" />
              </View>
            </TouchableOpacity>
          )}

          {!isAdminMode && onOpenDailyReport && (
            <View style={styles.cleanHeroFooterLink}>
              <TouchableOpacity
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                activeOpacity={0.7}
                onPress={onOpenDailyReport}
              >
                <Text style={styles.cleanHeroFooterText}>
                  Cobrado hoy: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{maskIfPrivate(metrics.collectedToday)}</Text>
                  {metrics.salidasCount > 0 ? ` • ${metrics.salidasCount} salidas` : ''}
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {onOpenExpense && officeConfig.allowCollectorExpenses !== false && (
                  <TouchableOpacity
                    style={styles.heroExpensePill}
                    activeOpacity={0.7}
                    onPress={onOpenExpense}
                  >
                    <Fuel size={11} color="#ea580c" />
                    <Text style={styles.heroExpensePillText}>+ Gasto</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                  activeOpacity={0.7}
                  onPress={onOpenDailyReport}
                >
                  <Text style={styles.cleanHeroLinkAction}>📊 Cuadre</Text>
                  <ChevronRight size={13} color="#38BDF8" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 1.1 PILARES FINANCIEROS (ADMIN) */}
        {isAdminMode && (
          <View style={styles.financialTrioCard}>
            <View style={styles.financialTrioItem}>
              <Text style={styles.financialTrioLabel}>ADMINISTRATIVO</Text>
              <Text style={styles.financialTrioValue} numberOfLines={1}>
                {maskIfPrivate(metrics.totalAdministrativeCapital || (metrics.activeCapitalInStreet + metrics.cashAvailableInHand))}
              </Text>
              <Text style={styles.financialTrioHint}>Préstamos + Intereses</Text>
            </View>

            <View style={styles.financialTrioDivider} />

            <View style={styles.financialTrioItem}>
              <Text style={styles.financialTrioLabel}>CARTERA (DEUDA)</Text>
              <Text style={styles.financialTrioValue} numberOfLines={1}>
                {maskIfPrivate(metrics.activeCapitalInStreet)}
              </Text>
              <Text style={styles.financialTrioHint}>En la calle</Text>
            </View>

            <View style={styles.financialTrioDivider} />

            <View style={styles.financialTrioItem}>
              <Text style={styles.financialTrioLabel}>BASE DISPONIBLE</Text>
              <Text style={[styles.financialTrioValue, { color: '#0284c7' }]} numberOfLines={1}>
                {maskIfPrivate(metrics.cashAvailableInHand)}
              </Text>
              <Text style={styles.financialTrioHint}>Para prestar</Text>
            </View>
          </View>
        )}

        {/* 2. ACCIONES RÁPIDAS (FAVORITOS DE RUTA) */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.fintechSectionTitle}>Acciones Rápidas</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.quickActionCard}
              activeOpacity={0.8}
              onPress={handleQuickPayFirstPending}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Zap size={18} color="#2563EB" />
              </View>
              <Text style={styles.quickActionTitle}>Siguiente</Text>
              <Text style={styles.quickActionSub} numberOfLines={1}>
                {firstPendingItem ? `#${firstPendingItem.customer.orderIndex || 1} ${firstPendingItem.customer.fullName.split(' ')[0]}` : 'Al día'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              activeOpacity={0.8}
              onPress={onOpenNewLoan}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: '#ECFDF5' }]}>
                <FilePlus2 size={18} color="#059669" />
              </View>
              <Text style={styles.quickActionTitle}>Nuevo Crédito</Text>
              <Text style={styles.quickActionSub} numberOfLines={1}>Desembolsar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionCard}
              activeOpacity={0.8}
              onPress={onNavigateToRoute || (() => setActiveFilter('PROMESAS'))}
            >
              <View style={[styles.quickActionIconWrap, { backgroundColor: '#FFFBEB' }]}>
                <Clock size={18} color="#D97706" />
                {counts.PROMESAS > 0 && (
                  <View style={styles.quickActionBadge}>
                    <Text style={styles.quickActionBadgeText}>{counts.PROMESAS}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.quickActionTitle}>Promesas</Text>
              <Text style={styles.quickActionSub} numberOfLines={1}>
                {counts.PROMESAS > 0 ? `${counts.PROMESAS} hoy` : 'Sin tareas'}
              </Text>
            </TouchableOpacity>

            {onOpenRecaudo && (
              <TouchableOpacity
                style={styles.quickActionCard}
                activeOpacity={0.8}
                onPress={onOpenRecaudo}
              >
                <View style={[styles.quickActionIconWrap, { backgroundColor: '#E0F2FE' }]}>
                  <Landmark size={18} color="#0284C7" />
                </View>
                <Text style={styles.quickActionTitle}>Recaudo</Text>
                <Text style={styles.quickActionSub} numberOfLines={1}>
                  Avance oficina
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 2.1 BENTO GRID DE RENDIMIENTO */}
        <View style={styles.bentoSection}>
          <View style={styles.bentoHeaderRow}>
            <Text style={styles.fintechSectionTitle}>Rendimiento de Ruta</Text>
            <Text style={styles.bentoHeaderDate}>{formatDateLabel(todayStr)}</Text>
          </View>
          <View style={styles.bentoGrid}>
            <View style={styles.bentoCard}>
              <Text style={styles.bentoLabel}>Cobrado hoy (Pleno)</Text>
              <Text style={styles.bentoValue}>{maskIfPrivate(metrics.collectedToday)}</Text>
              <Text style={styles.bentoSub}>
                {metrics.visitedCustomersCount}/{metrics.expectedCustomersCount} cobrados
              </Text>
            </View>

            <View style={styles.bentoCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.bentoLabel}>Meta del día</Text>
                <TrendingUp size={11} color="#059669" />
              </View>
              <Text style={styles.bentoValue}>{maskIfPrivate(metrics.expectedDailyGoal)}</Text>
              <Text style={styles.bentoSub}>{metrics.progressPercentage}% alcanzado</Text>
            </View>

            <View style={styles.bentoCard}>
              <Text style={styles.bentoLabel}>Cartera en calle</Text>
              <Text style={styles.bentoValue}>{maskIfPrivate(metrics.activeCapitalInStreet)}</Text>
              <Text style={styles.bentoSub}>Capital activo</Text>
            </View>

            <View style={styles.bentoCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={styles.bentoLabel}>En mora</Text>
                {metrics.overdueCustomersCount > 0 && <AlertCircle size={11} color="#DC2626" />}
              </View>
              <Text style={[styles.bentoValue, metrics.overdueCustomersCount > 0 && { color: '#DC2626' }]}>
                {metrics.overdueCustomersCount} clientes
              </Text>
              <Text style={styles.bentoSub}>
                {metrics.overdueCustomersCount > 0
                  ? `${maskIfPrivate(metrics.overdueTotalAmount)} vencido`
                  : 'Ruta al día'}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. BANNER PRINCIPAL: IR A LA HOJA DE RUTA */}
        {onNavigateToRoute && (
          <TouchableOpacity
            style={styles.openRouteBanner}
            activeOpacity={0.85}
            onPress={onNavigateToRoute}
          >
            <View style={styles.openRouteBannerLeft}>
              <View style={styles.openRouteIconWrap}>
                <MapPin size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.openRouteBannerTitle}>Ir a Hoja de Ruta de Cobro</Text>
                <Text style={styles.openRouteBannerSub}>
                  {customerCardsData.length} clientes en secuencia • {counts.COBRAR_HOY} a cobrar hoy
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color="#2563EB" />
          </TouchableOpacity>
        )}

        {/* 4. VISTA PREVIA: SIGUIENTES COBROS PRIORITARIOS */}
        {priorityItems.length > 0 && (
          <View style={styles.dashboardPrioritySection}>
            <View style={styles.bentoHeaderRow}>
              <Text style={styles.fintechSectionTitle}>Cobros Prioritarios de Hoy</Text>
              {onNavigateToRoute && (
                <TouchableOpacity onPress={onNavigateToRoute}>
                  <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>Ver todos ({customerCardsData.length})</Text>
                </TouchableOpacity>
              )}
            </View>
            {priorityItems.map((item) => (
              <TouchableOpacity
                key={item.customer.id}
                style={styles.chatListItem}
                activeOpacity={0.7}
                onPress={() => onSelectCustomerToPay(item.customer, item.activeLoan)}
              >
                <View style={styles.avatarWrapper}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>
                      {item.customer.fullName.substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.routeOrderBadge}>
                    <Text style={styles.routeOrderBadgeText}>
                      #{item.customer.orderIndex ?? '•'}
                    </Text>
                  </View>
                </View>

                <View style={styles.chatInfoCol}>
                  <View style={styles.chatInfoTop}>
                    <Text style={styles.chatName} numberOfLines={1}>
                      {item.customer.fullName}
                    </Text>
                    <Text style={styles.chatTime}>
                      {item.dueDateDisplay}
                    </Text>
                  </View>
                  <View style={styles.chatInfoBottom}>
                    <Text style={styles.chatSnippet} numberOfLines={1}>
                      {item.customer.neighborhood} • Cuota: {formatCOP(item.activeLoan.installmentAmount)}
                    </Text>
                    <View style={styles.quickPayPill}>
                      <Text style={styles.quickPayPillText}>Cobrar</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // MODO RUTA PURA: Enfocado 100% en la cobranza secuencial de la calle sin cuadros de métricas
  const pendingRouteCards = filteredCards.filter((item) => !item.isHandledToday);
  const completedRouteCards = filteredCards.filter((item) => item.isHandledToday);

  const renderPendingCard = (item: (typeof customerCardsData)[0], index: number) => {
    const { customer, activeLoan, delinquency, todayInstallment } = item;

    let badgeStyle = styles.badgeHoy;
    let badgeTextStyle = styles.badgeHoyText;
    let badgeLabel = 'Cobrar hoy';

    if (item.isCreatedToday) {
      badgeStyle = { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' };
      badgeTextStyle = { color: '#1D4ED8' };
      badgeLabel = 'CRÉDITO NUEVO';
    } else if (delinquency.hasDelinquency) {
      badgeStyle = styles.badgeMora;
      badgeTextStyle = styles.badgeMoraText;
      badgeLabel = `Mora (${delinquency.overdueDays}d)`;
    } else if (todayInstallment?.status === 'PARCIAL') {
      badgeStyle = styles.badgeParcial;
      badgeTextStyle = styles.badgeParcialText;
      badgeLabel = 'Abono parcial';
    } else if (!item.isDueToday) {
      badgeStyle = styles.badgeAlDia;
      badgeTextStyle = styles.badgeAlDiaText;
      badgeLabel = 'Al día';
    }

    const collectionAmount = item.expectedToday > 0 ? item.expectedToday : activeLoan.installmentAmount;

    return (
      <View key={customer.id} style={styles.cleanCustomerCard}>
        <TouchableOpacity
          style={styles.cardInfoTouch}
          activeOpacity={0.7}
          onPress={() => onViewCustomerDetail(customer)}
        >
          {/* FILA 1: PARADA + NOMBRE + FRECUENCIA + BADGE DE ESTADO */}
          <View style={styles.cardHeaderTopRow}>
            <View style={[styles.orderStopBadge, delinquency.hasDelinquency && styles.orderStopBadgeMora]}>
              <Text style={[styles.orderStopNumber, delinquency.hasDelinquency && { color: COLORS.danger }]}>
                #{customer.orderIndex ?? (index + 1)}
              </Text>
            </View>

            <View style={styles.nameAndFreqCol}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.customerNameBold} numberOfLines={1}>
                  {customer.fullName}
                </Text>
                <View style={styles.freqTagSoft}>
                  <Text style={styles.freqTagSoftText}>
                    {activeLoan.frequency === 'FIXED_DATE' && activeLoan.fixedDueDate
                      ? `F. Fija (${activeLoan.fixedDueDate.slice(5)})`
                      : getFrequencyLabel(activeLoan.frequency)}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.statusMiniBadge, badgeStyle]}>
              <Text style={[styles.statusMiniBadgeText, badgeTextStyle]}>{badgeLabel}</Text>
            </View>
          </View>

          {/* FILA 2: DIRECCIÓN Y SALDO RESTANTE (SIN NÚMEROS DUPLICADOS) */}
          <View style={styles.cardSubDetailsRow}>
            <Text style={styles.addressSubText} numberOfLines={1}>
              📍 {customer.neighborhood} • {customer.address}
            </Text>
            <Text style={styles.remainingBalanceText}>
              Saldo: <Text style={{ fontWeight: '800', color: COLORS.textPrimary }}>{maskIfPrivate(item.remainingBalance)}</Text>
            </Text>
          </View>
        </TouchableOpacity>

        {/* FILA 3: ACCIONES - BOTÓN DE COBRO CON MONTO INTEGRADO + 3 BOTONES COMPACTOS */}
        <View style={styles.cleanActionRow}>
          <TouchableOpacity
            style={styles.btnCobrarPrimario}
            activeOpacity={0.8}
            onPress={() => onSelectCustomerToPay(customer, activeLoan)}
          >
            <Text style={styles.btnCobrarPrimarioText}>
              💵 Cobrar {maskIfPrivate(collectionAmount)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAccionCircular, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
            activeOpacity={0.75}
            onPress={() => handleQuickCall(customer.phone)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Phone size={15} color="#1D4ED8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAccionCircular, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
            activeOpacity={0.75}
            onPress={() => handleQuickWhatsApp(customer, activeLoan, item.customerInstallments)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MessageCircle size={15} color="#15803D" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAccionCircular, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}
            activeOpacity={0.75}
            onPress={() => setOptionsCustomer(customer)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MoreVertical size={16} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderCompletedCard = (item: (typeof customerCardsData)[0], index: number) => {
    const { customer, activeLoan, todayNonPayment } = item;

    return (
      <View key={customer.id} style={styles.completedCustomerCard}>
        <View
          style={[
            styles.completedIconCircle,
            item.isPaidToday
              ? { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }
              : { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
          ]}
        >
          {item.isPaidToday ? (
            <CheckCircle size={15} color="#16A34A" />
          ) : (
            <AlertCircle size={15} color="#B45309" />
          )}
        </View>

        <TouchableOpacity
          style={styles.completedInfoCol}
          activeOpacity={0.7}
          onPress={() => onViewCustomerDetail(customer)}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.completedStopNum}>#{customer.orderIndex ?? (index + 1)}</Text>
            <Text style={styles.completedCustName} numberOfLines={1}>
              {customer.fullName}
            </Text>
          </View>
          <Text style={styles.completedSubDetail} numberOfLines={1}>
            {item.isPaidToday
              ? `✓ Cobrado hoy • Saldo restante: ${maskIfPrivate(item.remainingBalance)}`
              : `⚠️ Visita: ${todayNonPayment?.reasonLabel || 'No pago registrado'}`}
          </Text>
        </TouchableOpacity>

        <View style={styles.completedActionsCol}>
          <TouchableOpacity
            style={styles.btnAbonoExtra}
            activeOpacity={0.75}
            onPress={() => onSelectCustomerToPay(customer, activeLoan)}
          >
            <Text style={styles.btnAbonoExtraText}>+ Extra</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnCompletedOptions}
            activeOpacity={0.75}
            onPress={() => setOptionsCustomer(customer)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={15} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ENCABEZADO DE RUTA */}
      <View style={styles.routeHeaderBar}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.routeHeaderTitle}>Hoja de Ruta</Text>
            {isAdminMode && onOpenRouteSelector && (
              <TouchableOpacity
                style={styles.adminRouteBadge}
                activeOpacity={0.75}
                onPress={onOpenRouteSelector}
              >
                <MapPin size={11} color="#1D4ED8" />
                <Text style={styles.adminRouteBadgeText} numberOfLines={1}>
                  {activeRouteLabel || 'Cambiar Ruta'}
                </Text>
                <ChevronDown size={11} color="#1D4ED8" />
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.routeHeaderSub}>
            {customerCardsData.length} clientes • {counts.COBRAR_HOY} pendientes hoy
          </Text>
        </View>
        <View style={styles.routeHeaderBadgePill}>
          <Text style={styles.routeHeaderBadgeText}>{todayStr}</Text>
        </View>
      </View>

      {/* 1. BUSCADOR INTEGRADO CON SELECTOR DE ORDEN */}
      <View style={styles.searchAndSortRow}>
        <View style={styles.cleanSearchBox}>
          <Search size={14} color={COLORS.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.cleanSearchInput}
            placeholder="Buscar por cliente, cédula o barrio..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
              <X size={12} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.editRouteToggleBtn, isEditingRoute && styles.editRouteToggleBtnActive]}
          activeOpacity={0.7}
          onPress={isEditingRoute ? handleSaveRoute : handleStartEditRoute}
        >
          {isEditingRoute ? (
            <>
              <CheckCircle size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.saveRouteToggleText}>✓ Guardar</Text>
            </>
          ) : (
            <>
              <ListOrdered size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={styles.editRouteToggleText}>⚡ Ordenar Ruta</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Banner Informativo cuando está en Modo Editar Ruta */}
      {isEditingRoute && (
        <View style={[styles.editingRouteBanner, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.editingBannerIconCircle}>
                <ListOrdered size={14} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editingRouteBannerTitle}>Modo Ordenamiento Inteligente de Ruta</Text>
                <Text style={styles.editingRouteBannerSub}>
                  Usa ⬆️ ⬇️ para mover paradas o auto-ordena por prioridad de cobro
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.cancelEditBtn}
              onPress={handleCancelEditRoute}
            >
              <Text style={styles.cancelEditBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#eff6ff',
              borderWidth: 1,
              borderColor: '#93c5fd',
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 10,
            }}
            activeOpacity={0.75}
            onPress={handleAutoSortPriority}
          >
            <Zap size={14} color="#1d4ed8" style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#1d4ed8' }}>
              ⚡ Auto-Ordenar por Prioridad (1° Mora → 2° Cobrar Hoy → 3° Al Día)
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 4. BARRA DE FILTROS INTELIGENTE UNIFICADA (En 1 sola fila con scroll horizontal) */}
      {!isEditingRoute && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.cleanFilterScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
        >
          {/* Selector interactivo de Modalidad */}
          <TouchableOpacity
            style={[
              styles.unifiedFreqCycleBtn,
              frequencyFilter !== 'ALL' && styles.unifiedFreqCycleBtnActive,
            ]}
            activeOpacity={0.75}
            onPress={handleCycleFrequency}
          >
            <Zap size={11} color={frequencyFilter !== 'ALL' ? '#FFFFFF' : COLORS.primary} />
            <Text
              style={[
                styles.unifiedFreqCycleText,
                frequencyFilter !== 'ALL' && styles.unifiedFreqCycleTextActive,
              ]}
            >
              {frequencyFilter === 'ALL'
                ? 'Modalidad: Todas'
                : `${getFrequencyLabel(frequencyFilter)} (${freqCounts[frequencyFilter]})`}
            </Text>
            <ChevronDown size={11} color={frequencyFilter !== 'ALL' ? '#FFFFFF' : COLORS.primary} />
          </TouchableOpacity>

          <View style={styles.filterDividerVertical} />

          {/* Chips de Estado de Cobro */}
          {filterChips.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.cleanFilterChip, isActive && styles.cleanFilterChipActive]}
                onPress={() => setActiveFilter(chip.key)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.cleanFilterText,
                    isActive && styles.cleanFilterTextActive,
                  ]}
                >
                  {chip.label} ({chip.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* 6. TARJETAS DE PRÉSTAMO / RUTA DE COBRO (Modo Normal vs Modo Edición de Ruta) */}
      <View style={styles.cardsList}>
        {isEditingRoute ? (
          editingCustomers.map((customer, index) => {
            const activeLoan = loans.find(
              (l) => l.customerId === customer.id && l.status === 'ACTIVE'
            );
            const panResponder = createPanResponder(index);

            return (
              <View key={customer.id} style={styles.reorderCard}>
                {/* 1. Posición Secuencial Grande (#1, #2...) */}
                <View style={styles.reorderIndexBadge}>
                  <Text style={styles.reorderIndexText}>#{index + 1}</Text>
                </View>

                {/* 2. Información del Cliente */}
                <View style={styles.reorderInfoCol}>
                  <Text style={styles.reorderCustomerName} numberOfLines={1}>
                    {customer.fullName}
                  </Text>
                  <Text style={styles.reorderAddress} numberOfLines={1}>
                    📍 {customer.neighborhood} • {customer.address}
                  </Text>
                  <Text style={styles.reorderLoanInfo}>
                    {activeLoan
                      ? `Cuota ${formatCOP(activeLoan.installmentAmount)}`
                      : 'Sin crédito activo'}
                  </Text>
                </View>

                {/* 3. Controles Táctiles: Flechas Subir/Bajar y Manija de Desplazamiento con el Dedo */}
                <View style={styles.reorderActionsCol}>
                  <TouchableOpacity
                    style={[styles.reorderArrowBtn, index === 0 && styles.reorderArrowBtnDisabled]}
                    disabled={index === 0}
                    onPress={() => handleMoveUp(index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ArrowUp size={15} color={index === 0 ? '#CBD5E1' : COLORS.primary} />
                  </TouchableOpacity>

                  {/* Manija táctil para desplazar con el dedo */}
                  <View {...panResponder.panHandlers} style={styles.reorderGripHandle}>
                    <GripVertical size={16} color={COLORS.textSecondary} />
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.reorderArrowBtn,
                      index === editingCustomers.length - 1 && styles.reorderArrowBtnDisabled,
                    ]}
                    disabled={index === editingCustomers.length - 1}
                    onPress={() => handleMoveDown(index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ArrowDown
                      size={15}
                      color={index === editingCustomers.length - 1 ? '#CBD5E1' : COLORS.primary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        ) : filteredCards.length === 0 ? (
          <View style={styles.emptyState}>
            <Wallet size={32} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin resultados para este filtro</Text>
            <Text style={styles.emptyText}>
              Prueba cambiando el chip seleccionado o el texto de búsqueda.
            </Text>
          </View>
        ) : activeFilter === 'PAGADOS' ? (
          filteredCards.map((item, index) => renderCompletedCard(item, index))
        ) : activeFilter !== 'TODOS' ? (
          filteredCards.map((item, index) => renderPendingCard(item, index))
        ) : (
          <>
            {/* SECCIÓN 1: PARADAS PENDIENTES */}
            {pendingRouteCards.length > 0 && (
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderBadge}>
                  <MapPin size={13} color={COLORS.primary} />
                  <Text style={styles.sectionHeaderText}>Paradas Pendientes</Text>
                </View>
                <Text style={styles.sectionHeaderCount}>
                  {pendingRouteCards.length} {pendingRouteCards.length === 1 ? 'cliente' : 'clientes'}
                </Text>
              </View>
            )}

            {pendingRouteCards.map((item, index) => renderPendingCard(item, index))}

            {/* AVISO DE TODA LA RUTA COMPLETADA */}
            {pendingRouteCards.length === 0 && completedRouteCards.length > 0 && (
              <View style={styles.allDoneBanner}>
                <CheckCircle2 size={22} color="#16A34A" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.allDoneTitle}>¡Ruta al día completada!</Text>
                  <Text style={styles.allDoneSub}>
                    Has atendido todas las paradas programadas para hoy.
                  </Text>
                </View>
              </View>
            )}

            {/* SECCIÓN 2: CLIENTES YA GESTIONADOS / COBRADOS HOY (AL FINAL DE LA LISTA) */}
            {completedRouteCards.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity
                  style={styles.completedSectionHeader}
                  activeOpacity={0.75}
                  onPress={() => setCollapsedCompleted(!collapsedCompleted)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CheckCircle size={15} color="#16A34A" />
                    <Text style={styles.completedSectionTitle}>
                      Gestionados Hoy ({completedRouteCards.length})
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.completedToggleText}>
                      {collapsedCompleted ? 'Mostrar lista' : 'Ocultar'}
                    </Text>
                    <ChevronDown
                      size={15}
                      color={COLORS.primary}
                      style={collapsedCompleted ? { transform: [{ rotate: '-90deg' }] } : {}}
                    />
                  </View>
                </TouchableOpacity>

                {!collapsedCompleted &&
                  completedRouteCards.map((item, index) => renderCompletedCard(item, index))}
              </View>
            )}
          </>
        )}
      </View>

      {/* MODAL DE OPCIONES 360 DEL CLIENTE (Elimina la sobrecarga de 6 botones en cada tarjeta) */}
      <CustomerOptionsModal
        visible={!!optionsCustomer}
        customer={optionsCustomer}
        activeLoan={
          optionsCustomer
            ? loans.find((l) => l.customerId === optionsCustomer.id && l.status === 'ACTIVE') || null
            : null
        }
        onClose={() => setOptionsCustomer(null)}
        onViewDetail={(c) => onViewCustomerDetail(c)}
        onEditCustomer={(c) => onViewCustomerDetail(c)}
        onNewLoan={() => onOpenNewLoan()}
        onViewHistory={(c) => onViewCustomerDetail(c)}
        onPromiseLoan={(c, l) => onPromiseCustomer && onPromiseCustomer(c, l)}
        onNonPayment={(c, l) => onNonPaymentCustomer && onNonPaymentCustomer(c, l)}
        onRenewLoan={(c, l) => onRenewCustomer && onRenewCustomer(c, l)}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  scrollContent: {
    paddingBottom: 112, // Espacio amplio para el Floating Bottom Dock con FAB central
  },
  // 1. HERO FINTECH LIMPIO: COBRO PLENO (.cleanHeroCard)
  cleanHeroCard: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 16,
    backgroundColor: COLORS.dockBg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  cleanHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  cleanHeroLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  cleanEyeBtn: {
    padding: 3,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  cleanPercentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 9999,
  },
  cleanPercentText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  cleanAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 4,
  },
  cleanMainAmount: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cleanGoalText: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '600',
  },
  cleanProgressTrack: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 9999,
    overflow: 'hidden',
    marginBottom: 6,
  },
  cleanProgressFill: {
    height: '100%',
    backgroundColor: COLORS.heroBarFill,
    borderRadius: 9999,
  },
  cleanHeroFooterLink: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  cleanHeroFooterText: {
    color: '#CBD5E1',
    fontSize: 10.5,
    fontWeight: '600',
  },
  cleanHeroLinkAction: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  heroExpensePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(234, 88, 12, 0.18)',
    borderColor: 'rgba(234, 88, 12, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  heroExpensePillText: {
    color: '#FDBA74',
    fontSize: 10,
    fontWeight: '700',
  },

  // 1.1 PILARES FINANCIEROS DE LA RUTA (Audio 3)
  financialTrioCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  financialTrioItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  financialTrioLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  financialTrioValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  financialTrioHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 1,
  },
  financialTrioDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#e2e8f0',
  },

  // 2. BARRA DE ACCIÓN RÁPIDA LIMPIA & ORGANIZACIÓN DE RUTA

  // ACCIONES RÁPIDAS (FAVORITOS)
  quickActionsSection: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  fintechSectionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  quickActionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  quickActionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC2626',
    borderRadius: 9999,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  quickActionBadgeText: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  quickActionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  quickActionSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 2,
  },

  // BENTO GRID DE RENDIMIENTO
  bentoSection: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  bentoHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bentoHeaderDate: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bentoCard: {
    width: '48.5%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  bentoLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  bentoValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  bentoSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 3,
  },

  // BANNER DE ENLACE DIRECTO A LA RUTA
  openRouteBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  openRouteBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  openRouteIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openRouteBannerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  openRouteBannerSub: {
    fontSize: 11,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 2,
  },
  dashboardPrioritySection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  chatInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  chatName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  chatTime: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  chatInfoBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatSnippet: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  quickPayPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  quickPayPillText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
  },

  // ENCABEZADO DE LA HOJA DE RUTA
  routeHeaderBar: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.4,
  },
  routeHeaderSub: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  routeHeaderBadgePill: {
    backgroundColor: COLORS.dockBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  routeHeaderBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  // 3. BUSCADOR INTEGRADO CON ORDENAMIENTO
  searchAndSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  cleanSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  cleanSearchInput: {
    fontFamily: FONT_FAMILY,
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // 4. CHIPS DE FILTRO RÁPIDO (ESTADO)
  cleanFilterScroll: {
    marginBottom: 6,
  },
  cleanFilterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  cleanFilterChipActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  cleanFilterText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  cleanFilterTextActive: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // 5. SELECTOR DE MODALIDAD INTEGRADO EN LA BARRA DE FILTROS
  unifiedFreqCycleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
  },
  unifiedFreqCycleBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  unifiedFreqCycleText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
  },
  unifiedFreqCycleTextActive: {
    color: '#FFFFFF',
  },
  filterDividerVertical: {
    width: 1,
    height: 18,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 2,
  },

  // AVATAR WRAPPER & ROUTE ORDER BADGE
  avatarWrapper: {
    position: 'relative',
  },
  routeOrderBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: COLORS.dockBg,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  routeOrderBadgeText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '900',
  },

  // 6. LISTA DE CLIENTES EN RUTA (Estilo limpio, compacto y con jerarquía clara)
  cardsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  routeCustomerCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
    overflow: 'hidden',
  },
  chatListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cardActionsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  cardPrimaryPayBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPrimaryPayBtnPaid: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  cardPrimaryPayBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardSecondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  cardSecondaryBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
  },
  chatBalanceHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  avatarMora: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  avatarPagado: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  avatarMoraDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: COLORS.danger,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  chatInfoCol: {
    flex: 1,
    marginLeft: 10,
    marginRight: 8,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  frequencyTag: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  frequencyTagText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  chatAddressLine: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 0,
  },
  chatRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  chatAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chatAmountAndDateCol: {
    alignItems: 'flex-end',
  },
  chatExpectedAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  chatDueDateText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 1,
  },

  // PÍLDORAS DE ESTADO SEMÁNTICAS (Diseño discreto y disciplinado)
  pastelBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pastelBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  badgeAlDia: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
  },
  badgeAlDiaText: {
    color: COLORS.textSecondary,
  },
  badgeHoy: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
  },
  badgeHoyText: {
    color: COLORS.textSecondary,
  },
  badgePagado: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  badgePagadoText: {
    color: COLORS.success,
  },
  badgeMora: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  badgeMoraText: {
    color: COLORS.danger,
  },
  badgeParcial: {
    backgroundColor: COLORS.surfaceSoft,
    borderColor: COLORS.border,
  },
  badgeParcialText: {
    color: COLORS.textSecondary,
  },

  emptyState: {
    padding: 36,
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  emptyTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },

  // ESTILOS PARA EDICIÓN Y REORDENAMIENTO DE RUTA
  editRouteToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
  },
  editRouteToggleBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  editRouteToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  saveRouteToggleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editingRouteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  editingBannerIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editingRouteBannerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  editingRouteBannerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3B82F6',
    marginTop: 1,
  },
  cancelEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelEditBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  reorderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  reorderIndexBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderIndexText: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primary,
  },
  reorderInfoCol: {
    flex: 1,
    gap: 2,
  },
  reorderCustomerName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  reorderAddress: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  reorderLoanInfo: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  reorderActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reorderArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderArrowBtnDisabled: {
    opacity: 0.35,
    backgroundColor: '#F1F5F9',
  },
  reorderGripHandle: {
    width: 28,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  // SECCIONES DE PARADAS PENDIENTES & COMPLETADAS
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
  },
  sectionHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHeaderCount: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  allDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 14,
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 10,
  },
  allDoneTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#15803D',
  },
  allDoneSub: {
    fontSize: 11.5,
    color: '#166534',
    marginTop: 2,
  },
  completedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  completedSectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  completedToggleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.primary,
  },
  // TARJETA LIMPIA DE CLIENTE PENDIENTE (ANTI-SATURACIÓN)
  cleanCustomerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardInfoTouch: {
    paddingBottom: 6,
  },
  cardHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  orderStopBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderStopBadgeMora: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  orderStopNumber: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  nameAndFreqCol: {
    flex: 1,
  },
  customerNameBold: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  freqTagSoft: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  freqTagSoftText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  cardSubDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  addressSubText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  remainingBalanceText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    flexShrink: 0,
  },
  statusMiniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusMiniBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  // FILA ÚNICA DE ACCIONES LIMPIAS (1 BOTÓN PRINCIPAL + 3 ÍCONOS)
  cleanActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  btnCobrarPrimario: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCobrarPrimarioText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  btnAccionCircular: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // TARJETA CONDENSADA DE CLIENTE COMPLETADO / GESTIONADO
  completedCustomerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 6,
    gap: 10,
  },
  completedIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedInfoCol: {
    flex: 1,
  },
  completedStopNum: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  completedCustName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  completedSubDetail: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  completedActionsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  btnAbonoExtra: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnAbonoExtraText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  btnCompletedOptions: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminRouteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
    maxWidth: 160,
  },
  adminRouteBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
});
