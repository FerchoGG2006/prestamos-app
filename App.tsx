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
} from './src/core/domain/types';
import { COLORS } from './src/presentation/theme/colors';
import { TodayCollectionsView } from './src/presentation/views/collector/TodayCollectionsView';
import { CustomerDetailView } from './src/presentation/views/collector/CustomerDetailView';
import { AdminDashboardView } from './src/presentation/views/admin/AdminDashboardView';
import { LoansTableView } from './src/presentation/views/admin/LoansTableView';
import { SettlementsTableView } from './src/presentation/views/admin/SettlementsTableView';
import { AuditLogsView } from './src/presentation/views/admin/AuditLogsView';
import { ConfigView } from './src/presentation/views/admin/ConfigView';
import { PaymentModal } from './src/presentation/components/PaymentModal';
import { RenewalModal } from './src/presentation/components/RenewalModal';
import { PromiseModal } from './src/presentation/components/PromiseModal';
import { SettlementModal } from './src/presentation/components/SettlementModal';
import {
  Smartphone,
  Monitor,
  DollarSign,
  Users,
  MapPin,
  Landmark,
  LayoutDashboard,
  CreditCard,
  Wifi,
  ShieldCheck,
  Settings,
} from 'lucide-react-native';

export default function App() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 768;

  // Modo de visualización: Cobrador (Móvil) vs Administración (Desktop)
  const [appMode, setAppMode] = useState<'COLLECTOR' | 'ADMIN'>(
    isLargeScreen ? 'ADMIN' : 'COLLECTOR'
  );

  // Tabs activos
  const [collectorTab, setCollectorTab] = useState<'COBROS' | 'CLIENTES' | 'LIQUIDAR'>('COBROS');
  const [adminTab, setAdminTab] = useState<'DASHBOARD' | 'CREDITOS' | 'LIQUIDACIONES' | 'AUDITORIA' | 'CONFIGURACION'>('DASHBOARD');

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
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);

  // Modales
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
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const todayStr = '2026-09-19'; // Fecha operativa de trabajo

  // Carga e inicialización de datos offline
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bgPrimary} />

      {/* Barra Superior Global: Selector de Modo (Móvil/Desktop) y Estado */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>SISTEMA DE CARTERA</Text>
          <View style={styles.offlineBadge}>
            <Wifi size={12} color={COLORS.success} style={{ marginRight: 4 }} />
            <Text style={styles.offlineText}>Offline-Ready</Text>
          </View>
        </View>

        {/* Interruptor de Modo Móvil / Desktop */}
        <View style={styles.modeSwitch}>
          <TouchableOpacity
            style={[styles.modeBtn, appMode === 'COLLECTOR' && styles.modeBtnActive]}
            onPress={() => {
              setAppMode('COLLECTOR');
              setDetailCustomer(null);
            }}
          >
            <Smartphone size={14} color={appMode === 'COLLECTOR' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.modeBtnText, appMode === 'COLLECTOR' && styles.modeBtnTextActive]}>
              Cobrador (Móvil)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeBtn, appMode === 'ADMIN' && styles.modeBtnActive]}
            onPress={() => {
              setAppMode('ADMIN');
              setDetailCustomer(null);
            }}
          >
            <Monitor size={14} color={appMode === 'ADMIN' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.modeBtnText, appMode === 'ADMIN' && styles.modeBtnTextActive]}>
              Admin (Desktop)
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Contenido Principal */}
      <View style={styles.mainContainer}>
        {detailCustomer ? (
          /* Ficha 360° del Cliente */
          <CustomerDetailView
            customer={detailCustomer}
            loans={loans}
            installments={installments}
            payments={payments}
            renewals={renewals}
            promises={promises}
            todayStr={todayStr}
            onBack={() => setDetailCustomer(null)}
            onPayLoan={(cust, loan) => setPaymentModalData({ visible: true, customer: cust, loan })}
            onRenewLoan={(cust, loan) => setRenewalModalData({ visible: true, customer: cust, loan })}
          />
        ) : appMode === 'COLLECTOR' ? (
          /* VISTAS DEL COBRADOR */
          collectorTab === 'COBROS' ? (
            <TodayCollectionsView
              customers={customers}
              loans={loans}
              installments={installments}
              promises={promises}
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
            />
          ) : collectorTab === 'CLIENTES' ? (
            <ScrollView style={{ flex: 1, padding: 16 }}>
              <Text style={styles.sectionHeaderTitle}>Directorio de Clientes de Ruta</Text>
              {customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.customerListItem}
                  onPress={() => setDetailCustomer(c)}
                >
                  <View>
                    <Text style={styles.itemTitle}>{c.fullName}</Text>
                    <Text style={styles.itemSub}>{c.businessName || c.occupation} • {c.neighborhood}</Text>
                  </View>
                  <Text style={{ color: '#60a5fa', fontWeight: '600' }}>Ver Ficha 360° →</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <SettlementsTableView
              settlements={settlements}
              routes={routes}
              users={localStore.getUsers()}
              onOpenNewSettlement={() => setSettlementModalVisible(true)}
            />
          )
        ) : (
          /* VISTAS DE ADMINISTRACIÓN DESKTOP */
          adminTab === 'DASHBOARD' ? (
            <AdminDashboardView
              customers={customers}
              loans={loans}
              installments={installments}
              payments={payments}
              renewals={renewals}
              routes={routes}
              settlements={settlements}
              cashMovements={cashMovements}
              todayStr={todayStr}
              onNavigateTab={(tab) => {
                if (tab === 'CREDITOS') setAdminTab('CREDITOS');
                if (tab === 'LIQUIDACIONES') setAdminTab('LIQUIDACIONES');
              }}
            />
          ) : adminTab === 'CREDITOS' ? (
            <LoansTableView
              loans={loans}
              customers={customers}
              routes={routes}
              onOpenCustomerDetail={(customer) => setDetailCustomer(customer)}
            />
          ) : adminTab === 'LIQUIDACIONES' ? (
            <SettlementsTableView
              settlements={settlements}
              routes={routes}
              users={localStore.getUsers()}
              onOpenNewSettlement={() => setSettlementModalVisible(true)}
            />
          ) : adminTab === 'AUDITORIA' ? (
            <AuditLogsView logs={localStore.getAuditLogs()} />
          ) : (
            <ConfigView />
          )
        )}
      </View>

      {/* Bottom Navigation para Modo Cobrador */}
      {!detailCustomer && appMode === 'COLLECTOR' && (
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navBtn, collectorTab === 'COBROS' && styles.navBtnActive]}
            onPress={() => setCollectorTab('COBROS')}
          >
            <DollarSign size={22} color={collectorTab === 'COBROS' ? '#60a5fa' : COLORS.textSecondary} />
            <Text style={[styles.navText, collectorTab === 'COBROS' && styles.navTextActive]}>Cobros Hoy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, collectorTab === 'CLIENTES' && styles.navBtnActive]}
            onPress={() => setCollectorTab('CLIENTES')}
          >
            <Users size={22} color={collectorTab === 'CLIENTES' ? '#60a5fa' : COLORS.textSecondary} />
            <Text style={[styles.navText, collectorTab === 'CLIENTES' && styles.navTextActive]}>Clientes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, collectorTab === 'LIQUIDAR' && styles.navBtnActive]}
            onPress={() => setSettlementModalVisible(true)}
          >
            <Landmark size={22} color={COLORS.primary} />
            <Text style={[styles.navText, { color: '#60a5fa', fontWeight: 'bold' }]}>Liquidar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Top/Bottom Navigation para Modo Desktop */}
      {!detailCustomer && appMode === 'ADMIN' && (
        <View style={styles.adminTabBar}>
          <TouchableOpacity
            style={[styles.adminTabBtn, adminTab === 'DASHBOARD' && styles.adminTabBtnActive]}
            onPress={() => setAdminTab('DASHBOARD')}
          >
            <LayoutDashboard size={18} color={adminTab === 'DASHBOARD' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.adminTabText, adminTab === 'DASHBOARD' && styles.adminTabTextActive]}>
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.adminTabBtn, adminTab === 'CREDITOS' && styles.adminTabBtnActive]}
            onPress={() => setAdminTab('CREDITOS')}
          >
            <CreditCard size={18} color={adminTab === 'CREDITOS' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.adminTabText, adminTab === 'CREDITOS' && styles.adminTabTextActive]}>
              Créditos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.adminTabBtn, adminTab === 'LIQUIDACIONES' && styles.adminTabBtnActive]}
            onPress={() => setAdminTab('LIQUIDACIONES')}
          >
            <Landmark size={18} color={adminTab === 'LIQUIDACIONES' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.adminTabText, adminTab === 'LIQUIDACIONES' && styles.adminTabTextActive]}>
              Liquidación
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.adminTabBtn, adminTab === 'AUDITORIA' && styles.adminTabBtnActive]}
            onPress={() => setAdminTab('AUDITORIA')}
          >
            <ShieldCheck size={18} color={adminTab === 'AUDITORIA' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.adminTabText, adminTab === 'AUDITORIA' && styles.adminTabTextActive]}>
              Auditoría
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.adminTabBtn, adminTab === 'CONFIGURACION' && styles.adminTabBtnActive]}
            onPress={() => setAdminTab('CONFIGURACION')}
          >
            <Settings size={18} color={adminTab === 'CONFIGURACION' ? '#ffffff' : COLORS.textSecondary} />
            <Text style={[styles.adminTabText, adminTab === 'CONFIGURACION' && styles.adminTabTextActive]}>
              Ajustes
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modales Operativos */}
      <PaymentModal
        visible={paymentModalData.visible}
        customer={paymentModalData.customer}
        loan={paymentModalData.loan}
        installments={installments}
        onClose={() => setPaymentModalData({ visible: false, customer: null, loan: null })}
        onSuccess={syncFromStore}
      />

      <RenewalModal
        visible={renewalModalData.visible}
        customer={renewalModalData.customer}
        loan={renewalModalData.loan}
        installments={installments}
        onClose={() => setRenewalModalData({ visible: false, customer: null, loan: null })}
        onSuccess={syncFromStore}
      />

      <PromiseModal
        visible={promiseModalData.visible}
        customer={promiseModalData.customer}
        loan={promiseModalData.loan}
        onClose={() => setPromiseModalData({ visible: false, customer: null, loan: null })}
        onSuccess={syncFromStore}
      />

      <SettlementModal
        visible={settlementModalVisible}
        session={session}
        payments={payments}
        onClose={() => setSettlementModalVisible(false)}
        onSuccess={syncFromStore}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineText: {
    color: COLORS.success,
    fontSize: 10,
    fontWeight: 'bold',
  },
  modeSwitch: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 8,
    padding: 3,
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeBtnActive: {
    backgroundColor: COLORS.primary,
  },
  modeBtnText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#ffffff',
  },
  mainContainer: {
    flex: 1,
  },
  sectionHeaderTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  customerListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  itemTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgTertiary,
    paddingVertical: 8,
    paddingBottom: 14,
  },
  navBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  navBtnActive: {
    opacity: 1,
  },
  navText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  navTextActive: {
    color: '#60a5fa',
  },
  adminTabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.bgSecondary,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgTertiary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  adminTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.bgPrimary,
  },
  adminTabBtnActive: {
    backgroundColor: COLORS.primary,
  },
  adminTabText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  adminTabTextActive: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
