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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  Calculator,
  RefreshCw,
  Settings,
  Phone,
  MessageCircle,
  MoreVertical,
  Shield,
  Bell,
  Info,
  Calendar,
  Users,
  Receipt,
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
  onOpenSettlement?: () => void;
  onOpenDailyReport?: () => void;
  onNonPaymentCustomer?: (customer: Customer, loan: Loan) => void;
  onPromiseCustomer?: (customer: Customer, loan: Loan) => void;
  onRenewCustomer?: (customer: Customer, loan: Loan) => void;
  isAdminMode?: boolean;
  currentUserId?: string;
  viewMode?: 'DASHBOARD' | 'ROUTE';
  onNavigateToRoute?: () => void;
  activeRouteLabel?: string;
  onOpenRouteSelector?: () => void;
  /** Filtro de estado con el que abre la hoja de ruta (ej. 'PROMESAS' desde la campana). */
  initialFilter?: FilterType;
  onOpenCapitalConfig?: () => void;
  onDeleteCustomer?: (customer: Customer, force?: boolean) => void;
  onEditCustomer?: (customer: Customer) => void;
  onNewLoanForCustomer?: (customer: Customer) => void;
  onFixedDateLoan?: (customer: Customer) => void;
  onViewHistory?: (customer: Customer) => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
  onNavigateToCustomers?: () => void;
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
  currentUserId,
  viewMode = 'ROUTE',
  onNavigateToRoute,
  activeRouteLabel,
  onOpenRouteSelector,
  initialFilter = 'TODOS',
  onOpenCapitalConfig,
  onDeleteCustomer,
  onEditCustomer,
  onNewLoanForCustomer,
  onFixedDateLoan,
  onViewHistory,
  onOpenNotifications,
  unreadNotificationsCount,
  onNavigateToCustomers,
}) => {
  const insets = useSafeAreaInsets();
  const dockScrollClearance = insets.bottom + 140;
  const [activeFilter, setActiveFilter] = useState<FilterType>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');

  // Modo anti-miradas (ocultar montos): aislado por sesión de usuario y rol (nunca compartido globalmente)
  const privacyStorageKey = currentUserId
    ? `@prestamos_privacy_mode_${currentUserId}`
    : (isAdminMode ? '@prestamos_privacy_mode_admin' : '@prestamos_privacy_mode_collector');

  const [privacyMode, setPrivacyMode] = useState(true);
  const [frequencyFilter, setFrequencyFilter] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('ALL');
  const [optionsCustomer, setOptionsCustomer] = useState<Customer | null>(null);
  const [collapsedCompleted, setCollapsedCompleted] = useState<boolean>(false);
  const officeConfig = localStore.getOfficeConfig();

  useEffect(() => {
    safeStorage.getItem(privacyStorageKey).then((val) => {
      if (val !== null) {
        setPrivacyMode(val === 'true');
      } else {
        setPrivacyMode(true);
      }
    });
  }, [privacyStorageKey]);

  const togglePrivacy = () => {
    const next = !privacyMode;
    setPrivacyMode(next);
    safeStorage.setItem(privacyStorageKey, String(next));
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
        const matchName = item.customer.fullName?.toLowerCase().includes(q) ?? false;
        const matchDoc = item.customer.documentNumber?.toLowerCase().includes(q) ?? false;
        const matchBiz = item.customer.businessName?.toLowerCase().includes(q) ?? false;
        const matchNeighborhood = item.customer.neighborhood?.toLowerCase().includes(q) ?? false;
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

  const renderAdminGeneralDashboard = () => {
    const allRoutes = localStore.getRoutes();
    const allUsers = localStore.getUsers();
    const allLoans = localStore.getLoans();
    const activeLoans = allLoans.filter((l) => l.status === 'ACTIVE');

    const totalCollectedGlobal = payments
      .filter((p) => p.status === 'COMPLETED' && p.createdAt?.startsWith(todayStr))
      .reduce((sum, p) => sum + p.amountReceived, 0);

    const totalOverdueAmount = metrics.overdueTotalAmount || 0;
    const totalOverdueCount = metrics.overdueCustomersCount || 0;

    // Proporción matemática de la barra de progreso de patrimonio
    const totalAdmin = metrics.totalAdministrativeCapital || 0;
    const streetCapital = metrics.activeCapitalInStreet || 0;
    const officeCapital = metrics.cashAvailableInHand || 0;
    const streetRatio = totalAdmin > 0
      ? Math.min(100, Math.max(0, Math.round((streetCapital / totalAdmin) * 100)))
      : 0;
    const officeRatio = Math.max(0, 100 - streetRatio);

    // Escalado responsivo y seguro de tipografía para cifras financieras extremas
    const heroFontSize = totalAdmin >= 1_000_000_000 ? 25 : totalAdmin >= 100_000_000 ? 28 : 34;
    const getSubColFontSize = (val: number) => (val >= 1_000_000_000 ? 14 : val >= 100_000_000 ? 15.5 : 18);
    const getTileFontSize = (val: number) => (val >= 1_000_000_000 ? 14 : val >= 100_000_000 ? 15.5 : 19);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: dockScrollClearance }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. HEADER COMPACTO: BRAND + CENTRO DE CONTROL + NOTIFICACIONES */}
        <View style={styles.adminHeaderRow}>
          {/* Logo Cuadra */}
          <View style={styles.adminBrandBox}>
            <View style={styles.adminBrandLogoBg}>
              <Shield size={20} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <Text style={styles.adminBrandTitle}>Cuadra</Text>
          </View>

          {/* Centro de Control / Administrador General */}
          <View style={styles.adminHeaderCenter}>
            <Text style={styles.adminMainTitle} numberOfLines={1}>Centro de Control</Text>
            <Text style={styles.adminSubtitle} numberOfLines={1}>Administrador General</Text>
          </View>

          {/* Campana de Notificaciones */}
          <TouchableOpacity
            style={styles.adminBellBtn}
            activeOpacity={0.7}
            onPress={onOpenNotifications}
          >
            <Bell size={22} color={COLORS.textPrimary} strokeWidth={1.8} />
            {(unreadNotificationsCount || 0) > 0 && (
              <View style={styles.adminBellBadgeDot} />
            )}
          </TouchableOpacity>
        </View>

        {/* 2. FILA DE FILTRO DISCRETO: SELECTOR DE RUTA + EN LÍNEA */}
        <View style={styles.adminFilterBarContainer}>
          {onOpenRouteSelector ? (
            <TouchableOpacity
              style={styles.adminRouteFilterPill}
              activeOpacity={0.8}
              onPress={onOpenRouteSelector}
            >
              <MapPin size={14} color={COLORS.textPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.adminRouteFilterText} numberOfLines={1}>
                {activeRouteLabel || 'Todas las rutas'}
              </Text>
              <ChevronDown size={14} color={COLORS.textSecondary} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          ) : (
            <View style={styles.adminRouteFilterPill}>
              <MapPin size={14} color={COLORS.textPrimary} style={{ marginRight: 6 }} />
              <Text style={styles.adminRouteFilterText}>Todas las rutas</Text>
            </View>
          )}

          <View style={styles.adminLiveStatusPill}>
            <View style={styles.adminLiveDot} />
            <Text style={styles.adminLiveStatusText}>En línea</Text>
          </View>
        </View>

        {/* 3. HÉROE: PATRIMONIO OPERATIVO (UNA SOLA TARJETA BLANCA LIMPIA) */}
        <View style={styles.patrimonioHeroCard}>
          <View style={styles.patrimonioTopRow}>
            <View style={styles.patrimonioIconBox}>
              <Wallet size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.patrimonioCardTitle}>Patrimonio operativo</Text>
                <TouchableOpacity onPress={togglePrivacy} style={styles.cleanEyeBtn} activeOpacity={0.7}>
                  {privacyMode ? (
                    <EyeOff size={13} color="#94A3B8" />
                  ) : (
                    <Eye size={13} color="#94A3B8" />
                  )}
                </TouchableOpacity>
                {onOpenCapitalConfig && (
                  <TouchableOpacity onPress={onOpenCapitalConfig} activeOpacity={0.7}>
                    <Info size={15} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.patrimonioCardSubtitle}>Capital Administrativo Total</Text>
            </View>
          </View>

          {/* Gran Cifra Display */}
          <Text style={[styles.patrimonioHeroAmount, { fontSize: heroFontSize }]} numberOfLines={1} adjustsFontSizeToFit>
            {maskIfPrivate(totalAdmin)}
          </Text>

          <View style={styles.patrimonioDivider} />

          {/* Columnas: Cartera en Calle vs Base en Oficina */}
          <View style={styles.patrimonioColsRow}>
            <View style={styles.patrimonioCol}>
              <Text style={styles.patrimonioColLabel}>Cartera en calle</Text>
              <Text style={[styles.patrimonioColValue, { fontSize: getSubColFontSize(streetCapital) }]} numberOfLines={1} adjustsFontSizeToFit>
                {maskIfPrivate(streetCapital)}
              </Text>
            </View>

            <View style={styles.patrimonioVerticalDivider} />

            <View style={styles.patrimonioCol}>
              <Text style={styles.patrimonioColLabel}>Base en oficina</Text>
              <Text style={[styles.patrimonioColValue, { fontSize: getSubColFontSize(officeCapital) }]} numberOfLines={1} adjustsFontSizeToFit>
                {maskIfPrivate(officeCapital)}
              </Text>
            </View>
          </View>

          {/* Barra de progreso de proporción */}
          <View style={styles.patrimonioProgressTrack}>
            <View style={[styles.patrimonioProgressFill, { width: `${streetRatio}%` }]} />
          </View>

          <View style={styles.patrimonioProgressLabelsRow}>
            <Text style={styles.patrimonioProgressCaption}>{streetRatio}% en calle</Text>
            <Text style={styles.patrimonioProgressCaption}>{officeRatio}% en oficina</Text>
          </View>
        </View>

        {/* 4. RESUMEN DE HOY (GRID 2x2 MINIMALISTA) */}
        <View style={styles.adminSectionHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.adminSectionTitleText}>Resumen de hoy</Text>
            <TouchableOpacity onPress={togglePrivacy} style={styles.cleanEyeBtn} activeOpacity={0.7}>
              {privacyMode ? (
                <EyeOff size={11} color="#94A3B8" />
              ) : (
                <Eye size={11} color="#94A3B8" />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.datePickerPill}>
            <Calendar size={13} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
            <Text style={styles.datePickerText}>Hoy</Text>
            <ChevronDown size={13} color={COLORS.textSecondary} style={{ marginLeft: 3 }} />
          </View>
        </View>

        <View style={styles.resumenGrid}>
          {/* Fila 1 */}
          <View style={styles.resumenGridRow}>
            {/* Tile 1: Recaudado hoy */}
            <View style={[styles.resumenTile, styles.resumenTileGreen]}>
              <View style={styles.resumenTileIconGreen}>
                <Wallet size={16} color="#16A34A" />
              </View>
              <Text style={styles.resumenTileLabel}>Recaudado hoy</Text>
              <Text
                style={[
                  styles.resumenTileAmount,
                  {
                    color: '#15803D',
                    fontSize: getTileFontSize(totalCollectedGlobal > 0 ? totalCollectedGlobal : metrics.collectedToday),
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {maskIfPrivate(totalCollectedGlobal > 0 ? totalCollectedGlobal : metrics.collectedToday)}
              </Text>
              <Text style={styles.resumenTileSubGreen}>
                {metrics.expectedDailyGoal > 0
                  ? `↑ ${metrics.progressPercentage}% vs. meta`
                  : '● Al día'}
              </Text>
            </View>

            {/* Tile 2: En mora */}
            <View style={[
              styles.resumenTile,
              totalOverdueAmount > 0 ? styles.resumenTileRed : styles.resumenTileNeutral
            ]}>
              <View style={totalOverdueAmount > 0 ? styles.resumenTileIconRed : styles.resumenTileIconNeutral}>
                {totalOverdueAmount > 0 ? (
                  <AlertCircle size={16} color="#DC2626" />
                ) : (
                  <CheckCircle2 size={16} color="#16A34A" />
                )}
              </View>
              <Text style={styles.resumenTileLabel}>En mora</Text>
              <Text
                style={[
                  styles.resumenTileAmount,
                  {
                    color: totalOverdueAmount > 0 ? '#DC2626' : COLORS.textPrimary,
                    fontSize: getTileFontSize(totalOverdueAmount),
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {maskIfPrivate(totalOverdueAmount)}
              </Text>
              <Text style={totalOverdueAmount > 0 ? styles.resumenTileSubRed : styles.resumenTileSubNeutral}>
                {totalOverdueAmount > 0
                  ? `${totalOverdueCount} cliente(s) en mora`
                  : '● Al día'}
              </Text>
            </View>
          </View>

          {/* Fila 2 */}
          <View style={styles.resumenGridRow}>
            {/* Tile 3: Rutas activas */}
            <View style={[styles.resumenTile, styles.resumenTileBlue]}>
              <View style={styles.resumenTileIconBlue}>
                <MapPin size={16} color="#0284C7" />
              </View>
              <Text style={styles.resumenTileLabel}>Rutas activas</Text>
              <Text style={[styles.resumenTileAmount, { color: '#0284C7' }]} numberOfLines={1} adjustsFontSizeToFit>
                {allRoutes.length} / {allRoutes.length}
              </Text>
              <Text style={styles.resumenTileSubBlue}>100% en operación</Text>
            </View>

            {/* Tile 4: Liquidaciones */}
            <View style={[styles.resumenTile, styles.resumenTilePurple]}>
              <View style={styles.resumenTileIconPurple}>
                <Receipt size={16} color="#7C3AED" />
              </View>
              <Text style={styles.resumenTileLabel}>Liquidaciones</Text>
              <Text style={[styles.resumenTileAmount, { color: '#7C3AED' }]} numberOfLines={1} adjustsFontSizeToFit>
                0 pendientes
              </Text>
              <Text style={styles.resumenTileSubPurple}>Sin novedades</Text>
            </View>
          </View>
        </View>

        {/* 5. ACCIONES RÁPIDAS (FILA DE 4 BOTONES CON ICONO CIRCULAR + LABEL) */}
        <View style={styles.adminSectionHeaderRow}>
          <Text style={styles.adminSectionTitleText}>Acciones rápidas</Text>
        </View>

        <View style={styles.adminQuickActionsRow}>
          {/* Acción 1: Supervisar rutas */}
          <TouchableOpacity
            style={styles.adminQuickActionCard}
            activeOpacity={0.8}
            onPress={onNavigateToRoute ? onNavigateToRoute : onOpenRouteSelector}
          >
            <View style={[styles.adminQuickActionCircle, { backgroundColor: '#2563EB' }]}>
              <MapPin size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.adminQuickActionText}>Supervisar{'\n'}rutas</Text>
          </TouchableOpacity>

          {/* Acción 2: Liquidar caja */}
          <TouchableOpacity
            style={styles.adminQuickActionCard}
            activeOpacity={0.8}
            onPress={onOpenSettlement ? onOpenSettlement : onOpenDailyReport}
          >
            <View style={[styles.adminQuickActionCircle, { backgroundColor: '#16A34A' }]}>
              <Calculator size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.adminQuickActionText}>Liquidar{'\n'}caja</Text>
          </TouchableOpacity>

          {/* Acción 3: Gestionar cartera */}
          <TouchableOpacity
            style={styles.adminQuickActionCard}
            activeOpacity={0.8}
            onPress={onNavigateToCustomers}
          >
            <View style={[styles.adminQuickActionCircle, { backgroundColor: '#7C3AED' }]}>
              <Users size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.adminQuickActionText}>Gestionar{'\n'}cartera</Text>
          </TouchableOpacity>

          {/* Acción 4: Ver reportes */}
          <TouchableOpacity
            style={styles.adminQuickActionCard}
            activeOpacity={0.8}
            onPress={onOpenDailyReport}
          >
            <View style={[styles.adminQuickActionCircle, { backgroundColor: '#0284C7' }]}>
              <TrendingUp size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.adminQuickActionText}>Ver{'\n'}reportes</Text>
          </TouchableOpacity>
        </View>

        {/* 6. RUTAS Y COBRADORES (FILAS MINIMALISTAS CON DIVISORES) */}
        <View style={styles.adminSectionHeaderRow}>
          <Text style={styles.adminSectionTitleText}>Rutas y cobradores</Text>
          {onOpenRouteSelector && (
            <TouchableOpacity onPress={onOpenRouteSelector} activeOpacity={0.7}>
              <Text style={styles.seeAllRoutesLink}>Ver todas ›</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.routesListWrapper}>
          {allRoutes.length === 0 ? (
            <View style={styles.routesEmptyCard}>
              <MapPin size={24} color="#94A3B8" />
              <Text style={styles.routesEmptyTitle}>No hay rutas registradas</Text>
              <Text style={styles.routesEmptySubtitle}>
                Las rutas creadas aparecerán aquí con su estado y cartera activa.
              </Text>
            </View>
          ) : (
            allRoutes.map((rt, index) => {
              const collectorUser = allUsers.find((u) => u.id === rt.collectorId);
              const rtLoans = loans.filter((l) => l.routeId === rt.id && l.status === 'ACTIVE');
              const rtLoanIds = new Set(rtLoans.map((l) => l.id));
              const rtStreetCapital = installments
                .filter((i) => rtLoanIds.has(i.loanId))
                .reduce((sum, i) => sum + (i.pendingAmount || 0), 0);

              return (
                <TouchableOpacity
                  key={rt.id}
                  style={styles.routeListItem}
                  activeOpacity={0.75}
                  onPress={onNavigateToRoute ? onNavigateToRoute : onOpenRouteSelector}
                >
                  {/* Badge R1, R2, etc. */}
                  <View style={styles.routeBadgeSquare}>
                    <Text style={styles.routeBadgeSquareText}>R{index + 1}</Text>
                  </View>

                  {/* Info de la ruta */}
                  <View style={styles.routeItemInfo}>
                    <Text style={styles.routeItemTitle} numberOfLines={1}>{rt.name}</Text>
                    <Text style={styles.routeItemSubtitle} numberOfLines={1}>
                      {collectorUser?.name || 'Cobrador 1'}
                    </Text>
                  </View>

                  {/* Estado y Monto */}
                  <View style={styles.routeItemRight}>
                    <View style={styles.routeActivePill}>
                      <View style={styles.routeActiveDot} />
                      <Text style={styles.routeActivePillText}>Activa</Text>
                    </View>
                    <Text style={styles.routeItemAmount} numberOfLines={1}>
                      {formatCOP(rtStreetCapital > 0 ? rtStreetCapital : metrics.activeCapitalInStreet)}
                    </Text>
                    <ChevronRight size={15} color={COLORS.textSecondary} />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    );
  };

  const renderCollectorDashboard = () => (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: dockScrollClearance }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ENCABEZADO EXCLUSIVO PARA COBRADOR */}
      <View style={styles.collectorHeaderCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Text style={styles.collectorRoleBadge}>🛵 RUTA DE COBRADOR</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>EN CALLE</Text>
          </View>
        </View>
        <Text style={styles.collectorHeaderTitle}>Mi Ruta de Cobro de Hoy</Text>
        <Text style={styles.collectorHeaderSub}>
          {activeRouteLabel || 'Ruta activa'} • {customerCardsData.length} paradas asignadas
        </Text>
      </View>

      {/* 1. HERO FINTECH LIMPIO: COBRO PLENO DE LA RUTA */}
      <View style={styles.cleanHeroCard}>
        <View style={styles.cleanHeroTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.cleanHeroLabel}>COBRADO HOY EN MI RUTA</Text>
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

        {onOpenDailyReport && (
          <View style={styles.cleanHeroFooterLink}>
            <TouchableOpacity
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              activeOpacity={0.7}
              onPress={onOpenDailyReport}
            >
              <Text style={styles.cleanHeroFooterText}>
                {metrics.salidasCount > 0 ? (
                  <>
                    Salidas: <Text style={{ fontWeight: '800', color: '#F8FAFC' }}>{maskIfPrivate(metrics.disbursedToday || 0)}</Text>
                    {` • ${metrics.salidasCount} salida${metrics.salidasCount > 1 ? 's' : ''}`}
                  </>
                ) : (
                  <Text style={{ color: '#94A3B8' }}>Ruta al día • Sin salidas pendientes</Text>
                )}
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

      {/* TARJETA DE CAPITAL ASIGNADO A MI RUTA (Exclusivo Administrador: oculto para cobrador en calle) */}
      {isAdminMode && (
        <View style={styles.collectorCapitalCard}>
          <View style={styles.collectorCapitalHeader}>
            <Text style={styles.collectorCapitalTag}>💼 CAPITAL ASIGNADO A MI RUTA</Text>
            <Text style={styles.collectorCapitalFormula}>Admin = Cartera + Base</Text>
          </View>

          <View style={styles.collectorCapitalGrid}>
            <View style={styles.collectorCapitalItem}>
              <Text style={styles.collectorCapitalItemLabel}>📈 Administrativo</Text>
              <Text style={styles.collectorCapitalItemVal} numberOfLines={1} adjustsFontSizeToFit>
                {maskIfPrivate(metrics.totalAdministrativeCapital)}
              </Text>
            </View>

            <View style={styles.collectorCapitalDivider} />

            <View style={styles.collectorCapitalItem}>
              <Text style={styles.collectorCapitalItemLabel}>👥 Cartera en Calle</Text>
              <Text style={[styles.collectorCapitalItemVal, { color: '#0F766E' }]} numberOfLines={1} adjustsFontSizeToFit>
                {maskIfPrivate(metrics.activeCapitalInStreet)}
              </Text>
            </View>

            <View style={styles.collectorCapitalDivider} />

            <View style={styles.collectorCapitalItem}>
              <Text style={styles.collectorCapitalItemLabel}>💵 Base en Mano</Text>
              <Text style={[styles.collectorCapitalItemVal, { color: '#1D4ED8' }]} numberOfLines={1} adjustsFontSizeToFit>
                {maskIfPrivate(metrics.cashAvailableInHand)}
              </Text>
            </View>
          </View>

          <View style={styles.collectorCapitalFooter}>
            <Text style={styles.collectorCapitalFooterText}>
              💡 Base disponible para prestar hoy: <Text style={{ fontWeight: '800', color: '#1D4ED8' }}>{maskIfPrivate(metrics.cashAvailableInHand)}</Text>
            </Text>
          </View>
        </View>
      )}

      {/* 2. ACCIONES RÁPIDAS DEL COBRADOR EN UNA SOLA LÍNEA (BOTONES PEQUEÑOS, 2 PALABRAS, CON EMOJI) */}
      <View style={styles.adminActionsSingleLineSection}>
        <Text style={styles.adminSectionTitle}>ACCIONES DE RUTA</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.adminActionsScrollRow}
        >
          {firstPendingItem && (
            <TouchableOpacity
              style={[styles.adminSmallBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
              activeOpacity={0.75}
              onPress={handleQuickPayFirstPending}
            >
              <Text style={styles.adminSmallBtnText}>💵 Registrar Cobro</Text>
            </TouchableOpacity>
          )}

          {onOpenExpense && (
            <TouchableOpacity
              style={[styles.adminSmallBtn, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}
              activeOpacity={0.75}
              onPress={onOpenExpense}
            >
              <Text style={styles.adminSmallBtnText}>⛽ Gasto Ruta</Text>
            </TouchableOpacity>
          )}

          {onNavigateToRoute && (
            <TouchableOpacity
              style={[styles.adminSmallBtn, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
              activeOpacity={0.75}
              onPress={onNavigateToRoute}
            >
              <Text style={styles.adminSmallBtnText}>📍 Ver Ruta</Text>
            </TouchableOpacity>
          )}

          {onOpenDailyReport && (
            <TouchableOpacity
              style={[styles.adminSmallBtn, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}
              activeOpacity={0.75}
              onPress={onOpenDailyReport}
            >
              <Text style={styles.adminSmallBtnText}>📊 Mi Cuadre</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.adminSmallBtn, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}
            activeOpacity={0.75}
            onPress={onOpenNewLoan}
          >
            <Text style={styles.adminSmallBtnText}>➕ Nuevo Crédito</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 3. SIGUIENTE COBRO EN CALLE */}
      {firstPendingItem && (
        <TouchableOpacity
          style={styles.nextCollectionCard}
          activeOpacity={0.82}
          onPress={handleQuickPayFirstPending}
        >
          <View style={styles.nextCollectionTopRow}>
            <Text style={styles.nextCollectionEyebrow}>SIGUIENTE COBRO EN CALLE</Text>
            <Text style={styles.nextCollectionOrder}>PARADA #{firstPendingItem.customer.orderIndex || 1}</Text>
          </View>
          <View style={styles.nextCollectionBody}>
            <View style={styles.nextCollectionAvatar}>
              <Text style={styles.nextCollectionAvatarText}>{getInitials(firstPendingItem.customer.fullName)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nextCollectionName} numberOfLines={1}>{firstPendingItem.customer.fullName}</Text>
              <Text style={styles.nextCollectionMeta} numberOfLines={1}>
                {firstPendingItem.customer.neighborhood} · {firstPendingItem.dueDateDisplay}
              </Text>
            </View>
            <View style={styles.nextCollectionAction}>
              <Text style={styles.nextCollectionActionText}>Cobrar</Text>
              <ChevronRight size={15} color="#FFFFFF" />
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* 4. Señales de avance de la jornada */}
      <View style={styles.routeSignalsRow}>
        <View style={styles.routeSignal}>
          <Text style={styles.routeSignalLabel}>AVANCE HOY</Text>
          <Text style={styles.routeSignalValue}>{metrics.visitedCustomersCount}/{metrics.expectedCustomersCount}</Text>
          <Text style={styles.routeSignalHint}>clientes visitados</Text>
        </View>
        <View style={styles.routeSignalDivider} />
        <View style={styles.routeSignal}>
          <Text style={styles.routeSignalLabel}>MORA EN RUTA</Text>
          <Text style={[styles.routeSignalValue, metrics.overdueCustomersCount > 0 && { color: COLORS.danger }]}>
            {metrics.overdueCustomersCount}
          </Text>
          <Text style={styles.routeSignalHint}>
            {metrics.overdueCustomersCount > 0 ? 'clientes vencidos' : 'ruta al día'}
          </Text>
        </View>
      </View>

      {/* 5. BANNER: IR A LA HOJA DE RUTA */}
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
    </ScrollView>
  );

  if (viewMode === 'DASHBOARD') {
    if (isAdminMode) {
      return renderAdminGeneralDashboard();
    }
    return renderCollectorDashboard();
  }

  // MODO RUTA PURA: Enfocado 100% en la cobranza secuencial de la calle sin cuadros de métricas
  const pendingRouteCards = filteredCards.filter((item) => !item.isHandledToday);
  const completedRouteCards = filteredCards.filter((item) => item.isHandledToday);

  const renderPendingCard = (item: (typeof customerCardsData)[0], index: number) => {
    const { customer, activeLoan, delinquency, todayInstallment } = item;

    let badgeStyle = styles.badgeHoy;
    let badgeTextStyle = styles.badgeHoyText;
    let badgeLabel = '● Cobrar hoy';

    if (item.isCreatedToday) {
      badgeStyle = { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryBorder };
      badgeTextStyle = { color: COLORS.primary };
      badgeLabel = '★ Crédito nuevo';
    } else if (delinquency.hasDelinquency) {
      badgeStyle = styles.badgeMora;
      badgeTextStyle = styles.badgeMoraText;
      badgeLabel = `! Mora (${delinquency.overdueDays}d)`;
    } else if (item.todayPromise) {
      badgeStyle = { backgroundColor: COLORS.warningLight, borderColor: COLORS.warningBorder };
      badgeTextStyle = { color: COLORS.warning };
      badgeLabel = '⏳ Promesa';
    } else if (todayInstallment?.status === 'PARCIAL') {
      badgeStyle = styles.badgeParcial;
      badgeTextStyle = styles.badgeParcialText;
      badgeLabel = '◐ Abono parcial';
    } else if (!item.isDueToday) {
      badgeStyle = styles.badgeAlDia;
      badgeTextStyle = styles.badgeAlDiaText;
      badgeLabel = '✓ Al día';
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

        {/* FILA 3: ACCIONES - BOTÓN PRIMARIO ERGONÓMICO + ACCIONES SECUNDARIAS DISCRETAS */}
        <View style={styles.cleanActionRow}>
          <TouchableOpacity
            style={styles.btnCobrarPrimario}
            activeOpacity={0.85}
            onPress={() => onSelectCustomerToPay(customer, activeLoan)}
          >
            <Text style={styles.btnCobrarPrimarioText}>
              Registrar pago • {maskIfPrivate(collectionAmount)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAccionCircular, { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryBorder }]}
            activeOpacity={0.75}
            onPress={() => handleQuickCall(customer.phone)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Phone size={15} color={COLORS.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAccionCircular, { backgroundColor: COLORS.successLight, borderColor: COLORS.successBorder }]}
            activeOpacity={0.75}
            onPress={() => handleQuickWhatsApp(customer, activeLoan, item.customerInstallments)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MessageCircle size={15} color={COLORS.success} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnAccionCircular, { backgroundColor: COLORS.surfaceSoft, borderColor: COLORS.border }]}
            activeOpacity={0.75}
            onPress={() => setOptionsCustomer(customer)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <MoreVertical size={16} color={COLORS.textSecondary} />
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
      contentContainerStyle={[styles.scrollContent, { paddingBottom: dockScrollClearance }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ENCABEZADO PULIDO Y NÍTIDO DE HOJA DE RUTA */}
      <View style={styles.routeHeaderSection}>
        {/* FILA 1: TÍTULO Y BOTONES DE ACCIÓN */}
        <View style={styles.routeHeaderTopRow}>
          <Text style={styles.routeHeaderTitle} numberOfLines={1}>
            Hoja de Ruta
          </Text>

          <View style={styles.routeHeaderActionsRow}>
            <TouchableOpacity
              style={styles.btnNuevoCreditoHeader}
              activeOpacity={0.75}
              onPress={onOpenNewLoan}
            >
              <FilePlus2 size={13} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={styles.btnNuevoCreditoHeaderText}>
                + Crédito
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.btnOrdenarHeader,
                isEditingRoute && styles.btnOrdenarHeaderActive,
              ]}
              activeOpacity={0.7}
              onPress={isEditingRoute ? handleSaveRoute : handleStartEditRoute}
            >
              {isEditingRoute ? (
                <>
                  <CheckCircle size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.btnOrdenarHeaderTextActive}>✓ Guardar</Text>
                </>
              ) : (
                <>
                  <ListOrdered size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.btnOrdenarHeaderText}>Ordenar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* FILA 2: BADGES SEMÁNTICOS CON RESPIRACIÓN Y NITIDEZ */}
        <View style={styles.routeHeaderBadgesRow}>
          <View style={styles.routeBadgePillPending}>
            <View style={styles.badgePendingDot} />
            <Text style={styles.routeBadgeTextPending}>
              {counts.COBRAR_HOY} pendientes
            </Text>
          </View>

          <View style={styles.routeBadgePillDone}>
            <CheckCircle2 size={12} color="#16A34A" style={{ marginRight: 4 }} />
            <Text style={styles.routeBadgeTextDone}>
              {counts.PAGADOS} listos
            </Text>
          </View>

          {counts.MORA > 0 && (
            <View style={styles.routeBadgePillMora}>
              <AlertCircle size={12} color="#DC2626" style={{ marginRight: 4 }} />
              <Text style={styles.routeBadgeTextMora}>
                {counts.MORA} en mora
              </Text>
            </View>
          )}

          {counts.PROMESAS > 0 && (
            <View style={styles.routeBadgePillPromise}>
              <Clock size={12} color="#D97706" style={{ marginRight: 4 }} />
              <Text style={styles.routeBadgeTextPromise}>
                {counts.PROMESAS} promesas
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* BARRA RESUMEN OPERATIVO DE RUTA (Cobrado vs Meta + Liquidar) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: COLORS.bgSecondary,
          marginHorizontal: 16,
          marginBottom: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.textSecondary }}>
            COBRADO HOY:{' '}
            <Text style={{ color: COLORS.primary, fontSize: 12.5 }}>
              {maskIfPrivate(metrics.collectedToday)}
            </Text>{' '}
            / Meta {maskIfPrivate(metrics.expectedDailyGoal)} ({metrics.progressPercentage}%)
          </Text>
        </View>
        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: COLORS.primaryLight,
            borderWidth: 1,
            borderColor: COLORS.primaryBorder,
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 8,
          }}
          activeOpacity={0.75}
          onPress={isAdminMode ? onOpenSettlement : onOpenDailyReport}
        >
          {isAdminMode ? (
            <>
              <Landmark size={11} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary }}>
                🏛️ Liquidar Rutas
              </Text>
            </>
          ) : (
            <>
              <Calculator size={11} color={COLORS.primary} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 10.5, fontWeight: '800', color: COLORS.primary }}>
                📊 Mi Cuadre
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* 1. BUSCADOR COMPACTO */}
      <View style={[styles.searchAndSortRow, { marginTop: 2, marginBottom: 8 }]}>
        <View style={styles.cleanSearchBox}>
          <Search size={14} color={COLORS.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.cleanSearchInput}
            placeholder="Buscar cliente, cédula, negocio o barrio..."
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

            {/* AVISO DE RUTA LIMPIA / SIN CLIENTES CARGADOS */}
            {pendingRouteCards.length === 0 && completedRouteCards.length === 0 && (
              <View style={styles.emptyState}>
                <MapPin size={34} color={COLORS.primary} style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>Hoja de Ruta Lista para Operar</Text>
                <Text style={[styles.emptyText, { textAlign: 'center', marginBottom: 16 }]}>
                  {searchQuery || activeFilter !== 'TODOS'
                    ? 'No se encontraron clientes para el filtro actual.'
                    : 'Aún no hay clientes registrados en esta ruta. Puedes registrar tu primer cliente o recibir la ruta desde la oficina.'}
                </Text>
                <TouchableOpacity
                  style={{
                    backgroundColor: COLORS.primary,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                  onPress={onOpenNewLoan}
                >
                  <FilePlus2 size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                    + Registrar Cliente / Crédito
                  </Text>
                </TouchableOpacity>
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
        isAdmin={isAdminMode}
        onClose={() => setOptionsCustomer(null)}
        onViewDetail={(c) => onViewCustomerDetail(c)}
        onEditCustomer={(c) => (onEditCustomer ? onEditCustomer(c) : onViewCustomerDetail(c))}
        onNewLoan={(c) => (onNewLoanForCustomer ? onNewLoanForCustomer(c) : onOpenNewLoan())}
        onFixedDateLoan={(c) => (onFixedDateLoan ? onFixedDateLoan(c) : onOpenNewLoan())}
        onViewHistory={(c) => (onViewHistory ? onViewHistory(c) : onViewCustomerDetail(c))}
        onPromiseLoan={(c, l) => onPromiseCustomer && onPromiseCustomer(c, l)}
        onNonPayment={(c, l) => onNonPaymentCustomer && onNonPaymentCustomer(c, l)}
        onRenewLoan={(c, l) => onRenewCustomer && onRenewCustomer(c, l)}
        onDeleteCustomer={isAdminMode ? onDeleteCustomer : undefined}
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
    marginTop: 2,
    marginBottom: 16,
    minHeight: 158,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
    borderRadius: 22,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  cleanPercentText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cleanGoalText: {
    color: '#94A3B8',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  cleanProgressTrack: {
    height: 4,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '600',
  },
  cleanHeroLinkAction: {
    color: '#38BDF8',
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
  },

  nextCollectionCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  nextCollectionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nextCollectionEyebrow: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textMuted,
    letterSpacing: 0.7,
  },
  nextCollectionOrder: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
  },
  nextCollectionBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nextCollectionAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextCollectionAvatarText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.primary,
  },
  nextCollectionName: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  nextCollectionMeta: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  nextCollectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.dockBg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  nextCollectionActionText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  financialTrioValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  financialTrioHint: {
    fontFamily: FONT_FAMILY,
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
    paddingLeft: 20,
    marginBottom: 28,
  },
  fintechSectionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.65,
    marginBottom: 14,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 20,
  },
  quickActionCard: {
    width: 112,
    minHeight: 126,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  quickActionIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
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

  routeSignalsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    gap: 10,
    backgroundColor: 'transparent',
  },
  routeSignal: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 98,
    borderRadius: 20,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  routeSignalDivider: {
    display: 'none',
  },
  routeSignalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: COLORS.textMuted,
  },
  routeSignalValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 25,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  routeSignalHint: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 1,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  openRouteBannerSub: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  chatTime: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
  },

  // ENCABEZADO DE LA HOJA DE RUTA (DISEÑO PULIDO Y NÍTIDO)
  routeHeaderSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  routeHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  routeHeaderTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 21,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
    flexShrink: 1,
    marginRight: 8,
  },
  routeHeaderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnNuevoCreditoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  btnNuevoCreditoHeaderText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  btnOrdenarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  btnOrdenarHeaderActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  btnOrdenarHeaderText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  btnOrdenarHeaderTextActive: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  routeHeaderBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  routeBadgePillPending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 9999,
    gap: 5,
  },
  badgePendingDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  routeBadgeTextPending: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#1E40AF',
  },
  routeBadgePillDone: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 9999,
  },
  routeBadgeTextDone: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  routeBadgePillMora: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 9999,
  },
  routeBadgeTextMora: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
  },
  routeBadgePillPromise: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 9999,
  },
  routeBadgeTextPromise: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
  },
  chatBalanceHint: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  saveRouteToggleText: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '900',
    color: '#1E3A8A',
  },
  editingRouteBannerSub: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primary,
  },
  reorderInfoCol: {
    flex: 1,
    gap: 2,
  },
  reorderCustomerName: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  reorderAddress: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  reorderLoanInfo: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHeaderCount: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#15803D',
  },
  allDoneSub: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
  },
  completedToggleText: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  nameAndFreqCol: {
    flex: 1,
  },
  customerNameBold: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  remainingBalanceText: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    minHeight: 44,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCobrarPrimarioText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  btnAccionCircular: {
    width: 42,
    height: 42,
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  completedCustName: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  completedSubDetail: {
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
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
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  // ==========================================
  // FINTECH V2 — CENTRO DE CONTROL GERENCIAL (MOCKUP CUADRA)
  // ==========================================
  adminHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  adminBrandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminBrandLogoBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1E3A8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBrandTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  adminHeaderCenter: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 12,
  },
  adminMainTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  adminSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 1,
  },
  adminBellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  adminBellBadgeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  adminFilterBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  adminRouteFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    maxWidth: '70%',
  },
  adminRouteFilterText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  adminLiveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adminLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#16A34A',
  },
  adminLiveStatusText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
  },

  // HÉROE: PATRIMONIO OPERATIVO
  patrimonioHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EAEE',
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 26,
  },
  patrimonioTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patrimonioIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patrimonioCardTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  patrimonioCardSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  patrimonioHeroAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.8,
    marginTop: 14,
    fontVariant: ['tabular-nums'],
  },
  patrimonioDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 16,
  },
  patrimonioColsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  patrimonioCol: {
    flex: 1,
  },
  patrimonioColLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
  },
  patrimonioColValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  patrimonioVerticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 12,
  },
  patrimonioProgressTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 16,
    overflow: 'hidden',
  },
  patrimonioProgressFill: {
    height: 6,
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  patrimonioProgressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  patrimonioProgressCaption: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748B',
  },
  // SECCIONES GENERALES
  adminSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  adminSectionTitleText: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  datePickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  datePickerText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  // RESUMEN DE HOY GRID 2x2
  resumenGrid: {
    marginHorizontal: 20,
    gap: 12,
    marginBottom: 26,
  },
  resumenGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  resumenTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  resumenTileGreen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  resumenTileRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  resumenTileNeutral: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
  },
  resumenTileBlue: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  resumenTilePurple: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  resumenTileIconGreen: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resumenTileIconRed: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resumenTileIconNeutral: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resumenTileIconBlue: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resumenTileIconPurple: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resumenTileLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  resumenTileAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '700',
    marginTop: 4,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  resumenTileSubGreen: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#15803D',
    fontWeight: '600',
  },
  resumenTileSubRed: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  resumenTileSubNeutral: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  resumenTileSubBlue: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
  },
  resumenTileSubPurple: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
  },
  // ACCIONES RÁPIDAS (ADMIN FINTECH V2)
  adminQuickActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    gap: 8,
    marginBottom: 28,
  },
  adminQuickActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingVertical: 12,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  adminQuickActionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  adminQuickActionText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 15,
    letterSpacing: -0.2,
  },

  // COMPATIBILIDAD CON RUTA DE COBRADOR
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  liveText: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: '#16A34A',
  },
  adminActionsSingleLineSection: {
    marginHorizontal: 0,
    marginBottom: 14,
  },
  adminSectionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  adminActionsScrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  adminSmallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminSmallBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  // RUTAS Y COBRADORES
  seeAllRoutesLink: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  routesListWrapper: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  routesEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routesEmptyTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 10,
    marginBottom: 4,
  },
  routesEmptySubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  routeListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EAEE',
    padding: 14,
    marginBottom: 10,
  },
  routeBadgeSquare: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  routeBadgeSquareText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  routeItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  routeItemTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  routeItemSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  routeItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  routeActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
  },
  routeActivePillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#16A34A',
  },
  routeItemAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  collectorHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  collectorRoleBadge: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    color: '#0D9488',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#99F6E4',
    letterSpacing: 0.5,
  },
  collectorHeaderTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
  },
  collectorHeaderSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  capitalTriadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  capitalTriadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  capitalTriadIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capitalTriadTag: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '900',
    color: '#1D4ED8',
    letterSpacing: 0.4,
  },
  capitalAdjustBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EAEE',
  },
  capitalAdjustBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  capitalTriadFormulaText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 10,
  },
  capitalTriadColsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capitalTriadColBox: {
    flex: 1,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  capitalTriadColLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 2,
  },
  capitalTriadColAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '900',
  },
  capitalTriadColSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 8.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  capitalTriadSignBox: {
    paddingHorizontal: 3,
  },
  capitalTriadSignText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '900',
    color: '#94A3B8',
  },
  collectorCapitalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  collectorCapitalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  collectorCapitalTag: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '900',
    color: '#0D9488',
    letterSpacing: 0.4,
  },
  collectorCapitalFormula: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  collectorCapitalGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  collectorCapitalItem: {
    flex: 1,
    alignItems: 'center',
  },
  collectorCapitalItemLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 2,
  },
  collectorCapitalItemVal: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  collectorCapitalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  collectorCapitalFooter: {
    marginTop: 8,
    alignItems: 'center',
  },
  collectorCapitalFooterText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    color: '#64748B',
  },
});
