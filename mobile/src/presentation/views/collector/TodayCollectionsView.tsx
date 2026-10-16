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
} from 'lucide-react-native';

type FilterType = 'TODOS' | 'COBRAR_HOY' | 'MORA' | 'AL_DIA' | 'PAGADOS' | 'PROMESAS';

interface TodayCollectionsViewProps {
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  promises: PaymentPromise[];
  metrics: DailyRouteMetrics;
  todayStr: string;
  onSelectCustomerToPay: (customer: Customer, loan: Loan) => void;
  onSelectCustomerToRenew: (customer: Customer, loan: Loan) => void;
  onSelectCustomerPromise: (customer: Customer, loan: Loan) => void;
  onViewCustomerDetail: (customer: Customer) => void;
  onOpenNewCustomer: () => void;
  onOpenNewLoan: () => void;
  onOpenSettlement: () => void;
}

export const TodayCollectionsView: React.FC<TodayCollectionsViewProps> = ({
  customers,
  loans,
  installments,
  promises,
  metrics,
  todayStr,
  onSelectCustomerToPay,
  onSelectCustomerToRenew,
  onSelectCustomerPromise,
  onViewCustomerDetail,
  onOpenNewCustomer,
  onOpenNewLoan,
  onOpenSettlement,
}) => {
  const [activeFilter, setActiveFilter] = useState<FilterType>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [privacyMode, setPrivacyMode] = useState(false); // Mejora #3: Modo Privacidad en Calle (Ocultar Saldos)
  const [prioritizeOverdue, setPrioritizeOverdue] = useState(true); // Mejora #6: Ordenar Mora primero

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

  // Filtrado combinado (Chip + Buscador instantáneo + Ordenamiento Inteligente)
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
                <EyeOff size={11} color="#C7D2FE" />
              ) : (
                <Eye size={11} color="#C7D2FE" />
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.compactPercentPill}>
            <TrendingUp size={11} color="#34D399" style={{ marginRight: 3 }} />
            <Text style={styles.compactPercentText}>{metrics.progressPercentage}%</Text>
          </View>
        </View>

        {/* Monto Principal y Meta en una sola línea armónica */}
        <View style={styles.compactAmountRow}>
          <Text style={styles.compactMainAmount} numberOfLines={1} adjustsFontSizeToFit>
            {maskIfPrivate(metrics.collectedToday)}
          </Text>
          <Text style={styles.compactGoalText}>
            de {maskIfPrivate(metrics.expectedDailyGoal)}
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
            <Wallet size={12} color="#34D399" style={{ marginRight: 4 }} />
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
              color={metrics.overdueTotalAmount > 0 ? '#F87171' : '#34D399'}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.microKpiLabel}>Mora: </Text>
            <Text
              style={[
                styles.microKpiValue,
                metrics.overdueTotalAmount > 0 && { color: '#FCA5A5' },
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
          style={[styles.compactActionBtn, { backgroundColor: COLORS.successLight, borderColor: COLORS.successBorder }]}
          onPress={handleQuickPayFirstPending}
        >
          <PlusCircle size={13} color={COLORS.success} />
          <Text style={[styles.compactActionText, { color: COLORS.success }]}>Abono 1-Toque</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={onOpenNewCustomer}
        >
          <UserPlus size={13} color={COLORS.purple} />
          <Text style={[styles.compactActionText, { color: COLORS.purple }]}>+ Cliente</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={onOpenNewLoan}
        >
          <FilePlus2 size={13} color={COLORS.primary} />
          <Text style={[styles.compactActionText, { color: COLORS.primary }]}>+ Préstamo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.compactActionBtn}
          onPress={onOpenSettlement}
        >
          <Landmark size={13} color={COLORS.warning} />
          <Text style={[styles.compactActionText, { color: COLORS.warning }]}>Arqueo</Text>
        </TouchableOpacity>
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
              backgroundColor: COLORS.surfaceLavender,
              borderColor: COLORS.purpleBorder,
            },
            { flexDirection: 'row', alignItems: 'center', gap: 4 },
          ]}
          onPress={() => setPrioritizeOverdue(!prioritizeOverdue)}
        >
          <ArrowUpDown
            size={12}
            color={prioritizeOverdue ? COLORS.purple : COLORS.textSecondary}
          />
          <Text
            style={[
              styles.filterChipText,
              prioritizeOverdue && { color: COLORS.purple, fontWeight: '800' },
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

            // Selección de Píldora Semántica (borderRadius: 9999)
            let badgeStyle = styles.badgeHoy;
            let badgeTextStyle = styles.badgeHoyText;
            let badgeLabel = 'Cobrar hoy';

            if (item.isPaidToday) {
              badgeStyle = styles.badgeAlDia;
              badgeTextStyle = styles.badgeAlDiaText;
              badgeLabel = '✓ Aprobado hoy';
            } else if (delinquency.hasDelinquency) {
              badgeStyle = styles.badgeMora;
              badgeTextStyle = styles.badgeMoraText;
              badgeLabel = `En mora (${delinquency.overdueDays}d)`;
            } else if (todayInstallment?.status === 'PARCIAL') {
              badgeStyle = styles.badgeWarning;
              badgeTextStyle = styles.badgeWarningText;
              badgeLabel = 'Abono parcial';
            } else if (!item.isDueToday) {
              badgeStyle = styles.badgeAlDia;
              badgeTextStyle = styles.badgeAlDiaText;
              badgeLabel = 'Al día';
            }

            return (
              <View key={customer.id} style={styles.loanCard}>
                {/* Cabecera: Avatar + Cliente + Píldora Semántica */}
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => onViewCustomerDetail(customer)}
                >
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{getInitials(customer.fullName)}</Text>
                  </View>

                  <View style={{ flex: 1, marginLeft: 12, marginRight: 6 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.customerName} numberOfLines={1}>
                        {customer.fullName}
                      </Text>
                      <Text style={styles.loanNumberTag}>{activeLoan.loanNumber}</Text>
                    </View>
                    <Text style={styles.customerDetails} numberOfLines={1}>
                      {customer.businessName ? `${customer.businessName} • ` : ''}
                      {customer.neighborhood} • {customer.address}
                    </Text>
                  </View>

                  <View style={[styles.pastelBadge, badgeStyle]}>
                    <Text style={[styles.pastelBadgeText, badgeTextStyle]}>
                      {badgeLabel}
                    </Text>
                  </View>
                  <ChevronRight
                    size={16}
                    color={COLORS.textMuted}
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>

                {/* Bloque Soft UI (#F4F5F7) con Micro-Borde de 1px y Jerarquía Tipográfica Agresiva */}
                <View style={styles.cardFinancialsBox}>
                  <View style={styles.kpiCol}>
                    <Text style={styles.kpiLabel}>COBRO HOY</Text>
                    <Text style={styles.kpiValueGreen} numberOfLines={1} adjustsFontSizeToFit>
                      {formatCOP(item.expectedToday)}
                    </Text>
                  </View>

                  <View style={styles.kpiDivider} />

                  <View style={styles.kpiCol}>
                    <Text style={styles.kpiLabel}>SALDO PENDIENTE</Text>
                    <Text style={styles.kpiValueDark} numberOfLines={1} adjustsFontSizeToFit>
                      {formatCOP(remainingBalance)}
                    </Text>
                  </View>

                  <View style={styles.kpiDivider} />

                  <View style={styles.kpiCol}>
                    <Text style={styles.kpiLabel}>MORA ACUMULADA</Text>
                    <Text
                      style={[
                        styles.kpiValueMuted,
                        delinquency.hasDelinquency && styles.kpiValueRed,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {delinquency.hasDelinquency
                        ? formatCOP(delinquency.overdueAmount)
                        : '$ 0'}
                    </Text>
                  </View>
                </View>

                {/* Barra de Progreso de Amortización */}
                <View style={styles.amortizationSection}>
                  <View style={styles.amortizationHeader}>
                    <Text style={styles.amortizationText}>
                      Cuota {paidInstallmentsCount} de {totalInstallmentsCount} •{' '}
                      {amortizationPercentage}% amortizado
                    </Text>
                    <Text style={styles.amortizationSubText}>
                      Cuota base: {formatCOP(activeLoan.installmentAmount)}
                    </Text>
                  </View>
                  <View style={styles.amortizationTrack}>
                    <View
                      style={[
                        styles.amortizationBarFill,
                        {
                          width: `${Math.min(100, Math.max(4, amortizationPercentage))}%`,
                          backgroundColor: delinquency.hasDelinquency
                            ? COLORS.warning
                            : COLORS.successBright,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* Promesa activa si existe */}
                {todayPromise && (
                  <View style={styles.promiseBanner}>
                    <Calendar size={14} color={COLORS.warning} style={{ marginRight: 6 }} />
                    <Text style={styles.promiseBannerText}>
                      Promesa para el {todayPromise.promisedDate}:{' '}
                      {formatCOP(todayPromise.promisedAmount)}
                      {todayPromise.notes ? ` — "${todayPromise.notes}"` : ''}
                    </Text>
                  </View>
                )}

                {/* Botones de Acción Directa */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[
                      styles.payBtn,
                      item.isPaidToday && styles.payBtnCompleted,
                    ]}
                    onPress={() => onSelectCustomerToPay(customer, activeLoan)}
                  >
                    <CheckCircle
                      size={16}
                      color="#ffffff"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.payBtnText} numberOfLines={1}>
                      {item.isPaidToday
                        ? 'Abonar Extra'
                        : `Cobrar ${formatCOP(item.expectedToday)}`}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.whatsappBtn}
                    onPress={() => handleSendWhatsApp(item)}
                  >
                    <MessageCircle size={15} color={COLORS.success} />
                    <Text style={styles.whatsappBtnText}>Recibo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={() => onSelectCustomerPromise(customer, activeLoan)}
                  >
                    <Clock size={14} color={COLORS.textSecondary} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.secondaryActionBtn,
                      { backgroundColor: COLORS.purpleLight, borderColor: COLORS.purpleBorder },
                    ]}
                    onPress={() => onSelectCustomerToRenew(customer, activeLoan)}
                  >
                    <RefreshCw size={14} color={COLORS.purple} />
                  </TouchableOpacity>
                </View>
              </View>
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
    backgroundColor: COLORS.dockBg, // Índigo profundo Fintech
    shadowColor: '#1E1B4B',
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
    color: '#A5B4FC',
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
    color: '#C7D2FE',
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

  // 6. LOAN CARDS (.loan-card con Soft UI + Micro-Borde)
  cardsList: {
    paddingHorizontal: 16,
  },
  loanCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.surfaceLavender,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.purple,
    fontSize: 14,
    fontWeight: '800',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  loanNumberTag: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  customerDetails: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // PÍLDORAS DE ESTADO SEMÁNTICAS (borderRadius: 9999 — Patrón #6 de Gemini Share)
  pastelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
  },
  pastelBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeAlDia: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  badgeAlDiaText: {
    color: COLORS.success,
  },
  badgeHoy: {
    backgroundColor: COLORS.infoLight,
    borderColor: COLORS.infoBorder,
  },
  badgeHoyText: {
    color: COLORS.info,
  },
  badgeMora: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  badgeMoraText: {
    color: COLORS.danger,
  },
  badgeWarning: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warningBorder,
  },
  badgeWarningText: {
    color: COLORS.warning,
  },

  // CAJA DE KPIS FINANCIEROS (Bloque #F4F5F7 con Micro-borde 1px y Jerarquía Tipográfica Agresiva)
  cardFinancialsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 12,
  },
  kpiCol: {
    flex: 1,
  },
  kpiDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
    marginHorizontal: 8,
  },
  kpiLabel: {
    fontSize: 9,
    color: COLORS.textMuted,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  kpiValueGreen: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.success,
    marginTop: 2,
  },
  kpiValueDark: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  kpiValueRed: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.danger,
    marginTop: 2,
  },
  kpiValueMuted: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // BARRA DE AMORTIZACIÓN
  amortizationSection: {
    marginBottom: 12,
  },
  amortizationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  amortizationText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  amortizationSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  amortizationTrack: {
    height: 7,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  amortizationBarFill: {
    height: '100%',
    borderRadius: 9999,
  },

  promiseBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningLight,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginBottom: 10,
  },
  promiseBannerText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },

  // ACCIONES DE LA TARJETA
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.dockBg,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnCompleted: {
    backgroundColor: COLORS.success,
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  whatsappBtnText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
