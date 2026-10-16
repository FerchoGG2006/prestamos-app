import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {
  Customer,
  Loan,
  Installment,
  Payment,
  Renewal,
  Route,
  DailySettlement,
  CashMovement,
} from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { calculateDelinquencyMetrics } from '../../../core/domain/calculator';
import { COLORS } from '../../theme/colors';
import {
  TrendingUp,
  AlertCircle,
  Users,
  DollarSign,
  Landmark,
  RefreshCw,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react-native';

interface AdminDashboardViewProps {
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  payments: Payment[];
  renewals: Renewal[];
  routes: Route[];
  settlements: DailySettlement[];
  cashMovements: CashMovement[];
  todayStr: string;
  onNavigateTab: (tab: string) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  customers,
  loans,
  installments,
  payments,
  renewals,
  routes,
  settlements,
  cashMovements,
  todayStr,
  onNavigateTab,
}) => {
  // 1. CARTERA GLOBAL
  const activeLoans = loans.filter((l) => l.status === 'ACTIVE');
  const totalPrincipalPlaced = loans.reduce((sum, l) => sum + l.principal, 0);
  const totalPendingPortfolio = installments.reduce((sum, i) => sum + i.pendingAmount, 0);

  // 2. COBROS DE HOY
  const todayPayments = payments.filter((p) => p.createdAt === todayStr);
  const todayCollected = todayPayments.reduce((sum, p) => sum + p.amountReceived, 0);
  const todayInstallments = installments.filter((i) => i.dueDate === todayStr);
  const todayExpected = todayInstallments.reduce((sum, i) => sum + i.expectedAmount, 0);
  const todayPending = Math.max(0, todayExpected - todayCollected);

  // 3. MORA GLOBAL
  const customersWithDelinquency = customers.filter((c) => {
    const custLoans = loans.filter((l) => l.customerId === c.id && l.status === 'ACTIVE');
    const custInsts = installments.filter((i) => custLoans.some((l) => l.id === i.loanId));
    return calculateDelinquencyMetrics(custInsts, todayStr).hasDelinquency;
  });

  const totalOverdueAmount = installments
    .filter((i) => i.status === 'VENCIDA' || (i.status === 'PARCIAL' && i.dueDate < todayStr))
    .reduce((sum, i) => sum + i.pendingAmount, 0);

  // 4. RENOVACIONES
  const totalRenewedCapital = renewals.reduce((sum, r) => sum + r.newPrincipal, 0);
  const totalActualCashDisbursed = renewals.reduce((sum, r) => sum + r.actualCashDisbursed, 0);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Título y Fecha */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Panel de Control Administrativo</Text>
          <Text style={styles.subtitle}>Supervisión en tiempo real de cartera, rutas y caja</Text>
        </View>
        <View style={styles.dateBadge}>
          <Clock size={14} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
          <Text style={styles.dateText}>{todayStr}</Text>
        </View>
      </View>

      {/* Grid de KPIs Principales */}
      <View style={styles.kpiGrid}>
        {/* Cartera Activa */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiIconWrap}>
            <TrendingUp size={20} color={COLORS.primary} />
          </View>
          <Text style={styles.kpiLabel}>Cartera por Cobrar</Text>
          <Text style={styles.kpiValue}>{formatCOP(totalPendingPortfolio)}</Text>
          <Text style={styles.kpiSubtext}>{activeLoans.length} créditos activos</Text>
        </View>

        {/* Cobrado Hoy */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.successLight }]}>
            <DollarSign size={20} color={COLORS.success} />
          </View>
          <Text style={styles.kpiLabel}>Recaudado Hoy</Text>
          <Text style={[styles.kpiValue, { color: COLORS.success }]}>{formatCOP(todayCollected)}</Text>
          <Text style={styles.kpiSubtext}>Esperado: {formatCOP(todayExpected)}</Text>
        </View>

        {/* Cartera Vencida (Mora) */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.dangerLight }]}>
            <AlertCircle size={20} color={COLORS.danger} />
          </View>
          <Text style={styles.kpiLabel}>Mora Total</Text>
          <Text style={[styles.kpiValue, { color: COLORS.danger }]}>{formatCOP(totalOverdueAmount)}</Text>
          <Text style={styles.kpiSubtext}>{customersWithDelinquency.length} clientes atrasados</Text>
        </View>

        {/* Renovaciones y Colocación */}
        <View style={styles.kpiCard}>
          <View style={[styles.kpiIconWrap, { backgroundColor: COLORS.purpleLight }]}>
            <RefreshCw size={20} color={COLORS.purple} />
          </View>
          <Text style={styles.kpiLabel}>Capital Renovado</Text>
          <Text style={[styles.kpiValue, { color: COLORS.purple }]}>{formatCOP(totalRenewedCapital)}</Text>
          <Text style={styles.kpiSubtext}>Desembolso real: {formatCOP(totalActualCashDisbursed)}</Text>
        </View>
      </View>

      {/* Desempeño por Rutas */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Operación por Rutas</Text>
          <TouchableOpacity onPress={() => onNavigateTab('RUTAS')}>
            <Text style={styles.viewMoreText}>Ver todas</Text>
          </TouchableOpacity>
        </View>

        {routes.map((route) => {
          const routeLoans = loans.filter((l) => l.routeId === route.id);
          const routeCustomers = customers.filter((c) => c.routeId === route.id);
          const routeInstallments = installments.filter((i) =>
            routeLoans.some((l) => l.id === i.loanId)
          );
          const routeBalance = routeInstallments.reduce((sum, i) => sum + i.pendingAmount, 0);

          return (
            <View key={route.id} style={styles.routeItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeName}>{route.name} ({route.code})</Text>
                <Text style={styles.routeMeta}>
                  {routeCustomers.length} clientes • {routeLoans.filter((l) => l.status === 'ACTIVE').length} créditos activos
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.routeBalance}>{formatCOP(routeBalance)}</Text>
                <Text style={styles.routeBalanceLabel}>Saldo de ruta</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Flujo de Caja y Movimientos Recientes */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Flujo de Caja (Entradas y Salidas)</Text>
          <TouchableOpacity onPress={() => onNavigateTab('LIQUIDACIONES')}>
            <Text style={styles.viewMoreText}>Ver liquidaciones</Text>
          </TouchableOpacity>
        </View>

        {cashMovements.slice(0, 5).map((m) => (
          <View key={m.id} style={styles.cashItem}>
            <View style={styles.cashIconWrap}>
              {m.type === 'INCOME' ? (
                <ArrowDownRight size={18} color={COLORS.success} />
              ) : (
                <ArrowUpRight size={18} color={COLORS.danger} />
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.cashDesc}>{m.description}</Text>
              <Text style={styles.cashDate}>{m.createdAt}</Text>
            </View>
            <Text
              style={[
                styles.cashAmount,
                { color: m.type === 'INCOME' ? COLORS.success : COLORS.danger },
              ]}
            >
              {m.type === 'INCOME' ? '+' : '-'} {formatCOP(m.amount)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  dateText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.bgSecondary,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginVertical: 4,
  },
  kpiSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  sectionCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  viewMoreText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  routeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  routeName: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  routeMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  routeBalance: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
  },
  routeBalanceLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },
  cashItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  cashIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: COLORS.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashDesc: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '500',
  },
  cashDate: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  cashAmount: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});
