import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import {
  Customer,
  Loan,
  Installment,
  PaymentPromise,
  NonPaymentVisit,
} from '../../core/domain/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCOP } from '../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../core/domain/calculator';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import {
  Bell,
  X,
  AlertTriangle,
  Clock,
  Sparkles,
  Phone,
  MessageCircle,
  ChevronRight,
  TrendingUp,
  MapPin,
  CheckCircle,
} from 'lucide-react-native';

export type NotificationCategory = 'TODAS' | 'MORAS' | 'PROMESAS' | 'RENOVACIONES';

export interface AlertNotificationItem {
  id: string;
  category: 'MORA' | 'PROMESA' | 'RENOVACION' | 'NO_PAGO';
  title: string;
  subtitle: string;
  badgeLabel: string;
  badgeColor: string;
  badgeBg: string;
  customer: Customer;
  loan: Loan;
  customerInstallments: Installment[];
  priority: number; // 1 = Urgente, 2 = Media, 3 = Oportunidad
  phone: string;
  amountHint: string;
}

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  promises: PaymentPromise[];
  nonPaymentVisits?: NonPaymentVisit[];
  todayStr: string;
  onSelectCustomerToPay: (customer: Customer, loan: Loan) => void;
  onViewCustomerDetail: (customer: Customer) => void;
  onQuickWhatsApp: (customer: Customer, loan: Loan, custInsts: Installment[]) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  onClose,
  customers,
  loans,
  installments,
  promises,
  nonPaymentVisits = [],
  todayStr,
  onSelectCustomerToPay,
  onViewCustomerDetail,
  onQuickWhatsApp,
}) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<NotificationCategory>('TODAS');

  // Generador dinámico de alertas inteligentes de cartera
  const alertItems = useMemo<AlertNotificationItem[]>(() => {
    const items: AlertNotificationItem[] = [];

    // 1. Alertar Moras y Riesgos de Cartera
    customers.forEach((cust) => {
      const activeLoan = loans.find((l) => l.customerId === cust.id && l.status === 'ACTIVE');
      if (!activeLoan) return;

      const custInsts = installments.filter((i) => i.loanId === activeLoan.id);
      const delinquency = calculateDelinquencyMetrics(custInsts, todayStr);

      if (delinquency.hasDelinquency) {
        const isCritical = delinquency.overdueDays >= 3;
        items.push({
          id: `mora-${cust.id}-${activeLoan.id}`,
          category: 'MORA',
          title: cust.fullName,
          subtitle: `📍 ${cust.neighborhood} • Debe ${delinquency.overdueInstallmentsCount} cuotas (${formatCOP(delinquency.overdueAmount)})`,
          badgeLabel: isCritical ? `MORA CRÍTICA (${delinquency.overdueDays}d)` : `Atraso (${delinquency.overdueDays}d)`,
          badgeColor: isCritical ? '#DC2626' : '#EA580C',
          badgeBg: isCritical ? '#FEE2E2' : '#FFEDD5',
          customer: cust,
          loan: activeLoan,
          customerInstallments: custInsts,
          priority: isCritical ? 1 : 2,
          phone: cust.phone,
          amountHint: formatCOP(delinquency.overdueAmount),
        });
      }

      // 2. Alertar Oportunidades de Renovación (80% o más pagado)
      const paidCount = custInsts.filter((i) => i.status === 'PAGADA' || i.status === 'ADELANTADA' || i.pendingAmount <= 0).length;
      const totalCount = custInsts.length || activeLoan.installmentCount;
      if (totalCount > 0 && paidCount / totalCount >= 0.8 && paidCount < totalCount) {
        const pendingCount = totalCount - paidCount;
        items.push({
          id: `renovacion-${cust.id}-${activeLoan.id}`,
          category: 'RENOVACION',
          title: cust.fullName,
          subtitle: `📍 ${cust.neighborhood} • Solo le faltan ${pendingCount} cuotas para terminar el crédito`,
          badgeLabel: 'OPORTUNIDAD RENOVACIÓN',
          badgeColor: '#2563EB',
          badgeBg: '#EFF6FF',
          customer: cust,
          loan: activeLoan,
          customerInstallments: custInsts,
          priority: 3,
          phone: cust.phone,
          amountHint: `Faltan ${pendingCount} cuotas`,
        });
      }
    });

    // 3. Alertar Promesas de Pago pactadas para hoy
    promises.forEach((p) => {
      if (p.status !== 'PENDIENTE') return;
      const cust = customers.find((c) => c.id === p.customerId);
      const activeLoan = loans.find((l) => l.customerId === p.customerId && l.status === 'ACTIVE');
      if (!cust || !activeLoan) return;

      const custInsts = installments.filter((i) => i.loanId === activeLoan.id);
      const isDueToday = p.promisedDate === todayStr;
      const isOverduePromise = p.promisedDate < todayStr;

      if (isDueToday || isOverduePromise) {
        items.push({
          id: `promesa-${p.id}`,
          category: 'PROMESA',
          title: cust.fullName,
          subtitle: `📍 ${cust.neighborhood} • Pactó abonar ${formatCOP(p.promisedAmount)}${p.notes ? ` (${p.notes})` : ''}`,
          badgeLabel: isOverduePromise ? 'PROMESA INCUMPLIDA' : 'PROMESA PARA HOY',
          badgeColor: isOverduePromise ? '#B91C1C' : '#CA8A04',
          badgeBg: isOverduePromise ? '#FEE2E2' : '#FEF9C3',
          customer: cust,
          loan: activeLoan,
          customerInstallments: custInsts,
          priority: 1,
          phone: cust.phone,
          amountHint: formatCOP(p.promisedAmount),
        });
      }
    });

    // Ordenar: primero las urgentes (prioridad 1), luego las medias y oportunidades
    return items.sort((a, b) => a.priority - b.priority);
  }, [customers, loans, installments, promises, todayStr]);

  const counts = useMemo(() => {
    return {
      TODAS: alertItems.length,
      MORAS: alertItems.filter((i) => i.category === 'MORA').length,
      PROMESAS: alertItems.filter((i) => i.category === 'PROMESA').length,
      RENOVACIONES: alertItems.filter((i) => i.category === 'RENOVACION').length,
    };
  }, [alertItems]);

  const filteredItems = useMemo(() => {
    if (activeTab === 'MORAS') return alertItems.filter((i) => i.category === 'MORA');
    if (activeTab === 'PROMESAS') return alertItems.filter((i) => i.category === 'PROMESA');
    if (activeTab === 'RENOVACIONES') return alertItems.filter((i) => i.category === 'RENOVACION');
    return alertItems;
  }, [alertItems, activeTab]);

  const handleCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 12) }]}>
        <View
          style={[
            styles.container,
            { paddingBottom: Math.max(insets.bottom, 12) + 8, flexShrink: 1 },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View style={styles.headerIconWrap}>
                <Bell size={18} color="#2563EB" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Alertas de Cartera</Text>
                <Text style={styles.headerSub}>
                  {alertItems.length === 0
                    ? 'Todo al día • Sin alertas activas'
                    : `${alertItems.length} alertas detectadas en la jornada`}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.75}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Chips de Categorías */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'TODAS' && styles.tabChipActive]}
              onPress={() => setActiveTab('TODAS')}
            >
              <Text style={[styles.tabChipText, activeTab === 'TODAS' && styles.tabChipTextActive]}>
                Todas ({counts.TODAS})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabChip,
                activeTab === 'MORAS' && styles.tabChipActive,
                counts.MORAS > 0 && { borderColor: '#FECACA' },
              ]}
              onPress={() => setActiveTab('MORAS')}
            >
              <Text style={[styles.tabChipText, activeTab === 'MORAS' && styles.tabChipTextActive]}>
                ⚠️ En Mora ({counts.MORAS})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'PROMESAS' && styles.tabChipActive]}
              onPress={() => setActiveTab('PROMESAS')}
            >
              <Text style={[styles.tabChipText, activeTab === 'PROMESAS' && styles.tabChipTextActive]}>
                🤝 Promesas ({counts.PROMESAS})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabChip, activeTab === 'RENOVACIONES' && styles.tabChipActive]}
              onPress={() => setActiveTab('RENOVACIONES')}
            >
              <Text style={[styles.tabChipText, activeTab === 'RENOVACIONES' && styles.tabChipTextActive]}>
                🔄 Por Renovar ({counts.RENOVACIONES})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Alertas */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredItems.length === 0 ? (
              <View style={styles.emptyWrap}>
                <CheckCircle size={40} color="#16A34A" style={{ marginBottom: 10 }} />
                <Text style={styles.emptyTitle}>¡Excelente! Sin alertas pendientes</Text>
                <Text style={styles.emptySub}>
                  No hay créditos en mora crítica, promesas vencidas ni alertas en esta categoría.
                </Text>
              </View>
            ) : (
              filteredItems.map((item) => (
                <View key={item.id} style={styles.alertCard}>
                  {/* Fila superior: Nombre y Badge */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      onClose();
                      onViewCustomerDetail(item.customer);
                    }}
                    style={styles.cardHeaderTouch}
                  >
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.cardCustomerName} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.cardSubText} numberOfLines={2}>
                        {item.subtitle}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.alertBadge,
                        { backgroundColor: item.badgeBg, borderColor: item.badgeColor },
                      ]}
                    >
                      <Text style={[styles.alertBadgeText, { color: item.badgeColor }]}>
                        {item.badgeLabel}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Fila de Acciones Rápidas */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.btnActionCobrar}
                      activeOpacity={0.8}
                      onPress={() => {
                        onClose();
                        onSelectCustomerToPay(item.customer, item.loan);
                      }}
                    >
                      <Text style={styles.btnActionCobrarText}>💵 Cobrar {item.amountHint}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnActionIcon, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                      activeOpacity={0.75}
                      onPress={() => handleCall(item.phone)}
                    >
                      <Phone size={14} color="#1D4ED8" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnActionIcon, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                      activeOpacity={0.75}
                      onPress={() => {
                        onClose();
                        onQuickWhatsApp(item.customer, item.loan, item.customerInstallments);
                      }}
                    >
                      <MessageCircle size={14} color="#15803D" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeFooterBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeFooterBtnText}>Cerrar Notificaciones</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  headerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabChipActive: {
    backgroundColor: '#1E3A8A',
    borderColor: '#1E3A8A',
  },
  tabChipText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  listScroll: {
    maxHeight: 460,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHeaderTouch: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  cardCustomerName: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSubText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  alertBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  alertBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  btnActionCobrar: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActionCobrarText: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  btnActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
    marginBottom: 4,
  },
  emptySub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 280,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  closeFooterBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeFooterBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#475569',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
