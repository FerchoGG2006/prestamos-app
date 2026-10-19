import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Linking,
  Alert,
} from 'react-native';
import {
  Customer,
  Loan,
  Installment,
  PaymentPromise,
  DailyRouteMetrics,
  NonPaymentVisit,
} from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { COLORS } from '../../theme/colors';
import { safeStorage } from '../../../infrastructure/storage/local-store';
import {
  Search,
  CheckCircle,
  Clock,
  ChevronRight,
  RefreshCw,
  Calendar,
  PlusCircle,
  UserPlus,
  FilePlus2,
  Landmark,
  MessageCircle,
  TrendingUp,
  Wallet,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Eye,
  EyeOff,
  ArrowUpDown,
  X,
  Fuel,
  MapPin,
  AlertCircle,
  ListOrdered,
} from 'lucide-react-native';

type FilterType = 'TODOS' | 'COBRAR_HOY' | 'MORA' | 'AL_DIA' | 'PAGADOS' | 'PROMESAS';
type SortMode = 'ORDEN_RUTA' | 'MORA' | 'BARRIO';

interface TodayCollectionsViewProps {
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  promises: PaymentPromise[];
  metrics: DailyRouteMetrics;
  todayStr: string;
  nonPaymentVisits?: NonPaymentVisit[];
  onSelectCustomerToPay: (customer: Customer, loan: Loan) => void;
  onSelectCustomerToRenew: (customer: Customer, loan: Loan) => void;
  onSelectCustomerPromise: (customer: Customer, loan: Loan) => void;
  onSelectCustomerNonPayment?: (customer: Customer, loan: Loan) => void;
  onViewCustomerDetail: (customer: Customer) => void;
  onOpenNewCustomer: () => void;
  onOpenNewLoan: () => void;
  onOpenExpense?: () => void;
  onOpenSettlement: () => void;
  onOpenRouteOrganizer?: () => void;
  onOpenRecaudo?: () => void;
  isAdminMode?: boolean;
}

export const TodayCollectionsView: React.FC<TodayCollectionsViewProps> = ({
  customers,
  loans,
  installments,
  promises,
  metrics,
  todayStr,
  nonPaymentVisits = [],
  onSelectCustomerToPay,
  onSelectCustomerToRenew,
  onSelectCustomerPromise,
  onSelectCustomerNonPayment,
  onViewCustomerDetail,
  onOpenNewCustomer,
  onOpenNewLoan,
  onOpenExpense,
  onOpenSettlement,
  onOpenRouteOrganizer,
  onOpenRecaudo,
  isAdminMode = false,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [privacyMode, setPrivacyMode] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('ORDEN_RUTA');
  const [frequencyFilter, setFrequencyFilter] = useState<'ALL' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('ALL');

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

      // Estados para filtros y píldoras semánticas (borderRadius: 9999)
      const isPaidToday =
        todayInstallment?.status === 'PAGADA' ||
        todayInstallment?.status === 'ADELANTADA' ||
        (todayInstallment ? todayInstallment.pendingAmount === 0 : false);
      const isOverdue = delinquency.hasDelinquency;
      const hasPromise = !!todayPromise;
      const isDueToday =
        !!todayInstallment &&
        todayInstallment.pendingAmount > 0 &&
        (todayInstallment.status === 'PENDIENTE' || todayInstallment.status === 'PARCIAL');
      const isUpToDate = !isOverdue;

      // Total sugerido a cobrar hoy
      const expectedToday = todayInstallment
        ? todayInstallment.pendingAmount + delinquency.overdueAmount
        : delinquency.overdueAmount > 0
        ? delinquency.overdueAmount
        : activeLoan.installmentAmount;

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
        isPaidToday,
        isOverdue,
        hasPromise,
        isDueToday,
        isUpToDate,
        expectedToday,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Conteos dinámicos para los Filter Chips
  const counts = {
    TODOS: customerCardsData.length,
    COBRAR_HOY: customerCardsData.filter((i) => i.isDueToday || i.isOverdue).length,
    MORA: customerCardsData.filter((i) => i.isOverdue).length,
    AL_DIA: customerCardsData.filter((i) => i.isUpToDate).length,
    PAGADOS: customerCardsData.filter((i) => i.isPaidToday).length,
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

      if (activeFilter === 'COBRAR_HOY') return item.isDueToday || item.isOverdue;
      if (activeFilter === 'MORA') return item.isOverdue;
      if (activeFilter === 'AL_DIA') return item.isUpToDate;
      if (activeFilter === 'PAGADOS') return item.isPaidToday;
      if (activeFilter === 'PROMESAS') return item.hasPromise;

      return true;
    })
    .sort((a, b) => {
      if (sortMode === 'MORA') {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        return b.delinquency.overdueDays - a.delinquency.overdueDays;
      }
      if (sortMode === 'BARRIO') {
        const bA = a.customer.neighborhood || '';
        const bB = b.customer.neighborhood || '';
        const cmp = bA.localeCompare(bB);
        if (cmp !== 0) return cmp;
        return (a.customer.orderIndex ?? 999) - (b.customer.orderIndex ?? 999);
      }
      // 'ORDEN_RUTA' por defecto: secuencia de paradas de la ruta (#1, #2, #3...)
      const orderA = a.customer.orderIndex ?? 999;
      const orderB = b.customer.orderIndex ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.customer.fullName.localeCompare(b.customer.fullName);
    });

  const getFrequencyLabel = (freq?: string): string => {
    switch (freq) {
      case 'WEEKLY':
        return 'Semanal';
      case 'BIWEEKLY':
        return 'Quincenal';
      case 'MONTHLY':
        return 'Mensual';
      case 'FIXED_DATE':
        return 'Fecha Fija';
      case 'DAILY':
      default:
        return 'Diario';
    }
  };

  const getInitials = (fullName: string): string => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  const handleSendWhatsApp = (item: (typeof customerCardsData)[number]) => {
    const cleanPhone = item.customer.phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
    const message = item.isPaidToday
      ? `Hola *${item.customer.fullName}*, confirmamos tu estado *AL DÍA* en tu crédito *${item.activeLoan.loanNumber}*.\n• Progreso: Cuota ${item.paidInstallmentsCount} de ${item.totalInstallmentsCount} (${item.amortizationPercentage}%)\n• Saldo restante: *${formatCOP(item.remainingBalance)}*\n¡Gracias por tu puntualidad!`
      : `Hola *${item.customer.fullName}*, resumen de tu crédito *${item.activeLoan.loanNumber}*:\n• Cuota del día: *${formatCOP(item.expectedToday)}*\n• Progreso: Cuota ${item.paidInstallmentsCount} de ${item.totalInstallmentsCount} (${item.amortizationPercentage}%)\n• Saldo pendiente: *${formatCOP(item.remainingBalance)}*`;

    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Comprobante WhatsApp', message);
    });
  };

  const handleOpenMap = (c: Customer) => {
    const loc = `${c.address}, ${c.neighborhood}, ${c.city || 'Colombia'}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Dirección', loc);
    });
  };

  const handleQuickPayFirstPending = () => {
    const firstPending =
      customerCardsData.find((c) => !c.isPaidToday && (c.isDueToday || c.isOverdue)) ||
      customerCardsData[0];
    if (firstPending) {
      onSelectCustomerToPay(firstPending.customer, firstPending.activeLoan);
    } else {
      Alert.alert('Sin cobros pendientes', 'Todos los clientes de la ruta están al día.');
    }
  };

  const filterChips: Array<{ key: FilterType; label: string; count: number }> = [
    { key: 'TODOS', label: 'Todos', count: counts.TODOS },
    { key: 'COBRAR_HOY', label: 'Cobrar Hoy', count: counts.COBRAR_HOY },
    { key: 'MORA', label: 'En Mora', count: counts.MORA },
    { key: 'AL_DIA', label: 'Al Día', count: counts.AL_DIA },
    { key: 'PAGADOS', label: 'Pagados', count: counts.PAGADOS },
    { key: 'PROMESAS', label: 'Promesas', count: counts.PROMESAS },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. HERO FINTECH LIMPIO: COBRO PLENO (Auditoría: Sin micro-cajas saturadas ni avisos amarillos) */}
      <View style={styles.cleanHeroCard}>
        {/* Fila Superior: Título, Modo Privacidad y Porcentaje */}
        <View style={styles.cleanHeroTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.cleanHeroLabel}>COBRO PLENO DE HOY</Text>
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

        {/* Monto Principal y Progreso */}
        <View style={styles.cleanAmountRow}>
          <Text style={styles.cleanMainAmount} numberOfLines={1} adjustsFontSizeToFit>
            {maskIfPrivate(metrics.collectedToday)}
          </Text>
          <Text style={styles.cleanGoalText}>
            de {maskIfPrivate(metrics.expectedDailyGoal)} • {metrics.visitedCustomersCount}/{metrics.expectedCustomersCount} cobrados
          </Text>
        </View>

        {/* Barra de Progreso Ultra-Slim */}
        <View style={styles.cleanProgressTrack}>
          <View
            style={[
              styles.cleanProgressFill,
              { width: `${Math.min(100, Math.max(4, metrics.progressPercentage))}%` },
            ]}
          />
        </View>

        {/* Enlace sutil al Arqueo solo para Administrador */}
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
              <Text style={styles.cleanHeroLinkAction}>Ver Arqueo</Text>
              <ChevronRight size={13} color="#38BDF8" />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* 1.1 PILARES FINANCIEROS DE LA RUTA - Exclusivo Vista Administrador / Supervisor (Audios 1 y 3) */}
      {isAdminMode && (
        <View style={styles.financialTrioCard}>
          <View style={styles.financialTrioItem}>
            <Text style={styles.financialTrioLabel}>ADMINISTRATIVO</Text>
            <Text style={styles.financialTrioValue} numberOfLines={1}>
              {maskIfPrivate(metrics.totalAdministrativeCapital || (metrics.activeCapitalInStreet + metrics.cashAvailableInHand))}
            </Text>
            <Text style={styles.financialTrioHint}>Patrimonio ruta</Text>
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
            <Text style={styles.financialTrioLabel}>BASE (CAJA)</Text>
            <Text style={[styles.financialTrioValue, { color: '#0284c7' }]} numberOfLines={1}>
              {maskIfPrivate(metrics.cashAvailableInHand)}
            </Text>
            <Text style={styles.financialTrioHint}>Para prestar</Text>
          </View>
        </View>
      )}

      {/* 2. BARRA DE ACCIÓN RÁPIDA LIMPIA & ORGANIZACIÓN DE RUTA */}
      <View style={styles.cleanToolbarRow}>
        {onOpenRouteOrganizer && (
          <TouchableOpacity
            style={styles.routeOrganizeBtn}
            activeOpacity={0.8}
            onPress={onOpenRouteOrganizer}
          >
            <ListOrdered size={14} color="#FFFFFF" style={{ marginRight: 5 }} />
            <Text style={styles.routeOrganizeText}>Organizar</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.toolbarActionBtn}
          activeOpacity={0.8}
          onPress={onOpenNewCustomer}
        >
          <UserPlus size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
          <Text style={styles.toolbarActionText}>+ Cliente</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.toolbarActionBtn}
          activeOpacity={0.8}
          onPress={onOpenNewLoan}
        >
          <FilePlus2 size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
          <Text style={styles.toolbarActionText}>+ Crédito</Text>
        </TouchableOpacity>

        {/* Botón de Recaudo: Potestad exclusiva de la Vista Administrador / Oficina (NUNCA en Vista Cobrador) */}
        {isAdminMode && onOpenRecaudo && (
          <TouchableOpacity
            style={[styles.toolbarActionBtn, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}
            activeOpacity={0.8}
            onPress={onOpenRecaudo}
          >
            <Landmark size={13} color="#0284c7" style={{ marginRight: 4 }} />
            <Text style={[styles.toolbarActionText, { color: '#0369a1', fontWeight: 'bold' }]}>💰 Recaudo</Text>
          </TouchableOpacity>
        )}

        {isAdminMode && (
          <TouchableOpacity
            style={styles.toolbarActionBtn}
            activeOpacity={0.8}
            onPress={onOpenSettlement}
          >
            <Landmark size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
            <Text style={styles.toolbarActionText}>Arqueo</Text>
          </TouchableOpacity>
        )}

        {onOpenExpense && (
          <TouchableOpacity
            style={[styles.toolbarActionBtn, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
            activeOpacity={0.8}
            onPress={onOpenExpense}
          >
            <Fuel size={13} color="#ea580c" style={{ marginRight: 4 }} />
            <Text style={[styles.toolbarActionText, { color: '#c2410c', fontWeight: 'bold' }]}>+ Gasto</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. BUSCADOR INTEGRADO CON SELECTOR DE ORDEN */}
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
          style={styles.sortToggleBtn}
          activeOpacity={0.7}
          onPress={() => {
            if (sortMode === 'ORDEN_RUTA') setSortMode('MORA');
            else if (sortMode === 'MORA') setSortMode('BARRIO');
            else setSortMode('ORDEN_RUTA');
          }}
        >
          <ArrowUpDown size={12} color={COLORS.primary} style={{ marginRight: 4 }} />
          <Text style={styles.sortToggleText}>
            {sortMode === 'ORDEN_RUTA' ? '📍 # Ruta' : sortMode === 'MORA' ? '⚡ Mora' : '🏘️ Barrio'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 4. CHIPS DE FILTRO DE ESTADO EN UNA SOLA FILA ÁGIL */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.cleanFilterScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
      >
        {filterChips.map((chip) => {
          const isActive = activeFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.cleanFilterChip, isActive && styles.cleanFilterChipActive]}
              onPress={() => setActiveFilter(chip.key)}
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

      {/* 6. TARJETAS DE PRÉSTAMO / RUTA DE COBRO (.loan-card / Soft UI + Píldoras Semánticas 9999) */}
      <View style={styles.cardsList}>
        {filteredCards.length === 0 ? (
          <View style={styles.emptyState}>
            <Wallet size={32} color={COLORS.textMuted} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sin resultados para este filtro</Text>
            <Text style={styles.emptyText}>
              Prueba cambiando el chip seleccionado o el texto de búsqueda.
            </Text>
          </View>
        ) : (
          filteredCards.map((item, index) => {
            const {
              customer,
              activeLoan,
              delinquency,
              todayInstallment,
              todayPromise,
              paidInstallmentsCount,
              totalInstallmentsCount,
              amortizationPercentage,
              remainingBalance,
            } = item;

            const todayNonPayment = nonPaymentVisits.find(
              (v) => v.customerId === customer.id && v.date === todayStr
            );

            // Selección de Píldora Semántica: Estados discretos (Neutro para normal, Verde para pagado, Rojo para mora, Ámbar para no pago)
            let badgeStyle = styles.badgeHoy;
            let badgeTextStyle = styles.badgeHoyText;
            let badgeLabel = 'Cobrar hoy';

            if (item.isPaidToday) {
              badgeStyle = styles.badgePagado;
              badgeTextStyle = styles.badgePagadoText;
              badgeLabel = '✓ Cobrado hoy';
            } else if (todayNonPayment) {
              badgeStyle = { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' };
              badgeTextStyle = { color: '#B45309' };
              badgeLabel = `⚠️ ${todayNonPayment.reasonLabel}`;
            } else if (delinquency.hasDelinquency) {
              badgeStyle = styles.badgeMora;
              badgeTextStyle = styles.badgeMoraText;
              badgeLabel = `En mora (${delinquency.overdueDays}d)`;
            } else if (todayInstallment?.status === 'PARCIAL') {
              badgeStyle = styles.badgeParcial;
              badgeTextStyle = styles.badgeParcialText;
              badgeLabel = 'Abono parcial';
            } else if (!item.isDueToday) {
              badgeStyle = styles.badgeAlDia;
              badgeTextStyle = styles.badgeAlDiaText;
              badgeLabel = 'Al día';
            }

            return (
              <TouchableOpacity
                key={customer.id}
                style={styles.chatListItem}
                activeOpacity={0.7}
                onPress={() => onViewCustomerDetail(customer)}
              >
                {/* 1. Avatar con badge de parada en ruta (#1, #2...) y estado */}
                <View style={styles.avatarWrapper}>
                  <View
                    style={[
                      styles.avatarCircle,
                      delinquency.hasDelinquency && styles.avatarMora,
                      item.isPaidToday && styles.avatarPagado,
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        delinquency.hasDelinquency && { color: COLORS.danger },
                        item.isPaidToday && { color: COLORS.success },
                      ]}
                    >
                      {getInitials(customer.fullName)}
                    </Text>
                    {delinquency.hasDelinquency && <View style={styles.avatarMoraDot} />}
                  </View>
                  <View style={styles.routeOrderBadge}>
                    <Text style={styles.routeOrderBadgeText}>
                      #{customer.orderIndex ?? (index + 1)}
                    </Text>
                  </View>
                </View>

                {/* 2. Info Central del Chat: Nombre + ID + Modalidad | Dirección y Barrio | Teléfono y Negocio */}
                <View style={styles.chatInfoCol}>
                  <View style={styles.nameRow}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {customer.fullName}
                    </Text>
                    <Text style={styles.loanNumberTag}>#{activeLoan.loanNumber}</Text>
                    <View style={styles.frequencyTag}>
                      <Text style={styles.frequencyTagText}>
                        {activeLoan.frequency === 'FIXED_DATE' && activeLoan.fixedDueDate
                          ? `F. Fija (${activeLoan.fixedDueDate.slice(5)})`
                          : getFrequencyLabel(activeLoan.frequency)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.chatAddressLine} numberOfLines={1}>
                    📍 {customer.neighborhood} • {customer.address}
                  </Text>

                  <View style={styles.chatContactLine}>
                    <Text style={styles.chatPhoneText}>📞 {customer.phone}</Text>
                    {customer.businessName ? (
                      <Text style={styles.chatBizText} numberOfLines={1}>
                        {' '}• {customer.businessName}
                      </Text>
                    ) : null}
                  </View>
                </View>

                {/* 3. Columna Derecha: Píldora Semántica + Valor Hoy / Chevron */}
                <View style={styles.chatRightCol}>
                  <View style={[styles.pastelBadge, badgeStyle]}>
                    <Text style={[styles.pastelBadgeText, badgeTextStyle]}>
                      {badgeLabel}
                    </Text>
                  </View>
                  <View style={styles.chatAmountRow}>
                    {!item.isPaidToday && (
                      <Text style={styles.chatExpectedAmount}>
                        {formatCOP(item.expectedToday)}
                      </Text>
                    )}
                    <ChevronRight size={15} color={COLORS.textMuted} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
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
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 20,
    backgroundColor: COLORS.dockBg,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  cleanHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cleanHeroLabel: {
    color: '#94A3B8',
    fontSize: 9,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  cleanPercentText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  cleanAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  cleanMainAmount: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  cleanGoalText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  cleanProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 9999,
    overflow: 'hidden',
    marginBottom: 8,
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
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  cleanHeroFooterText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  cleanHeroLinkAction: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
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
    fontSize: 9,
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
    fontSize: 9,
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
  cleanToolbarRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  routeOrganizeBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 8,
    borderRadius: 9999,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  routeOrganizeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  toolbarActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  toolbarActionText: {
    color: COLORS.textPrimary,
    fontSize: 11,
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
  sortToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  sortToggleText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },

  // 4. CHIPS DE FILTRO RÁPIDO
  cleanFilterScroll: {
    marginBottom: 8,
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
    color: COLORS.textSecondary,
    fontSize: 11.5,
    fontWeight: '700',
  },
  cleanFilterTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
    fontSize: 8.5,
    fontWeight: '900',
  },

  // 6. LISTA DE CLIENTES EN RUTA (Estilo chat de WhatsApp: limpio, compacto y ágil)
  cardsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  chatListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    color: COLORS.textSecondary,
    fontSize: 13,
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
    marginLeft: 12,
    marginRight: 8,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  loanNumberTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
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
    color: COLORS.primary,
    fontSize: 9.5,
    fontWeight: '800',
  },
  chatAddressLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 2,
  },
  chatContactLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatPhoneText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  chatBizText: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '500',
    flexShrink: 1,
  },
  chatRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  chatAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chatExpectedAmount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },

  // PÍLDORAS DE ESTADO SEMÁNTICAS (Diseño discreto y disciplinado)
  pastelBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pastelBadgeText: {
    fontSize: 10,
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
});
