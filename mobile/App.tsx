// Prevents "NotFoundError: Failed to execute 'removeChild' on 'Node'" in React Native Web DOM reconciliation
if (typeof window !== 'undefined' && typeof Node !== 'undefined' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Prevented unhandled removeChild error on mismatched parent:', child, this);
      }
      return child;
    }
    return originalRemoveChild.apply(this, [child]) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Prevented unhandled insertBefore error on mismatched parent:', referenceNode, this);
      }
      return newNode;
    }
    return originalInsertBefore.apply(this, [newNode, referenceNode]) as T;
  };

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.classList.add('notranslate');
  }
}

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
  Keyboard,
  AppState,
  AppStateStatus,
  Modal,
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
  LoanFrequency,
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
import { ErrorBoundary } from './src/presentation/components/ErrorBoundary';
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
  Lock,
  ShieldCheck,
  MoreHorizontal,
  TrendingUp,
  Calculator,
  RefreshCw,
  Home,
} from 'lucide-react-native';
import { verifyPassword } from './src/core/utils/security';
import { useFonts } from 'expo-font';

type AndroidNavMode = 'GESTURES_API35' | 'THREE_BUTTONS_API31';

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope: require('./assets/fonts/Manrope-Variable.ttf'),
  });
  const [fontSystemReady, setFontSystemReady] = useState(false);
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

  // Garantiza Manrope incluso en textos heredados de vistas antiguas que no definen fontFamily.
  useEffect(() => {
    if (!fontsLoaded) return;
    const TextComponent = Text as unknown as { defaultProps?: Record<string, unknown> };
    const InputComponent = TextInput as unknown as { defaultProps?: Record<string, unknown> };
    TextComponent.defaultProps = {
      ...TextComponent.defaultProps,
      style: [TextComponent.defaultProps?.style, { fontFamily: 'Manrope' }],
    };
    InputComponent.defaultProps = {
      ...InputComponent.defaultProps,
      style: [InputComponent.defaultProps?.style, { fontFamily: 'Manrope' }],
    };
    setFontSystemReady(true);
  }, [fontsLoaded]);

  if (!fontsLoaded || !fontSystemReady) return null;

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
                <ErrorBoundary>
                  <MainApp
                    isWideViewport={isWideViewport}
                    phoneFrameEnabled={phoneFrameEnabled}
                    onTogglePhoneFrame={() => setPhoneFrameEnabled(!phoneFrameEnabled)}
                  />
                </ErrorBoundary>
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
      <View style={isWideViewport ? styles.webDesktopBackdrop : { flex: 1 }}>
        <View style={isWideViewport ? styles.webDesktopContainer : { flex: 1 }}>
          <ErrorBoundary>
            <MainApp
              isWideViewport={isWideViewport}
              phoneFrameEnabled={phoneFrameEnabled}
              onTogglePhoneFrame={() => setPhoneFrameEnabled(!phoneFrameEnabled)}
            />
          </ErrorBoundary>
        </View>
      </View>
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
  const dockClearance = insets.bottom + 140;
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Usuario autenticado activo en el dispositivo (Seguridad Operativa)
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Rol activo (Cobrador vs Administrador / Supervisor / Dueño) - Audio 1
  const [userRole, setUserRole] = useState<'COBRADOR' | 'ADMIN'>('COBRADOR');
  const [selectedRouteId, setSelectedRouteId] = useState<string>('ALL');

  // Inicio es el punto de entrada operativo; el resto de funciones vive a un toque de distancia.
  const [collectorTab, setCollectorTab] = useState<'HOME' | 'RUTA' | 'CLIENTES' | 'HISTORIAL' | 'LIQUIDAR'>('HOME');
  const [operationsMenuVisible, setOperationsMenuVisible] = useState(false);
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
  const [officeConfigInitialTab, setOfficeConfigInitialTab] = useState<
    'EMPRESA' | 'CAPITAL' | 'CREDITO' | 'PERMISOS' | 'RUTAS' | 'BACKUP'
  >('EMPRESA');

  const openOfficeConfig = (
    tab: 'EMPRESA' | 'CAPITAL' | 'CREDITO' | 'PERMISOS' | 'RUTAS' | 'BACKUP' = 'EMPRESA'
  ) => {
    setOfficeConfigInitialTab(tab);
    setOfficeConfigVisible(true);
  };
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
  const [newLoanInitialFrequency, setNewLoanInitialFrequency] = useState<LoanFrequency>('DAILY');
  const [newLoanInitialFixedDate, setNewLoanInitialFixedDate] = useState<string>('');
  const [editCustomerModalData, setEditCustomerModalData] = useState<{
    visible: boolean;
    customer: Customer | null;
  }>({ visible: false, customer: null });
  const [routeSelectorVisible, setRouteSelectorVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);

  const handleOpenNewLoanForCustomer = (
    customer: Customer,
    initialFrequency?: LoanFrequency,
    initialFixedDate?: string
  ) => {
    setPreselectedLoanCustomerId(customer.id);
    setNewLoanInitialFrequency(initialFrequency || 'DAILY');
    setNewLoanInitialFixedDate(initialFixedDate || '');
    setNewLoanModalVisible(true);
  };

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

  // Pilar 1: Seguridad en Calle — Bloqueo automático por inactividad o pase a segundo plano
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [lockPasswordInput, setLockPasswordInput] = useState('');
  const [lockError, setLockError] = useState('');

  useEffect(() => {
    if (!currentUser) return;

    let inactivityTimer: any;
    let backgroundTimestamp: number | null = null;
    // Jornada de trabajo en calle (8 horas): no molestar al cobrador mientras opera
    const INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000;
    // Umbral de segundo plano (4 horas): si sale a WhatsApp, llamadas o calculadora y regresa,
    // NO se bloquea la sesión. Solo se bloquea si la app queda abandonada por más de 4 horas.
    const BACKGROUND_LOCK_THRESHOLD_MS = 4 * 60 * 60 * 1000;

    const resetTimer = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        setIsSessionLocked(true);
      }, INACTIVITY_TIMEOUT_MS);
    };

    resetTimer();

    const handleAppState = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundTimestamp = Date.now();
      } else if (state === 'active') {
        if (backgroundTimestamp) {
          const elapsed = Date.now() - backgroundTimestamp;
          if (elapsed > BACKGROUND_LOCK_THRESHOLD_MS) {
            setIsSessionLocked(true);
          }
          backgroundTimestamp = null;
        }
        resetTimer();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    const onUserAction = () => {
      if (!isSessionLocked) resetTimer();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('mousedown', onUserAction);
      window.addEventListener('keydown', onUserAction);
      window.addEventListener('touchstart', onUserAction);
    }

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('mousedown', onUserAction);
        window.removeEventListener('keydown', onUserAction);
        window.removeEventListener('touchstart', onUserAction);
      }
    };
  }, [currentUser, isSessionLocked]);

  const handleUnlockSession = () => {
    if (!lockPasswordInput.trim()) {
      setLockError('Ingresa tu contraseña para reanudar la sesión.');
      return;
    }
    const entered = lockPasswordInput.trim();
    const isUserValid = currentUser?.password
      ? verifyPassword(entered, currentUser.password)
      : false;
    const isAdminValid = localStore.verifyAdminPassword(entered);

    if (isUserValid || isAdminValid) {
      setIsSessionLocked(false);
      setLockPasswordInput('');
      setLockError('');
    } else {
      setLockError('Contraseña incorrecta. Verifica tu clave de acceso.');
    }
  };

  const handleDeleteCustomer = async (customer: Customer, force?: boolean) => {
    // Seguridad Operativa: Los cobradores no pueden eliminar clientes, solo la Administración
    const isSessionAdmin =
      userRole === 'ADMIN' ||
      currentUser?.role === 'ADMIN' ||
      currentUser?.role === 'SUPER_ADMIN';
    if (!isSessionAdmin) {
      const msg = 'Acceso Denegado: Los cobradores no tienen autorización para eliminar clientes. Esta acción debe ser solicitada a la administración de la oficina.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Acceso Denegado', msg);
      }
      return;
    }

    try {
      const res = await localStore.deleteCustomer(customer.id, force, undefined, 'ADMIN');
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
    // Si se accede con ?reset=1 o ?desde0=1, purgar el almacenamiento completo para iniciar desde cero
    if (typeof window !== 'undefined' && window.location) {
      const q = window.location.search || '';
      if (q.includes('reset') || q.includes('limpiar') || q.includes('desde0')) {
        localStore.factoryResetAll().then(() => {
          safeStorage.removeItem('@prestamos_logged_user_id');
          if (typeof window.localStorage !== 'undefined') {
            window.localStorage.clear();
          }
          if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          syncFromStore();
          setCurrentUser(null);
        });
        return;
      }
    }

    localStore.initialize().then(() => {
      syncFromStore();
      safeStorage.getItem('@prestamos_logged_user_id').then((savedUserId) => {
        const allUsers = localStore.getUsers();
        if (savedUserId) {
          const found = allUsers.find((u) => u.id === savedUserId);
          if (found) {
            setCurrentUser(found);
            setUserRole(found.role === 'COBRADOR' ? 'COBRADOR' : 'ADMIN');
            setCollectorTab('HOME');
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
    setCollectorTab('HOME');
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
    syncFromStore();
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
    setUserRole('COBRADOR');
    setOfficeConfigVisible(false);
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

  // Alternar vista entre ADMINISTRADOR y COBRADOR para auditoría, supervisión y pruebas
  const handleToggleRole = () => {
    const nextRole = userRole === 'ADMIN' ? 'COBRADOR' : 'ADMIN';
    setUserRole(nextRole);
    setCollectorTab('HOME');
    setDetailCustomer(null);
    if (nextRole === 'COBRADOR') {
      const assignedRoute = localStore
        .getRoutes()
        .find(
          (r) =>
            r.collectorId === currentUser?.id ||
            r.id === currentUser?.routeId ||
            currentUser?.assignedRouteIds?.includes(r.id)
        );
      setSelectedRouteId(
        assignedRoute?.id || currentUser?.routeId || currentUser?.assignedRouteIds?.[0] || 'route-norte'
      );
    } else {
      setSelectedRouteId('ALL');
    }
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
    currentUserId: currentUser?.id,
    nonPaymentVisits,
    onSelectCustomerToPay: (customer: Customer, loan: Loan) =>
      setPaymentModalData({ visible: true, customer, loan }),
    onViewCustomerDetail: (customer: Customer) => setDetailCustomer(customer),
    onOpenNewLoan: () => setNewLoanModalVisible(true),
    onOpenExpense: () => setExpenseModalVisible(true),
    onOpenRecaudo: userRole === 'ADMIN' ? () => setRecaudoModalVisible(true) : undefined,
    onOpenSettlement: userRole === 'ADMIN' ? () => setSettlementModalVisible(true) : undefined,
    onOpenDailyReport: () => setCollectorCuadreModalVisible(true),
    onNonPaymentCustomer: (customer: Customer, loan: Loan) =>
      setNonPaymentModalData({ visible: true, customer, loan }),
    onPromiseCustomer: (customer: Customer, loan: Loan) =>
      setPromiseModalData({ visible: true, customer, loan }),
    onRenewCustomer: (customer: Customer, loan: Loan) =>
      setRenewalModalData({ visible: true, customer, loan }),
    activeRouteLabel,
    onOpenRouteSelector: userRole === 'ADMIN' ? () => setRouteSelectorVisible(true) : undefined,
    onOpenCapitalConfig: () => openOfficeConfig('CAPITAL'),
    onDeleteCustomer: userRole === 'ADMIN' ? handleDeleteCustomer : undefined,
    onEditCustomer: handleOpenEditCustomer,
    onNewLoanForCustomer: handleOpenNewLoanForCustomer,
    onFixedDateLoan: (c: Customer) => handleOpenNewLoanForCustomer(c, 'FIXED_DATE'),
    onViewHistory: (c: Customer) => {
      setDetailCustomer(null);
      setHistoryInitialDoc(c.documentNumber);
      setCollectorTab('HISTORIAL');
    },
    onOpenNotifications: () => setNotificationsModalVisible(true),
    unreadNotificationsCount: totalNotificationsCount,
    onNavigateToCustomers: () => setCollectorTab('CLIENTES'),
  };

  const mobileContent = (
    <SafeAreaView
      style={[
        styles.safeArea,
        Platform.OS === 'web' && phoneFrameEnabled && {
          paddingTop: insets.top,
        },
      ]}
      edges={['top', 'left', 'right']}
    >
      <StatusBar
        hidden={false}
        barStyle="dark-content"
        backgroundColor={COLORS.bgPrimary}
        translucent={false}
      />

      {/* Top Bar Móvil con Rol Claramente Identificado y Segregación Total (Se oculta en Ficha 360 para vista limpia) */}
      {!detailCustomer && (
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
            <View style={[
              styles.brandBadgeIcon,
              userRole === 'ADMIN' ? { backgroundColor: '#1E3A8A' } : { backgroundColor: COLORS.primary }
            ]}>
              {userRole === 'ADMIN' ? (
                <ShieldCheck size={18} color="#FFFFFF" />
              ) : (
                <Store size={18} color="#FFFFFF" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.brandTitle} numberOfLines={1}>
                  {userRole === 'ADMIN' ? 'Centro Gerencial' : 'Ruta de Cobro'}
                </Text>
                {userRole === 'ADMIN' && <ChevronDown size={14} color={COLORS.primary} />}
              </View>
              <Text style={styles.brandSub} numberOfLines={1}>
                {userRole === 'ADMIN'
                  ? `🛡️ Supervisión • ${activeRouteLabel}`
                  : `🛵 ${activeRouteLabel} • ${currentUser?.name || 'En Calle'}`}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.rightTopActions}>
            {/* Indicador o Selector de Rol Segregado */}
            {currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN' ? (
              <TouchableOpacity
                style={[
                  styles.rolePillToggle,
                  userRole === 'ADMIN' ? styles.rolePillToggleAdmin : styles.rolePillToggleCollector,
                ]}
                activeOpacity={0.75}
                onPress={handleToggleRole}
              >
                {userRole === 'ADMIN' ? (
                  <>
                    <Text style={styles.rolePillToggleTextAdmin}>🛡️ Admin</Text>
                    <RefreshCw size={9} color="#1E40AF" style={{ marginLeft: 4 }} />
                  </>
                ) : (
                  <>
                    <Text style={styles.rolePillToggleTextCollector}>🛵 Ver Cobrador</Text>
                    <RefreshCw size={9} color="#166534" style={{ marginLeft: 4 }} />
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <View style={[styles.rolePillToggle, styles.rolePillToggleCollector]}>
                <Text style={styles.rolePillToggleTextCollector}>🛵 Cobrador</Text>
              </View>
            )}

            {/* Campana: Alertas de Mora, Promesas y Renovación */}
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
                      ? COLORS.danger
                      : COLORS.warning
                    : COLORS.textPrimary
                }
              />
              {totalNotificationsCount > 0 && (
                <View
                  style={[
                    styles.topBadgeCircle,
                    {
                      backgroundColor: overdueAlertsCount > 0 ? COLORS.danger : COLORS.warning,
                      minWidth: 16,
                      height: 16,
                    },
                  ]}
                >
                  <Text style={styles.topBadgeText}>{totalNotificationsCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            {userRole === 'ADMIN' && (
              <TouchableOpacity
                style={styles.officeConfigBtn}
                activeOpacity={0.7}
                onPress={() => openOfficeConfig('EMPRESA')}
              >
                <Settings size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
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
              <LogOut size={14} color={COLORS.danger} />
            </TouchableOpacity>
          </View>
        </View>
      )}


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
            userRole={userRole === 'ADMIN' ? 'ADMIN' : 'COBRADOR'}
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
            onDeleteCustomer={userRole === 'ADMIN' ? handleDeleteCustomer : undefined}
            onEditCustomer={handleOpenEditCustomer}
            onNewLoan={handleOpenNewLoanForCustomer}
          />
        ) : collectorTab === 'HISTORIAL' ? (
          <CreditHistoryView
            customers={routeScopedCustomers}
            loans={routeScopedLoans}
            installments={installments}
            payments={routeScopedPayments}
            todayStr={todayStr}
            initialDocumentNumber={historyInitialDoc}
            onBack={() => setCollectorTab('HOME')}
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

                    const initials = (c.fullName || 'CL')
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
                                        ? `! Mora • ${activeLoan.loanNumber}`
                                        : `✓ Al Día • ${activeLoan.loanNumber}`
                                      : '○ Libre'}
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
                                const clean = (c.phone || '').replace(/[^\d+]/g, '');
                                Linking.openURL(`tel:${clean}`).catch(() => {});
                              }}
                            >
                              <Phone size={13} color="#0D9488" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.inlineIconBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                              activeOpacity={0.7}
                              onPress={() => {
                                let digits = (c.phone || '').replace(/\D/g, '');
                                if (digits.length === 10) digits = `57${digits}`;
                                const msg = encodeURIComponent(
                                  `Hola ${c.fullName || 'Cliente'}, te contactamos de ${officeLabel}.`
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
        })() : userRole === 'ADMIN' ? (
          <SettlementsTableView
            settlements={settlements}
            routes={routes}
            users={localStore.getUsers()}
            onOpenNewSettlement={() => setSettlementModalVisible(true)}
            onBack={() => setCollectorTab('HOME')}
          />
        ) : (
          <TodayCollectionsView
            {...collectionsViewProps}
            viewMode="DASHBOARD"
            onNavigateToRoute={() => openRoute()}
          />
        )}
      </View>

      {/* NAVEGACIÓN INFERIOR SEGREGADA POR ROL */}
      {!detailCustomer && !isKeyboardVisible && (
        <View
          style={[
            styles.floatingDockWrapper,
            { bottom: insets.bottom + 12 },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.floatingDockPill}>
            {userRole === 'ADMIN' ? (
              <>
                {/* ADMIN Tab 1: Inicio */}
                <TouchableOpacity
                  style={[styles.dockNavBtn, collectorTab === 'HOME' && styles.dockNavBtnActive]}
                  onPress={() => setCollectorTab('HOME')}
                  activeOpacity={0.75}
                >
                  <Home
                    size={20}
                    color={collectorTab === 'HOME' ? '#2563EB' : '#64748B'}
                    strokeWidth={collectorTab === 'HOME' ? 2.3 : 1.8}
                  />
                  <Text
                    style={[
                      styles.dockNavText,
                      collectorTab === 'HOME' && { color: '#2563EB', fontWeight: '700' },
                    ]}
                  >
                    Inicio
                  </Text>
                </TouchableOpacity>

                {/* ADMIN Tab 2: Rutas */}
                <TouchableOpacity
                  style={[styles.dockNavBtn, collectorTab === 'RUTA' && styles.dockNavBtnActive]}
                  onPress={() => openRoute()}
                  activeOpacity={0.75}
                >
                  <MapPin
                    size={20}
                    color={collectorTab === 'RUTA' ? '#2563EB' : '#64748B'}
                    strokeWidth={collectorTab === 'RUTA' ? 2.3 : 1.8}
                  />
                  <Text
                    style={[
                      styles.dockNavText,
                      collectorTab === 'RUTA' && { color: '#2563EB', fontWeight: '700' },
                    ]}
                  >
                    Rutas
                  </Text>
                </TouchableOpacity>

                {/* ADMIN Tab 3: Cartera */}
                <TouchableOpacity
                  style={[styles.dockNavBtn, collectorTab === 'CLIENTES' && styles.dockNavBtnActive]}
                  onPress={() => setCollectorTab('CLIENTES')}
                  activeOpacity={0.75}
                >
                  <Users
                    size={20}
                    color={collectorTab === 'CLIENTES' ? '#2563EB' : '#64748B'}
                    strokeWidth={collectorTab === 'CLIENTES' ? 2.3 : 1.8}
                  />
                  <Text
                    style={[
                      styles.dockNavText,
                      collectorTab === 'CLIENTES' && { color: '#2563EB', fontWeight: '700' },
                    ]}
                  >
                    Cartera
                  </Text>
                </TouchableOpacity>

                {/* ADMIN Tab 4: Más */}
                <TouchableOpacity
                  style={[
                    styles.dockNavBtn,
                    (operationsMenuVisible || collectorTab === 'HISTORIAL') && styles.dockNavBtnActive,
                  ]}
                  onPress={() => setOperationsMenuVisible(true)}
                  activeOpacity={0.75}
                >
                  <MoreHorizontal
                    size={20}
                    color={operationsMenuVisible || collectorTab === 'HISTORIAL' ? '#2563EB' : '#64748B'}
                    strokeWidth={operationsMenuVisible || collectorTab === 'HISTORIAL' ? 2.3 : 1.8}
                  />
                  <Text
                    style={[
                      styles.dockNavText,
                      (operationsMenuVisible || collectorTab === 'HISTORIAL') && { color: '#2563EB', fontWeight: '700' },
                    ]}
                  >
                    Más
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* COBRADOR Tab 1: Hoja de Ruta de Calle */}
                <TouchableOpacity
                  style={[styles.dockNavBtn, collectorTab === 'RUTA' && styles.dockNavBtnActive]}
                  onPress={() => openRoute()}
                >
                  <MapPin
                    size={19}
                    color={collectorTab === 'RUTA' ? COLORS.primary : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.dockNavText,
                      collectorTab === 'RUTA' && styles.dockNavTextActive,
                    ]}
                  >
                    Mi Ruta
                  </Text>
                </TouchableOpacity>

                {/* COBRADOR Tab 2: Mis Clientes */}
                <TouchableOpacity
                  style={[styles.dockNavBtn, collectorTab === 'CLIENTES' && styles.dockNavBtnActive]}
                  onPress={() => setCollectorTab('CLIENTES')}
                >
                  <Users
                    size={19}
                    color={collectorTab === 'CLIENTES' ? COLORS.primary : '#64748B'}
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

                {/* Reserva central */}
                <View style={styles.dockCenterSpacer} />

                {/* COBRADOR Tab 4: Alertas de mi Ruta */}
                <TouchableOpacity
                  style={[styles.dockNavBtn, notificationsModalVisible && styles.dockNavBtnActive]}
                  onPress={() => setNotificationsModalVisible(true)}
                >
                  <View style={{ position: 'relative' }}>
                    <Bell
                      size={19}
                      color={notificationsModalVisible ? COLORS.primary : '#64748B'}
                    />
                    {totalNotificationsCount > 0 && (
                      <View style={styles.dockBadgePill}>
                        <Text style={styles.dockBadgeText}>{totalNotificationsCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.dockNavText, notificationsModalVisible && styles.dockNavTextActive]}>
                    Alertas
                  </Text>
                </TouchableOpacity>

                {/* COBRADOR Tab 5: Mi Cuadre de Calle */}
                <TouchableOpacity
                  style={[
                    styles.dockNavBtn,
                    (operationsMenuVisible || collectorTab === 'HISTORIAL') && styles.dockNavBtnActive,
                  ]}
                  onPress={() => setOperationsMenuVisible(true)}
                >
                  <View style={{ position: 'relative' }}>
                    <Calculator
                      size={19}
                      color={operationsMenuVisible || collectorTab === 'HISTORIAL' ? COLORS.primary : '#64748B'}
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
                      (operationsMenuVisible || collectorTab === 'HISTORIAL') && styles.dockNavTextActive,
                    ]}
                  >
                    Mi Cuadre
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {userRole !== 'ADMIN' && (
            <TouchableOpacity
              style={[
                styles.dockHomeOrb,
                collectorTab === 'HOME' && styles.dockHomeOrbActive,
              ]}
              activeOpacity={0.88}
              onPress={() => setCollectorTab('HOME')}
            >
              <Store size={25} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.dockHomeOrbText}>Mi Día</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal
        visible={operationsMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOperationsMenuVisible(false)}
      >
        <TouchableOpacity style={styles.operationsOverlay} activeOpacity={1} onPress={() => setOperationsMenuVisible(false)}>
          <View style={styles.operationsSheet}>
            <View style={styles.operationsHandle} />
            {userRole === 'ADMIN' ? (
              <>
                <Text style={styles.operationsTitle}>🛡️ Centro de Control Gerencial</Text>
                <Text style={styles.operationsSubtitle}>Liquidaciones multi-ruta, arqueo y administración general</Text>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setOperationsMenuVisible(false);
                    setCollectorTab('LIQUIDAR');
                  }}
                >
                  <View style={styles.operationMenuIcon}><Landmark size={18} color={COLORS.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>🏛️ Liquidaciones y Arqueos</Text>
                    <Text style={styles.operationMenuSubtitle}>Auditoría de cierres diarios, consolidado y liquidar ruta</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setHistoryInitialDoc('');
                    setCollectorTab('HISTORIAL');
                    setOperationsMenuVisible(false);
                  }}
                >
                  <View style={styles.operationMenuIcon}><Receipt size={18} color="#2563EB" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>📋 Comprobantes y Auditoría</Text>
                    <Text style={styles.operationMenuSubtitle}>Todos los pagos y recibos de la red</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setOperationsMenuVisible(false);
                    openOfficeConfig('CAPITAL');
                  }}
                >
                  <View style={styles.operationMenuIcon}><Landmark size={18} color="#0D9488" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>💼 Administrativo, Cartera y Base</Text>
                    <Text style={styles.operationMenuSubtitle}>Techo de capital, cartera en calle y base en mano por ruta</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setOperationsMenuVisible(false);
                    openOfficeConfig('EMPRESA');
                  }}
                >
                  <View style={styles.operationMenuIcon}><Settings size={18} color="#D97706" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>⚙️ Configuración de Oficina</Text>
                    <Text style={styles.operationMenuSubtitle}>Tasas de interés, rutas, cobradores y políticas</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.operationsTitle}>🛵 Centro Operativo del Cobrador</Text>
                <Text style={styles.operationsSubtitle}>Arqueo de mi ruta y comprobantes de calle</Text>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setOperationsMenuVisible(false);
                    setTimeout(() => {
                      setCollectorCuadreModalVisible(true);
                    }, Platform.OS === 'ios' ? 250 : 50);
                  }}
                >
                  <View style={styles.operationMenuIcon}><Calculator size={18} color={COLORS.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>📊 Mi Cuadre de Hoy</Text>
                    <Text style={styles.operationMenuSubtitle}>Resumen de recaudo, dinero a entregar y arqueo</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setOperationsMenuVisible(false);
                    setTimeout(() => {
                      setExpenseModalVisible(true);
                    }, Platform.OS === 'ios' ? 250 : 50);
                  }}
                >
                  <View style={styles.operationMenuIcon}><Fuel size={18} color="#EA580C" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>⛽ Registrar Gasto de Ruta</Text>
                    <Text style={styles.operationMenuSubtitle}>Gasolina u otros gastos menores autorizados</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.operationMenuItem}
                  onPress={() => {
                    setHistoryInitialDoc('');
                    setCollectorTab('HISTORIAL');
                    setOperationsMenuVisible(false);
                  }}
                >
                  <View style={styles.operationMenuIcon}><Receipt size={18} color="#059669" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.operationMenuTitle}>📋 Comprobantes de mi Ruta</Text>
                    <Text style={styles.operationMenuSubtitle}>Recibos y abonos cobrados en mi ruta</Text>
                  </View>
                  <ChevronDown size={16} color={COLORS.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

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
        initialFrequency={newLoanInitialFrequency}
        initialFixedDueDate={newLoanInitialFixedDate}
        isCollector={userRole === 'COBRADOR'}
        onClose={() => {
          setNewLoanModalVisible(false);
          setPreselectedLoanCustomerId('');
          setNewLoanInitialFrequency('DAILY');
          setNewLoanInitialFixedDate('');
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
          setNewLoanInitialFrequency('DAILY');
          setNewLoanInitialFixedDate('');
          setNewLoanModalVisible(true);
        }}
        onFixedDateLoan={(c) => {
          setPreselectedLoanCustomerId(c.id);
          setNewLoanInitialFrequency('FIXED_DATE');
          const defaultFixed = new Date();
          defaultFixed.setDate(defaultFixed.getDate() + 20);
          setNewLoanInitialFixedDate(defaultFixed.toISOString().slice(0, 10));
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
        isAdmin={userRole === 'ADMIN'}
        onDeleteCustomer={userRole === 'ADMIN' ? handleDeleteCustomer : undefined}
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

      {userRole === 'ADMIN' && (
        <OfficeConfigModal
          visible={officeConfigVisible}
          initialTab={officeConfigInitialTab}
          onClose={() => setOfficeConfigVisible(false)}
          onSuccess={syncFromStore}
        />
      )}

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

      {/* Pilar 1: Modal de Bloqueo Automático por Inactividad / Segundo Plano */}
      <Modal
        visible={isSessionLocked && Boolean(currentUser)}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={styles.lockOverlay}>
          <View style={styles.lockCard}>
            <View style={styles.lockIconBadge}>
              <Lock size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.lockTitle}>Sesión Protegida</Text>
            <Text style={styles.lockSubtitle}>
              La aplicación se bloqueó automáticamente por seguridad en calle. Ingresa tu contraseña para continuar operando.
            </Text>

            <View style={styles.lockUserInfo}>
              <ShieldCheck size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
              <Text style={styles.lockUserText}>
                {currentUser?.name} • {currentUser?.role === 'ADMIN' ? 'Administración' : 'Cobrador'}
              </Text>
            </View>

            {Boolean(lockError) && (
              <Text style={styles.lockErrorText}>{lockError}</Text>
            )}

            <TextInput
              style={styles.lockInput}
              secureTextEntry
              placeholder="Contraseña de acceso"
              placeholderTextColor={COLORS.textMuted}
              value={lockPasswordInput}
              onChangeText={(t) => {
                setLockPasswordInput(t);
                if (lockError) setLockError('');
              }}
              onSubmitEditing={handleUnlockSession}
            />

            <TouchableOpacity style={styles.lockUnlockBtn} onPress={handleUnlockSession}>
              <Text style={styles.lockUnlockBtnText}>Desbloquear Pantalla</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.lockLogoutBtn}
              onPress={() => {
                setIsSessionLocked(false);
                setLockPasswordInput('');
                setLockError('');
                handleLogout();
              }}
            >
              <LogOut size={13} color={COLORS.danger} style={{ marginRight: 6 }} />
              <Text style={styles.lockLogoutBtnText}>Cerrar Sesión Activa</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  // Si no hay sesión iniciada, muestra la pantalla de autenticación y selección de rol
  if (!currentUser) {
    const loginContent = (
      <SafeAreaView
        style={[
          styles.safeArea,
          {
            backgroundColor: COLORS.bgPrimary,
          },
          Platform.OS === 'web' && phoneFrameEnabled && {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <StatusBar
          hidden={false}
          barStyle="dark-content"
          backgroundColor={COLORS.bgPrimary}
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
  webDesktopBackdrop: {
    flex: 1,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webDesktopContainer: {
    width: '100%',
    maxWidth: 460,
    height: '100%',
    backgroundColor: COLORS.bgPrimary,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
    elevation: 12,
    overflow: 'hidden',
  },
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
    backgroundColor: COLORS.primary,
    borderColor: COLORS.accent,
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
    backgroundColor: COLORS.bgPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
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
    color: COLORS.textPrimary,
  },
  androidStatusIcons: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  androidStatusRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  androidStatusMeta: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  androidSystemNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bgPrimary,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
    color: COLORS.textSecondary,
  },
  androidGesturePill: {
    width: 108,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textSecondary,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.microBorder,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandBadgeIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  brandSub: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  rightTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  logoutTopBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    borderRadius: 16,
  },
  logoutTopBtnText: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: '800',
  },
  rolePillToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  rolePillToggleAdmin: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  rolePillToggleCollector: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  rolePillToggleTextAdmin: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1E40AF',
  },
  rolePillToggleTextCollector: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  officeConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  officeConfigText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  simulateDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  simulateDayText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  frameToggleBtn: {
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 7,
    paddingVertical: 6,
    borderRadius: 9,
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 13,
    paddingVertical: 8,
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
    color: COLORS.textSecondary,
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
    borderColor: COLORS.border,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textPrimary,
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
    borderColor: COLORS.border,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
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
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  floatingDockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    height: 66,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E8EAEE',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  dockNavBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 52,
    borderRadius: 14,
  },
  dockNavBtnActive: {
    backgroundColor: COLORS.primaryLight,
  },
  dockNavText: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '700',
  },
  dockNavTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  dockCenterSpacer: {
    flex: 1,
  },
  dockHomeOrb: {
    position: 'absolute',
    top: -34,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    borderWidth: 7,
    borderColor: COLORS.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 14,
  },
  dockHomeOrbActive: {
    backgroundColor: COLORS.primaryHover,
  },
  dockHomeOrbText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '800',
    marginTop: 1,
  },
  operationsOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.32)',
  },
  operationsSheet: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  operationsHandle: {
    width: 38,
    height: 4,
    borderRadius: 99,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 18,
  },
  operationsTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: COLORS.textPrimary,
  },
  operationsSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 3,
    marginBottom: 18,
  },
  operationMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.microBorder,
  },
  operationMenuIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operationMenuTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  operationMenuSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
    marginTop: 2,
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
    width: 42,
    height: 42,
    borderRadius: 21,
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
  lockOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  lockCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  lockIconBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.dockBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  lockSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  lockUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 14,
  },
  lockUserText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  lockErrorText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: '#F8FAFC',
    marginBottom: 14,
  },
  lockUnlockBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  lockUnlockBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  lockLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  lockLogoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
