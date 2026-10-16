import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { DailySettlement, Route, User } from '../../../core/domain/types';
import { formatCOP } from '../../../core/config/business-rules';
import { COLORS } from '../../theme/colors';
import { Landmark, Calendar, AlertTriangle, CheckCircle, Filter } from 'lucide-react-native';

interface SettlementsTableViewProps {
  settlements: DailySettlement[];
  routes: Route[];
  users: User[];
  onOpenNewSettlement: () => void;
}

export const SettlementsTableView: React.FC<SettlementsTableViewProps> = ({
  settlements,
  routes,
  users,
  onOpenNewSettlement,
}) => {
  const [selectedRouteId, setSelectedRouteId] = useState<string>('ALL');

  const filteredSettlements = settlements.filter((s) => {
    if (selectedRouteId !== 'ALL' && s.routeId !== selectedRouteId) return false;
    return true;
  });

  // Consolidado Semanal (Handoff punto 24)
  const weeklyConsolidated = {
    totalCollections: filteredSettlements.reduce((sum, s) => sum + s.actualCollection, 0),
    totalExpected: filteredSettlements.reduce((sum, s) => sum + s.expectedCollection, 0),
    newLoansCount: filteredSettlements.reduce((sum, s) => sum + s.newLoansCount, 0),
    newLoansCapital: filteredSettlements.reduce((sum, s) => sum + s.newLoansCapitalPlaced, 0),
    renewalsCount: filteredSettlements.reduce((sum, s) => sum + s.renewalsCount, 0),
    renewalsCapital: filteredSettlements.reduce((sum, s) => sum + s.renewalsCapitalPlaced, 0),
    actualCashDisbursed: filteredSettlements.reduce((sum, s) => sum + s.actualCashDisbursedTotal, 0),
    recoveredDelinquency: filteredSettlements.reduce((sum, s) => sum + s.recoveredDelinquency, 0),
    totalCashDifference: filteredSettlements.reduce((sum, s) => sum + s.cashDifference, 0),
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Liquidaciones y Arqueos</Text>
          <Text style={styles.subtitle}>Auditoría de cierres diarios y consolidado semanal</Text>
        </View>
        <TouchableOpacity style={styles.newSettlementBtn} onPress={onOpenNewSettlement}>
          <Landmark size={16} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={styles.newSettlementBtnText}>Liquidar Hoy</Text>
        </TouchableOpacity>
      </View>

      {/* CONSOLIDADO SEMANAL (Handoff punto 24) */}
      <View style={styles.consolidatedCard}>
        <View style={styles.consolidatedHeader}>
          <Calendar size={18} color={COLORS.primary} style={{ marginRight: 8 }} />
          <Text style={styles.consolidatedTitle}>CONSOLIDADO SEMANAL DE CARTERA</Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Cobro Total</Text>
            <Text style={[styles.metricVal, { color: COLORS.success }]}>
              {formatCOP(weeklyConsolidated.totalCollections)}
            </Text>
            <Text style={styles.metricSub}>Esperado: {formatCOP(weeklyConsolidated.totalExpected)}</Text>
          </View>

          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Renovaciones</Text>
            <Text style={[styles.metricVal, { color: COLORS.purple }]}>
              {weeklyConsolidated.renewalsCount} créditos
            </Text>
            <Text style={styles.metricSub}>Capital: {formatCOP(weeklyConsolidated.renewalsCapital)}</Text>
          </View>

          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Desembolso Real</Text>
            <Text style={styles.metricVal}>
              {formatCOP(weeklyConsolidated.actualCashDisbursed)}
            </Text>
            <Text style={styles.metricSub}>Dinero entregado</Text>
          </View>

          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Diferencia Arqueo</Text>
            <Text
              style={[
                styles.metricVal,
                { color: weeklyConsolidated.totalCashDifference === 0 ? COLORS.success : COLORS.danger },
              ]}
            >
              {weeklyConsolidated.totalCashDifference === 0
                ? '$0 (Cuadrada)'
                : formatCOP(weeklyConsolidated.totalCashDifference)}
            </Text>
            <Text style={styles.metricSub}>Descuadre en caja</Text>
          </View>
        </View>
      </View>

      {/* Filtro por Ruta */}
      <View style={styles.filterRow}>
        <Filter size={16} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
        <Text style={styles.filterLabel}>Filtrar por Ruta:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 8 }}>
          <TouchableOpacity
            style={[styles.filterChip, selectedRouteId === 'ALL' && styles.filterChipActive]}
            onPress={() => setSelectedRouteId('ALL')}
          >
            <Text style={[styles.filterChipText, selectedRouteId === 'ALL' && styles.filterChipTextActive]}>
              Todas
            </Text>
          </TouchableOpacity>
          {routes.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.filterChip, selectedRouteId === r.id && styles.filterChipActive]}
              onPress={() => setSelectedRouteId(r.id)}
            >
              <Text style={[styles.filterChipText, selectedRouteId === r.id && styles.filterChipTextActive]}>
                {r.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Historial de Liquidaciones Diarias */}
      <Text style={styles.historyTitle}>Historial de Liquidaciones Diarias Cerradas</Text>

      {filteredSettlements.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No hay liquidaciones registradas en este período.</Text>
        </View>
      ) : (
        filteredSettlements.map((s) => {
          const route = routes.find((r) => r.id === s.routeId);
          const collector = users.find((u) => u.id === s.collectorId);

          return (
            <View key={s.id} style={styles.settlementCard}>
              <View style={styles.cardTopRow}>
                <View>
                  <Text style={styles.settlementDate}>{s.date} • {route?.name || s.routeId}</Text>
                  <Text style={styles.collectorName}>Cobrador: {collector?.name || s.collectorId}</Text>
                </View>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{s.status}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.breakdownRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bLabel}>Cobro Esperado:</Text>
                  <Text style={styles.bVal}>{formatCOP(s.expectedCollection)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bLabel}>Cobro Realizado:</Text>
                  <Text style={[styles.bVal, { color: COLORS.success }]}>{formatCOP(s.actualCollection)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bLabel}>Efectivo Entregado:</Text>
                  <Text style={styles.bVal}>{formatCOP(s.cashHandedOver)}</Text>
                </View>
              </View>

              {/* Resultado del Arqueo */}
              <View style={styles.arqueoResultRow}>
                {s.cashDifference === 0 ? (
                  <View style={styles.balancedBadge}>
                    <CheckCircle size={14} color={COLORS.success} style={{ marginRight: 6 }} />
                    <Text style={styles.balancedText}>Arqueo exacto ($0 diferencia)</Text>
                  </View>
                ) : (
                  <View style={styles.unbalancedBadge}>
                    <AlertTriangle size={14} color={COLORS.danger} style={{ marginRight: 6 }} />
                    <Text style={styles.unbalancedText}>
                      Diferencia de caja: {formatCOP(s.cashDifference)}
                    </Text>
                  </View>
                )}
              </View>

              {s.differenceJustification && (
                <View style={styles.justificationBox}>
                  <Text style={styles.justificationLabel}>Justificación del Descuadre:</Text>
                  <Text style={styles.justificationText}>"{s.differenceJustification}"</Text>
                </View>
              )}
            </View>
          );
        })
      )}
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
    marginBottom: 16,
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
  newSettlementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  newSettlementBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  consolidatedCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 20,
  },
  consolidatedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  consolidatedTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.bgPrimary,
    padding: 12,
    borderRadius: 10,
  },
  metricLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metricVal: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  metricSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  filterLabel: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChip: {
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  historyTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  settlementCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementDate: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  collectorName: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.bgTertiary,
    marginVertical: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  bLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  bVal: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  arqueoResultRow: {
    marginTop: 4,
  },
  balancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: 8,
    borderRadius: 6,
  },
  balancedText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  unbalancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    padding: 8,
    borderRadius: 6,
  },
  unbalancedText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: 'bold',
  },
  justificationBox: {
    backgroundColor: COLORS.bgPrimary,
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  justificationLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  justificationText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
