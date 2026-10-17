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
} from 'lucide-react-native';

type FilterType = 'TODOS' | 'COBRAR_HOY' | 'MORA' | 'AL_DIA' | 'PAGADOS' | 'PROMESAS';

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
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [privacyMode, setPrivacyMode] = useState(false); // Mejora #3: Modo Privacidad en Calle (Ocultar Saldos)
  const [prioritizeOverdue, setPrioritizeOverdue] = useState(true); // Mejora #6: Ordenar Mora primero
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
      if (!prioritizeOverdue) return 0;
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return b.delinquency.overdueDays - a.delinquency.overdueDays;
    });

  const getFrequencyLabel = (freq?: string): string => {
    switch (freq) {
      case 'WEEKLY':
        return 'Semanal';
      case 'BIWEEKLY':
        return 'Quincenal';
      case 'MONTHLY':
        return 'Mensual';
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
      {/* 1. HERO COMPACTO FINTECH CON KPIS INTEGRADOS (Ultraligero para calle) */}
      <View style={styles.compactHeroCard}>
        {/* Fila Superior: Título, Modo Privacidad y Porcentaje */}
        <View style={styles.compactHeroTopRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.compactHeroLabel}>RECAUDO DE HOY</Text>
            <TouchableOpacity onPress={togglePrivacy} style={styles.compactEyeBtn}>
              {privacyMode ? (
                <EyeOff size={11} color="#94A3B8" />
              ) : (
                <Eye size={11} color="#94A3B8" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.compactPercentPill}>
            <TrendingUp size={11} color="#FFFFFF" style={{ marginRight: 3 }} />
            <Text style={styles.compactPercentText}>{metrics.progressPercentage}%</Text>
          </View>
        </View>

        {/* Monto Principal y Programado del Día */}
        <View style={styles.compactAmountRow}>
          <Text style={styles.compactMainAmount} numberOfLines={1} adjustsFontSizeToFit>
            {maskIfPrivate(metrics.collectedToday)}
          </Text>
          <Text style={styles.compactGoalText}>
            de {maskIfPrivate(metrics.expectedDailyGoal)} programado
          </Text>
        </View>

        {/* Barra de Progreso Ultra-Slim */}
        <View style={styles.compactProgressTrack}>
          <View
            style={[
              styles.compactProgressFill,
              { width: `${Math.min(100, Math.max(4, metrics.progressPercentage))}%` },
            ]}
          />
        </View>

        {/* Tira de Micro-KPIs Integrados (Reemplaza la cuadrícula pesada Bento) */}
        <View style={styles.microKpiStrip}>
          <TouchableOpacity
            style={styles.microKpiItem}
            activeOpacity={0.7}
            onPress={onOpenSettlement}
          >
            <Wallet size={12} color="#94A3B8" style={{ marginRight: 4 }} />
            <Text style={styles.microKpiLabel}>En Caja: </Text>
            <Text style={styles.microKpiValue}>{maskIfPrivate(metrics.cashAvailableInHand)}</Text>
          </TouchableOpacity>

          <View style={styles.microKpiDivider} />

          <TouchableOpacity
            style={styles.microKpiItem}
            activeOpacity={0.7}
            onPress={() => setActiveFilter(activeFilter === 'MORA' ? 'TODOS' : 'MORA')}
          >
            <ShieldAlert
              size={12}
              color={metrics.overdueTotalAmount > 0 ? '#EF4444' : '#94A3B8'}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.microKpiLabel}>Mora: </Text>
            <Text
              style={[
                styles.microKpiValue,
                metrics.overdueTotalAmount > 0 && { color: '#EF4444' },
              ]}
            >
              {maskIfPrivate(metrics.overdueTotalAmount)}
            </Text>
          </TouchableOpacity>

          <View style={styles.microKpiDivider} />

          <View style={styles.microKpiItem}>
            <Text style={styles.microKpiLabel}>Cobrados: </Text>
            <Text style={styles.microKpiValue}>
              {metrics.visitedCustomersCount}/{metrics.expectedCustomersCount}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. ACCIONES RÁPIDAS COMPACTAS (Micro-píldoras en 1 fila) */}
      <View style={styles.compactActionsRow}>
        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={handleQuickPayFirstPending}
        >
          <PlusCircle size={13} color={COLORS.primary} />
          <Text style={[styles.compactActionText, { color: COLORS.textPrimary }]}>Abono Rápido</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={onOpenNewCustomer}
        >
          <UserPlus size={13} color={COLORS.primary} />
          <Text style={[styles.compactActionText, { color: COLORS.textPrimary }]}>+ Cliente</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={onOpenNewLoan}
        >
          <FilePlus2 size={13} color={COLORS.primary} />
          <Text style={[styles.compactActionText, { color: COLORS.textPrimary }]}>+ Préstamo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={onOpenSettlement}
        >
          <Landmark size={13} color={COLORS.primary} />
          <Text style={[styles.compactActionText, { color: COLORS.textPrimary }]}>Arqueo</Text>
        </TouchableOpacity>

        {onOpenExpense && (
          <TouchableOpacity
            style={styles.compactActionBtn}
            onPress={onOpenExpense}
          >
            <Fuel size={13} color="#D97706" />
            <Text style={[styles.compactActionText, { color: COLORS.textPrimary }]}>+ Gasto</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. BUSCADOR COMPACTO Y LIMPIO */}
      <View style={styles.compactSearchContainer}>
        <Search size={15} color={COLORS.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.compactSearchInput}
          placeholder="Buscar por cliente, cédula o barrio..."
          placeholderTextColor={COLORS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={styles.clearSearchBtn}
          >
            <X size={12} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* 5. CHIPS HORIZONTALES DE FILTRADO RÁPIDO (.filter-chip con borderRadius: 9999 + Ordenamiento) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterTabs}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        <TouchableOpacity
          style={[
            styles.filterChip,
            prioritizeOverdue && {
              backgroundColor: COLORS.primaryLight,
              borderColor: COLORS.primaryBorder,
            },
            { flexDirection: 'row', alignItems: 'center', gap: 4 },
          ]}
          onPress={() => setPrioritizeOverdue(!prioritizeOverdue)}
        >
          <ArrowUpDown
            size={12}
            color={prioritizeOverdue ? COLORS.primary : COLORS.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              prioritizeOverdue && { color: COLORS.primary, fontWeight: '800' },
            ]}
          >
            {prioritizeOverdue ? '⚡ Mora 1°' : '📍 Orden Ruta'}
          </Text>
        </TouchableOpacity>

        {filterChips.map((chip) => {
          const isActive = activeFilter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(chip.key)}
            >
              <Text
                style={[styles.filterChipText, isActive && styles.filterChipTextActive]}
              >
                {chip.label} ({chip.count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 5.1 FILTRO POR MODALIDAD DE PAGO (Diario, Semanal, Quincenal, Mensual) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.freqTabs}
        contentContainerStyle={{ paddingRight: 16 }}
      >
        {(
          [
            { key: 'ALL', label: `Todas (${freqCounts.ALL})` },
            { key: 'DAILY', label: `Diario (${freqCounts.DAILY})` },
            { key: 'WEEKLY', label: `Semanal (${freqCounts.WEEKLY})` },
            { key: 'BIWEEKLY', label: `Quincenal (${freqCounts.BIWEEKLY})` },
            { key: 'MONTHLY', label: `Mensual (${freqCounts.MONTHLY})` },
          ] as const
        ).map((item) => {
          const isActive = frequencyFilter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.freqChip, isActive && styles.freqChipActive]}
              onPress={() => setFrequencyFilter(item.key)}
            >
              <Text
                style={[
                  styles.freqChipText,
                  isActive && styles.freqChipTextActive,
                ]}
              >
                {item.label}
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
          filteredCards.map((item) => {
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
                {/* 1. Avatar circular con iniciales y micro-indicador de estado */}
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

                {/* 2. Info Central del Chat: Nombre + ID + Modalidad | Dirección y Barrio | Teléfono y Negocio */}
                <View style={styles.chatInfoCol}>
                  <View style={styles.nameRow}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {customer.fullName}
                    </Text>
                    <Text style={styles.loanNumberTag}>#{activeLoan.loanNumber}</Text>
                    <View style={styles.frequencyTag}>
                      <Text style={styles.frequencyTagText}>
                        {getFrequencyLabel(activeLoan.frequency)}
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
  // 1. HERO COMPACTO FINTECH (.compactHeroCard)
  compactHeroCard: {
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
  compactHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  compactHeroLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  compactEyeBtn: {
    padding: 3,
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  compactPercentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  compactPercentText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  compactAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 6,
  },
  compactMainAmount: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  compactGoalText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  compactProgressTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 9999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  compactProgressFill: {
    height: '100%',
    backgroundColor: COLORS.heroBarFill,
    borderRadius: 9999,
  },
  microKpiStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
  },
  microKpiItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  microKpiLabel: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  microKpiValue: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  microKpiDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },

  // 2. ACCIONES RÁPIDAS COMPACTAS (Micro-píldoras en 1 fila)
  compactActionsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  compactActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingVertical: 7,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    gap: 4,
  },
  compactActionText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // 3. BUSCADOR COMPACTO Y LIMPIO
  compactSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  compactSearchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // 5. FILTER CHIPS (.filter-chip con borderRadius: 9999)
  filterTabs: {
    paddingLeft: 16,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9999,
    backgroundColor: COLORS.bgSecondary,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  filterChipActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // 5.1 FREQUENCY CHIPS (Modalidad de pago)
  freqTabs: {
    paddingLeft: 16,
    marginBottom: 10,
  },
  freqChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    marginRight: 6,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  freqChipActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  freqChipText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  freqChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
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
