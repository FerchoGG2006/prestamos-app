import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  useWindowDimensions,
  ScrollView,
  Alert,
  Platform,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  NonPaymentVisit,
  User,
} from './src/core/domain/types';
import { COLORS, TYPOGRAPHY, FONT_FAMILY } from './src/presentation/theme/colors';
import { getLocalTodayStr, calculateDelinquencyMetrics } from './src/core/domain/calculator';
import { TodayCollectionsView, FilterType } from './src/presentation/views/collector/TodayCollectionsView';
import { CustomerDetailView } from './src/presentation/views/collector/CustomerDetailView';
import { CreditHistoryView } from './src/presentation/views/collector/CreditHistoryView';
import { SettlementsTableView } from './src/presentation/views/admin/SettlementsTableView';
import { PaymentModal } from './src/presentation/components/PaymentModal';
import { RenewalModal } from './src/presentation/components/RenewalModal';
import { PromiseModal } from './src/presentation/components/PromiseModal';
import { SettlementModal } from './src/presentation/components/SettlementModal';
import { CollectorCuadreModal } from './src/presentation/components/CollectorCuadreModal';
import { NewCustomerModal } from './src/presentation/components/NewCustomerModal';
import { NewLoanModal } from './src/presentation/components/NewLoanModal';
import { NonPaymentModal } from './src/presentation/components/NonPaymentModal';
import { ExpenseModal } from './src/presentation/components/ExpenseModal';
import { OfficeConfigModal } from './src/presentation/components/OfficeConfigModal';
import { RecaudoModal } from './src/presentation/components/RecaudoModal';
import { CustomerOptionsModal } from './src/presentation/components/CustomerOptionsModal';
import { EditCustomerModal } from './src/presentation/components/EditCustomerModal';
import { RouteSelectorModal } from './src/presentation/components/RouteSelectorModal';
import { NotificationsModal } from './src/presentation/components/NotificationsModal';
import { formatAccountStatementReminder, openWhatsAppReceipt } from './src/core/utils/whatsapp-receipt';
import { LoginView } from './src/presentation/views/auth/LoginView';
import { safeStorage } from './src/infrastructure/storage/local-store';
import {
  Users,
  Landmark,
  Wifi,
  UserPlus,
  RotateCcw,
  ClipboardList,
  Settings,
  Fuel,
  LogOut,
  Search,
  MoreVertical,
  Phone,
  MessageCircle,
  X,
  Bell,
  Receipt,
  ChevronDown,
  Store,
  MapPin,
} from 'lucide-react-native';

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const safeTop = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0
  );
  const safeBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 8);

  const { width, height } = useWindowDimensions();
  const isWideViewport = width >= 500;

  // Permite alternar marco de teléfono simulado (390x844) cuando se visualiza en pantallas anchas / IDE
  const [phoneFrameEnabled, setPhoneFrameEnabled] = useState(true);

  // Usuario autenticado activo en el dispositivo (Seguridad Operativa)
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Rol activo (Cobrador vs Administrador / Supervisor / Dueño) - Audio 1
  const [userRole, setUserRole] = useState<'COBRADOR' | 'ADMIN'>('COBRADOR');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('ALL');

  // Tabs: HOME (botón central: dashboard con cuadros), RUTA (hoja de cobro en calle), CLIENTES, HISTORIAL, LIQUIDAR
  const [collectorTab, setCollectorTab] = useState<'HOME' | 'RUTA' | 'CLIENTES' | 'HISTORIAL' | 'LIQUIDAR'>('HOME');
  // Filtro con el que se abre la hoja de ruta (la campana la abre en 'PROMESAS')
  const [routeInitialFilter, setRouteInitialFilter] = useState<FilterType>('TODOS');
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
  const [collectorCuadreModalVisible, setCollectorCuadreModalVisible] = useState(false);
  const [newCustomerModalVisible, setNewCustomerModalVisible] = useState(false);
  const [newLoanModalVisible, setNewLoanModalVisible] = useState(false);
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [recaudoModalVisible, setRecaudoModalVisible] = useState(false);
  const [officeConfigVisible, setOfficeConfigVisible] = useState(false);
  const [nonPaymentModalData, setNonPaymentModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
    loan: Loan | null;
  }>({ visible: false, customer: null, loan: null });
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [nonPaymentVisits, setNonPaymentVisits] = useState<NonPaymentVisit[]>([]);

  // Opciones completas de cliente y filtros en sección Clientes
  const [customerOptionsModalData, setCustomerOptionsModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
    activeLoan?: Loan | null;
  }>({ visible: false, customer: null, activeLoan: null });
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerFilterTab, setCustomerFilterTab] = useState<
    'ALL' | 'ACTIVE' | 'UP_TO_DATE' | 'OVERDUE' | 'NO_LOAN'
  >('ALL');
  const [preselectedLoanCustomerId, setPreselectedLoanCustomerId] = useState<string>('');
  const [editCustomerModalData, setEditCustomerModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
  }>({ visible: false, customer: null });
  const [routeSelectorVisible, setRouteSelectorVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);

  const handleOpenEditCustomer = (customer: Customer) => {
    setEditCustomerModalData({ visible: true, customer });
  };

  const handleEditCustomerSuccess = (updatedCustomer: Customer) => {
    syncFromStore();
    if (detailCustomer?.id === updatedCustomer.id) {
      setDetailCustomer(updatedCustomer);
    }
  };

  // Fecha operativa de trabajo en ruta (se renueva oficialmente tras la liquidación del día)
  const [todayStr, setTodayStr] = useState<string>(
    () => localStore.getActiveSession()?.date || getLocalTodayStr()
  );

  const handleDeleteCustomer = async (customer: Customer, force?: boolean) => {
    try {
      const res = await localStore.deleteCustomer(customer.id, force);
      if (detailCustomer?.id === customer.id) {
        setDetailCustomer(null);
      }
      syncFromStore();
      if (Platform.OS === 'web') {
        window.alert(res.message);
      } else {
        Alert.alert('Éxito', res.message);
      }
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err.message || 'Error al eliminar cliente');
      } else {
        Alert.alert('Aviso', err.message || 'Error al eliminar cliente');
      }
    }
  };

  const handleQuickWhatsAppAlert = (customer: Customer, loan: Loan, custInsts: Installment[]) => {
    const officeConfig = localStore.getOfficeConfig();
    const delinquency = calculateDelinquencyMetrics(custInsts, todayStr);
    const text = formatAccountStatementReminder({
      companyConfig: officeConfig,
      customer,
      loan,
      installments: custInsts,
      overdueDays: delinquency.overdueDays,
      overdueAmount: delinquency.overdueAmount,
      todayStr,
    });
    openWhatsAppReceipt(customer.whatsappPhone || customer.phone, text);
  };

  const syncFromStore = () => {
    const activeSes = localStore.getActiveSession();
    if (activeSes?.date && activeSes.date !== todayStr) {
      setTodayStr(activeSes.date);
    }
    setCustomers([...localStore.getCustomers()]);
    setLoans([...localStore.getLoans()]);
    setInstallments([...localStore.getInstallments()]);
    setPayments([...localStore.getPayments()]);
    setRenewals([...localStore.getRenewals()]);
    setRoutes([...localStore.getRoutes()]);
    setSettlements([...localStore.getSettlements()]);
    setSession(activeSes);
    setPromises([...localStore.getPromises()]);
    setCashMovements([...localStore.getCashMovements()]);
    setNonPaymentVisits([...localStore.getNonPaymentVisits()]);
  };

  useEffect(() => {
    localStore.initialize().then(() => {
      syncFromStore();
      safeStorage.getItem('@prestamos_logged_user_id').then((savedUserId) => {
        const allUsers = localStore.getUsers();
        if (savedUserId) {
          const found = allUsers.find((u) => u.id === savedUserId);
          if (found) {
            setCurrentUser(found);
            setUserRole(found.role === 'COBRADOR' ? 'COBRADOR' : 'ADMIN');
            if (found.role === 'COBRADOR') {
              const assignedRoute = localStore
                .getRoutes()
                .find(
                  (r) =>
                    r.collectorId === found.id ||
                    r.id === found.routeId ||
                    found.assignedRouteIds?.includes(r.id)
                );
              setSelectedRouteId(
                assignedRoute?.id || found.routeId || found.assignedRouteIds?.[0] || 'route-norte'
              );
            } else {
              setSelectedRouteId('ALL');
            }
          }
        }
      });
    });
    const unsubscribe = localStore.subscribe(() => {
      syncFromStore();
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = async (user: User, remember: boolean) => {
    setCurrentUser(user);
    setUserRole(user.role === 'COBRADOR' ? 'COBRADOR' : 'ADMIN');
    if (user.role === 'COBRADOR') {
      const assignedRoute = localStore
        .getRoutes()
        .find(
          (r) =>
            r.collectorId === user.id ||
            r.id === user.routeId ||
            user.assignedRouteIds?.includes(r.id)
        );
      setSelectedRouteId(
        assignedRoute?.id || user.routeId || user.assignedRouteIds?.[0] || 'route-norte'
      );
    } else {
      setSelectedRouteId('ALL');
    }
    if (remember) {
      await safeStorage.setItem('@prestamos_logged_user_id', user.id);
    } else {
      await safeStorage.removeItem('@prestamos_logged_user_id');
    }
  };

  const handleLogout = async () => {
    try {
      await safeStorage.removeItem('@prestamos_logged_user_id');
    } catch (err) {
      console.warn('Error clearing login session:', err);
    }
    setCurrentUser(null);
    setDetailCustomer(null);
  };

  const effectiveRouteFilter =
    userRole === 'COBRADOR'
      ? currentUser?.routeId ||
        currentUser?.assignedRouteIds?.[0] ||
        routes.find((r) => r.collectorId === currentUser?.id)?.id ||
        'route-norte'
      : selectedRouteId;

  const routeScopedCustomers =
    effectiveRouteFilter === 'ALL'
      ? customers
      : customers.filter((c) => (c.routeId || 'route-norte') === effectiveRouteFilter);

  const routeScopedCustomerIds = new Set(routeScopedCustomers.map((c) => c.id));
  const routeScopedLoans =
    effectiveRouteFilter === 'ALL'
      ? loans
      : loans.filter(
          (l) =>
            (l.routeId || 'route-norte') === effectiveRouteFilter ||
            routeScopedCustomerIds.has(l.customerId)
        );

  const routeMetrics: DailyRouteMetrics = localStore.getDailyRouteMetrics(
    todayStr,
    effectiveRouteFilter === 'ALL' ? undefined : effectiveRouteFilter
  );
  const todayPaymentsCount = payments.filter((p) => p.status === 'COMPLETED').length;
  const pendingPromisesCount = promises.filter((p) => p.status === 'PENDIENTE').length;

  // Alertas de cartera: Moras activas y promesas de pago para hoy o vencidas
  const overdueAlertsCount = useMemo(() => {
    let count = 0;
    routeScopedCustomers.forEach((c) => {
      const activeLoan = routeScopedLoans.find((l) => l.customerId === c.id && l.status === 'ACTIVE');
      if (!activeLoan) return;
      const custInsts = installments.filter((i) => i.loanId === activeLoan.id);
      const delinquency = calculateDelinquencyMetrics(custInsts, todayStr);
      if (delinquency.hasDelinquency) {
        count++;
      }
    });
    return count;
  }, [routeScopedCustomers, routeScopedLoans, installments, todayStr]);

  const pendingPromisesTodayCount = useMemo(() => {
    return promises.filter((p) => p.status === 'PENDIENTE' && p.promisedDate <= todayStr).length;
  }, [promises, todayStr]);

  const totalNotificationsCount = overdueAlertsCount + pendingPromisesTodayCount;

  const cycleActiveRoute = () => {
    if (userRole === 'COBRADOR') return;
    const options = ['ALL', ...routes.map((r) => r.id)];
    const idx = options.indexOf(selectedRouteId);
    const next = options[(idx + 1) % options.length];
    setSelectedRouteId(next);
  };

  const activeRouteLabel =
    effectiveRouteFilter === 'ALL'
      ? 'Todas las Rutas'
      : routes.find((r) => r.id === effectiveRouteFilter)?.name || 'Ruta Norte';

  // Botón Central con Logo de la Oficina: Dashboard principal con los cuadros (NO es la hoja de ruta)
  const handleCentralLogoPress = () => {
    setDetailCustomer(null);
    setCollectorTab('HOME');
  };

  const openRoute = (filter: FilterType = 'TODOS') => {
    setDetailCustomer(null);
    setRouteInitialFilter(filter);
    setCollectorTab('RUTA');
  };

  // Props compartidas por el Dashboard (botón central) y la Hoja de Ruta
  const collectionsViewProps = {
    customers: routeScopedCustomers,
    loans: routeScopedLoans,
    installments,
    promises,
    payments,
    metrics: routeMetrics,
    todayStr,
    isAdminMode: userRole === 'ADMIN',
    nonPaymentVisits,
    onSelectCustomerToPay: (customer: Customer, loan: Loan) =>
      setPaymentModalData({ visible: true, customer, loan }),
    onViewCustomerDetail: (customer: Customer) => setDetailCustomer(customer),
    onOpenNewLoan: () => setNewLoanModalVisible(true),
    onOpenExpense: () => setExpenseModalVisible(true),
    onOpenRecaudo: () => setRecaudoModalVisible(true),
    onOpenSettlement: () => setSettlementModalVisible(true),
    onOpenDailyReport: () => setCollectorCuadreModalVisible(true),
    onNonPaymentCustomer: (customer: Customer, loan: Loan) =>
      setNonPaymentModalData({ visible: true, customer, loan }),
    onPromiseCustomer: (customer: Customer, loan: Loan) =>
      setPromiseModalData({ visible: true, customer, loan }),
    onRenewCustomer: (customer: Customer, loan: Loan) =>
      setRenewalModalData({ visible: true, customer, loan }),
    activeRouteLabel,
    onOpenRouteSelector: () => setRouteSelectorVisible(true),
  };

  const mobileContent = (
    <View style={[styles.safeArea, { paddingTop: safeTop }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={Platform.OS === 'android'} />

      {/* Top Bar Móvil Limpio (Fintech Punto de Venta UI) */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.brandRow}
          activeOpacity={userRole === 'ADMIN' ? 0.7 : 1}
          onPress={() => {
            if (userRole === 'ADMIN') {
              setRouteSelectorVisible(true);
            }
          }}
        >
          <View style={styles.brandBadgeIcon}>
            <Store size={16} color="#FFFFFF" />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.brandTitle}>{activeRouteLabel}</Text>
              {userRole === 'ADMIN' && <ChevronDown size={13} color={COLORS.textPrimary} />}
            </View>
            <Text style={styles.brandSub}>
              {localStore.getOfficeConfig().companyName || 'Kredia'} •{' '}
              {userRole === 'ADMIN'
                ? 'Administrador • Cambiar Ruta'
                : `Usuario: ${currentUser?.username || 'cobrador'}`}
            </Text>
          </View>
        </TouchableOpacity>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rightTopActions}
          style={{ flexShrink: 1, marginLeft: 8 }}
        >
          {/* Campana: Centro Inteligente de Notificaciones de Cartera (Moras, Promesas, Oportunidades) */}
          <TouchableOpacity
            style={styles.topActionIconBtn}
            activeOpacity={0.7}
            onPress={() => setNotificationsModalVisible(true)}
          >
            <Bell
              size={17}
              color={
                totalNotificationsCount > 0
                  ? overdueAlertsCount > 0
                    ? '#DC2626'
                    : '#D97706'
                  : COLORS.textPrimary
              }
            />
            {totalNotificationsCount > 0 && (
              <View
                style={[
                  styles.topBadgeCircle,
                  {
                    backgroundColor: overdueAlertsCount > 0 ? '#DC2626' : '#F59E0B',
                    minWidth: 16,
                    height: 16,
                  },
                ]}
              >
                <Text style={styles.topBadgeText}>{totalNotificationsCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.simulateDayBtn}
            activeOpacity={0.7}
            onPress={() => setRecaudoModalVisible(true)}
          >
            <Landmark size={11} color="#0284c7" style={{ marginRight: 3 }} />
            <Text style={styles.simulateDayText}>Recaudo</Text>
          </TouchableOpacity>

          {userRole === 'ADMIN' && (
            <>
              <TouchableOpacity
                style={styles.officeConfigBtn}
                onPress={() => setOfficeConfigVisible(true)}
              >
                <Settings size={11} color={COLORS.primary} style={{ marginRight: 3 }} />
                <Text style={styles.officeConfigText}>Oficina</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.simulateDayBtn}
                activeOpacity={0.7}
                onPress={() => setSettlementModalVisible(true)}
              >
                <Landmark size={11} color="#0284c7" style={{ marginRight: 3 }} />
                <Text style={styles.simulateDayText}>Caja Admin</Text>
              </TouchableOpacity>

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
            </>
          )}

          <TouchableOpacity
            style={styles.logoutTopBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={handleLogout}
          >
            <LogOut size={12} color="#DC2626" style={{ marginRight: 3 }} />
            <Text style={styles.logoutTopBtnText}>Salir</Text>
          </TouchableOpacity>

          <View style={styles.offlineBadge}>
            <Wifi size={12} color={COLORS.success} style={{ marginRight: 4 }} />
            <Text style={styles.offlineText}>Offline</Text>
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
        </ScrollView>
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
            userRole={currentUser?.role || (userRole === 'ADMIN' ? 'ADMIN' : 'COBRADOR')}
            currentUserId={currentUser?.id || 'usr-col-1'}
            onDataChanged={syncFromStore}
            onBack={() => setDetailCustomer(null)}
            onPayLoan={(cust, loan) =>
              setPaymentModalData({ visible: true, customer: cust, loan })
            }
            onRenewLoan={(cust, loan) =>
              setRenewalModalData({ visible: true, customer: cust, loan })
            }
            onPromiseLoan={(cust, loan) =>
              setPromiseModalData({ visible: true, customer: cust, loan })
            }
            onNonPayment={(cust, loan) =>
              setNonPaymentModalData({ visible: true, customer: cust, loan })
            }
            onOpenCreditHistory={(cust) => {
              setDetailCustomer(null);
              setHistoryInitialDoc(cust.documentNumber);
              setCollectorTab('HISTORIAL');
            }}
            onDeleteCustomer={handleDeleteCustomer}
            onEditCustomer={handleOpenEditCustomer}
          />
        ) : collectorTab === 'HISTORIAL' ? (
          <CreditHistoryView
            customers={routeScopedCustomers}
            loans={routeScopedLoans}
            installments={installments}
            payments={payments}
            todayStr={todayStr}
            initialDocumentNumber={historyInitialDoc}
            onOpenNewLoan={(c) => {
              setPreselectedLoanCustomerId(c.id);
              setNewLoanModalVisible(true);
            }}
            onOpenPayment={(c, l) => {
              setPaymentModalData({ visible: true, customer: c, loan: l });
            }}
          />
        ) : collectorTab === 'HOME' ? (
          <TodayCollectionsView
            {...collectionsViewProps}
            viewMode="DASHBOARD"
            onNavigateToRoute={() => openRoute()}
          />
        ) : collectorTab === 'RUTA' ? (
          <TodayCollectionsView
            key={`route-${routeInitialFilter}`}
            {...collectionsViewProps}
            viewMode="ROUTE"
            initialFilter={routeInitialFilter}
          />
        ) : collectorTab === 'CLIENTES' ? (() => {
          const q = customerSearchQuery.trim().toLowerCase();
          const filteredCustomers = customers.filter((c) => {
            if (q) {
              const matchName = c.fullName?.toLowerCase().includes(q);
              const matchDoc = c.documentNumber?.toLowerCase().includes(q);
              const matchPhone = c.phone?.toLowerCase().includes(q);
              const matchNeigh = c.neighborhood?.toLowerCase().includes(q);
              const matchBiz =
                c.businessName?.toLowerCase().includes(q) ||
                c.occupation?.toLowerCase().includes(q);
              if (!matchName && !matchDoc && !matchPhone && !matchNeigh && !matchBiz) {
                return false;
              }
            }

            const activeLoan = loans.find(
              (l) => l.customerId === c.id && l.status === 'ACTIVE'
            );
            if (customerFilterTab === 'ACTIVE') return !!activeLoan;
            if (customerFilterTab === 'NO_LOAN') return !activeLoan;
            if (customerFilterTab === 'OVERDUE') {
              if (!activeLoan) return false;
              const loanInsts = installments.filter(
                (i) => i.loanId === activeLoan.id && i.pendingAmount > 0
              );
              return loanInsts.some((i) => i.dueDate < todayStr);
            }
            if (customerFilterTab === 'UP_TO_DATE') {
              if (!activeLoan) return false;
              const loanInsts = installments.filter(
                (i) => i.loanId === activeLoan.id && i.pendingAmount > 0
              );
              return !loanInsts.some((i) => i.dueDate < todayStr);
            }
            return true;
          });

          const totalCount = customers.length;
          const activeLoanCount = customers.filter((c) =>
            loans.some((l) => l.customerId === c.id && l.status === 'ACTIVE')
          ).length;
          const noLoanCount = totalCount - activeLoanCount;
          const overdueCount = customers.filter((c) => {
            const al = loans.find((l) => l.customerId === c.id && l.status === 'ACTIVE');
            if (!al) return false;
            return installments.some(
              (i) => i.loanId === al.id && i.pendingAmount > 0 && i.dueDate < todayStr
            );
          }).length;
          const upToDateCount = activeLoanCount - overdueCount;

          return (
            <View style={{ flex: 1, backgroundColor: COLORS.bgPrimary }}>
              {/* Header Directorio */}
              <View style={[styles.directoryHeaderRow, { paddingHorizontal: 16, paddingTop: 16 }]}>
                <View>
                  <Text style={styles.sectionHeaderTitle}>Directorio de Clientes</Text>
                  <Text style={styles.directorySubheader}>
                    {filteredCustomers.length} de {totalCount} clientes en ruta
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.addCustomerHeaderBtn}
                  activeOpacity={0.8}
                  onPress={() => setNewCustomerModalVisible(true)}
                >
                  <UserPlus size={14} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.addCustomerHeaderText}>+ Cliente</Text>
                </TouchableOpacity>
              </View>

              {/* Barra de Búsqueda Interactiva */}
              <View style={styles.searchBarWrapper}>
                <Search size={16} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchBarInput}
                  placeholder="Buscar por nombre, cédula, barrio o tel..."
                  placeholderTextColor="#94a3b8"
                  value={customerSearchQuery}
                  onChangeText={setCustomerSearchQuery}
                />
                {customerSearchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setCustomerSearchQuery('')}
                    style={styles.clearSearchBtn}
                  >
                    <X size={14} color="#64748b" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Chips de Filtros Rápidos */}
              <View style={{ height: 38, marginBottom: 10 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                >
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      customerFilterTab === 'ALL' && styles.filterChipActive,
                    ]}
                    onPress={() => setCustomerFilterTab('ALL')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        customerFilterTab === 'ALL' && styles.filterChipTextActive,
                      ]}
                    >
                      Todos ({totalCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      customerFilterTab === 'ACTIVE' && styles.filterChipActive,
                    ]}
                    onPress={() => setCustomerFilterTab('ACTIVE')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        customerFilterTab === 'ACTIVE' && styles.filterChipTextActive,
                      ]}
                    >
                      Con Crédito ({activeLoanCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      customerFilterTab === 'UP_TO_DATE' && styles.filterChipActive,
                    ]}
                    onPress={() => setCustomerFilterTab('UP_TO_DATE')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        customerFilterTab === 'UP_TO_DATE' && styles.filterChipTextActive,
                      ]}
                    >
                      Al Día ({upToDateCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      customerFilterTab === 'OVERDUE' && styles.filterChipActive,
                    ]}
                    onPress={() => setCustomerFilterTab('OVERDUE')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        customerFilterTab === 'OVERDUE' && styles.filterChipTextActive,
                      ]}
                    >
                      En Mora ({overdueCount})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      customerFilterTab === 'NO_LOAN' && styles.filterChipActive,
                    ]}
                    onPress={() => setCustomerFilterTab('NO_LOAN')}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        customerFilterTab === 'NO_LOAN' && styles.filterChipTextActive,
                      ]}
                    >
                      Sin Crédito ({noLoanCount})
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {/* Lista de Clientes con Varias Opciones */}
              <ScrollView
                style={{ flex: 1, paddingHorizontal: 16 }}
                contentContainerStyle={{ paddingBottom: 150 }}
                showsVerticalScrollIndicator={false}
              >
                {filteredCustomers.length === 0 ? (
                  <View style={styles.emptyResultsBox}>
                    <Users size={36} color="#cbd5e1" style={{ marginBottom: 10 }} />
                    <Text style={styles.emptyResultsTitle}>No se encontraron clientes</Text>
                    <Text style={styles.emptyResultsSub}>
                      {customerSearchQuery
                        ? 'Ningún cliente coincide con el término de búsqueda.'
                        : 'No hay clientes registrados bajo este filtro.'}
                    </Text>
                    {customerSearchQuery ? (
                      <TouchableOpacity
                        style={styles.resetFilterBtn}
                        onPress={() => {
                          setCustomerSearchQuery('');
                          setCustomerFilterTab('ALL');
                        }}
                      >
                        <Text style={styles.resetFilterBtnText}>Restablecer búsqueda</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : (
                  filteredCustomers.map((c) => {
                    const activeLoan = loans.find(
                      (l) => l.customerId === c.id && l.status === 'ACTIVE'
                    );
                    const isOverdue =
                      activeLoan &&
                      installments.some(
                        (i) =>
                          i.loanId === activeLoan.id &&
                          i.pendingAmount > 0 &&
                          i.dueDate < todayStr
                      );

                    const initials = c.fullName
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0].toUpperCase())
                      .join('');

                    return (
                      <View key={c.id} style={styles.customerCardWrapper}>
                        <TouchableOpacity
                          style={styles.customerCardMainTouch}
                          activeOpacity={0.7}
                          onPress={() => setDetailCustomer(c)}
                        >
                          <View
                            style={[
                              styles.customerAvatarCircle,
                              activeLoan
                                ? isOverdue
                                  ? { backgroundColor: '#ef4444' }
                                  : { backgroundColor: '#2563eb' }
                                : { backgroundColor: '#64748b' },
                            ]}
                          >
                            <Text style={styles.customerAvatarText}>{initials}</Text>
                          </View>

                          <View style={{ flex: 1, marginLeft: 12, marginRight: 6 }}>
                            <Text style={styles.customerItemName} numberOfLines={1}>
                              {c.fullName}
                            </Text>
                            <Text style={styles.customerItemSub}>
                              CC: {c.documentNumber || 'Sin doc'} • Tel: {c.phone}
                            </Text>
                            <Text style={styles.customerItemAddress} numberOfLines={1}>
                              {c.businessName || c.occupation || 'Comercio'} • {c.neighborhood}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.semanticLoanPill,
                              activeLoan
                                ? isOverdue
                                  ? {
                                      backgroundColor: '#fef2f2',
                                      borderColor: '#fecaca',
                                    }
                                  : {
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
                                {
                                  color: activeLoan
                                    ? isOverdue
                                      ? '#dc2626'
                                      : COLORS.primary
                                    : COLORS.textMuted,
                                },
                              ]}
                            >
                              {activeLoan
                                ? isOverdue
                                  ? `Mora • ${activeLoan.loanNumber}`
                                  : `Al Día • ${activeLoan.loanNumber}`
                                : 'Sin crédito'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Barra de Acciones / Varias Opciones */}
                        <View style={styles.customerCardActionRow}>
                          <TouchableOpacity
                            style={styles.cardQuickActionBtn}
                            activeOpacity={0.7}
                            onPress={() => {
                              const clean = c.phone.replace(/[^\d+]/g, '');
                              Linking.openURL(`tel:${clean}`).catch(() => {});
                            }}
                          >
                            <Phone size={13} color="#059669" style={{ marginRight: 4 }} />
                            <Text style={[styles.cardQuickActionText, { color: '#059669' }]}>
                              Llamar
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.cardQuickActionBtn}
                            activeOpacity={0.7}
                            onPress={() => {
                              let digits = c.phone.replace(/\D/g, '');
                              if (digits.length === 10) digits = `57${digits}`;
                              const msg = encodeURIComponent(
                                `Hola ${c.fullName}, te contactamos de la administración de préstamos.`
                              );
                              Linking.openURL(`https://wa.me/${digits}?text=${msg}`).catch(() => {});
                            }}
                          >
                            <MessageCircle size={13} color="#16a34a" style={{ marginRight: 4 }} />
                            <Text style={[styles.cardQuickActionText, { color: '#16a34a' }]}>
                              WhatsApp
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.cardMoreOptionsBtn}
                            activeOpacity={0.7}
                            onPress={() =>
                              setCustomerOptionsModalData({
                                visible: true,
                                customer: c,
                                activeLoan: activeLoan || null,
                              })
                            }
                          >
                            <MoreVertical size={14} color="#4338ca" style={{ marginRight: 2 }} />
                            <Text style={styles.cardMoreOptionsText}>Opciones</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          );
        })() : (
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
        <View
          style={[
            styles.floatingDockWrapper,
            { bottom: safeBottom + (Platform.OS === 'android' ? 12 : 8) },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.floatingDockPill}>
            {/* Tab 1: Hoja de Ruta de Cobro en Calle */}
            <TouchableOpacity
              style={styles.dockNavBtn}
              onPress={() => openRoute()}
            >
              <MapPin
                size={20}
                color={
                  collectorTab === 'RUTA' ? COLORS.dockActive : COLORS.dockInactive
                }
              />
              <Text
                style={[
                  styles.dockNavText,
                  collectorTab === 'RUTA' && styles.dockNavTextActive,
                ]}
              >
                Ruta
              </Text>
            </TouchableOpacity>

            {/* Tab 2: Clientes (Cobrador) o Liquidaciones (Admin) */}
            {userRole === 'COBRADOR' ? (
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
            ) : (
              <TouchableOpacity
                style={styles.dockNavBtn}
                onPress={() => setCollectorTab('LIQUIDAR')}
              >
                <Landmark
                  size={20}
                  color={
                    collectorTab === 'LIQUIDAR' ? COLORS.dockActive : COLORS.dockInactive
                  }
                />
                <Text
                  style={[
                    styles.dockNavText,
                    collectorTab === 'LIQUIDAR' && styles.dockNavTextActive,
                  ]}
                  numberOfLines={1}
                >
                  Cierres
                </Text>
              </TouchableOpacity>
            )}

            {/* Botón Central con Logo de la Oficina: Dashboard principal (cuadros, acciones, cierre) */}
            <View style={styles.fabCenterSlot}>
              <View style={styles.centralFabHalo}>
                <TouchableOpacity
                  style={[
                    styles.centralFabButton,
                    collectorTab === 'HOME' && !detailCustomer && styles.centralFabButtonActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={handleCentralLogoPress}
                >
                  <View style={styles.centralLogoBadge}>
                    <Text style={styles.centralLogoText}>CP</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tab 3: Clientes (Admin) o Historial (Cobrador) con badge */}
            {userRole === 'ADMIN' ? (
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
            ) : (
              <TouchableOpacity
                style={styles.dockNavBtn}
                onPress={() => {
                  setHistoryInitialDoc('');
                  setCollectorTab('HISTORIAL');
                }}
              >
                <View style={{ position: 'relative' }}>
                  <Receipt
                    size={20}
                    color={
                      collectorTab === 'HISTORIAL' ? COLORS.dockActive : COLORS.dockInactive
                    }
                  />
                  {todayPaymentsCount > 0 && (
                    <View style={styles.dockBadgePill}>
                      <Text style={styles.dockBadgeText}>{todayPaymentsCount}</Text>
                    </View>
                  )}
                </View>
                <Text
                  style={[
                    styles.dockNavText,
                    collectorTab === 'HISTORIAL' && styles.dockNavTextActive,
                  ]}
                >
                  Historial
                </Text>
              </TouchableOpacity>
            )}

            {/* Tab 4:
                - Cobrador: + Gasto Ruta (pinchazo, gasolina, datos)
                - Admin: Historial Crediticio */}
            {userRole === 'COBRADOR' ? (
              <TouchableOpacity
                style={styles.dockNavBtn}
                onPress={() => setExpenseModalVisible(true)}
              >
                <Fuel size={20} color="#fb923c" />
                <Text style={[styles.dockNavText, { color: '#fb923c' }]}>
                  + Gasto Ruta
                </Text>
              </TouchableOpacity>
            ) : (
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
            )}
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

      <CollectorCuadreModal
        visible={collectorCuadreModalVisible}
        session={session}
        payments={payments}
        metrics={routeMetrics}
        todayStr={todayStr}
        onClose={() => setCollectorCuadreModalVisible(false)}
        onSuccess={syncFromStore}
        onOpenRecaudo={() => setRecaudoModalVisible(true)}
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
        defaultRouteId={effectiveRouteFilter}
        isCollector={userRole === 'COBRADOR'}
        onClose={() => setNewCustomerModalVisible(false)}
        onSuccess={syncFromStore}
      />

      <NewLoanModal
        visible={newLoanModalVisible}
        customers={routeScopedCustomers}
        loans={routeScopedLoans}
        todayStr={todayStr}
        baseAvailable={routeMetrics.cashAvailableInHand}
        preselectedCustomerId={preselectedLoanCustomerId}
        onClose={() => {
          setNewLoanModalVisible(false);
          setPreselectedLoanCustomerId('');
        }}
        onSuccess={syncFromStore}
      />

      <CustomerOptionsModal
        visible={customerOptionsModalData.visible}
        customer={customerOptionsModalData.customer}
        activeLoan={customerOptionsModalData.activeLoan}
        onClose={() =>
          setCustomerOptionsModalData({ visible: false, customer: null, activeLoan: null })
        }
        onViewDetail={(c) => setDetailCustomer(c)}
        onEditCustomer={handleOpenEditCustomer}
        onNewLoan={(c) => {
          setPreselectedLoanCustomerId(c.id);
          setNewLoanModalVisible(true);
        }}
        onViewHistory={(c) => {
          setHistoryInitialDoc(c.documentNumber);
          setCollectorTab('HISTORIAL');
        }}
        onPromiseLoan={(c, loan) =>
          setPromiseModalData({ visible: true, customer: c, loan })
        }
        onNonPayment={(c, loan) =>
          setNonPaymentModalData({ visible: true, customer: c, loan })
        }
        onDeleteCustomer={handleDeleteCustomer}
      />

      <EditCustomerModal
        visible={editCustomerModalData.visible}
        customer={editCustomerModalData.customer}
        onClose={() => setEditCustomerModalData({ visible: false, customer: null })}
        onSuccess={handleEditCustomerSuccess}
      />

      <NonPaymentModal
        visible={nonPaymentModalData.visible}
        customer={nonPaymentModalData.customer}
        loan={nonPaymentModalData.loan}
        todayStr={todayStr}
        onClose={() =>
          setNonPaymentModalData({ visible: false, customer: null, loan: null })
        }
        onSuccess={syncFromStore}
      />

      <ExpenseModal
        visible={expenseModalVisible}
        todayStr={todayStr}
        onClose={() => setExpenseModalVisible(false)}
        onSuccess={syncFromStore}
      />

      <RecaudoModal
        visible={recaudoModalVisible}
        baseDisponible={routeMetrics.cashAvailableInHand}
        todayStr={todayStr}
        onClose={() => setRecaudoModalVisible(false)}
        onSuccess={syncFromStore}
      />

      <OfficeConfigModal
        visible={officeConfigVisible}
        onClose={() => setOfficeConfigVisible(false)}
        onSuccess={syncFromStore}
      />

      <RouteSelectorModal
        visible={routeSelectorVisible}
        routes={routes}
        selectedRouteId={selectedRouteId}
        customers={customers}
        loans={loans}
        onSelectRoute={(newRouteId) => setSelectedRouteId(newRouteId)}
        onClose={() => setRouteSelectorVisible(false)}
      />

      <NotificationsModal
        visible={notificationsModalVisible}
        onClose={() => setNotificationsModalVisible(false)}
        customers={routeScopedCustomers}
        loans={routeScopedLoans}
        installments={installments}
        promises={promises}
        nonPaymentVisits={nonPaymentVisits}
        todayStr={todayStr}
        onSelectCustomerToPay={(cust, loan) => {
          setNotificationsModalVisible(false);
          setPaymentModalData({ visible: true, customer: cust, loan });
        }}
        onViewCustomerDetail={(cust) => {
          setNotificationsModalVisible(false);
          setDetailCustomer(cust);
        }}
        onQuickWhatsApp={handleQuickWhatsAppAlert}
      />
    </View>
  );

  // Si no hay sesión iniciada, muestra la pantalla de autenticación y selección de rol
  if (!currentUser) {
    const loginContent = (
      <View
        style={[
          styles.safeArea,
          {
            backgroundColor: '#0F172A',
            paddingTop: safeTop,
            paddingBottom: safeBottom,
          },
        ]}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0F172A" translucent={Platform.OS === 'android'} />
        <LoginView
          users={localStore.getUsers()}
          routes={routes}
          onLoginSuccess={handleLoginSuccess}
          onDataReset={syncFromStore}
        />
      </View>
    );

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
            <View style={styles.phoneScreen}>{loginContent}</View>
            <View style={styles.phoneHomeIndicator} />
          </View>
        </View>
      );
    }
    return loginContent;
  }

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
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  brandSub: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  rightTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoutTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  logoutTopBtnText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '800',
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
  officeConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  officeConfigText: {
    color: COLORS.primary,
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
  simulateDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  simulateDayText: {
    color: '#0284c7',
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
  directorySubheader: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 6,
  },
  clearSearchBtn: {
    padding: 4,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  filterChipText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterChipTextActive: {
    fontFamily: FONT_FAMILY,
    color: '#1d4ed8',
    fontWeight: '700',
  },
  customerCardWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  customerCardMainTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  customerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  customerItemName: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  customerItemSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  customerItemAddress: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  customerCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cardQuickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardQuickActionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardMoreOptionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  cardMoreOptionsText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338ca',
  },
  emptyResultsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyResultsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  emptyResultsSub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
  },
  resetFilterBtn: {
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  resetFilterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },

  // FLOATING BOTTOM DOCK CON FAB CENTRAL (Patrón #3 de Gemini Share + Mejora IA #3)
  floatingDockWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
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
  centralFabHalo: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(37, 99, 235, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
  centralFabButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.38,
    shadowRadius: 10,
    elevation: 8,
  },
  centralFabButtonActive: {
    borderColor: '#38BDF8',
    backgroundColor: '#1E293B',
  },
  centralLogoBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centralLogoText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  topActionIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  topBadgeCircle: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  topBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
  },
  dockBadgePill: {
    position: 'absolute',
    top: -5,
    right: -10,
    backgroundColor: '#0284C7',
    borderRadius: 9999,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.dockBg,
  },
  dockBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '900',
  },
});
