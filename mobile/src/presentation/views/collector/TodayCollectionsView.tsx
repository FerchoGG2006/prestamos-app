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
      {/* 1. HERO BALANCE CARD (Figma 7020-3430 + Modo Privacidad en Calle 👁️) */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.heroLabel}>RECAUDO DEL DÍA VS. META DIARIA</Text>
              <TouchableOpacity
                onPress={togglePrivacy}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  borderRadius: 9999,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {privacyMode ? (
                  <EyeOff size={12} color="#E0E7FF" />
                ) : (
                  <Eye size={12} color="#E0E7FF" />
                )}
                <Text style={{ color: '#E0E7FF', fontSize: 9, fontWeight: '800' }}>
                  {privacyMode ? 'Mostrar' : 'Ocultar'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.heroMainAmount} numberOfLines={1} adjustsFontSizeToFit>
              {maskIfPrivate(metrics.collectedToday)}
            </Text>
            <Text style={styles.heroGoalSubtitle}>
              Meta de hoy: {maskIfPrivate(metrics.expectedDailyGoal)}
            </Text>
          </View>
          <View style={styles.heroPercentPill}>
            <TrendingUp size={14} color="#34D399" style={{ marginRight: 4 }} />
            <Text style={styles.heroPercentText}>{metrics.progressPercentage}%</Text>
          </View>
        </View>

        {/* Barra de Progreso de Cumplimiento Diario */}
        <View style={styles.heroProgressTrack}>
          <View
            style={[
              styles.heroProgressFill,
              { width: `${Math.min(100, Math.max(4, metrics.progressPercentage))}%` },
            ]}
          />
        </View>
        <View style={styles.heroProgressMetaRow}>
          <Text style={styles.heroProgressMetaText}>
            {metrics.visitedCustomersCount} de {metrics.expectedCustomersCount} clientes cobrados
          </Text>
          <Text style={styles.heroProgressMetaText}>
            Efectivo: {maskIfPrivate(metrics.collectedCashToday)} • Digital:{' '}
            {maskIfPrivate(metrics.collectedDigitalToday)}
          </Text>
        </View>
      </View>

      {/* 2. CUADRÍCULA BENTO ASIMÉTRICA (Patrón #2 de https://share.gemini.google/KjMOzkltAOCD)
          Incluye Mejora IA #1: overflow: 'hidden' y flexShrink para evitar desbordamiento de botones en pantallas angostas,
          y Mejora IA #3: micro-bordes de 1px (rgba(15, 23, 42, 0.07)) sobre bloques Soft UI. */}
      <View style={styles.bentoGridContainer}>
        {/* Columna Izquierda: Tarjeta Bento Alta "Mi Caja & Capital en Calle" */}
        <TouchableOpacity
          style={styles.bentoCardPrimary}
          activeOpacity={0.88}
          onPress={onOpenSettlement}
        >
          <View style={styles.bentoTopHeader}>
            <View style={styles.bentoIconBadge}>
              <Wallet size={16} color={COLORS.primary} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  togglePrivacy();
                }}
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  borderRadius: 9999,
                  backgroundColor: COLORS.surfaceSoft,
                  borderWidth: 1,
                  borderColor: COLORS.microBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                {privacyMode ? (
                  <EyeOff size={11} color={COLORS.textMuted} />
                ) : (
                  <Eye size={11} color={COLORS.textMuted} />
                )}
                <Text style={{ fontSize: 9, fontWeight: '800', color: COLORS.textMuted }}>
                  {privacyMode ? 'Ver' : 'Ocultar'}
                </Text>
              </TouchableOpacity>
              <View style={styles.bentoPillTag}>
                <Text style={styles.bentoPillTagText} numberOfLines={1}>
                  Mi Caja
                </Text>
                <ArrowUpRight size={12} color={COLORS.primary} />
              </View>
            </View>
          </View>

          <Text style={styles.bentoMutedLabel}>EFECTIVO DISPONIBLE</Text>
          <Text style={styles.bentoBigAmount} numberOfLines={1} adjustsFontSizeToFit>
            {maskIfPrivate(metrics.cashAvailableInHand)}
          </Text>

          <View style={styles.bentoDivider} />

          <View style={styles.bentoMiniRow}>
            <Text style={styles.bentoMiniLabel}>Capital en Calle</Text>
            <Text style={styles.bentoMiniValue} numberOfLines={1}>
              {maskIfPrivate(metrics.activeCapitalInStreet)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Columna Derecha: 2 Tarjetas Bento Apiladas ("Cartera en Mora" y "Favoritos / Nuevo Crédito") */}
        <View style={styles.bentoRightCol}>
          {/* Tarjeta Bento Superior Derecha: Radar de Mora */}
          <TouchableOpacity
            style={[
              styles.bentoCardSmall,
              metrics.overdueTotalAmount > 0 && styles.bentoCardMoraSurface,
            ]}
            activeOpacity={0.88}
            onPress={() => setActiveFilter(activeFilter === 'MORA' ? 'TODOS' : 'MORA')}
          >
            <View style={styles.bentoSmallTopRow}>
              <Text style={styles.bentoSmallLabel} numberOfLines={1}>
                TOTAL EN MORA
              </Text>
              <ShieldAlert
                size={15}
                color={metrics.overdueTotalAmount > 0 ? COLORS.danger : COLORS.success}
              />
            </View>
            <Text
              style={[
                styles.bentoSmallAmount,
                metrics.overdueTotalAmount > 0
                  ? { color: COLORS.danger }
                  : { color: COLORS.success },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {maskIfPrivate(metrics.overdueTotalAmount)}
            </Text>
            <Text style={styles.bentoSmallHint} numberOfLines={1}>
              {counts.MORA > 0 ? `${counts.MORA} cliente(s) por cobrar` : '0 clientes vencidos'}
            </Text>
          </TouchableOpacity>

          {/* Tarjeta Bento Inferior Derecha: Bloque Lavanda Suave (#F5F3FF) */}
          <TouchableOpacity
            style={styles.bentoCardLavender}
            activeOpacity={0.88}
            onPress={onOpenNewLoan}
          >
            <View style={styles.bentoSmallTopRow}>
              <Text style={styles.bentoLavenderLabel} numberOfLines={1}>
                DESEMBOLSO RÁPIDO
              </Text>
              <Sparkles size={15} color={COLORS.purple} />
            </View>
            <Text style={styles.bentoLavenderTitle} numberOfLines={1}>
              + Crear Préstamo
            </Text>
            <Text style={styles.bentoLavenderHint} numberOfLines={1}>
              Hoy: {maskIfPrivate(metrics.disbursedToday)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. ACCIONES RÁPIDAS HORIZONTALES (Píldoras Soft UI con Micro-Borde) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.quickActionsScroll}
        contentContainerStyle={styles.quickActionsContainer}
      >
        <TouchableOpacity
          style={styles.quickActionPill}
          onPress={handleQuickPayFirstPending}
        >
          <View style={[styles.quickIconCircle, { backgroundColor: COLORS.successLight }]}>
            <PlusCircle size={15} color={COLORS.success} />
          </View>
          <Text style={styles.quickActionText}>Abono 1-Toque</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickActionPill} onPress={onOpenNewCustomer}>
          <View style={[styles.quickIconCircle, { backgroundColor: COLORS.purpleLight }]}>
            <UserPlus size={15} color={COLORS.purple} />
          </View>
          <Text style={styles.quickActionText}>+ Cliente</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickActionPill} onPress={onOpenNewLoan}>
          <View style={[styles.quickIconCircle, { backgroundColor: COLORS.infoLight }]}>
            <FilePlus2 size={15} color={COLORS.primary} />
          </View>
          <Text style={styles.quickActionText}>+ Préstamo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickActionPill} onPress={onOpenSettlement}>
          <View style={[styles.quickIconCircle, { backgroundColor: COLORS.warningLight }]}>
            <Landmark size={15} color={COLORS.warning} />
          </View>
          <Text style={styles.quickActionText}>Arqueo Caja</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 4. BUSCADOR ESTILO FILLED INPUT CON FLOATING LABEL INTERNO + BOTÓN LIMPIAR (✕) */}
      <View style={styles.filledSearchContainer}>
        <Search size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.filledSearchFloatingLabel}>FILTRAR DIRECTORIO DE RUTA</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Nombre, cédula, negocio o barrio..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        {searchQuery.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearchQuery('')}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: COLORS.surfaceSoft,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 6,
            }}
          >
            <X size={14} color={COLORS.textSecondary} />
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
  // 1. HERO BALANCE CARD (.hero-card)
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: COLORS.dockBg, // Índigo/púrpura profundo de alto contraste Fintech
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroLabel: {
    color: '#A5B4FC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroMainAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.8,
    marginTop: 4,
  },
  heroGoalSubtitle: {
    color: '#C7D2FE',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  heroPercentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  heroPercentText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroProgressTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 9999,
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    backgroundColor: COLORS.heroBarFill,
    borderRadius: 9999,
  },
  heroProgressMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  heroProgressMetaText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '600',
  },

  // 2. CUADRÍCULA BENTO ASIMÉTRICA (Patrón #2 de Gemini Share + Mejora IA #1 anti-overflow)
  bentoGridContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  bentoCardPrimary: {
    flex: 1.08,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 22,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    overflow: 'hidden', // Crítico (Mejora IA #1): evita que píldoras o montos se salgan del borde
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  bentoTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
  bentoIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bentoPillTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    flexShrink: 1,
    gap: 3,
  },
  bentoPillTagText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  bentoMutedLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bentoBigAmount: {
    color: COLORS.textPrimary,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 2,
  },
  bentoDivider: {
    height: 1,
    backgroundColor: COLORS.bgTertiary,
    marginVertical: 10,
  },
  bentoMiniRow: {
    flexDirection: 'column',
  },
  bentoMiniLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  bentoMiniValue: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 1,
  },
  bentoRightCol: {
    flex: 1,
    gap: 10,
  },
  bentoCardSmall: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    overflow: 'hidden',
    justifyContent: 'space-between',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  bentoCardMoraSurface: {
    backgroundColor: '#FFFDFD',
    borderColor: COLORS.dangerBorder,
  },
  bentoSmallTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  bentoSmallLabel: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  bentoSmallAmount: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginVertical: 2,
  },
  bentoSmallHint: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  bentoCardLavender: {
    flex: 1,
    backgroundColor: COLORS.surfaceLavender,
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  bentoLavenderLabel: {
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  bentoLavenderTitle: {
    color: '#2E1065',
    fontSize: 14,
    fontWeight: '800',
    marginVertical: 2,
  },
  bentoLavenderHint: {
    color: COLORS.purple,
    fontSize: 10,
    fontWeight: '700',
  },

  // 3. QUICK ACTION PILLS (.quick-action-btn)
  quickActionsScroll: {
    marginBottom: 12,
  },
  quickActionsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  quickIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  quickActionText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },

  // 4. FILLED INPUT SEARCH BAR CON FLOATING LABEL (Patrón #5 + Mejora IA #3)
  filledSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  filledSearchFloatingLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  searchInput: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
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
