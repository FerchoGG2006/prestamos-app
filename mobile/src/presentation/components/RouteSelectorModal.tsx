import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Route, Customer, Loan } from '../../core/domain/types';
import { localStore } from '../../infrastructure/storage/local-store';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import {
  X,
  Search,
  Check,
  MapPin,
  Layers,
  User as UserIcon,
  ChevronRight,
  Navigation,
} from 'lucide-react-native';

interface RouteSelectorModalProps {
  visible: boolean;
  routes: Route[];
  selectedRouteId: string; // 'ALL' o ID de la ruta
  customers: Customer[];
  loans: Loan[];
  onSelectRoute: (routeId: string) => void;
  onClose: () => void;
}

export const RouteSelectorModal: React.FC<RouteSelectorModalProps> = ({
  visible,
  routes,
  selectedRouteId,
  customers,
  loans,
  onSelectRoute,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const allUsers = localStore.getUsers();

  const getCollectorName = (collectorId: string): string => {
    const user = allUsers.find((u) => u.id === collectorId);
    return user?.name || 'Cobrador no asignado';
  };

  const getRouteStats = (routeId: string) => {
    const routeCustomers =
      routeId === 'ALL'
        ? customers
        : customers.filter((c) => (c.routeId || 'route-norte') === routeId);
    const activeLoans =
      routeId === 'ALL'
        ? loans.filter((l) => l.status === 'ACTIVE')
        : loans.filter(
            (l) =>
              l.status === 'ACTIVE' &&
              ((l.routeId || 'route-norte') === routeId ||
                routeCustomers.some((c) => c.id === l.customerId))
          );
    return {
      customersCount: routeCustomers.length,
      activeLoansCount: activeLoans.length,
    };
  };

  // Filtrado reactivo de rutas por nombre, código o cobrador
  const filteredRoutes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) => {
      const matchName = r.name.toLowerCase().includes(q);
      const matchCode = r.code.toLowerCase().includes(q);
      const collector = getCollectorName(r.collectorId).toLowerCase();
      const matchCollector = collector.includes(q);
      const matchDesc = (r.description || '').toLowerCase().includes(q);
      return matchName || matchCode || matchCollector || matchDesc;
    });
  }, [routes, searchQuery, allUsers]);

  const allStats = getRouteStats('ALL');

  const handleSelect = (routeId: string) => {
    onSelectRoute(routeId);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { paddingTop: Math.max(insets.top, 12) }]}
      >
        <View
          style={[
            styles.sheetContainer,
            { paddingBottom: Math.max(insets.bottom, 12) + 8, flexShrink: 1 },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Navigation size={18} color={COLORS.primary} />
                <Text style={styles.headerTitle}>Seleccionar Ruta Operativa</Text>
              </View>
              <Text style={styles.headerSub}>
                Filtra y cambia la ruta para visualizar sus créditos, cobros y clientes
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={19} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Buscador de rutas */}
          <View style={styles.searchBox}>
            <Search size={15} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar ruta por nombre, código o cobrador..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={14} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Lista de rutas */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Opción 1: Todas las rutas (Consolidado) */}
            <TouchableOpacity
              style={[
                styles.routeCard,
                selectedRouteId === 'ALL' && styles.routeCardSelected,
              ]}
              activeOpacity={0.75}
              onPress={() => handleSelect('ALL')}
            >
              <View
                style={[
                  styles.routeIconBox,
                  selectedRouteId === 'ALL' && styles.routeIconBoxSelected,
                ]}
              >
                <Layers
                  size={20}
                  color={selectedRouteId === 'ALL' ? '#FFFFFF' : COLORS.primary}
                />
              </View>

              <View style={styles.routeInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text
                    style={[
                      styles.routeName,
                      selectedRouteId === 'ALL' && styles.routeNameSelected,
                    ]}
                  >
                    Todas las Rutas (Consolidado)
                  </Text>
                  <View style={styles.allBadge}>
                    <Text style={styles.allBadgeText}>GLOBAL</Text>
                  </View>
                </View>
                <Text style={styles.routeSub} numberOfLines={1}>
                  Supervisión y auditoría de todas las zonas de cobranza
                </Text>
                <Text style={styles.routeMetricsText}>
                  👥 {allStats.customersCount} clientes • 💼 {allStats.activeLoansCount} créditos activos
                </Text>
              </View>

              <View style={styles.selectCheckCol}>
                {selectedRouteId === 'ALL' ? (
                  <View style={styles.checkCircleActive}>
                    <Check size={14} color="#FFFFFF" />
                  </View>
                ) : (
                  <View style={styles.checkCircleInactive} />
                )}
              </View>
            </TouchableOpacity>

            {/* Separador de Rutas Individuales */}
            <View style={styles.dividerRow}>
              <Text style={styles.dividerLabel}>RUTAS INDIVIDUALES ({filteredRoutes.length})</Text>
            </View>

            {filteredRoutes.length === 0 ? (
              <View style={styles.emptyState}>
                <MapPin size={28} color="#94A3B8" style={{ marginBottom: 6 }} />
                <Text style={styles.emptyTitle}>No se encontraron rutas</Text>
                <Text style={styles.emptySub}>
                  No hay rutas que coincidan con "{searchQuery}".
                </Text>
              </View>
            ) : (
              filteredRoutes.map((route) => {
                const isSelected = selectedRouteId === route.id;
                const stats = getRouteStats(route.id);
                const collectorName = getCollectorName(route.collectorId);

                return (
                  <TouchableOpacity
                    key={route.id}
                    style={[
                      styles.routeCard,
                      isSelected && styles.routeCardSelected,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelect(route.id)}
                  >
                    <View
                      style={[
                        styles.routeIconBox,
                        isSelected && styles.routeIconBoxSelected,
                      ]}
                    >
                      <MapPin
                        size={20}
                        color={isSelected ? '#FFFFFF' : COLORS.primary}
                      />
                    </View>

                    <View style={styles.routeInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text
                          style={[
                            styles.routeName,
                            isSelected && styles.routeNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {route.name}
                        </Text>
                        <View style={styles.codeBadge}>
                          <Text style={styles.codeBadgeText}>{route.code}</Text>
                        </View>
                      </View>

                      <View style={styles.collectorRow}>
                        <UserIcon size={12} color="#64748B" />
                        <Text style={styles.collectorText} numberOfLines={1}>
                          {collectorName}
                        </Text>
                      </View>

                      <Text style={styles.routeMetricsText}>
                        👥 {stats.customersCount} clientes • 💼 {stats.activeLoansCount} créditos activos
                      </Text>
                    </View>

                    <View style={styles.selectCheckCol}>
                      {isSelected ? (
                        <View style={styles.checkCircleActive}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <View style={styles.checkCircleInactive} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  listScroll: {
    maxHeight: 450,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    gap: 12,
  },
  routeCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#F8FAFC',
  },
  routeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconBoxSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  routeInfo: {
    flex: 1,
    gap: 3,
  },
  routeName: {
    fontFamily: FONT_FAMILY,
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  routeNameSelected: {
    color: COLORS.primary,
  },
  allBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  allBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 9.5,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  codeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  codeBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  routeSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748B',
  },
  collectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  collectorText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  routeMetricsText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  selectCheckCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleInactive: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  dividerRow: {
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  dividerLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  emptySub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
});
