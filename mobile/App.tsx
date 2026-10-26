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
import {
  SafeAreaProvider,
  SafeAreaView,
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
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

type AndroidNavMode = 'GESTURES_API35' | 'THREE_BUTTONS_API31';

export default function App() {
  const { width, height } = useWindowDimensions();
  const isWideViewport = width >= 500;
  const [phoneFrameEnabled, setPhoneFrameEnabled] = useState(true);
  const [androidNavMode, setAndroidNavMode] = useState<AndroidNavMode>('THREE_BUTTONS_API31');

  const simulatedInsets =
    androidNavMode === 'THREE_BUTTONS_API31'
      ? { top: 26, bottom: 48, left: 0, right: 0 }
      : { top: 28, bottom: 20, left: 0, right: 0 };

  const clockLabel = new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  if (isWideViewport && phoneFrameEnabled) {
    return (
      <SafeAreaProvider>
        <View style={styles.simulatorBackdrop}>
          {/* Barra superior de prueba de perfiles Android (Gestos vs 3 Botones y versiones de SO) */}
          <View style={styles.androidProfileBar}>
            <TouchableOpacity
              style={[
                styles.androidProfileChip,
                androidNavMode === 'THREE_BUTTONS_API31' && styles.androidProfileChipActive,
              ]}
              onPress={() => setAndroidNavMode('THREE_BUTTONS_API31')}
            >
              <Text
                style={[
                  styles.androidProfileChipText,
                  androidNavMode === 'THREE_BUTTONS_API31' && styles.androidProfileChipTextActive,
                ]}
              >
                Android 12 (API 31) • 3 Botones (48dp)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.androidProfileChip,
                androidNavMode === 'GESTURES_API35' && styles.androidProfileChipActive,
              ]}
              onPress={() => setAndroidNavMode('GESTURES_API35')}
            >
              <Text
                style={[
                  styles.androidProfileChipText,
                  androidNavMode === 'GESTURES_API35' && styles.androidProfileChipTextActive,
                ]}
              >
                Android 15 (API 35) • Gestos (20dp)
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.phoneBezel,
              { height: Math.min(860, Math.max(660, height - 52)) },
            ]}
          >
            <View style={styles.phoneScreen}>
              <SafeAreaInsetsContext.Provider value={simulatedInsets}>
                <MainApp
                  isWideViewport={isWideViewport}
                  phoneFrameEnabled={phoneFrameEnabled}
                  onTogglePhoneFrame={() => setPhoneFrameEnabled(!phoneFrameEnabled)}
                />
              </SafeAreaInsetsContext.Provider>

              {/* Barra de Estado Android Visible (Hora, Notificaciones, Señal y Batería) */}
              <View
                style={[
                  styles.androidSystemStatusBar,
                  { height: simulatedInsets.top },
                ]}
                pointerEvents="none"
              >
                <View style={styles.androidStatusLeft}>
                  <Text style={styles.androidStatusClock}>{clockLabel}</Text>
                  <Text style={styles.androidStatusIcons}>🔔 💬</Text>
                </View>
                <View style={styles.androidStatusRight}>
                  <Text style={styles.androidStatusMeta}>5G  📶  🔋 94%</Text>
                </View>
              </View>

              {/* Controles de Navegación del Sistema Android Visibles (3 Botones o Gestos) */}
              <View
                style={[
                  styles.androidSystemNavBar,
                  { height: simulatedInsets.bottom },
                ]}
                pointerEvents="none"
              >
                {androidNavMode === 'THREE_BUTTONS_API31' ? (
                  <View style={styles.androidThreeButtonsRow}>
                    <Text style={styles.androidNavButtonGlyph}>◀</Text>
                    <Text style={styles.androidNavButtonGlyph}>●</Text>
                    <Text style={styles.androidNavButtonGlyph}>■</Text>
                  </View>
                ) : (
                  <View style={styles.androidGesturePill} />
                )}
              </View>
            </View>
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <MainApp
        isWideViewport={isWideViewport}
        phoneFrameEnabled={phoneFrameEnabled}
        onTogglePhoneFrame={() => setPhoneFrameEnabled(!phoneFrameEnabled)}
      />
    </SafeAreaProvider>
  );
}

interface MainAppProps {
  isWideViewport: boolean;
  phoneFrameEnabled: boolean;
  onTogglePhoneFrame: () => void;
}

function MainApp({
  isWideViewport,
  phoneFrameEnabled,
  onTogglePhoneFrame,
}: MainAppProps) {
  const insets = useSafeAreaInsets();
  const dockClearance = insets.bottom + 88;

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
  const routeScopedLoanIds = new Set(routeScopedLoans.map((l) => l.id));

  const routeScopedPayments =
    effectiveRouteFilter === 'ALL'
      ? payments
      : payments.filter(
          (p) =>
            routeScopedLoanIds.has(p.loanId) || routeScopedCustomerIds.has(p.customerId)
        );

  const routeScopedPromises =
    effectiveRouteFilter === 'ALL'
      ? promises
      : promises.filter(
          (pr) =>
            routeScopedLoanIds.has(pr.loanId) || routeScopedCustomerIds.has(pr.customerId)
        );

  const routeMetrics: DailyRouteMetrics = localStore.getDailyRouteMetrics(
    todayStr,
    effectiveRouteFilter === 'ALL' ? undefined : effectiveRouteFilter
  );
  const todayPaymentsCount = routeScopedPayments.filter((p) => p.status === 'COMPLETED').length;
  const pendingPromisesCount = routeScopedPromises.filter((p) => p.status === 'PENDIENTE').length;

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
    return routeScopedPromises.filter((p) => p.status === 'PENDIENTE' && p.promisedDate <= todayStr).length;
  }, [routeScopedPromises, todayStr]);

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
    promises: routeScopedPromises,
    payments: routeScopedPayments,
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar
        hidden={false}
        barStyle="dark-content"
        backgroundColor="#F8FAFC"
        translucent={false}
      />

      {/* Top Bar Móvil Limpio (Kredia Light Fintech UI) */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.brandRow, { flex: 1, marginRight: 8 }]}
          activeOpacity={userRole === 'ADMIN' ? 0.7 : 1}
          onPress={() => {
            if (userRole === 'ADMIN') {
              setRouteSelectorVisible(true);
            }
          }}
        >
          <View style={styles.brandBadgeIcon}>
            <Store size={15} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.brandTitle} numberOfLines={1}>
                {activeRouteLabel}
              </Text>
              {userRole === 'ADMIN' && <ChevronDown size={13} color={COLORS.primary} />}
            </View>
            <Text style={styles.brandSub} numberOfLines={1}>
              {localStore.getOfficeConfig().companyName || 'Kredia'} •{' '}
              {userRole === 'ADMIN'
                ? 'Admin'
                : currentUser?.username || 'Ruta'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.rightTopActions}>
          {/* Campana: Centro Inteligente de Notificaciones */}
          <TouchableOpacity
            style={styles.topActionIconBtn}
            activeOpacity={0.7}
            onPress={() => setNotificationsModalVisible(true)}
          >
            <Bell
              size={16}
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
            <Landmark size={11} color="#0D9488" style={{ marginRight: 3 }} />
            <Text style={styles.simulateDayText}>Recaudo</Text>
          </TouchableOpacity>

          {userRole === 'ADMIN' && (
            <TouchableOpacity
              style={styles.officeConfigBtn}
              activeOpacity={0.7}
              onPress={() => setOfficeConfigVisible(true)}
            >
              <Settings size={11} color="#4F46E5" style={{ marginRight: 3 }} />
              <Text style={styles.officeConfigText}>Oficina</Text>
            </TouchableOpacity>
          )}

          {isWideViewport && (
            <TouchableOpacity
              style={styles.frameToggleBtn}
              onPress={onTogglePhoneFrame}
            >
              <Text style={styles.frameToggleText}>
                {phoneFrameEnabled ? '📱' : '🖥️'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.logoutTopBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={handleLogout}
          >
            <LogOut size={12} color="#DC2626" style={{ marginRight: 3 }} />
            <Text style={styles.logoutTopBtnText}>Salir</Text>
          </TouchableOpacity>
        </View>
      </View>


      {/* Contenido Principal Móvil */}
      <View
        style={[
          styles.mainContainer,
          detailCustomer ? { paddingBottom: insets.bottom } : null,
        ]}
      >
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
            payments={routeScopedPayments}
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
          const filteredCustomers = routeScopedCustomers.filter((c) => {
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

            const activeLoan = routeScopedLoans.find(
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

          const totalCount = routeScopedCustomers.length;
          const activeLoanCount = routeScopedCustomers.filter((c) =>
            routeScopedLoans.some((l) => l.customerId === c.id && l.status === 'ACTIVE')
          ).length;
          const noLoanCount = totalCount - activeLoanCount;
          const overdueCount = routeScopedCustomers.filter((c) => {
            const al = routeScopedLoans.find((l) => l.customerId === c.id && l.status === 'ACTIVE');
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
                contentContainerStyle={{ paddingBottom: dockClearance }}
                keyboardShouldPersistTaps="handled"
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
                    const activeLoan = routeScopedLoans.find(
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

                    const officeLabel =
                      localStore.getOfficeConfig().companyName || 'Kredia';

                    return (
                      <View key={c.id} style={styles.customerCardWrapper}>
                        <View style={styles.customerCardMainTouch}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                            activeOpacity={0.7}
                            onPress={() => setDetailCustomer(c)}
                          >
                            <View
                              style={[
                                styles.customerAvatarCircle,
                                activeLoan
                                  ? isOverdue
                                    ? { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' }
                                    : { backgroundColor: '#F0FDFA', borderWidth: 1, borderColor: '#99F6E4' }
                                  : { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.customerAvatarText,
                                  {
                                    color: activeLoan
                                      ? isOverdue
                                        ? '#DC2626'
                                        : '#0D9488'
                                      : '#64748B',
                                  },
                                ]}
                              >
                                {initials}
                              </Text>
                            </View>

                            <View style={{ flex: 1, marginLeft: 10, marginRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.customerItemName} numberOfLines={1}>
                                  {c.fullName}
                                </Text>
                                <View
                                  style={[
                                    styles.semanticLoanPill,
                                    activeLoan
                                      ? isOverdue
                                        ? {
                                            backgroundColor: '#FEF2F2',
                                            borderColor: '#FECACA',
                                          }
                                        : {
                                            backgroundColor: '#F0FDFA',
                                            borderColor: '#99F6E4',
                                          }
                                      : {
                                          backgroundColor: '#F8FAFC',
                                          borderColor: '#E2E8F0',
                                        },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.loanTagText,
                                      {
                                        color: activeLoan
                                          ? isOverdue
                                            ? '#DC2626'
                                            : '#0D9488'
                                          : '#64748B',
                                      },
                                    ]}
                                  >
                                    {activeLoan
                                      ? isOverdue
                                        ? `Mora • ${activeLoan.loanNumber}`
                                        : `Al Día • ${activeLoan.loanNumber}`
                                      : 'Libre'}
                                  </Text>
                                </View>
                              </View>

                              <Text style={styles.customerItemSub} numberOfLines={1}>
                                CC {c.documentNumber || 'S/D'} • {c.neighborhood}
                                {c.businessName ? ` • ${c.businessName}` : ''}
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {/* Acciones Ejecutivas Compactas en la misma fila */}
                          <View style={styles.customerInlineActions}>
                            <TouchableOpacity
                              style={[styles.inlineIconBtn, { backgroundColor: '#F0FDFA', borderColor: '#CCFBF1' }]}
                              activeOpacity={0.7}
                              onPress={() => {
                                const clean = c.phone.replace(/[^\d+]/g, '');
                                Linking.openURL(`tel:${clean}`).catch(() => {});
                              }}
                            >
                              <Phone size={13} color="#0D9488" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.inlineIconBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                              activeOpacity={0.7}
                              onPress={() => {
                                let digits = c.phone.replace(/\D/g, '');
                                if (digits.length === 10) digits = `57${digits}`;
                                const msg = encodeURIComponent(
                                  `Hola ${c.fullName}, te contactamos de ${officeLabel}.`
                                );
                                Linking.openURL(`https://wa.me/${digits}?text=${msg}`).catch(() => {});
                              }}
                            >
                              <MessageCircle size={13} color="#059669" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.inlineIconBtn, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}
                              activeOpacity={0.7}
                              onPress={() =>
                                setCustomerOptionsModalData({
                                  visible: true,
                                  customer: c,
                                  activeLoan: activeLoan || null,
                                })
                              }
                            >
                              <MoreVertical size={14} color="#475569" />
                            </TouchableOpacity>
                          </View>
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

      {/* FLOATING BOTTOM DOCK KREDIA */}
      {!detailCustomer && (
        <View
          style={[
            styles.floatingDockWrapper,
            { bottom: insets.bottom + 8 },
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
                size={19}
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
                  size={19}
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
                  size={19}
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

            {/* Botón Central con Emblema de la Oficina / Kredia: Dashboard Principal */}
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
                    <Text style={styles.centralLogoText}>
                      {(localStore.getOfficeConfig().companyName || 'Kredia')
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0].toUpperCase())
                        .join('') || 'KR'}
                    </Text>
                    <Text style={styles.centralLogoSub}>INICIO</Text>
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
                  size={19}
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
                    size={19}
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

            {/* Tab 4: Cobrador -> Gasto Ruta | Admin -> Historial Crediticio */}
            {userRole === 'COBRADOR' ? (
              <TouchableOpacity
                style={styles.dockNavBtn}
                onPress={() => setExpenseModalVisible(true)}
              >
                <Fuel size={19} color={COLORS.dockInactive} />
                <Text style={styles.dockNavText}>
                  Gastos
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
                  size={19}
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
        payments={routeScopedPayments}
        metrics={routeMetrics}
        todayStr={todayStr}
        routeId={effectiveRouteFilter}
        collectorId={currentUser?.id}
        onClose={() => setCollectorCuadreModalVisible(false)}
        onSuccess={syncFromStore}
        onOpenRecaudo={() => setRecaudoModalVisible(true)}
      />

      <SettlementModal
        visible={settlementModalVisible}
        session={session}
        payments={routeScopedPayments}
        metrics={routeMetrics}
        todayStr={todayStr}
        routeId={effectiveRouteFilter}
        collectorId={currentUser?.id}
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
        routeId={effectiveRouteFilter}
        collectorId={currentUser?.id}
        onClose={() => setExpenseModalVisible(false)}
        onSuccess={syncFromStore}
      />

      <RecaudoModal
        visible={recaudoModalVisible}
        baseDisponible={routeMetrics.cashAvailableInHand}
        todayStr={todayStr}
        routeId={effectiveRouteFilter}
        authorizedBy={currentUser?.id}
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
        promises={routeScopedPromises}
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
    </SafeAreaView>
  );

  // Si no hay sesión iniciada, muestra la pantalla de autenticación y selección de rol
  if (!currentUser) {
    const loginContent = (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: '#F3F7FA',
          },
        ]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <StatusBar
          hidden={false}
          barStyle="dark-content"
          backgroundColor="#F3F7FA"
          translucent={false}
        />
        <LoginView
          users={localStore.getUsers()}
          routes={routes}
          onLoginSuccess={handleLoginSuccess}
          onDataReset={syncFromStore}
        />
      </SafeAreaView>
    );

    return loginContent;
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
    position: 'relative',
  },
  androidProfileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  androidProfileChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  androidProfileChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#2DD4BF',
  },
  androidProfileChipText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  androidProfileChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  androidSystemStatusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 999,
  },
  androidStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  androidStatusClock: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  androidStatusIcons: {
    fontSize: 10,
    color: '#475569',
  },
  androidStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  androidStatusMeta: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  androidSystemNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  androidThreeButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '72%',
  },
  androidNavButtonGlyph: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  androidGesturePill: {
    width: 108,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#475569',
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
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
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
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },
  logoutTopBtnText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '800',
  },
  officeConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  officeConfigText: {
    color: '#4F46E5',
    fontSize: 10.5,
    fontWeight: '800',
  },
  simulateDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  simulateDayText: {
    color: '#0D9488',
    fontSize: 10.5,
    fontWeight: '800',
  },
  frameToggleBtn: {
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  frameToggleText: {
    fontSize: 11,
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
    marginBottom: 12,
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
    backgroundColor: '#0D9488',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addCustomerHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  semanticLoanPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  loanTagText: {
    fontSize: 10,
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
    backgroundColor: '#ffffff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#F0FDFA',
    borderColor: '#0D9488',
  },
  filterChipText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterChipTextActive: {
    fontFamily: FONT_FAMILY,
    color: '#0F766E',
    fontWeight: '800',
  },
  customerCardWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  customerCardMainTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  customerItemName: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    flexShrink: 1,
  },
  customerItemSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  customerInlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: 'rgba(13, 148, 136, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  centralFabButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  centralFabButtonActive: {
    borderColor: '#2DD4BF',
    backgroundColor: '#0D9488',
  },
  centralLogoBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centralLogoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.4,
    lineHeight: 15,
  },
  centralLogoSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 1,
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
