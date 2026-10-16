import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { localStore } from './src/infrastructure/storage/local-store';
import {
  Customer,
  Loan,
  Installment,
  Payment,
  Renewal,
  Route,
  DailySettlement,
  CollectionSession,
  PaymentPromise,
  CashMovement,
  DailyRouteMetrics,
} from './src/core/domain/types';
import { COLORS } from './src/presentation/theme/colors';
import { TodayCollectionsView } from './src/presentation/views/collector/TodayCollectionsView';
import { CustomerDetailView } from './src/presentation/views/collector/CustomerDetailView';
import { CreditHistoryView } from './src/presentation/views/collector/CreditHistoryView';
import { SettlementsTableView } from './src/presentation/views/admin/SettlementsTableView';
import { PaymentModal } from './src/presentation/components/PaymentModal';
import { RenewalModal } from './src/presentation/components/RenewalModal';
import { PromiseModal } from './src/presentation/components/PromiseModal';
import { SettlementModal } from './src/presentation/components/SettlementModal';
import { NewCustomerModal } from './src/presentation/components/NewCustomerModal';
import { NewLoanModal } from './src/presentation/components/NewLoanModal';
import {
  Smartphone,
  DollarSign,
  Users,
  Landmark,
  Wifi,
  UserPlus,
  ChevronRight,
  Plus,
  FilePlus2,
  RotateCcw,
  ClipboardList,
} from 'lucide-react-native';

export default function App() {
  const { width, height } = useWindowDimensions();
  const isWideViewport = width >= 500;

  // Permite alternar marco de teléfono simulado (390x844) cuando se visualiza en pantallas anchas / IDE
  const [phoneFrameEnabled, setPhoneFrameEnabled] = useState(true);

  // Tabs móviles del cobrador
  const [collectorTab, setCollectorTab] = useState<'COBROS' | 'CLIENTES' | 'HISTORIAL' | 'LIQUIDAR'>('COBROS');
  const [historyInitialDoc, setHistoryInitialDoc] = useState<string>('');

  // Estado reactivo del almacén local
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [settlements, setSettlements] = useState<DailySettlement[]>([]);
  const [session, setSession] = useState<CollectionSession | null>(null);
  const [promises, setPromises] = useState<PaymentPromise[]>([]);
  const [, setCashMovements] = useState<CashMovement[]>([]);

  // Modales operativos
  const [paymentModalData, setPaymentModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
    loan: Loan | null;
  }>({ visible: false, customer: null, loan: null });

  const [renewalModalData, setRenewalModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
    loan: Loan | null;
  }>({ visible: false, customer: null, loan: null });

  const [promiseModalData, setPromiseModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
    loan: Loan | null;
  }>({ visible: false, customer: null, loan: null });

  const [settlementModalVisible, setSettlementModalVisible] = useState(false);
  const [newCustomerModalVisible, setNewCustomerModalVisible] = useState(false);
  const [newLoanModalVisible, setNewLoanModalVisible] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const todayStr = '2026-09-19'; // Fecha operativa de trabajo en ruta

  const syncFromStore = () => {
    setCustomers([...localStore.getCustomers()]);
    setLoans([...localStore.getLoans()]);
    setInstallments([...localStore.getInstallments()]);
    setPayments([...localStore.getPayments()]);
    setRenewals([...localStore.getRenewals()]);
    setRoutes([...localStore.getRoutes()]);
    setSettlements([...localStore.getSettlements()]);
    setSession(localStore.getActiveSession());
    setPromises([...localStore.getPromises()]);
    setCashMovements([...localStore.getCashMovements()]);
  };

  useEffect(() => {
    localStore.initialize().then(() => {
      syncFromStore();
    });
    const unsubscribe = localStore.subscribe(() => {
      syncFromStore();
    });
    return () => unsubscribe();
  }, []);

  const routeMetrics: DailyRouteMetrics = localStore.getDailyRouteMetrics(todayStr);

  // Acción del FAB Central (+): abre el Drawer de Abono Rápido en el primer cliente pendiente de hoy
  const handleCentralFabPress = () => {
    for (const c of customers) {
      const activeLoan = loans.find(
        (l) => l.customerId === c.id && l.status === 'ACTIVE'
      );
      if (!activeLoan) continue;
      const loanInsts = installments.filter((i) => i.loanId === activeLoan.id);
      const hasPending = loanInsts.some(
        (i) => i.dueDate <= todayStr && i.pendingAmount > 0
      );
      if (hasPending) {
        setPaymentModalData({ visible: true, customer: c, loan: activeLoan });
        return;
      }
    }
    const firstWithActiveLoan = customers.find((c) =>
      loans.some((l) => l.customerId === c.id && l.status === 'ACTIVE')
    );
    if (firstWithActiveLoan) {
      const loan = loans.find(
        (l) => l.customerId === firstWithActiveLoan.id && l.status === 'ACTIVE'
      )!;
      setPaymentModalData({ visible: true, customer: firstWithActiveLoan, loan });
    } else {
      Alert.alert('Ruta al día', 'No hay préstamos activos pendientes de cobro.');
    }
  };

  const mobileContent = (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bgPrimary} />

      {/* Top Bar Móvil Limpio (Clean Fintech UI) */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadgeIcon}>
            <Smartphone size={15} color="#ffffff" />
          </View>
          <View>
            <Text style={styles.brandTitle}>CARTERA MÓVIL</Text>
            <Text style={styles.brandSub}>Ruta Norte • {todayStr}</Text>
          </View>
        </View>

        <View style={styles.rightTopActions}>
          <TouchableOpacity
            style={styles.demoResetBtn}
            onPress={async () => {
              await localStore.resetToDemoSeed();
              syncFromStore();
              Alert.alert('Datos Demo Restaurados', 'Se han restablecido los clientes, préstamos y saldos iniciales.');
            }}
          >
            <RotateCcw size={11} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
            <Text style={styles.demoResetText}>Reset Demo</Text>
          </TouchableOpacity>

          <View style={styles.offlineBadge}>
            <Wifi size={12} color={COLORS.success} style={{ marginRight: 4 }} />
            <Text style={styles.offlineText}>Offline-First</Text>
          </View>

          {isWideViewport && (
            <TouchableOpacity
              style={styles.frameToggleBtn}
              onPress={() => setPhoneFrameEnabled(!phoneFrameEnabled)}
            >
              <Text style={styles.frameToggleText}>
                {phoneFrameEnabled ? '📱 iPhone' : '🖥️ Full'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contenido Principal Móvil */}
      <View style={styles.mainContainer}>
        {detailCustomer ? (
          <CustomerDetailView
            customer={detailCustomer}
            loans={loans}
            installments={installments}
            payments={payments}
            renewals={renewals}
            promises={promises}
            todayStr={todayStr}
            onBack={() => setDetailCustomer(null)}
            onPayLoan={(cust, loan) =>
              setPaymentModalData({ visible: true, customer: cust, loan })
            }
            onRenewLoan={(cust, loan) =>
              setRenewalModalData({ visible: true, customer: cust, loan })
            }
            onOpenCreditHistory={(cust) => {
              setDetailCustomer(null);
              setHistoryInitialDoc(cust.documentNumber);
              setCollectorTab('HISTORIAL');
            }}
          />
        ) : collectorTab === 'HISTORIAL' ? (
          <CreditHistoryView
            customers={customers}
            loans={loans}
            installments={installments}
            payments={payments}
            todayStr={todayStr}
            initialDocumentNumber={historyInitialDoc}
            onOpenNewLoan={(c) => {
              setNewLoanModalVisible(true);
            }}
            onOpenPayment={(c, l) => {
              setPaymentModalData({ visible: true, customer: c, loan: l });
            }}
          />
        ) : collectorTab === 'COBROS' ? (
          <TodayCollectionsView
            customers={customers}
            loans={loans}
            installments={installments}
            promises={promises}
            metrics={routeMetrics}
            todayStr={todayStr}
            onSelectCustomerToPay={(customer, loan) =>
              setPaymentModalData({ visible: true, customer, loan })
            }
            onSelectCustomerToRenew={(customer, loan) =>
              setRenewalModalData({ visible: true, customer, loan })
            }
            onSelectCustomerPromise={(customer, loan) =>
              setPromiseModalData({ visible: true, customer, loan })
            }
            onViewCustomerDetail={(customer) => setDetailCustomer(customer)}
            onOpenNewCustomer={() => setNewCustomerModalVisible(true)}
            onOpenNewLoan={() => setNewLoanModalVisible(true)}
            onOpenSettlement={() => setSettlementModalVisible(true)}
          />
        ) : collectorTab === 'CLIENTES' ? (
          <ScrollView
            style={{ flex: 1, padding: 16 }}
            contentContainerStyle={{ paddingBottom: 112 }}
          >
            <View style={styles.directoryHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>
                Directorio de Ruta ({customers.length})
              </Text>
              <TouchableOpacity
                style={styles.addCustomerHeaderBtn}
                onPress={() => setNewCustomerModalVisible(true)}
              >
                <UserPlus size={14} color="#ffffff" style={{ marginRight: 5 }} />
                <Text style={styles.addCustomerHeaderText}>+ Cliente</Text>
              </TouchableOpacity>
            </View>

            {customers.map((c) => {
              const activeLoan = loans.find(
                (l) => l.customerId === c.id && l.status === 'ACTIVE'
              );
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.customerListItem}
                  onPress={() => setDetailCustomer(c)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{c.fullName}</Text>
                    <Text style={styles.itemSub}>
                      {c.businessName || c.occupation} • {c.neighborhood} • Tel: {c.phone}
                    </Text>
                  </View>
                  <View style={styles.customerRightMeta}>
                    <View
                      style={[
                        styles.semanticLoanPill,
                        activeLoan
                          ? {
                              backgroundColor: COLORS.infoLight,
                              borderColor: COLORS.infoBorder,
                            }
                          : {
                              backgroundColor: COLORS.surfaceSoft,
                              borderColor: COLORS.microBorder,
                            },
                      ]}
                    >
                      <Text
                        style={[
                          styles.loanTagText,
                          { color: activeLoan ? COLORS.primary : COLORS.textMuted },
                        ]}
                      >
                        {activeLoan ? activeLoan.loanNumber : 'Sin crédito'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={COLORS.textMuted} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
          <SettlementsTableView
            settlements={settlements}
            routes={routes}
            users={localStore.getUsers()}
            onOpenNewSettlement={() => setSettlementModalVisible(true)}
          />
        )}
      </View>

      {/* PATRÓN #3 DE GEMINI SHARE: FLOATING BOTTOM DOCK CON FAB CENTRAL SOBRESALIENTE
          Píldora flotante en índigo/púrpura oscuro (#1E1B4B) despegada de los bordes con botón central (+) */}
      {!detailCustomer && (
        <View style={styles.floatingDockWrapper} pointerEvents="box-none">
          <View style={styles.floatingDockPill}>
            {/* Tab 1: Ruta Hoy */}
            <TouchableOpacity
              style={styles.dockNavBtn}
              onPress={() => setCollectorTab('COBROS')}
            >
              <DollarSign
                size={20}
                color={
                  collectorTab === 'COBROS' ? COLORS.dockActive : COLORS.dockInactive
                }
              />
              <Text
                style={[
                  styles.dockNavText,
                  collectorTab === 'COBROS' && styles.dockNavTextActive,
                ]}
              >
                Ruta
              </Text>
            </TouchableOpacity>

            {/* Tab 2: Clientes */}
            <TouchableOpacity
              style={styles.dockNavBtn}
              onPress={() => setCollectorTab('CLIENTES')}
            >
              <Users
                size={20}
                color={
                  collectorTab === 'CLIENTES' ? COLORS.dockActive : COLORS.dockInactive
                }
              />
              <Text
                style={[
                  styles.dockNavText,
                  collectorTab === 'CLIENTES' && styles.dockNavTextActive,
                ]}
              >
                Clientes
              </Text>
            </TouchableOpacity>

            {/* FAB Central Sobresaliente (+ Cobro 1-Toque) */}
            <View style={styles.fabCenterSlot}>
              <TouchableOpacity
                style={styles.centralFabButton}
                activeOpacity={0.9}
                onPress={handleCentralFabPress}
              >
                <Plus size={26} color="#FFFFFF" strokeWidth={2.8} />
              </TouchableOpacity>
            </View>

            {/* Tab 3: Historial Crediticio */}
            <TouchableOpacity
              style={styles.dockNavBtn}
              onPress={() => {
                setHistoryInitialDoc('');
                setCollectorTab('HISTORIAL');
              }}
            >
              <ClipboardList
                size={20}
                color={
                  collectorTab === 'HISTORIAL' ? COLORS.dockActive : COLORS.dockInactive
                }
              />
              <Text
                style={[
                  styles.dockNavText,
                  collectorTab === 'HISTORIAL' && styles.dockNavTextActive,
                ]}
              >
                Historial
              </Text>
            </TouchableOpacity>

            {/* Tab 4: Mi Caja / Cuadre */}
            <TouchableOpacity
              style={styles.dockNavBtn}
              onPress={() => setSettlementModalVisible(true)}
            >
              <Landmark size={20} color="#34D399" />
              <Text style={[styles.dockNavText, { color: '#34D399', fontWeight: '800' }]}>
                Mi Caja
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Modales y Bottom Sheets Operativos */}
      <PaymentModal
        visible={paymentModalData.visible}
        customer={paymentModalData.customer}
        loan={paymentModalData.loan}
        installments={installments}
        todayStr={todayStr}
        onClose={() =>
          setPaymentModalData({ visible: false, customer: null, loan: null })
        }
        onSuccess={syncFromStore}
      />

      <RenewalModal
        visible={renewalModalData.visible}
        customer={renewalModalData.customer}
        loan={renewalModalData.loan}
        installments={installments}
        todayStr={todayStr}
        onClose={() =>
          setRenewalModalData({ visible: false, customer: null, loan: null })
        }
        onSuccess={syncFromStore}
      />

      <PromiseModal
        visible={promiseModalData.visible}
        customer={promiseModalData.customer}
        loan={promiseModalData.loan}
        todayStr={todayStr}
        onClose={() =>
          setPromiseModalData({ visible: false, customer: null, loan: null })
        }
        onSuccess={syncFromStore}
      />

      <SettlementModal
        visible={settlementModalVisible}
        session={session}
        payments={payments}
        metrics={routeMetrics}
        todayStr={todayStr}
        onClose={() => setSettlementModalVisible(false)}
        onSuccess={syncFromStore}
      />

      <NewCustomerModal
        visible={newCustomerModalVisible}
        todayStr={todayStr}
        onClose={() => setNewCustomerModalVisible(false)}
        onSuccess={syncFromStore}
      />

      <NewLoanModal
        visible={newLoanModalVisible}
        customers={customers}
        loans={loans}
        todayStr={todayStr}
        onClose={() => setNewLoanModalVisible(false)}
        onSuccess={syncFromStore}
      />
    </SafeAreaView>
  );

  // Si estamos en el navegador / IDE con pantalla ancha y phoneFrameEnabled está activo,
  // renderiza un chasis de teléfono móvil realista (406x860) para previsualización exacta
  if (isWideViewport && phoneFrameEnabled) {
    return (
      <View style={styles.simulatorBackdrop}>
        <View
          style={[
            styles.phoneBezel,
            { height: Math.min(860, Math.max(660, height - 24)) },
          ]}
        >
          <View style={styles.phoneDynamicIsland} />
          <View style={styles.phoneScreen}>{mobileContent}</View>
          <View style={styles.phoneHomeIndicator} />
        </View>
      </View>
    );
  }

  return mobileContent;
}

const styles = StyleSheet.create({
  simulatorBackdrop: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  phoneBezel: {
    width: 406,
    backgroundColor: '#1E293B',
    borderRadius: 46,
    padding: 10,
    borderWidth: 3,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 16,
  },
  phoneDynamicIsland: {
    width: 96,
    height: 20,
    backgroundColor: '#090D16',
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 6,
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: COLORS.bgPrimary,
  },
  phoneHomeIndicator: {
    width: 120,
    height: 5,
    backgroundColor: '#64748B',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 6,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    position: 'relative',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.microBorder,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandBadgeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.dockBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  brandSub: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  rightTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  offlineText: {
    color: COLORS.success,
    fontSize: 10,
    fontWeight: '800',
  },
  demoResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  demoResetText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  frameToggleBtn: {
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  frameToggleText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  mainContainer: {
    flex: 1,
  },
  directoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionHeaderTitle: {
    color: COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  addCustomerHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dockBg,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  addCustomerHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  customerListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    padding: 15,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  itemTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  itemSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  customerRightMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  semanticLoanPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
  },
  loanTagText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // FLOATING BOTTOM DOCK CON FAB CENTRAL (Patrón #3 de Gemini Share + Mejora IA #3)
  floatingDockWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    alignItems: 'center',
  },
  floatingDockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 62,
    backgroundColor: COLORS.dockBg,
    borderRadius: 9999,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.dockBorder,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  dockNavBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dockNavText: {
    color: COLORS.dockInactive,
    fontSize: 10,
    fontWeight: '700',
  },
  dockNavTextActive: {
    color: COLORS.dockActive,
    fontWeight: '800',
  },
  fabCenterSlot: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centralFabButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.fabBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26, // Sobresale por encima de la píldora flotante (Floating FAB)
    borderWidth: 4,
    borderColor: COLORS.bgPrimary,
    shadowColor: COLORS.fabBg,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
});
