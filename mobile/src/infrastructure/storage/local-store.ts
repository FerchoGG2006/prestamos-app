/**
 * ALMACENAMIENTO LOCAL OFFLINE-FIRST (AsyncStorage + Memoria Reactiva)
 *
 * Permite que el cobrador en la calle opere 100% sin conexión a Internet.
 * Todas las operaciones se persisten inmediatamente en almacenamiento local con claves de idempotencia
 * y pueden exportarse como paquetes JSON compatibles con cartera.db (SQLite).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  UserRole,
  Customer,
  Route,
  Loan,
  Installment,
  Payment,
  Renewal,
  CollectionSession,
  DailySettlement,
  PaymentPromise,
  CashMovement,
  AuditLog,
  PaymentMethod,
  LoanFrequency,
  DailyRouteMetrics,
  MobileSyncPackage,
  NonPaymentVisit,
  OfficeCompanyConfig,
} from '../../core/domain/types';
import {
  INITIAL_USERS,
  INITIAL_ROUTES,
  INITIAL_CUSTOMERS,
  INITIAL_LOANS,
  INITIAL_INSTALLMENTS,
  INITIAL_SESSION,
  INITIAL_PROMISES,
  INITIAL_CASH_MOVEMENTS,
} from './initial-data';
import {
  applyPaymentToLoan,
  calculateDelinquencyMetrics,
  calculateLoanSummary,
  calculatePaperworkFee,
  calculateRenewalDisbursement,
  generateInstallments,
  getLocalTodayStr,
  addDaysToDate,
} from '../../core/domain/calculator';
import {
  hashPassword,
  verifyPassword,
  encryptBackupData,
  decryptBackupData,
} from '../../core/utils/security';

export const DEFAULT_OFFICE_CONFIG: OfficeCompanyConfig = {
  companyName: 'Inversiones FBV',
  taxId: '901.458.789-1',
  city: 'Barranquilla',
  address: 'Calle 72 # 48-25, Oficina 302',
  supportPhone: '+57 300 123 4567',
  receiptFooterMessage: 'Gracias por su puntualidad • Conserve este comprobante',
  defaultInterestRate: 0.20,
  defaultInstallmentsCount: 30,
  defaultFrequency: 'DAILY',
  excludeSundays: true,
  paperworkFeeEnabled: true,
  paperworkRate: 5000,
  graceDays: 0,
  maxNewLoanLimit: 500000,
  routeInitialCashBase: 0,
  allowRouteNewLoans: true,
  allowCollectorExpenses: true,
  allowRouteReorder: false,
  allowPartialPayments: true,
  officeServerUrl: 'http://192.168.1.10:8765',
  isSetupCompleted: true,
};

const STORAGE_KEYS = {
  USERS: '@prestamos_mobile_users_v1',
  ROUTES: '@prestamos_mobile_routes_v1',
  CUSTOMERS: '@prestamos_mobile_customers_v1',
  LOANS: '@prestamos_mobile_loans_v1',
  INSTALLMENTS: '@prestamos_mobile_installments_v1',
  SESSION: '@prestamos_mobile_session_v1',
  PAYMENTS: '@prestamos_mobile_payments_v1',
  RENEWALS: '@prestamos_mobile_renewals_v1',
  SETTLEMENTS: '@prestamos_mobile_settlements_v1',
  PROMISES: '@prestamos_mobile_promises_v1',
  CASH_MOVEMENTS: '@prestamos_mobile_cash_v1',
  NON_PAYMENT_VISITS: '@prestamos_mobile_non_payments_v1',
  AUDIT_LOGS: '@prestamos_mobile_audit_v1',
  OFFICE_CONFIG: '@prestamos_mobile_office_config_v1',
};

/**
 * Adaptador de almacenamiento seguro: Conecta AsyncStorage con window.localStorage en Web
 * Garantiza persistencia instantánea contra recargas accidentales (F5) o cierres de pestaña.
 */
const safeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    let result: string | null = null;
    try {
      result = await AsyncStorage.getItem(key);
    } catch (e) {
      console.warn(`[safeStorage] AsyncStorage.getItem failed for ${key}:`, e);
    }
    if (!result && typeof window !== 'undefined' && window.localStorage) {
      try {
        result = window.localStorage.getItem(key);
      } catch (e) {
        console.warn(`[safeStorage] localStorage.getItem failed for ${key}:`, e);
      }
    }
    return result;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[safeStorage] AsyncStorage.setItem failed for ${key}:`, e);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, value);
      } catch (e) {
        console.warn(`[safeStorage] localStorage.setItem failed for ${key}:`, e);
      }
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn(`[safeStorage] AsyncStorage.removeItem failed for ${key}:`, e);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        console.warn(`[safeStorage] localStorage.removeItem failed for ${key}:`, e);
      }
    }
  },
};

class LocalStore {
  private users: User[] = [...INITIAL_USERS];
  private routes: Route[] = [...INITIAL_ROUTES];
  private customers: Customer[] = [];
  private loans: Loan[] = [];
  private installments: Installment[] = [];
  private activeSession: CollectionSession | null = null;
  private payments: Payment[] = [];
  private renewals: Renewal[] = [];
  private settlements: DailySettlement[] = [];
  private promises: PaymentPromise[] = [];
  private cashMovements: CashMovement[] = [];
  private nonPaymentVisits: NonPaymentVisit[] = [];
  private auditLogs: AuditLog[] = [];
  private officeConfig: OfficeCompanyConfig = { ...DEFAULT_OFFICE_CONFIG };

  private isInitialized = false;
  private listeners: Array<() => void> = [];

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const [
        savedUsers,
        savedRoutes,
        savedCustomers,
        savedLoans,
        savedInstallments,
        savedSession,
        savedPayments,
        savedRenewals,
        savedSettlements,
        savedPromises,
        savedCash,
        savedNonPayments,
        savedAudit,
        savedOfficeConfig,
      ] = await Promise.all([
        safeStorage.getItem(STORAGE_KEYS.USERS),
        safeStorage.getItem(STORAGE_KEYS.ROUTES),
        safeStorage.getItem(STORAGE_KEYS.CUSTOMERS),
        safeStorage.getItem(STORAGE_KEYS.LOANS),
        safeStorage.getItem(STORAGE_KEYS.INSTALLMENTS),
        safeStorage.getItem(STORAGE_KEYS.SESSION),
        safeStorage.getItem(STORAGE_KEYS.PAYMENTS),
        safeStorage.getItem(STORAGE_KEYS.RENEWALS),
        safeStorage.getItem(STORAGE_KEYS.SETTLEMENTS),
        safeStorage.getItem(STORAGE_KEYS.PROMISES),
        safeStorage.getItem(STORAGE_KEYS.CASH_MOVEMENTS),
        safeStorage.getItem(STORAGE_KEYS.NON_PAYMENT_VISITS),
        safeStorage.getItem(STORAGE_KEYS.AUDIT_LOGS),
        safeStorage.getItem(STORAGE_KEYS.OFFICE_CONFIG),
      ]);

      let needInitialSeed = false;
      if (savedCustomers) {
        try {
          const parsed = JSON.parse(savedCustomers);
          if (Array.isArray(parsed)) {
            this.customers = parsed;
          } else {
            needInitialSeed = true;
          }
        } catch {
          needInitialSeed = true;
        }
      } else {
        needInitialSeed = true;
      }

      const adminPass = hashPassword('123456');
      const colPass = hashPassword('123456');

      const seedAllData = async () => {
        this.officeConfig = { ...DEFAULT_OFFICE_CONFIG };
        const adminUser: User = {
          id: 'usr-admin-1',
          name: 'Administrador FBV',
          username: 'admin',
          password: adminPass,
          email: 'admin@inversionesfbv.com',
          role: 'ADMIN',
          phone: '+57 300 123 4567',
          assignedRouteIds: [],
          isActive: true,
          createdAt: getLocalTodayStr(),
        };
        const colUser: User = {
          id: 'usr-col-1',
          name: 'Carlos Cobrador (Ruta 1)',
          username: 'cobrador',
          password: colPass,
          email: 'cobrador@inversionesfbv.com',
          role: 'COBRADOR',
          phone: '3001234567',
          assignedRouteIds: ['route-norte'],
          routeId: 'route-norte',
          isActive: true,
          createdAt: getLocalTodayStr(),
        };
        this.users = [adminUser, colUser];
        this.routes = [...INITIAL_ROUTES];
        this.customers = [...INITIAL_CUSTOMERS];
        this.loans = [...INITIAL_LOANS];
        this.installments = [...INITIAL_INSTALLMENTS];
        this.activeSession = { ...INITIAL_SESSION };
        this.cashMovements = [...INITIAL_CASH_MOVEMENTS];
        this.promises = [...INITIAL_PROMISES];
        this.payments = [];
        this.renewals = [];
        this.settlements = [];
        this.nonPaymentVisits = [];
        this.auditLogs = [];

        await Promise.all([
          safeStorage.setItem(STORAGE_KEYS.OFFICE_CONFIG, JSON.stringify(this.officeConfig)),
          safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users)),
          safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes)),
          safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
          safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
          safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
          safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
          safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
          safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
          safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
        ]);
      };

      if (needInitialSeed) {
        await seedAllData();
      } else {
        if (savedUsers) this.users = JSON.parse(savedUsers);
        if (savedRoutes) this.routes = JSON.parse(savedRoutes);
        if (savedLoans) this.loans = JSON.parse(savedLoans);
        if (savedInstallments) this.installments = JSON.parse(savedInstallments);
        if (savedSession) this.activeSession = JSON.parse(savedSession);
        if (savedPayments) this.payments = JSON.parse(savedPayments);
        if (savedRenewals) this.renewals = JSON.parse(savedRenewals);
        if (savedSettlements) this.settlements = JSON.parse(savedSettlements);
        if (savedPromises) this.promises = JSON.parse(savedPromises);
        if (savedCash) this.cashMovements = JSON.parse(savedCash);
        if (savedNonPayments) this.nonPaymentVisits = JSON.parse(savedNonPayments);
        if (savedAudit) this.auditLogs = JSON.parse(savedAudit);
        if (savedOfficeConfig) {
          this.officeConfig = JSON.parse(savedOfficeConfig);
          // Si aún tenía el nombre demo pre-cargado sin haber registrado oficina, limpiarlo
          if (
            !this.officeConfig.isSetupCompleted &&
            this.officeConfig.companyName === 'Inversiones & Cobranzas La Excelencia'
          ) {
            this.officeConfig.companyName = '';
            safeStorage.setItem(STORAGE_KEYS.OFFICE_CONFIG, JSON.stringify(this.officeConfig));
          }
        }

        // Eliminar contraseñas predeterminadas heredadas ('123') si la oficina no ha sido configurada
        let sanitizedLegacyPasswords = false;
        this.users = this.users.map((u) => {
          if (u.password === '123') {
            sanitizedLegacyPasswords = true;
            return { ...u, password: '' };
          }
          return u;
        });

        // Garantizar que cada ruta activa tenga su propio usuario cobrador único sin asignar claves por defecto
        const usedCollectorIds = new Set<string>();
        let usersOrRoutesHealed = sanitizedLegacyPasswords;
        this.routes = this.routes.map((rt, idx) => {
          const isSharedOrMissing =
            !rt.collectorId ||
            usedCollectorIds.has(rt.collectorId) ||
            !this.users.some((u) => u.id === rt.collectorId);

          if (!isSharedOrMissing) {
            usedCollectorIds.add(rt.collectorId);
            return rt;
          }

          usersOrRoutesHealed = true;
          const dedicatedId = `usr-col-${idx + 1}`;
          usedCollectorIds.add(dedicatedId);
          const defaultUsername = idx === 0 ? 'cobrador' : `ruta${idx + 1}`;
          if (!this.users.some((u) => u.id === dedicatedId)) {
            this.users.push({
              id: dedicatedId,
              name: rt.collectorName || rt.name || `Ruta ${idx + 1}`,
              username: defaultUsername,
              password: '',
              email: `${defaultUsername}@oficina.com`,
              role: 'COBRADOR',
              assignedRouteIds: [rt.id],
              routeId: rt.id,
              isActive: true,
              createdAt: getLocalTodayStr(),
            });
          }
          return { ...rt, collectorId: dedicatedId };
        });

        if (usersOrRoutesHealed) {
          safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
          safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes));
        }

        // =========================================================================
        // MIGRACIÓN Y AUTO-SANACIÓN V1 -> V2 (Teléfonos con versión anterior)
        // =========================================================================
        // 1. Purgar movimientos obsoletos de 'Base sugerida' ($200.000) heredados de v1
        const legacyBaseMovs = this.cashMovements.filter((cm: any) =>
          cm.description?.includes('Base') ||
          cm.notes?.includes('Base') ||
          (cm.category === 'ADJUSTMENT' && cm.amount === 200000) ||
          (cm.type === 'INCOME' && cm.amount === 200000 && cm.description?.toLowerCase().includes('base'))
        );
        if (legacyBaseMovs.length > 0) {
          this.cashMovements = this.cashMovements.filter((cm: any) =>
            !cm.description?.includes('Base') &&
            !cm.notes?.includes('Base') &&
            !(cm.category === 'ADJUSTMENT' && cm.amount === 200000) &&
            !(cm.type === 'INCOME' && cm.amount === 200000 && cm.description?.toLowerCase().includes('base'))
          );
          safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements));
        }

        // 2. Si la oficina venía de v1 y no tiene targetAdministrative en rutas o no tiene admin con clave válida:
        const validAdmin = this.users.find(
          (u) => (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') && Boolean(u.password?.trim())
        );
        const routesNeedMigration =
          this.routes.length === 0 ||
          this.routes.some((r) => r.targetAdministrative === undefined || r.targetAdministrative === null);

        // Auto-sanación: Si la oficina está incompleta o sin usuarios o sin clientes, auto-cargar Inversiones FBV
        if (!this.officeConfig.companyName || !this.officeConfig.isSetupCompleted || this.users.length === 0 || this.customers.length === 0) {
          await seedAllData();
        } else {
          const hasAdmin = this.users.some(
            (u) => (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') && Boolean(u.password?.trim())
          );
          if (!hasAdmin) {
            const adminUser: User = {
              id: 'usr-admin-1',
              name: 'Administrador FBV',
              username: 'admin',
              password: adminPass,
              email: 'admin@inversionesfbv.com',
              role: 'ADMIN',
              phone: '+57 300 123 4567',
              assignedRouteIds: [],
              isActive: true,
              createdAt: getLocalTodayStr(),
            };
            this.users = [adminUser, ...this.users];
            safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users));
          }
        }
      }

      this.alignScenarioDatesIfNeeded();
      this.isInitialized = true;
      this.notify();
    } catch (error) {
      console.error('Error al inicializar LocalStore:', error);
      this.users = [];
      this.routes = [];
      this.customers = [];
      this.loans = [];
      this.installments = [];
      this.activeSession = null;
      this.promises = [];
      this.cashMovements = [];
      this.officeConfig = { ...DEFAULT_OFFICE_CONFIG };
      this.alignScenarioDatesIfNeeded();
      this.isInitialized = true;
      this.notify();
    }
  }

  /**
   * Alínea las fechas operativas del almacén a la fecha de hoy si estaban ancladas
   * a la fecha estática inicial (2026-09-19). Preserva intactos saldos, cuotas e importes.
   */
  public alignScenarioDatesIfNeeded(targetDateStr: string = getLocalTodayStr()): void {
    if (this.installments.length === 0) return;
    const refDateStr = '2026-09-19';
    if (targetDateStr === refDateStr) return;

    // Verificar si las cuotas tienen fechas ancladas a 2026-09-19
    const sampleInst = this.installments.find((i) => i.dueDate === refDateStr);
    if (!sampleInst) return; // Ya están alineadas a otra fecha de operación

    const refDate = new Date(refDateStr + 'T00:00:00');
    const targetDate = new Date(targetDateStr + 'T00:00:00');
    const diffTime = targetDate.getTime() - refDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return;

    this.installments = this.installments.map((inst) => ({
      ...inst,
      dueDate: addDaysToDate(inst.dueDate, diffDays),
      lastPaymentDate: inst.lastPaymentDate ? addDaysToDate(inst.lastPaymentDate, diffDays) : undefined,
    }));

    this.loans = this.loans.map((loan) => ({
      ...loan,
      startDate: addDaysToDate(loan.startDate, diffDays),
      endDate: addDaysToDate(loan.endDate, diffDays),
      createdAt: addDaysToDate(loan.createdAt, diffDays),
      updatedAt: targetDateStr,
    }));

    this.promises = this.promises.map((p) => ({
      ...p,
      promisedDate: addDaysToDate(p.promisedDate, diffDays),
    }));

    if (this.activeSession) {
      this.activeSession = {
        ...this.activeSession,
        date: targetDateStr,
      };
    }

    safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments));
    safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans));
    safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises));
    if (this.activeSession) {
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession));
    }
  }

  /**
   * Renovación del Día de Cobro Posterior a la Liquidación del Día:
   * REGLA DE NEGOCIO: La renovación del día se efectúa ÚNICAMENTE después de liquidar la jornada.
   * - Las cuotas que vencían en la fecha liquidada o antes que no fueron pagadas pasan a estado de mora.
   * - Las cuotas programadas para la nueva fecha pasan a 'Cobrar hoy'.
   * - El total cobrado hoy arranca en $0 para la nueva jornada.
   * - Se abre una nueva sesión de recaudo para el día siguiente.
   */
  public async renewCollectionDayAfterSettlement(nextTodayStr?: string): Promise<DailyRouteMetrics> {
    const currentSessionDate = this.activeSession?.date || '2026-09-19';
    const nextDate = nextTodayStr || addDaysToDate(currentSessionDate, 1);

    const routeMetrics = this.getDailyRouteMetrics(nextDate);
    this.activeSession = {
      id: `session-${nextDate}-${this.routes[0]?.id || 'norte'}`,
      date: nextDate,
      routeId: this.routes[0]?.id || 'route-norte',
      collectorId: 'usr-col-1',
      status: 'OPEN',
      startTime: '07:00:00',
      expectedCollection: routeMetrics.expectedDailyGoal,
      collectedAmount: 0,
      expectedCustomersCount: this.customers.length,
      visitedCustomersCount: 0,
      notes: `Nueva jornada iniciada tras la liquidación exitosa del día ${currentSessionDate}.`,
    };

    const log: AuditLog = {
      id: `audit-renew-${Date.now()}`,
      userId: 'SISTEMA_LIQUIDACION',
      timestamp: new Date().toISOString(),
      entity: 'SESSION',
      entityId: this.activeSession.id,
      action: 'CREATE',
      reason: `Renovación del día de cobro para ${nextDate} realizada tras liquidar la jornada del día ${currentSessionDate}.`,
    };
    this.auditLogs.unshift(log);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
      safeStorage.setItem('@prestamos_operating_date', nextDate),
    ]);

    this.notify();
    return routeMetrics;
  }

  // --- GETTERS ---
  public getUsers(): User[] { return this.users; }
  public getRoutes(): Route[] { return this.routes; }
  public getCustomers(): Customer[] { return this.customers; }
  public getLoans(): Loan[] { return this.loans; }
  public getInstallments(): Installment[] { return this.installments; }
  public getActiveSession(): CollectionSession {
    if (!this.activeSession) {
      const today = getLocalTodayStr();
      this.activeSession = {
        id: `ses-${today}`,
        routeId: this.routes[0]?.id || 'route-norte',
        date: today,
        collectorId: this.users.find((u) => u.role === 'COBRADOR')?.id || 'usr-col-1',
        status: 'OPEN',
        startTime: '07:30:00',
        expectedCollection: 0,
        collectedAmount: 0,
        expectedCustomersCount: 0,
        visitedCustomersCount: 0,
        notes: 'Sesión operativa',
      };
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession));
    }
    return this.activeSession;
  }
  public getPayments(): Payment[] { return this.payments; }
  public getRenewals(): Renewal[] { return this.renewals; }
  public getSettlements(): DailySettlement[] { return this.settlements; }
  public getPromises(): PaymentPromise[] { return this.promises; }
  public getCashMovements(): CashMovement[] { return this.cashMovements; }
  public getAuditLogs(): AuditLog[] { return this.auditLogs; }
  public getOfficeConfig(): OfficeCompanyConfig { return { ...this.officeConfig }; }

  public async updateOfficeConfig(config: Partial<OfficeCompanyConfig>): Promise<OfficeCompanyConfig> {
    this.officeConfig = { ...this.officeConfig, ...config };
    await safeStorage.setItem(STORAGE_KEYS.OFFICE_CONFIG, JSON.stringify(this.officeConfig));
    this.notify();
    return { ...this.officeConfig };
  }

  public async saveUsersAndRoutes(users: User[], routes: Route[]): Promise<void> {
    this.users = [...users];
    this.routes = [...routes];
    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users)),
      safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes)),
    ]);
    this.notify();
  }

  /**
   * Verifica si la contraseña suministrada coincide con la del Administrador actual.
   */
  public verifyAdminPassword(password: string): boolean {
    const existingAdmin = this.users.find(
      (u) => (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') && Boolean(u.password?.trim())
    );
    // Si no hay Administrador con clave válida previa (migración de v1), permitir el acceso para configurar
    if (!existingAdmin || !existingAdmin.password) return true;
    return verifyPassword(password, existingAdmin.password);
  }

  /**
   * Configuración integral de la Oficina:
   * Crea las credenciales del Administrador y configura las N rutas elegidas con sus credenciales y parámetros a gusto de la oficina.
   */
  public async setupOfficeAndRoutes(params: {
    companyName: string;
    city?: string;
    supportPhone?: string;
    adminName: string;
    adminUsername: string;
    adminPassword: string;
    currentAdminPassword?: string;
    defaultInterestRatePercent?: number;
    paperworkFeeEnabled?: boolean;
    paperworkRate?: number;
    excludeSundays?: boolean;
    allowRouteNewLoans?: boolean;
    allowCollectorExpenses?: boolean;
    allowPartialPayments?: boolean;
    cleanCustomersData?: boolean;
    routesConfig: Array<{
      id?: string;
      name: string;
      collectorName: string;
      username: string;
      password: string;
      description?: string;
      targetAdministrative?: number;
      expectedCustomersCount?: number;
      initialCashBase?: number;
    }>;
  }): Promise<{ adminUser: User; createdRoutes: Route[]; createdUsers: User[] }> {
    const FORBIDDEN_DEFAULT_PASSWORDS = new Set([
      '123',
      '1234',
      '12345',
      '123456',
      '000',
      '0000',
      '000000',
      'admin',
      'password',
      'cobrador',
    ]);

    // Si la oficina ya estaba configurada y tiene un administrador con clave activa,
    // exigir verificación de la contraseña actual antes de permitir cambios desde el login.
    const existingAdmin = this.users.find(
      (u) => (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') && Boolean(u.password?.trim())
    );
    if (this.officeConfig.isSetupCompleted && existingAdmin?.password) {
      if (!params.currentAdminPassword || !verifyPassword(params.currentAdminPassword, existingAdmin.password)) {
        throw new Error(
          'La clave actual del Administrador no coincide. Autorización requerida para modificar credenciales.'
        );
      }
    }

    const cleanAdminUsername = params.adminUsername.trim().toLowerCase();
    const cleanAdminPassword = params.adminPassword.trim();
    if (!cleanAdminUsername || !cleanAdminPassword) {
      throw new Error('Debe definir un usuario y contraseña para el Administrador de la oficina.');
    }
    if (
      cleanAdminPassword.length < 6 ||
      FORBIDDEN_DEFAULT_PASSWORDS.has(cleanAdminPassword.toLowerCase())
    ) {
      throw new Error(
        'Por seguridad, la clave del Administrador debe tener al menos 6 caracteres y no ser una clave predeterminada.'
      );
    }
    if (!params.routesConfig || params.routesConfig.length === 0) {
      throw new Error('Debe configurar al menos 1 ruta para la oficina.');
    }

    const usedUsernames = new Set<string>([cleanAdminUsername]);
    for (let i = 0; i < params.routesConfig.length; i++) {
      const rUser = (params.routesConfig[i].username || '').trim().toLowerCase();
      const rPass = (params.routesConfig[i].password || '').trim();
      if (!rUser || !rPass) {
        throw new Error(`La Ruta ${i + 1} requiere usuario y contraseña de acceso.`);
      }
      if (rPass.length < 6 || FORBIDDEN_DEFAULT_PASSWORDS.has(rPass.toLowerCase())) {
        throw new Error(
          `La clave de la Ruta ${i + 1} debe tener al menos 6 caracteres y no usar valores predeterminados.`
        );
      }
      if (usedUsernames.has(rUser)) {
        throw new Error(`El usuario "${rUser}" está repetido. Cada ruta y el administrador deben tener un usuario único.`);
      }
      usedUsernames.add(rUser);
    }

    const nowIso = new Date().toISOString();
    const todayStr = getLocalTodayStr();

    const newRoutes: Route[] = [];
    const collectorUsers: User[] = [];

    params.routesConfig.forEach((rc, idx) => {
      const routeId = rc.id || (idx === 0 ? 'route-norte' : idx === 1 ? 'route-centro' : idx === 2 ? 'route-sur' : `route-${idx + 1}-${Date.now()}`);
      const collectorId = `usr-col-${idx + 1}`;
      const colName = rc.collectorName.trim() || `Cobrador Ruta ${idx + 1}`;
      const rName = rc.name.trim() || `Ruta ${idx + 1}`;
      const rUser = rc.username.trim().toLowerCase();
      const rPass = rc.password.trim();
      const targetAdmin = rc.targetAdministrative ?? 0;
      const expectedCustomers = rc.expectedCustomersCount ?? 0;

      newRoutes.push({
        id: routeId,
        name: rName,
        code: `R-${String(idx + 1).padStart(2, '0')}`,
        collectorId,
        collectorName: colName,
        isActive: true,
        description: rc.description?.trim() || `Asignada a ${colName}`,
        targetAdministrative: targetAdmin,
        expectedCustomersCount: expectedCustomers,
        initialCashBase: 0,
        createdAt: todayStr,
      });

      collectorUsers.push({
        id: collectorId,
        name: colName,
        username: rUser,
        password: hashPassword(rPass),
        email: `${rUser}@oficina.com`,
        role: 'COBRADOR',
        assignedRouteIds: [routeId],
        routeId,
        isActive: true,
        createdAt: todayStr,
      });
    });

    const allRouteIds = newRoutes.map((r) => r.id);
    const adminUser: User = {
      id: 'usr-adm-1',
      name: params.adminName.trim() || 'Administrador de Oficina',
      username: cleanAdminUsername,
      password: hashPassword(cleanAdminPassword),
      email: `${cleanAdminUsername}@oficina.com`,
      role: 'ADMIN',
      assignedRouteIds: ['ALL', ...allRouteIds],
      isActive: true,
      createdAt: todayStr,
    };

    this.users = [adminUser, ...collectorUsers];
    this.routes = newRoutes;

    const rateFraction =
      params.defaultInterestRatePercent !== undefined
        ? Math.max(0.01, params.defaultInterestRatePercent / 100)
        : this.officeConfig.defaultInterestRate || 0.2;

    this.officeConfig = {
      ...this.officeConfig,
      companyName: params.companyName.trim() || this.officeConfig.companyName,
      city: params.city?.trim() || this.officeConfig.city,
      supportPhone: params.supportPhone?.trim() || this.officeConfig.supportPhone,
      defaultInterestRate: rateFraction,
      paperworkFeeEnabled: params.paperworkFeeEnabled ?? this.officeConfig.paperworkFeeEnabled ?? true,
      paperworkRate: params.paperworkRate ?? this.officeConfig.paperworkRate ?? 5000,
      excludeSundays: params.excludeSundays ?? this.officeConfig.excludeSundays ?? true,
      allowRouteNewLoans: params.allowRouteNewLoans ?? this.officeConfig.allowRouteNewLoans ?? true,
      allowCollectorExpenses: params.allowCollectorExpenses ?? this.officeConfig.allowCollectorExpenses ?? true,
      allowPartialPayments: params.allowPartialPayments ?? this.officeConfig.allowPartialPayments ?? true,
      routeInitialCashBase: 0,
      isSetupCompleted: true,
    };

    const shouldClean = params.cleanCustomersData !== false;
    if (shouldClean) {
      this.customers = [];
      this.loans = [];
      this.installments = [];
      this.payments = [];
      this.renewals = [];
      this.settlements = [];
      this.promises = [];
      this.nonPaymentVisits = [];
      // Sin base sugerida artificial: la base real es Dinero Total de la ruta - Cartera colocada en calle
      this.cashMovements = [];
    }

    const audit: AuditLog = {
      id: `audit-setup-${Date.now()}`,
      userId: adminUser.id,
      timestamp: nowIso,
      entity: 'CONFIG',
      entityId: 'office-setup',
      action: 'UPDATE',
      newValue: JSON.stringify({
        companyName: this.officeConfig.companyName,
        adminUsername: adminUser.username,
        routesCount: newRoutes.length,
        routes: newRoutes.map((r) => ({ id: r.id, name: r.name })),
      }),
      reason: `Configuración de oficina con ${newRoutes.length} ruta(s) y credenciales personalizadas.`,
    };
    this.auditLogs.unshift(audit);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users)),
      safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes)),
      safeStorage.setItem(STORAGE_KEYS.OFFICE_CONFIG, JSON.stringify(this.officeConfig)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
      ...(shouldClean
        ? [
            safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
            safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
            safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
            safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
            safeStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify(this.renewals)),
            safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
            safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
            safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
          ]
        : []),
    ]);

    this.notify();
    return { adminUser, createdRoutes: newRoutes, createdUsers: this.users };
  }

  public async updateAdminCredentials(params: {
    name: string;
    username: string;
    password: string;
  }): Promise<User> {
    const cleanUsername = params.username.trim().toLowerCase();
    const cleanPass = params.password.trim();
    if (!cleanUsername || !cleanPass) {
      throw new Error('El usuario y la contraseña del administrador no pueden estar vacíos.');
    }
    if (cleanPass.length < 6 || cleanPass === '123' || cleanPass === '123456') {
      throw new Error('Por seguridad, la contraseña del administrador debe tener al menos 6 caracteres y no ser una clave por defecto.');
    }

    const conflict = this.users.find(
      (u) => u.role === 'COBRADOR' && (u.username || '').toLowerCase() === cleanUsername
    );
    if (conflict) {
      throw new Error(`El usuario "${cleanUsername}" ya está asignado a un cobrador de ruta.`);
    }

    const adminIdx = this.users.findIndex((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
    const updatedAdmin: User =
      adminIdx >= 0
        ? {
            ...this.users[adminIdx],
            name: params.name.trim() || this.users[adminIdx].name,
            username: cleanUsername,
            password: cleanPass,
          }
        : {
            id: 'usr-adm-1',
            name: params.name.trim() || 'Administrador de Oficina',
            username: cleanUsername,
            password: cleanPass,
            email: `${cleanUsername}@oficina.com`,
            role: 'ADMIN',
            assignedRouteIds: ['ALL', ...this.routes.map((r) => r.id)],
            isActive: true,
            createdAt: getLocalTodayStr(),
          };

    if (adminIdx >= 0) {
      this.users[adminIdx] = updatedAdmin;
    } else {
      this.users.unshift(updatedAdmin);
    }

    this.officeConfig = { ...this.officeConfig, isSetupCompleted: true };
    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users)),
      safeStorage.setItem(STORAGE_KEYS.OFFICE_CONFIG, JSON.stringify(this.officeConfig)),
    ]);
    this.notify();
    return updatedAdmin;
  }

  public async updateRouteWithCredentials(params: {
    routeId: string;
    routeName: string;
    collectorName: string;
    username: string;
    password: string;
    description?: string;
    initialCashBase?: number;
    targetAdministrative?: number;
    expectedCustomersCount?: number;
  }): Promise<void> {
    const routeIdx = this.routes.findIndex((r) => r.id === params.routeId);
    if (routeIdx === -1) throw new Error('Ruta no encontrada.');

    const cleanUsername = params.username.trim().toLowerCase();
    const cleanPassword = params.password.trim();
    if (!params.routeName.trim() || !cleanUsername || !cleanPassword) {
      throw new Error('Nombre de ruta, usuario y contraseña son obligatorios.');
    }
    if (cleanPassword.length < 6 || cleanPassword === '123' || cleanPassword === '123456') {
      throw new Error('Por seguridad, la contraseña de la ruta debe tener al menos 6 caracteres y no ser una clave por defecto.');
    }

    const currentRoute = this.routes[routeIdx];
    const isCollectorShared = this.routes.some(
      (r) => r.id !== params.routeId && r.collectorId === currentRoute.collectorId
    );
    const collectorId =
      !currentRoute.collectorId || isCollectorShared
        ? `usr-col-${Date.now()}`
        : currentRoute.collectorId;

    const duplicateUser = this.users.find(
      (u) =>
        u.id !== collectorId &&
        (u.username || '').toLowerCase() === cleanUsername
    );
    if (duplicateUser) {
      throw new Error(`El usuario "${cleanUsername}" ya está siendo usado por otro miembro de la oficina.`);
    }

    const userIdx = this.users.findIndex((u) => u.id === collectorId);
    const updatedCollector: User =
      userIdx >= 0
        ? {
            ...this.users[userIdx],
            name: params.collectorName.trim() || this.users[userIdx].name,
            username: cleanUsername,
            password: hashPassword(cleanPassword),
            routeId: currentRoute.id,
            assignedRouteIds: [currentRoute.id],
          }
        : {
            id: collectorId,
            name: params.collectorName.trim() || 'Cobrador',
            username: cleanUsername,
            password: hashPassword(cleanPassword),
            email: `${cleanUsername}@oficina.com`,
            role: 'COBRADOR',
            routeId: currentRoute.id,
            assignedRouteIds: [currentRoute.id],
            isActive: true,
            createdAt: getLocalTodayStr(),
          };

    if (userIdx >= 0) {
      this.users[userIdx] = updatedCollector;
    } else {
      this.users.push(updatedCollector);
    }

    this.routes[routeIdx] = {
      ...currentRoute,
      name: params.routeName.trim(),
      collectorId,
      collectorName: updatedCollector.name,
      description: params.description?.trim() ?? currentRoute.description,
      initialCashBase:
        params.initialCashBase !== undefined ? params.initialCashBase : currentRoute.initialCashBase,
      targetAdministrative:
        params.targetAdministrative !== undefined
          ? params.targetAdministrative
          : currentRoute.targetAdministrative,
      expectedCustomersCount:
        params.expectedCustomersCount !== undefined
          ? params.expectedCustomersCount
          : currentRoute.expectedCustomersCount,
    };

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users)),
      safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes)),
    ]);
    this.notify();
  }

  /**
   * Actualiza directamente el Administrativo (Cupo Total) y la Base de Efectivo de una ruta
   * sin requerir re-escribir usuario o contraseña.
   */
  public async updateRouteCapital(params: {
    routeId: string;
    targetAdministrative?: number;
    initialCashBase?: number;
  }): Promise<Route> {
    const routeIdx = this.routes.findIndex((r) => r.id === params.routeId);
    if (routeIdx === -1) throw new Error('Ruta no encontrada.');
    const currentRoute = this.routes[routeIdx];

    const updatedRoute: Route = {
      ...currentRoute,
      targetAdministrative:
        params.targetAdministrative !== undefined
          ? params.targetAdministrative
          : currentRoute.targetAdministrative,
      initialCashBase:
        params.initialCashBase !== undefined
          ? params.initialCashBase
          : currentRoute.initialCashBase,
    };

    this.routes[routeIdx] = updatedRoute;
    await safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes));
    this.notify();
    return updatedRoute;
  }

  public async deleteRoute(routeId: string): Promise<void> {
    if (this.routes.length <= 1) {
      throw new Error('La oficina debe mantener al menos 1 ruta activa.');
    }
    const targetRoute = this.routes.find((r) => r.id === routeId);
    if (!targetRoute) return;

    this.routes = this.routes.filter((r) => r.id !== routeId);
    if (targetRoute.collectorId) {
      const usedElsewhere = this.routes.some((r) => r.collectorId === targetRoute.collectorId);
      if (!usedElsewhere) {
        this.users = this.users.filter((u) => u.id !== targetRoute.collectorId);
      }
    }

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(this.users)),
      safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes)),
    ]);
    this.notify();
  }

  public async updateCustomerOrder(orderedCustomerIds: string[]): Promise<void> {
    this.customers = this.customers.map((c) => {
      const idx = orderedCustomerIds.indexOf(c.id);
      return idx >= 0 ? { ...c, orderIndex: idx + 1 } : c;
    });
    await safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers));
    this.notify();
  }

  /**
   * Calcula las métricas en tiempo real para el Hero Balance Card, Quick Pills y Gráficos (Figma 7020-3430)
   */
  public getDailyRouteMetrics(todayStr: string, routeIdFilter?: string): DailyRouteMetrics {
    const filterByRoute = Boolean(routeIdFilter && routeIdFilter !== 'ALL');
    const scopedLoans = filterByRoute
      ? this.loans.filter((l) => l.routeId === routeIdFilter)
      : this.loans;
    const activeLoans = scopedLoans.filter((l) => l.status === 'ACTIVE');
    const activeLoanIds = new Set(activeLoans.map((l) => l.id));
    const scopedLoanIds = new Set(scopedLoans.map((l) => l.id));

    // Capital activo en la calle (suma de pendingAmount en cuotas de créditos activos)
    const activeCapitalInStreet = this.installments
      .filter((i) => activeLoanIds.has(i.loanId))
      .reduce((sum, i) => sum + i.pendingAmount, 0);

    // Mora fáctica acumulada y conteo de clientes en mora
    let overdueTotalAmount = 0;
    let overdueCustomersCount = 0;
    let expectedTodayFromInstallments = 0;

    activeLoans.forEach((loan) => {
      const loanInsts = this.installments.filter((i) => i.loanId === loan.id);
      const delinq = calculateDelinquencyMetrics(loanInsts, todayStr);
      if (delinq.hasDelinquency) {
        overdueTotalAmount += delinq.overdueAmount;
        overdueCustomersCount += 1;
      }
      const todayInst = loanInsts.find((i) => i.dueDate === todayStr);
      if (todayInst) {
        expectedTodayFromInstallments += todayInst.expectedAmount;
      } else if (loan.frequency === 'DAILY' && loan.startDate !== todayStr) {
        const nextPending = loanInsts.find((i) => i.pendingAmount > 0);
        if (nextPending) {
          expectedTodayFromInstallments += nextPending.expectedAmount;
        }
      }
    });

    const sessionId = this.activeSession?.id;
    const isCurrentSessionDate = this.activeSession?.date === todayStr;
    const todayPayments = this.payments.filter(
      (p) =>
        p.status === 'COMPLETED' &&
        (!filterByRoute || scopedLoanIds.has(p.loanId)) &&
        (p.createdAt.startsWith(todayStr) || (isCurrentSessionDate && p.sessionId === sessionId))
    );

    const collectedCashToday = todayPayments
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + p.amountReceived, 0);

    const collectedDigitalToday = todayPayments
      .filter((p) => p.paymentMethod === 'NEQUI' || p.paymentMethod === 'TRANSFER' || p.paymentMethod === 'OTHER')
      .reduce((sum, p) => sum + p.amountReceived, 0);

    const collectedToday = collectedCashToday + collectedDigitalToday;

    const rawGoal = Math.max(
      filterByRoute ? 0 : (this.activeSession?.expectedCollection || 0),
      expectedTodayFromInstallments + overdueTotalAmount
    );
    // Si no hay meta válida definida, la meta es 0 (no se fuerza 1 falso para evitar Meta: $1 100%)
    const expectedDailyGoal = Math.max(0, rawGoal);

    const progressRatio = expectedDailyGoal > 0
      ? Math.min(1, Math.max(0, collectedToday / expectedDailyGoal))
      : 0;
    const progressPercentage = expectedDailyGoal > 0
      ? Math.round(progressRatio * 100)
      : 0;

    const scopedCashMovements = filterByRoute
      ? this.cashMovements.filter((cm) => cm.routeId === routeIdFilter)
      : this.cashMovements;

    // Desembolsos de hoy (préstamos nuevos + renovaciones netas) menos créditos anulados hoy
    const disbursedRawToday = scopedCashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          (cm.category === 'LOAN_DISBURSEMENT' || cm.category === 'RENEWAL_DISBURSEMENT') &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    const cancelledLoansRefundToday = scopedCashMovements
      .filter(
        (cm) =>
          cm.type === 'INCOME' &&
          cm.category === 'LOAN_CANCELLATION' &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    const disbursedToday = Math.max(0, disbursedRawToday - cancelledLoansRefundToday);

    // Desglose de Salidas / Salientes (Préstamos Paridos & Renovaciones, excluyendo migraciones de cartulina física)
    const isMigratedCardLoan = (l: Loan) =>
      Boolean(l.notes?.startsWith('Migrado de cartulina física'));
    const todayNewLoans = scopedLoans.filter(
      (l) =>
        l.createdAt.startsWith(todayStr) &&
        !l.previousLoanId &&
        l.status !== 'CANCELLED' &&
        !isMigratedCardLoan(l)
    );
    const todayRenewals = this.renewals.filter(
      (r) => r.createdAt.startsWith(todayStr) && (!filterByRoute || scopedLoanIds.has(r.newLoanId))
    );

    const salidasCount = todayNewLoans.length + todayRenewals.length;
    const salidasCapitalPlaced =
      todayNewLoans.reduce((sum, l) => sum + l.principal, 0) +
      todayRenewals.reduce((sum, r) => sum + r.newPrincipal, 0);

    // Saldo anterior refinanciado / saliente (los $150.000 que van a Salidas y NO al Pleno)
    const salidasRefinancedBalance = todayRenewals.reduce(
      (sum, r) => sum + r.previousBalanceDeducted,
      0
    );

    const salidasNetCashDisbursed =
      todayRenewals.reduce((sum, r) => sum + r.actualCashDisbursed, 0) +
      todayNewLoans.reduce((sum, l) => sum + l.principal, 0);

    // Gastos operativos de ruta (pinchazos, datos, gasolina)
    const expensesToday = scopedCashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          cm.category === 'EXPENSE' &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    // Retiros de recaudo de la base a oficina (Audio 3)
    const recaudoRetiradoToday = scopedCashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          cm.category === 'RECAUDO_OFICINA' &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    const capitalInjectedToday = scopedCashMovements
      .filter(
        (cm) =>
          cm.type === 'INCOME' &&
          cm.category === 'CAPITAL_INJECTION' &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    const paperworkRetiradoToday = scopedCashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          cm.category === 'RETIRO_PAPELERIA' &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    // Base disponible en caja de la ruta:
    // Dinero Total fijado a la ruta (Administrativo) - Cartera colocada en calle
    // + Efectivo cobrado hoy - Desembolsos netos en efectivo hoy - Gastos de ruta hoy - Retiros a oficina
    const matchingRoutes = filterByRoute
      ? this.routes.filter((r) => r.id === routeIdFilter)
      : this.routes;

    const hasTargetAdmin = matchingRoutes.some((r) => (r.targetAdministrative || 0) > 0);
    const totalTarget = matchingRoutes.reduce((sum, r) => sum + (r.targetAdministrative || 0), 0);
    const totalTargetCustomers = matchingRoutes.reduce((sum, r) => sum + (r.expectedCustomersCount || 0), 0);
    const totalAssignedCashBase = matchingRoutes.reduce((sum, r) => sum + (r.initialCashBase || 0), 0);

    // =========================================================================
    // CÁLCULO DE BASE EN EFECTIVO Y CAPITAL ADMINISTRATIVO TOTAL
    //
    // Reglas Financieras Inmutables:
    // 1. Un pago de cuota ($30k en efectivo):
    //    - Se RESTA ÚNICAMENTE de la Cartera (disminuye la deuda en calle de los clientes).
    //    - Se SUMA a la Base en mano (ingresa dinero físico al bolsillo del cobrador).
    //    - El Administrativo NO SE RESTA (el patrimonio total de la ruta permanece inmutable).
    // 2. Si la ruta tiene Dinero Total Asignado (totalTarget > 0):
    //    - Administrativo Total = totalTarget (constante fijada por la oficina).
    //    - Base en Mano = totalTarget - activeCapitalInStreet - collectedDigitalToday - expensesToday - recaudoRetiradoToday
    // 3. Si la ruta NO tiene Dinero Total Asignado aún (totalTarget <= 0):
    //    - Base en Mano = Base Inicial + collectedCashToday - salidasNetCashDisbursed - expensesToday - recaudoRetiradoToday
    //    - Administrativo Total = activeCapitalInStreet + cashAvailableInHand + collectedDigitalToday
    // =========================================================================

    let cashAvailableInHand = 0;
    let totalAdministrativeCapital = 0;

    if (hasTargetAdmin && totalTarget > 0 && totalTarget >= activeCapitalInStreet) {
      // MODELO A: La ruta tiene fijado un Dinero Total Administrado (ej: $10.000.000)
      totalAdministrativeCapital = totalTarget;

      // Base = Dinero Total de la ruta - Cartera en la calle
      // ajustado por transferencias digitales (dinero en banco), gastos de hoy y retiros a oficina de hoy.
      // Cuando un cliente abona 30k en efectivo:
      // activeCapitalInStreet BAJA 30k -> (totalTarget - activeCapitalInStreet) SUBE 30k directamente a la Base.
      cashAvailableInHand = Math.max(
        0,
        totalTarget -
          activeCapitalInStreet -
          collectedDigitalToday -
          expensesToday -
          recaudoRetiradoToday -
          paperworkRetiradoToday +
          capitalInjectedToday
      );
    } else {
      // MODELO B: La ruta no tiene un Administrativo tope fijado o está en transición
      const initialBase = totalAssignedCashBase;
      cashAvailableInHand = Math.max(
        0,
        initialBase +
          collectedCashToday +
          capitalInjectedToday -
          salidasNetCashDisbursed -
          expensesToday -
          recaudoRetiradoToday -
          paperworkRetiradoToday
      );

      // El Administrativo es la suma del patrimonio vivo: Cartera en Calle + Base en Mano + Cobros Digitales
      // Como un abono de 30k resta 30k a Cartera y suma 30k a Base, el Administrativo permanece EXACTAMENTE IGUAL.
      totalAdministrativeCapital = Math.max(
        totalTarget,
        activeCapitalInStreet + cashAvailableInHand + collectedDigitalToday
      );
    }

    const visitedCustomerIds = new Set(todayPayments.map((p) => p.customerId));

    return {
      plenoCollected: collectedToday,
      collectedToday,
      expectedDailyGoal,
      progressRatio,
      progressPercentage,
      activeCapitalInStreet,
      overdueTotalAmount,
      overdueCustomersCount,
      collectedCashToday,
      collectedDigitalToday,
      disbursedToday,
      expensesToday,
      recaudoRetiradoToday,
      capitalInjectedToday,
      paperworkRetiradoToday,
      cashAvailableInHand,
      totalAdministrativeCapital,
      visitedCustomersCount: visitedCustomerIds.size,
      expectedCustomersCount: activeLoans.length,
      routeTargetCustomers: totalTargetCustomers,

      // Desglose de Salidas / Salientes
      salidasCount,
      salidasCapitalPlaced,
      salidasRefinancedBalance,
      salidasNetCashDisbursed,
    };
  }

  // --- MUTACIONES OPERATIVAS Y FINANCIERAS ---

  /**
   * Registrar Pago (Flujo rápido de cobro con idempotencia estricta)
   */
  public async recordPayment(params: {
    loanId: string;
    amountReceived: number;
    paymentMethod: PaymentMethod;
    collectorId: string;
    todayStr: string;
    notes?: string;
    idempotencyKey?: string;
  }): Promise<{ payment: Payment; updatedLoan: Loan }> {
    const loan = this.loans.find((l) => l.id === params.loanId);
    if (!loan) throw new Error('Crédito no encontrado');

    // Inmutabilidad de cierres contables: No permitir registrar pagos en días ya liquidados/cerrados
    const isDaySettled = this.settlements.some(
      (s) =>
        s.routeId === loan.routeId &&
        s.date === params.todayStr &&
        s.status === 'SETTLED'
    );
    if (isDaySettled) {
      throw new Error(
        `El cuadre de la ruta para el día ${params.todayStr} ya fue cerrado y liquidado. Por seguridad contable, los cierres son inmutables y no permiten registrar nuevos abonos.`
      );
    }

    const idempotencyKey =
      params.idempotencyKey || `idem-${Date.now()}-${params.loanId}-${params.amountReceived}`;

    // Verificación de idempotencia offline-first
    const existingPayment = this.payments.find((p) => p.idempotencyKey === idempotencyKey);
    if (existingPayment) {
      return { payment: existingPayment, updatedLoan: loan };
    }

    const currentInstallments = this.installments
      .filter((i) => i.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const totalPending = currentInstallments.reduce((sum, i) => sum + i.pendingAmount, 0);
    if (params.amountReceived > totalPending) {
      throw new Error('El monto ingresado supera el saldo total pendiente del crédito');
    }

    if (this.officeConfig.allowPartialPayments === false) {
      const nextPendingInst = currentInstallments.find((i) => i.pendingAmount > 0);
      const minRequired = Math.min(
        totalPending,
        nextPendingInst ? nextPendingInst.pendingAmount : loan.installmentAmount
      );
      if (params.amountReceived < minRequired) {
        throw new Error(
          `Los abonos parciales están deshabilitados por política de oficina. El monto mínimo a recaudar es $${minRequired.toLocaleString('es-CO')}.`
        );
      }
    }

    const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const sessionId = this.activeSession?.id || 'session-default';

    // Aplicar lógica matemática de negocio
    const result = applyPaymentToLoan({
      loan,
      currentInstallments,
      amountReceived: params.amountReceived,
      paymentMethod: params.paymentMethod,
      collectorId: params.collectorId,
      sessionId,
      todayStr: params.todayStr,
      paymentId,
      idempotencyKey,
      notes: params.notes,
    });

    // Actualizar estado en memoria
    this.loans = this.loans.map((l) => (l.id === loan.id ? result.updatedLoan : l));
    const updatedIds = new Set(result.updatedInstallments.map((i) => i.id));
    this.installments = this.installments.map((i) =>
      updatedIds.has(i.id) ? result.updatedInstallments.find((ui) => ui.id === i.id)! : i
    );
    this.payments.unshift(result.payment);

    // Si hay promesa pendiente para este crédito hoy, marcarla como CUMPLIDA
    this.promises = this.promises.map((pr) =>
      pr.loanId === loan.id && pr.status === 'PENDIENTE'
        ? { ...pr, status: 'CUMPLIDA', updatedAt: params.todayStr }
        : pr
    );

    // Si la jornada está abierta, actualizar montos
    if (this.activeSession && this.activeSession.status === 'OPEN') {
      this.activeSession = {
        ...this.activeSession,
        collectedAmount: this.activeSession.collectedAmount + params.amountReceived,
        visitedCustomersCount: this.activeSession.visitedCustomersCount + 1,
      };
    }

    // Registrar movimiento de caja
    const cashMov: CashMovement = {
      id: `cm-${Date.now()}`,
      routeId: loan.routeId,
      collectorId: params.collectorId,
      sessionId,
      type: 'INCOME',
      category: 'COLLECTION',
      amount: params.amountReceived,
      referenceId: result.payment.id,
      description: `Cobro crédito ${loan.loanNumber} (${params.paymentMethod})`,
      createdAt: `${params.todayStr} ${new Date().toLocaleTimeString('es-CO', { hour12: false })}`,
    };
    this.cashMovements.unshift(cashMov);

    // Registrar auditoría
    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: params.collectorId,
      timestamp: new Date().toISOString(),
      entity: 'PAYMENT',
      entityId: result.payment.id,
      action: 'CREATE',
      newValue: JSON.stringify(result.payment),
    };
    this.auditLogs.unshift(audit);

    // Persistir en disco
    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
      safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return { payment: result.payment, updatedLoan: result.updatedLoan };
  }

  /**
   * Crear Nuevo Cliente desde la Ruta Móvil (Quick Action Pill: + Nuevo Cliente)
   */
  public async createCustomer(params: {
    fullName: string;
    documentNumber: string;
    phone: string;
    whatsappPhone?: string;
    address: string;
    neighborhood: string;
    city?: string;
    occupation?: string;
    businessName?: string;
    referenceName?: string;
    referenceRelationship?: string;
    referencePhone?: string;
    routeId?: string;
    collectorId?: string;
    orderIndex?: number;
    photoUri?: string;
    videoUri?: string;
    mediaType?: 'PHOTO' | 'VIDEO' | 'NONE';
    todayStr: string;
  }): Promise<Customer> {
    if (!params.fullName.trim() || !params.documentNumber.trim()) {
      throw new Error('El nombre completo y la cédula son obligatorios');
    }
    const duplicate = this.customers.find(
      (c) => c.documentNumber.trim() === params.documentNumber.trim()
    );
    if (duplicate) {
      throw new Error(`Ya existe un cliente registrado con la cédula ${params.documentNumber}`);
    }

    const effectiveRouteId = params.routeId || 'route-norte';
    const routeObj = this.routes.find((r) => r.id === effectiveRouteId);
    const effectiveCollectorId = params.collectorId || routeObj?.collectorId || 'usr-col-1';
    const existingRouteCustomersCount = this.customers.filter((c) => c.routeId === effectiveRouteId).length;
    const effectiveOrderIndex =
      params.orderIndex !== undefined && params.orderIndex > 0
        ? params.orderIndex
        : existingRouteCustomersCount + 1;

    const customerId = `cust-${Date.now()}`;
    const newCustomer: Customer = {
      id: customerId,
      fullName: params.fullName.trim(),
      documentNumber: params.documentNumber.trim(),
      phone: params.phone.trim() || '3000000000',
      whatsappPhone: params.whatsappPhone?.trim() || params.phone.trim() || '3000000000',
      address: params.address.trim() || 'Dirección pendiente',
      neighborhood: params.neighborhood.trim() || 'Centro',
      city: params.city?.trim() || 'Barranquilla',
      occupation: params.occupation?.trim() || 'Comerciante',
      businessName: params.businessName?.trim() || undefined,
      routeId: effectiveRouteId,
      assignedCollectorId: effectiveCollectorId,
      orderIndex: effectiveOrderIndex,
      status: 'ACTIVE',
      references: params.referenceName?.trim()
        ? [
            {
              id: `ref-${Date.now()}`,
              fullName: params.referenceName.trim(),
              relationship: params.referenceRelationship?.trim() || 'Familiar',
              phone: params.referencePhone?.trim() || '',
            },
          ]
        : [],
      createdAt: params.todayStr,
      updatedAt: params.todayStr,
    };

    this.customers.unshift(newCustomer);

    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: newCustomer.assignedCollectorId,
      timestamp: new Date().toISOString(),
      entity: 'CUSTOMER',
      entityId: newCustomer.id,
      action: 'CREATE',
      newValue: JSON.stringify(newCustomer),
    };
    this.auditLogs.unshift(audit);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return newCustomer;
  }

  /**
   * Eliminar Cliente del Directorio y la Ruta
   * Valida si tiene créditos activos con saldo pendiente. Si force=true, procede
   * cancelando los créditos activos y eliminando al cliente con auditoría inmutable.
   */
  public async deleteCustomer(
    customerId: string,
    force: boolean = false,
    adminPassword?: string,
    callerRole?: UserRole
  ): Promise<{ success: boolean; message: string }> {
    // Protección de seguridad: La eliminación de clientes es exclusiva del Administrador o requiere clave de autorización
    const sessionUser = this.users.find((u) => u.id === this.activeSession?.collectorId);
    const isSessionAdmin =
      callerRole === 'ADMIN' ||
      callerRole === 'SUPER_ADMIN' ||
      sessionUser?.role === 'ADMIN' ||
      sessionUser?.role === 'SUPER_ADMIN';

    if (!isSessionAdmin) {
      if (!adminPassword || !this.verifyAdminPassword(adminPassword)) {
        throw new Error(
          'Acceso denegado: La eliminación de clientes es exclusiva de la administración de la oficina o requiere la clave de autorización del Administrador.'
        );
      }
    }

    const customerIndex = this.customers.findIndex((c) => c.id === customerId);
    if (customerIndex === -1) {
      throw new Error('El cliente no fue encontrado en el sistema.');
    }
    const customer = this.customers[customerIndex];

    const activeLoans = this.loans.filter(
      (l) => l.customerId === customerId && l.status === 'ACTIVE'
    );
    if (activeLoans.length > 0 && !force) {
      const loanNumbers = activeLoans.map((l) => l.loanNumber).join(', ');
      throw new Error(
        `El cliente ${customer.fullName} tiene créditos activos (${loanNumbers}). Cancele o liquide el crédito antes de eliminarlo.`
      );
    }

    // Registrar en auditoría
    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: customer.assignedCollectorId || 'usr-col-1',
      timestamp: new Date().toISOString(),
      entity: 'CUSTOMER',
      entityId: customer.id,
      action: 'DELETE',
      previousValue: JSON.stringify(customer),
    };
    this.auditLogs.unshift(audit);

    // Remover cliente de la lista activa
    this.customers.splice(customerIndex, 1);

    // Si se forzó la eliminación y tenía créditos activos, cancelarlos para no dejar inconsistencias
    if (activeLoans.length > 0 && force) {
      this.loans = this.loans.map((l) =>
        l.customerId === customerId && l.status === 'ACTIVE'
          ? { ...l, status: 'CANCELLED' as const, updatedAt: getLocalTodayStr() }
          : l
      );
    }

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return { success: true, message: `Cliente ${customer.fullName} eliminado exitosamente.` };
  }

  /**
   * Actualizar datos de un cliente
   */
  public async updateCustomer(
    customerId: string,
    updates: Partial<Customer>
  ): Promise<Customer> {
    const idx = this.customers.findIndex((c) => c.id === customerId);
    if (idx === -1) throw new Error('Cliente no encontrado');

    const oldCustomer = this.customers[idx];
    const updatedCustomer: Customer = {
      ...oldCustomer,
      ...updates,
      updatedAt: getLocalTodayStr(),
    };

    this.customers[idx] = updatedCustomer;

    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: updatedCustomer.assignedCollectorId || 'usr-col-1',
      timestamp: new Date().toISOString(),
      entity: 'CUSTOMER',
      entityId: updatedCustomer.id,
      action: 'UPDATE',
      previousValue: JSON.stringify(oldCustomer),
      newValue: JSON.stringify(updatedCustomer),
    };
    this.auditLogs.unshift(audit);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return updatedCustomer;
  }

  /**
   * Crear Nuevo Préstamo desde la Ruta Móvil (Quick Action Pill: + Nuevo Préstamo)
   */
  public async createLoan(params: {
    customerId: string;
    principal: number;
    interestRate?: number;
    installmentCount?: number;
    frequency?: LoanFrequency;
    fixedDueDate?: string;
    collectorId?: string;
    routeId?: string;
    todayStr: string;
    isCardMigration?: boolean;
    paidInstallmentNumbers?: number[];
    startDate?: string;
    photoUri?: string;
    videoUri?: string;
    mediaType?: 'PHOTO' | 'VIDEO' | 'NONE';
  }): Promise<{ loan: Loan; installments: Installment[]; paperworkFee: number }> {
    const customer = this.customers.find((c) => c.id === params.customerId);
    if (!customer) throw new Error('Cliente no encontrado');

    const existingActive = this.loans.find(
      (l) => l.customerId === customer.id && l.status === 'ACTIVE'
    );
    if (existingActive) {
      throw new Error(
        `El cliente ya tiene un crédito activo (${existingActive.loanNumber}). Use la opción Renovar.`
      );
    }

    const isMigration = Boolean(params.isCardMigration);
    const paidSet = new Set<number>(params.paidInstallmentNumbers || []);

    const isFixedDate = params.frequency === 'FIXED_DATE';
    const effectiveInstallmentCount = isFixedDate ? 1 : (params.installmentCount ?? 30);

    const summary = calculateLoanSummary(
      params.principal,
      params.interestRate ?? 0.20,
      effectiveInstallmentCount
    );
    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const paperworkFee =
      isMigration || !isPaperworkEnabled
        ? 0
        : calculatePaperworkFee(params.principal, {
            rate: this.officeConfig.paperworkRate || 5000,
            base: 100000,
            calculationMode: 'PROPORTIONAL',
          });
    const netDisbursed = isMigration ? 0 : Math.max(0, summary.principal - paperworkFee);

    const loanId = `loan-${Date.now()}`;
    const loanNumber = `#00${101 + this.loans.length}`;
    const collectorId = params.collectorId || customer.assignedCollectorId || 'usr-col-1';
    const routeId = params.routeId || customer.routeId || 'route-norte';

    // Si es migración de cartulina física y no enviaron fecha de inicio explícita,
    // calculamos el inicio hacia atrás según las cuotas ya pagadas para que la próxima cuota caiga hoy
    const effectiveStartDate =
      params.startDate ||
      (isMigration && paidSet.size > 0
        ? addDaysToDate(params.todayStr, -(paidSet.size + 1))
        : params.todayStr);

    const rawInstallments = generateInstallments(
      loanId,
      summary,
      effectiveStartDate,
      params.frequency || 'DAILY',
      undefined,
      params.fixedDueDate
    );

    const generatedInstallments: Installment[] = rawInstallments.map((inst) => {
      if (isMigration && paidSet.has(inst.installmentNumber)) {
        return {
          ...inst,
          paidAmount: inst.expectedAmount,
          pendingAmount: 0,
          status: 'PAGADA',
          lastPaymentDate: inst.dueDate,
        };
      }
      return inst;
    });

    const endDate =
      isFixedDate && params.fixedDueDate
        ? params.fixedDueDate
        : generatedInstallments.length > 0
        ? generatedInstallments[generatedInstallments.length - 1].dueDate
        : params.todayStr;

    const allPaidInCard = isMigration && paidSet.size >= summary.installmentCount;

    const newLoan: Loan = {
      id: loanId,
      loanNumber,
      customerId: customer.id,
      routeId,
      collectorId,
      principal: summary.principal,
      interestRate: summary.interestRate,
      interestType: 'FLAT_INITIAL_CAPITAL',
      interestAmount: summary.interestAmount,
      totalAgreed: summary.totalAgreed,
      installmentCount: summary.installmentCount,
      installmentAmount: summary.installmentAmount,
      frequency: params.frequency || 'DAILY',
      fixedDueDate: params.fixedDueDate,
      startDate: effectiveStartDate,
      endDate,
      status: allPaidInCard ? 'PAID' : 'ACTIVE',
      notes: isMigration
        ? `Migrado de cartulina física a digital (${paidSet.size}/${summary.installmentCount} cuotas pagadas en papel)`
        : undefined,
      createdAt: params.todayStr,
      updatedAt: params.todayStr,
    };

    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: collectorId,
      timestamp: new Date().toISOString(),
      entity: 'LOAN',
      entityId: newLoan.id,
      action: 'CREATE',
      newValue: JSON.stringify(newLoan),
      reason: isMigration
        ? `Migración de cartulina física a digital (${paidSet.size} cuotas previas pagadas)`
        : undefined,
    };

    this.loans.unshift(newLoan);
    this.installments.push(...generatedInstallments);

    // En migración de cartulina física NO se descuenta efectivo de la caja del día de hoy
    if (!isMigration) {
      const cashMov: CashMovement = {
        id: `cm-${Date.now()}`,
        routeId,
        collectorId,
        sessionId: this.activeSession?.id,
        type: 'EXPENSE',
        category: 'LOAN_DISBURSEMENT',
        amount: netDisbursed,
        referenceId: newLoan.id,
        description: `Desembolso nuevo crédito ${newLoan.loanNumber} a ${customer.fullName} (Capital: $${summary.principal}, Papelería: $${paperworkFee})`,
        createdAt: `${params.todayStr} ${new Date().toLocaleTimeString('es-CO', { hour12: false })}`,
      };
      this.cashMovements.unshift(cashMov);
    }

    this.auditLogs.unshift(audit);

    if (this.activeSession && this.activeSession.status === 'OPEN') {
      this.activeSession = {
        ...this.activeSession,
        expectedCustomersCount: this.activeSession.expectedCustomersCount + 1,
      };
    }

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return { loan: newLoan, installments: generatedInstallments, paperworkFee };
  }

  /**
   * Registrar Renovación
   */
  public async recordRenewal(params: {
    previousLoanId: string;
    newPrincipal: number;
    interestRate?: number;
    installmentCount?: number;
    collectorId: string;
    todayStr: string;
    paperworkFee?: number;
  }): Promise<{ renewal: Renewal; newLoan: Loan }> {
    const prevLoan = this.loans.find((l) => l.id === params.previousLoanId);
    if (!prevLoan) throw new Error('Crédito anterior no encontrado');

    const prevInstallments = this.installments.filter((i) => i.loanId === prevLoan.id);
    const previousBalanceDeducted = prevInstallments.reduce((acc, i) => acc + i.pendingAmount, 0);

    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const defaultPaperworkFee = isPaperworkEnabled
      ? calculatePaperworkFee(params.newPrincipal, {
          rate: this.officeConfig.paperworkRate || 5000,
          base: 100000,
          calculationMode: 'PROPORTIONAL',
        })
      : 0;
    const effectivePaperworkFee =
      params.paperworkFee !== undefined ? params.paperworkFee : defaultPaperworkFee;

    const renewalCalc = calculateRenewalDisbursement(
      params.newPrincipal,
      previousBalanceDeducted,
      effectivePaperworkFee
    );

    if (renewalCalc.actualCashDisbursed <= 0) {
      throw new Error(
        `El desembolso neto debe ser mayor a $0 COP (actual: $${renewalCalc.actualCashDisbursed.toLocaleString('es-CO')}). El nuevo capital debe cubrir el saldo anterior más papelería.`
      );
    }

    const updatedPrevLoan: Loan = {
      ...prevLoan,
      status: 'RENEWED',
      updatedAt: params.todayStr,
    };

    const effectiveFrequency = prevLoan.frequency || 'DAILY';
    const isFixedDate = effectiveFrequency === 'FIXED_DATE';
    const effectiveInstallmentCount = isFixedDate
      ? 1
      : params.installmentCount || prevLoan.installmentCount;

    const summary = calculateLoanSummary(
      params.newPrincipal,
      params.interestRate || prevLoan.interestRate,
      effectiveInstallmentCount
    );

    const newLoanId = `loan-${Date.now()}`;
    const newLoanNumber = `#00${101 + this.loans.length}`;
    const newInstallments = generateInstallments(
      newLoanId,
      summary,
      params.todayStr,
      effectiveFrequency,
      undefined,
      prevLoan.fixedDueDate
    );
    const endDate =
      newInstallments.length > 0
        ? newInstallments[newInstallments.length - 1].dueDate
        : addDaysToDate(params.todayStr, 30);

    const newLoan: Loan = {
      id: newLoanId,
      loanNumber: newLoanNumber,
      customerId: prevLoan.customerId,
      routeId: prevLoan.routeId,
      collectorId: params.collectorId,
      principal: summary.principal,
      interestRate: summary.interestRate,
      interestType: 'FLAT_INITIAL_CAPITAL',
      interestAmount: summary.interestAmount,
      totalAgreed: summary.totalAgreed,
      installmentCount: summary.installmentCount,
      installmentAmount: summary.installmentAmount,
      frequency: effectiveFrequency,
      fixedDueDate: prevLoan.fixedDueDate,
      startDate: params.todayStr,
      endDate,
      status: 'ACTIVE',
      previousLoanId: prevLoan.id,
      createdAt: params.todayStr,
      updatedAt: params.todayStr,
    };

    const renewal: Renewal = {
      id: `ren-${Date.now()}`,
      customerId: prevLoan.customerId,
      previousLoanId: prevLoan.id,
      newLoanId: newLoan.id,
      collectorId: params.collectorId,
      newPrincipal: renewalCalc.newPrincipal,
      previousBalanceDeducted: renewalCalc.previousBalanceDeducted,
      paperworkDeducted: renewalCalc.paperworkDeducted,
      actualCashDisbursed: renewalCalc.actualCashDisbursed,
      createdAt: params.todayStr,
    };

    const cashMov: CashMovement = {
      id: `cm-${Date.now()}`,
      routeId: prevLoan.routeId,
      collectorId: params.collectorId,
      sessionId: this.activeSession?.id,
      type: 'EXPENSE',
      category: 'RENEWAL_DISBURSEMENT',
      amount: renewalCalc.actualCashDisbursed,
      referenceId: renewal.id,
      description: `Desembolso neto renovación ${prevLoan.loanNumber} -> ${newLoan.loanNumber}`,
      createdAt: `${params.todayStr} ${new Date().toLocaleTimeString('es-CO', { hour12: false })}`,
    };

    // Marcar cuotas del préstamo anterior como pagadas por renovación
    this.installments = this.installments.map((inst) =>
      inst.loanId === prevLoan.id
        ? {
            ...inst,
            paidAmount: inst.expectedAmount,
            pendingAmount: 0,
            status: 'PAGADA',
            lastPaymentDate: params.todayStr,
          }
        : inst
    );

    this.loans = this.loans.map((l) => (l.id === prevLoan.id ? updatedPrevLoan : l)).concat(newLoan);
    this.installments.push(...newInstallments);
    this.renewals.unshift(renewal);
    this.cashMovements.unshift(cashMov);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify(this.renewals)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
    ]);

    this.notify();
    return { renewal, newLoan };
  }

  /**
   * Registrar Promesa de Pago
   */
  public async recordPromise(params: {
    customerId: string;
    loanId: string;
    collectorId: string;
    promisedAmount: number;
    promisedDate: string;
    todayStr?: string;
    notes?: string;
  }): Promise<PaymentPromise> {
    const dateStamp = params.todayStr || getLocalTodayStr();
    const promise: PaymentPromise = {
      id: `prom-${Date.now()}`,
      customerId: params.customerId,
      loanId: params.loanId,
      collectorId: params.collectorId,
      promisedAmount: params.promisedAmount,
      promisedDate: params.promisedDate,
      status: 'PENDIENTE',
      notes: params.notes,
      createdAt: dateStamp,
      updatedAt: dateStamp,
    };

    this.promises.unshift(promise);
    await safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises));
    this.notify();
    return promise;
  }

  /**
   * Registrar Retiro de Recaudo de la Base a la Oficina (Audio 3)
   * Descuenta directamente de la base en efectivo de la ruta.
   * Validación estricta: No se puede retirar más de lo que haya en la base ("si no hay base, de dónde vas a sacar").
   */
  public async recordRecaudoWithdrawal(params: {
    amount: number;
    destinationOrReason?: string;
    routeId?: string;
    authorizedBy?: string;
    todayStr?: string;
  }): Promise<CashMovement> {
    if (params.amount <= 0) {
      throw new Error('El monto a recaudar debe ser mayor a cero.');
    }

    const dateStamp = params.todayStr || this.activeSession?.date || getLocalTodayStr();
    const effectiveRouteId =
      params.routeId && params.routeId !== 'ALL' ? params.routeId : undefined;
    const metrics = this.getDailyRouteMetrics(dateStamp, effectiveRouteId);

    if (params.amount > metrics.cashAvailableInHand) {
      throw new Error(
        `Base insuficiente. La base actual disponible es $${metrics.cashAvailableInHand.toLocaleString(
          'es-CO'
        )}. No se pueden retirar $${params.amount.toLocaleString('es-CO')}.`
      );
    }

    const session = this.activeSession;
    const targetRouteId = effectiveRouteId || session?.routeId || this.routes[0]?.id || 'route-norte';
    const movement: CashMovement = {
      id: `csm-rec-${Date.now()}`,
      routeId: targetRouteId,
      collectorId: params.authorizedBy || session?.collectorId || 'usr-admin-1',
      sessionId: session?.id,
      type: 'EXPENSE',
      category: 'RECAUDO_OFICINA',
      amount: params.amount,
      description: params.destinationOrReason || 'Retiro de Recaudo / Utilidad a Oficina Central',
      createdAt: `${dateStamp}T${new Date().toTimeString().split(' ')[0]}`,
    };

        this.cashMovements.unshift(movement);
    await safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements));
    this.notify();
    return movement;
  }

  /**
   * Registrar Inyección de Capital a la Base / Ruta
   */
  public async recordCapitalInjection(params: {
    amount: number;
    sourceOrReason?: string;
    routeId?: string;
    authorizedBy?: string;
    todayStr?: string;
    increaseTargetAdmin?: boolean;
  }): Promise<CashMovement> {
    if (params.amount <= 0) {
      throw new Error('El monto a inyectar debe ser mayor a cero.');
    }

    const dateStamp = params.todayStr || this.activeSession?.date || getLocalTodayStr();
    const effectiveRouteId =
      params.routeId && params.routeId !== 'ALL' ? params.routeId : undefined;
    const session = this.activeSession;
    const targetRouteId = effectiveRouteId || session?.routeId || this.routes[0]?.id || 'route-norte';

    const movement: CashMovement = {
      id: "csm-inj-" + Date.now(),
      routeId: targetRouteId,
      collectorId: params.authorizedBy || session?.collectorId || 'usr-admin-1',
      sessionId: session?.id,
      type: 'INCOME',
      category: 'CAPITAL_INJECTION',
      amount: params.amount,
      description: params.sourceOrReason || 'Inyección de capital a la base',
      createdAt: dateStamp + "T" + new Date().toTimeString().split(' ')[0],
    };

    this.cashMovements.unshift(movement);

    if (params.increaseTargetAdmin) {
      const routeIdx = this.routes.findIndex((r) => r.id === targetRouteId);
      if (routeIdx >= 0) {
        this.routes[routeIdx] = {
          ...this.routes[routeIdx],
          targetAdministrative: (this.routes[routeIdx].targetAdministrative || 20000000) + params.amount,
        };
        await safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes));
      }
    }

    await safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements));
    this.notify();
    return movement;
  }

  /**
   * Registrar Retiro de Papelería hacia la Oficina Central
   */
  public async recordPaperworkWithdrawal(params: {
    amount: number;
    destinationOrReason?: string;
    routeId?: string;
    authorizedBy?: string;
    todayStr?: string;
  }): Promise<CashMovement> {
    if (params.amount <= 0) {
      throw new Error('El monto a retirar de papelería debe ser mayor a cero.');
    }

    const dateStamp = params.todayStr || this.activeSession?.date || getLocalTodayStr();
    const effectiveRouteId =
      params.routeId && params.routeId !== 'ALL' ? params.routeId : undefined;
    const session = this.activeSession;
    const targetRouteId = effectiveRouteId || session?.routeId || this.routes[0]?.id || 'route-norte';

    const movement: CashMovement = {
      id: "csm-pap-" + Date.now(),
      routeId: targetRouteId,
      collectorId: params.authorizedBy || session?.collectorId || 'usr-admin-1',
      sessionId: session?.id,
      type: 'EXPENSE',
      category: 'RETIRO_PAPELERIA',
      amount: params.amount,
      description: params.destinationOrReason || 'Retiro de utilidad por papelería a oficina',
      createdAt: dateStamp + "T" + new Date().toTimeString().split(' ')[0],
    };

    this.cashMovements.unshift(movement);
    await safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements));
    this.notify();
    return movement;
  }

  /**
   * Obtener Historial de Papelería (Cobrada en préstamos/renovaciones y retirada con fecha)
   */
  public getPaperworkHistory(routeId?: string): Array<{
    id: string;
    date: string;
    type: 'NUEVO_PRESTAMO' | 'RENOVACION' | 'RETIRO_PAPELERIA';
    customerName?: string;
    loanNumber?: string;
    amount: number;
    notes?: string;
    routeId: string;
  }> {
    const isFilter = Boolean(routeId && routeId !== 'ALL');
    const items: Array<{
      id: string;
      date: string;
      type: 'NUEVO_PRESTAMO' | 'RENOVACION' | 'RETIRO_PAPELERIA';
      customerName?: string;
      loanNumber?: string;
      amount: number;
      notes?: string;
      routeId: string;
    }> = [];

    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const pRate = this.officeConfig.paperworkRate || 5000;

    // 1. Préstamos nuevos con papelería
    this.loans.forEach((l) => {
      if (isFilter && l.routeId !== routeId) return;
      if (l.status === 'CANCELLED') return;
      if (l.notes && l.notes.startsWith('Migrado de cartulina')) return;
      const fee = isPaperworkEnabled ? calculatePaperworkFee(l.principal, { rate: pRate, base: 100000, calculationMode: 'PROPORTIONAL' }) : 0;
      if (fee > 0) {
        const cust = this.customers.find((c) => c.id === l.customerId);
        items.push({
          id: "pap-loan-" + l.id,
          date: l.createdAt,
          type: 'NUEVO_PRESTAMO',
          customerName: cust ? cust.fullName : 'Cliente',
          loanNumber: l.loanNumber,
          amount: fee,
          notes: "Papelería en crédito nuevo de $" + l.principal.toLocaleString('es-CO'),
          routeId: l.routeId,
        });
      }
    });

    // 2. Renovaciones con papelería
    this.renewals.forEach((r) => {
      const assocLoan = this.loans.find((l) => l.id === r.newLoanId);
      const rRouteId = assocLoan ? assocLoan.routeId : (this.routes[0] ? this.routes[0].id : 'route-norte');
      if (isFilter && rRouteId !== routeId) return;
      if (r.paperworkDeducted > 0) {
        const cust = this.customers.find((c) => c.id === r.customerId);
        items.push({
          id: "pap-ren-" + r.id,
          date: r.createdAt,
          type: 'RENOVACION',
          customerName: cust ? cust.fullName : 'Cliente',
          loanNumber: assocLoan ? assocLoan.loanNumber : '#Renovación',
          amount: r.paperworkDeducted,
          notes: "Papelería en renovación de $" + r.newPrincipal.toLocaleString('es-CO'),
          routeId: rRouteId,
        });
      }
    });

    // 3. Retiros de papelería
    this.cashMovements.forEach((cm) => {
      if (cm.category === 'RETIRO_PAPELERIA') {
        if (isFilter && cm.routeId !== routeId) return;
        items.push({
          id: cm.id,
          date: cm.createdAt,
          type: 'RETIRO_PAPELERIA',
          amount: cm.amount,
          notes: cm.description,
          routeId: cm.routeId,
        });
      }
    });

    return items.sort((a, b) => (b.date > a.date ? 1 : -1));
  }

  /**
   * Obtener Historial de Movimientos de Recaudo e Inyecciones con fecha
   */
  public getRecaudoHistory(routeId?: string): CashMovement[] {
    const isFilter = Boolean(routeId && routeId !== 'ALL');
    return this.cashMovements
      .filter((cm) => {
        if (isFilter && cm.routeId !== routeId) return false;
        return (
          cm.category === 'RECAUDO_OFICINA' ||
          cm.category === 'CAPITAL_INJECTION' ||
          cm.category === 'RETIRO_PAPELERIA'
        );
      })
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }

  /**
   * Cerrar Jornada y Liquidar Ruta con Arqueo de Caja (Efectivo vs Digital Nequi/Transferencia)
   */
  public async closeDailySettlement(params: {
    cashHandedOver: number;
    differenceJustification?: string;
    auditedBy?: string;
    payrollDeductionAmount?: number;
    payrollDeductionReason?: string;
    routeId?: string;
    collectorId?: string;
  }): Promise<DailySettlement> {
    const session = this.getActiveSession();
    const effectiveRouteFilter =
      params.routeId && params.routeId !== 'ALL' ? params.routeId : undefined;
    const targetRouteId = effectiveRouteFilter || session.routeId || this.routes[0]?.id || 'route-norte';
    const targetRouteObj = this.routes.find((r) => r.id === targetRouteId);
    const targetCollectorId =
      params.collectorId || targetRouteObj?.collectorId || session.collectorId || 'usr-col-1';

    const metrics = this.getDailyRouteMetrics(session.date, effectiveRouteFilter);
    const collectedCash = metrics.collectedCashToday;
    const collectedTransfers = metrics.collectedDigitalToday;
    const actualCollection = metrics.collectedToday;
    const expectedCollection = metrics.expectedDailyGoal;
    const pendingCollection = Math.max(0, expectedCollection - actualCollection);

    const sessionExpenses = metrics.expensesToday || 0;
    const disbursedToday = metrics.disbursedToday || 0;
    const recaudoRetiradoToday = metrics.recaudoRetiradoToday || 0;

    const netCashExpected = Math.max(
      0,
      collectedCash - sessionExpenses - disbursedToday - recaudoRetiradoToday
    );
    const cashDifference = netCashExpected - params.cashHandedOver;
    if (cashDifference !== 0 && !params.differenceJustification) {
      throw new Error('Es obligatoria una justificación cuando existe diferencia en el arqueo de caja');
    }

    const isMigratedCardLoan = (l: Loan) =>
      Boolean(l.notes?.startsWith('Migrado de cartulina física'));
    const scopedLoans = effectiveRouteFilter
      ? this.loans.filter((l) => (l.routeId || 'route-norte') === effectiveRouteFilter)
      : this.loans;
    const scopedLoanIds = new Set(scopedLoans.map((l) => l.id));

    const todayNewLoans = scopedLoans.filter(
      (l) =>
        l.createdAt.startsWith(session.date) &&
        !l.previousLoanId &&
        l.status !== 'CANCELLED' &&
        !isMigratedCardLoan(l)
    );
    const todayRenewals = this.renewals.filter(
      (r) =>
        r.createdAt.startsWith(session.date) &&
        (!effectiveRouteFilter || scopedLoanIds.has(r.newLoanId))
    );

    const salidasCount = todayNewLoans.length + todayRenewals.length;
    const salidasCapitalPlaced =
      todayNewLoans.reduce((sum, l) => sum + l.principal, 0) +
      todayRenewals.reduce((sum, r) => sum + r.newPrincipal, 0);
    const salidasRefinancedBalance = todayRenewals.reduce(
      (sum, r) => sum + r.previousBalanceDeducted,
      0
    );
    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const salidasNetCashDisbursed =
      disbursedToday > 0
        ? disbursedToday
        : todayRenewals.reduce((sum, r) => sum + r.actualCashDisbursed, 0) +
          todayNewLoans.reduce(
            (sum, l) =>
              sum +
              (l.principal -
                (isPaperworkEnabled
                  ? calculatePaperworkFee(l.principal, {
                      rate: this.officeConfig.paperworkRate || 5000,
                      base: 100000,
                      calculationMode: 'PROPORTIONAL',
                    })
                  : 0)),
            0
          );

    let justificationText = params.differenceJustification || '';
    if (params.payrollDeductionAmount && params.payrollDeductionAmount > 0) {
      const payrollReason = params.payrollDeductionReason || 'Consumo personal / descuadre cobrador';
      justificationText += ` [DEDUCCIÓN NÓMINA: $${params.payrollDeductionAmount.toLocaleString('es-CO')} (${payrollReason})]`;

      // Registrar movimiento de ajuste para nómina
      const payrollMov: CashMovement = {
        id: `csm-nom-${Date.now()}`,
        routeId: targetRouteId,
        collectorId: targetCollectorId,
        sessionId: session.id,
        type: 'EXPENSE',
        category: 'ADJUSTMENT',
        amount: params.payrollDeductionAmount,
        description: `Deducción nómina: ${payrollReason}`,
        createdAt: new Date().toISOString(),
      };
      this.cashMovements.unshift(payrollMov);
    }

    const settlement: DailySettlement = {
      id: `set-${Date.now()}`,
      sessionId: session.id,
      date: session.date,
      routeId: targetRouteId,
      collectorId: targetCollectorId,
      plenoCollection: actualCollection,
      expectedCollection,
      actualCollection,
      pendingCollection,
      salidasCount,
      salidasCapitalPlaced,
      salidasRefinancedBalance,
      salidasNetCashDisbursed,
      newLoansCount: todayNewLoans.length,
      newLoansCapitalPlaced: todayNewLoans.reduce((sum, l) => sum + l.principal, 0),
      renewalsCount: todayRenewals.length,
      renewalsCapitalPlaced: todayRenewals.reduce((sum, r) => sum + r.newPrincipal, 0),
      actualCashDisbursedTotal: salidasNetCashDisbursed,
      recoveredDelinquency: 0,
      collectedCash,
      collectedTransfers,
      cashHandedOver: params.cashHandedOver,
      cashDifference,
      differenceJustification: justificationText.trim() || undefined,
      status: 'SETTLED',
      settledAt: new Date().toISOString(),
      auditedBy: params.auditedBy,
    };

    // 1. Guardar la liquidación en el registro histórico inmutable
    this.settlements.unshift(settlement);

    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: targetCollectorId,
      timestamp: new Date().toISOString(),
      entity: 'SETTLEMENT',
      entityId: settlement.id,
      action: 'CLOSE',
      newValue: JSON.stringify(settlement),
      reason: params.differenceJustification,
    };
    this.auditLogs.unshift(audit);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    // 2. REGLA FUNDAMENTAL DE NEGOCIO:
    // El día de cobro se renueva DESPUÉS de realizar la liquidación del día.
    // Al liquidar con éxito la jornada, el sistema renueva la ruta para el siguiente día:
    const nextDayStr = addDaysToDate(session.date, 1);
    await this.renewCollectionDayAfterSettlement(nextDayStr);

    return settlement;
  }

  public getNonPaymentVisits(date?: string): NonPaymentVisit[] {
    if (!date) return [...this.nonPaymentVisits];
    return this.nonPaymentVisits.filter((v) => v.date === date);
  }

  public async recordNonPaymentVisit(visit: Omit<NonPaymentVisit, 'id' | 'createdAt'>): Promise<NonPaymentVisit> {
    const newRecord: NonPaymentVisit = {
      ...visit,
      id: `npv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
    };
    // Reemplaza si ya existía para el mismo cliente en la misma fecha
    this.nonPaymentVisits = this.nonPaymentVisits.filter(
      (v) => !(v.customerId === visit.customerId && v.date === visit.date)
    );
    this.nonPaymentVisits.unshift(newRecord);

    await safeStorage.setItem(STORAGE_KEYS.NON_PAYMENT_VISITS, JSON.stringify(this.nonPaymentVisits));
    this.notify();
    return newRecord;
  }

  public async recordRouteExpense(params: {
    amount: number;
    category: string;
    description: string;
    todayStr: string;
    routeId?: string;
    collectorId?: string;
  }): Promise<CashMovement> {
    const routeId =
      (params.routeId && params.routeId !== 'ALL' ? params.routeId : undefined) ||
      this.activeSession?.routeId ||
      this.routes[0]?.id ||
      'route-norte';
    const routeObj = this.routes.find((r) => r.id === routeId);
    const collectorId =
      params.collectorId || routeObj?.collectorId || this.activeSession?.collectorId || 'usr-col-1';

    const movement: CashMovement = {
      id: `csm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      routeId,
      collectorId,
      sessionId: this.activeSession?.id,
      type: 'EXPENSE',
      category: 'EXPENSE',
      amount: Math.round(params.amount),
      description: `${params.category}: ${params.description}`.trim(),
      createdAt: `${params.todayStr}T${new Date().toTimeString().split(' ')[0]}Z`,
    };

    this.cashMovements.unshift(movement);
    await safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements));
    this.notify();
    return movement;
  }

  /**
   * Exporta el paquete de sincronización móvil en formato JSON exacto para cartera.db (BigDecimal string safe)
   */
  public exportMobileSyncPackage(todayStr: string): MobileSyncPackage {
    const metrics = this.getDailyRouteMetrics(todayStr);
    const routeId = this.activeSession?.routeId || 'route-norte';
    const collectorId = this.activeSession?.collectorId || 'usr-col-1';

    return {
      packageVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      operatingDate: todayStr,
      routeId,
      collectorId,
      metrics,
      payments: this.payments.map((p) => {
        const assocLoan = this.loans.find((l) => l.id === p.loanId);
        return {
          id: p.id,
          idempotencyKey: p.idempotencyKey,
          loanId: p.loanId,
          customerId: p.customerId,
          collectorId: p.collectorId || assocLoan?.collectorId || collectorId,
          routeId: assocLoan?.routeId || routeId,
          amountReceived: Math.round(p.amountReceived).toString(),
          paymentMethod: p.paymentMethod,
          createdAt: p.createdAt,
          notes: p.notes,
          allocations: (p.installmentsBreakdown || []).map((b) => ({
            installmentId: b.installmentId,
            installmentNumber: b.installmentNumber,
            amountApplied: Math.round(b.amountApplied).toString(),
            resultingStatus: b.resultingStatus,
          })),
        };
      }),
      promises: this.promises,
      newCustomers: this.customers,
      newLoans: this.loans,
      installments: this.installments,
      renewals: this.renewals,
      settlements: this.settlements,
      cashMovements: this.cashMovements,
      nonPaymentVisits: this.nonPaymentVisits,
    };
  }

  /**
   * Exporta la copia de seguridad de la ruta cifrada con contraseña y verificación de integridad SHA-256
   */
  public exportEncryptedMobileSyncPackage(todayStr: string, passwordKey: string): string {
    const pkg = this.exportMobileSyncPackage(todayStr);
    const jsonStr = JSON.stringify(pkg, null, 2);
    return encryptBackupData(jsonStr, passwordKey);
  }

  /**
   * Importa un paquete JSON de Ruta (proveniente de cartera.db o respaldo móvil cifrado/plano) y lo persiste en AsyncStorage
   * haciendo merge inteligente por ID para nunca destruir registros existentes.
   */
  public async importMobileSyncPackage(
    rawJson: string,
    passwordKey?: string
  ): Promise<{
    importedCustomers: number;
    importedLoans: number;
  }> {
    let effectiveJson = rawJson.trim();
    if (effectiveJson.includes('kredia_backup_enc_v1')) {
      if (!passwordKey) {
        throw new Error('Esta copia de seguridad está protegida con contraseña. Ingrese la clave para restaurarla.');
      }
      effectiveJson = decryptBackupData(effectiveJson, passwordKey);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(effectiveJson);
    } catch {
      throw new Error('El archivo no contiene un formato JSON válido de respaldo.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Paquete de sincronización vacío o inválido.');
    }

    const mergeById = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
      const map = new Map<string, T>();
      for (const item of existing) {
        if (item && item.id) map.set(item.id, item);
      }
      for (const item of incoming) {
        if (item && item.id) {
          const prev = map.get(item.id);
          map.set(item.id, prev ? { ...prev, ...item } : item);
        }
      }
      return Array.from(map.values());
    };

    const incomingCustomers = Array.isArray(parsed.newCustomers)
      ? parsed.newCustomers
      : Array.isArray(parsed.customers)
      ? parsed.customers
      : [];
    if (incomingCustomers.length > 0) {
      this.customers = mergeById(this.customers, incomingCustomers);
    }

    const incomingLoans = Array.isArray(parsed.newLoans)
      ? parsed.newLoans
      : Array.isArray(parsed.loans)
      ? parsed.loans
      : [];
    if (incomingLoans.length > 0) {
      this.loans = mergeById(this.loans, incomingLoans);
    }

    if (Array.isArray(parsed.installments) && parsed.installments.length > 0) {
      this.installments = mergeById(this.installments, parsed.installments);
    }

    if (Array.isArray(parsed.promises) && parsed.promises.length > 0) {
      this.promises = mergeById(this.promises, parsed.promises);
    }

    if (Array.isArray(parsed.renewals) && parsed.renewals.length > 0) {
      this.renewals = mergeById(this.renewals, parsed.renewals);
    }

    if (Array.isArray(parsed.settlements) && parsed.settlements.length > 0) {
      this.settlements = mergeById(this.settlements, parsed.settlements);
    }

    if (Array.isArray(parsed.cashMovements) && parsed.cashMovements.length > 0) {
      this.cashMovements = mergeById(this.cashMovements, parsed.cashMovements);
    }

    if (Array.isArray(parsed.nonPaymentVisits) && parsed.nonPaymentVisits.length > 0) {
      this.nonPaymentVisits = mergeById(this.nonPaymentVisits, parsed.nonPaymentVisits);
    }

    if (Array.isArray(parsed.payments) && parsed.payments.length > 0) {
      const normalizedPayments: Payment[] = parsed.payments.map((p: any) => ({
        id: p.id,
        idempotencyKey: p.idempotencyKey || `idem-${p.id}`,
        loanId: p.loanId,
        customerId: p.customerId,
        collectorId: p.collectorId || parsed.collectorId || 'usr-col-1',
        sessionId: p.sessionId || this.activeSession?.id || 'session-sync',
        amountReceived:
          typeof p.amountReceived === 'string'
            ? Number(p.amountReceived)
            : Number(p.amountReceived || 0),
        paymentMethod: p.paymentMethod || 'CASH',
        installmentsBreakdown: Array.isArray(p.installmentsBreakdown)
          ? p.installmentsBreakdown
          : Array.isArray(p.allocations)
          ? p.allocations.map((a: any) => ({
              installmentId: a.installmentId,
              installmentNumber: a.installmentNumber,
              amountApplied:
                typeof a.amountApplied === 'string'
                  ? Number(a.amountApplied)
                  : Number(a.amountApplied || 0),
              previousPending: 0,
              newPending: 0,
              resultingStatus: a.resultingStatus || 'PAGADA',
            }))
          : [],
        notes: p.notes,
        status: p.status || 'COMPLETED',
        createdAt: p.createdAt || parsed.operatingDate || getLocalTodayStr(),
      }));
      this.payments = mergeById(this.payments, normalizedPayments);
    }

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
      safeStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify(this.renewals)),
      safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.NON_PAYMENT_VISITS, JSON.stringify(this.nonPaymentVisits)),
      safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
    ]);

    this.notify();
    return {
      importedCustomers: incomingCustomers.length || this.customers.length,
      importedLoans: incomingLoans.length || this.loans.length,
    };
  }

  /**
   * Exporta la base de datos completa de la cartera a formato JSON estructurado
   */
  public exportFullBackupJSON(): string {
    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      companyName: this.officeConfig.companyName,
      customers: this.customers,
      loans: this.loans,
      installments: this.installments,
      payments: this.payments,
      renewals: this.renewals,
      settlements: this.settlements,
      promises: this.promises,
      cashMovements: this.cashMovements,
      nonPaymentVisits: this.nonPaymentVisits,
      auditLogs: this.auditLogs,
      officeConfig: this.officeConfig,
    };
    return JSON.stringify(backup, null, 2);
  }

  /**
   * Restaura la base de datos completa desde un paquete de respaldo JSON
   */
  public async restoreFullBackupJSON(jsonStr: string): Promise<{ customersCount: number; loansCount: number }> {
    let data: any;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      throw new Error('El archivo o texto provisto no contiene un formato JSON válido.');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('El respaldo JSON está vacío o no es un objeto válido.');
    }

    if (Array.isArray(data.customers)) this.customers = data.customers;
    if (Array.isArray(data.loans)) this.loans = data.loans;
    if (Array.isArray(data.installments)) this.installments = data.installments;
    if (Array.isArray(data.payments)) this.payments = data.payments;
    if (Array.isArray(data.renewals)) this.renewals = data.renewals;
    if (Array.isArray(data.settlements)) this.settlements = data.settlements;
    if (Array.isArray(data.promises)) this.promises = data.promises;
    if (Array.isArray(data.cashMovements)) this.cashMovements = data.cashMovements;
    if (Array.isArray(data.nonPaymentVisits)) this.nonPaymentVisits = data.nonPaymentVisits;
    if (Array.isArray(data.auditLogs)) this.auditLogs = data.auditLogs;
    if (data.officeConfig && typeof data.officeConfig === 'object') this.officeConfig = data.officeConfig;

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
      safeStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify(this.renewals)),
      safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
      safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.NON_PAYMENT_VISITS, JSON.stringify(this.nonPaymentVisits)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
      safeStorage.setItem(STORAGE_KEYS.OFFICE_CONFIG, JSON.stringify(this.officeConfig)),
    ]);

    this.notify();
    return {
      customersCount: this.customers.length,
      loansCount: this.loans.length,
    };
  }

  /**
   * Limpia toda la cartera (clientes, préstamos, cuotas, pagos, etc.)
   * dejando el sistema 100% en blanco listo para registrar clientes reales uno a uno.
   */
  public async clearPortfolioToEmpty(): Promise<void> {
    this.customers = [];
    this.loans = [];
    this.installments = [];
    this.payments = [];
    this.renewals = [];
    this.settlements = [];
    this.promises = [];
    this.cashMovements = [];
    this.nonPaymentVisits = [];
    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify([])),
      safeStorage.setItem(STORAGE_KEYS.NON_PAYMENT_VISITS, JSON.stringify([])),
    ]);
    this.notify();
  }

  /**
   * Restaura los datos semilla de demostración en 1 toque y limpia el almacenamiento local
   */
  public async resetToDemoSeed(): Promise<void> {
    await Promise.all(
      Object.values(STORAGE_KEYS).map((key) => safeStorage.removeItem(key))
    );

    this.users = [...INITIAL_USERS];
    this.routes = [...INITIAL_ROUTES];
    this.customers = [...INITIAL_CUSTOMERS];
    this.loans = [...INITIAL_LOANS];
    this.installments = [...INITIAL_INSTALLMENTS];
    this.activeSession = { ...INITIAL_SESSION };
    this.payments = [];
    this.renewals = [];
    this.settlements = [];
    this.promises = [...INITIAL_PROMISES];
    this.cashMovements = [...INITIAL_CASH_MOVEMENTS];
    this.auditLogs = [];

    this.notify();
  }

  /**
   * Carga el escenario oficial de prueba: 40 clientes y Administrativo de $20.000.000 COP
   */
  public async load20MillionScenario(): Promise<void> {
    await this.resetToDemoSeed();
  }

  /**
   * Ítem 3: Crear nueva Ruta y asignarle cobrador
   */
  public async createRoute(params: {
    name: string;
    code: string;
    collectorId: string;
    description?: string;
  }): Promise<Route> {
    if (!params.name.trim() || !params.code.trim()) {
      throw new Error('El nombre y el código de la ruta son obligatorios.');
    }
    const newRoute: Route = {
      id: `route-${Date.now()}`,
      name: params.name.trim(),
      code: params.code.trim().toUpperCase(),
      collectorId: params.collectorId || 'usr-col-1',
      description: params.description?.trim() || 'Ruta operativa de cobro diario',
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    this.routes.push(newRoute);
    await safeStorage.setItem(STORAGE_KEYS.ROUTES, JSON.stringify(this.routes));
    this.notify();
    return newRoute;
  }

  /**
   * Ítem 1: Sincronización por Red Local Wi-Fi (REST HTTP directo al PC de Oficina)
   */
  public async testOfficeConnection(
    serverUrl?: string
  ): Promise<{ ok: boolean; statusText: string; companyName?: string }> {
    const baseUrl = (serverUrl || this.officeConfig.officeServerUrl || 'http://192.168.1.10:8765')
      .trim()
      .replace(/\/+$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${baseUrl}/api/sync/status`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        return {
          ok: false,
          statusText: `Servidor respondió HTTP ${res.status}`,
        };
      }
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        statusText: data.message || 'Conectado a Oficina Central',
        companyName: data.companyName || this.officeConfig.companyName,
      };
    } catch (err: any) {
      clearTimeout(timer);
      return {
        ok: false,
        statusText:
          err?.name === 'AbortError'
            ? 'Tiempo de espera agotado (5s). Verifique IP y red Wi-Fi.'
            : `No se pudo conectar a ${baseUrl}. Verifique que el PC de Oficina esté encendido en la misma red Wi-Fi.`,
      };
    }
  }

  public async pushSyncToOfficeServer(
    serverUrl: string | undefined,
    todayStr: string
  ): Promise<{ ok: boolean; message: string }> {
    const baseUrl = (serverUrl || this.officeConfig.officeServerUrl || 'http://192.168.1.10:8765')
      .trim()
      .replace(/\/+$/, '');
    const payload = this.exportMobileSyncPackage(todayStr);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${baseUrl}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Error HTTP ${res.status}: ${errText || 'Rechazado por el servidor'}`);
      }
      const data = await res.json().catch(() => ({}));
      await this.updateOfficeConfig({ officeServerUrl: baseUrl });
      return {
        ok: true,
        message:
          data.message ||
          `Recaudo del día (${payload.payments.length} cobros y ${payload.newLoans.length} créditos) enviado exitosamente al PC de Oficina.`,
      };
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error(
        err?.name === 'AbortError'
          ? 'Tiempo de espera agotado al enviar datos al PC de Oficina.'
          : err?.message || 'Error de red al enviar paquete al PC de Oficina.'
      );
    }
  }

  public async pullRouteFromOfficeServer(
    serverUrl: string | undefined,
    routeId?: string
  ): Promise<{ importedCustomers: number; importedLoans: number }> {
    const baseUrl = (serverUrl || this.officeConfig.officeServerUrl || 'http://192.168.1.10:8765')
      .trim()
      .replace(/\/+$/, '');
    const query = routeId && routeId !== 'ALL' ? `?routeId=${encodeURIComponent(routeId)}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(`${baseUrl}/api/sync/pull${query}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`El servidor de Oficina respondió HTTP ${res.status}`);
      }
      const rawText = await res.text();
      const result = await this.importMobileSyncPackage(rawText);
      await this.updateOfficeConfig({ officeServerUrl: baseUrl });
      return result;
    } catch (err: any) {
      clearTimeout(timer);
      throw new Error(
        err?.name === 'AbortError'
          ? 'Tiempo de espera agotado al descargar cartera desde el PC de Oficina.'
          : err?.message || 'Error al descargar cartera desde el PC de Oficina.'
      );
    }
  }

  /**
   * Ítem 5: Reverso / Anulación Auditada de Abono (EXCLUSIVO ADMIN y SUPERVISOR)
   * Prohibido para el rol COBRADOR / COLLECTOR.
   */
  public async reversePayment(params: {
    paymentId: string;
    reason: string;
    userRole: UserRole;
    userId: string;
    todayStr: string;
  }): Promise<{ reversedPayment: Payment; updatedLoan: Loan }> {
    const isAuthorized =
      params.userRole === 'ADMIN' ||
      params.userRole === 'SUPERVISOR' ||
      params.userRole === 'SUPER_ADMIN';
    if (!isAuthorized) {
      throw new Error(
        'Acceso denegado: La anulación o reverso de abonos es exclusiva para el Administrador o Supervisor.'
      );
    }

    const cleanReason = (params.reason || '').trim();
    if (cleanReason.length < 5) {
      throw new Error(
        'Debe ingresar un motivo de auditoría válido (mínimo 5 caracteres) para anular el abono.'
      );
    }

    const paymentIdx = this.payments.findIndex((p) => p.id === params.paymentId);
    if (paymentIdx === -1) {
      throw new Error('El abono especificado no existe.');
    }

    const payment = this.payments[paymentIdx];
    if (payment.status === 'REVERSED' || payment.status === 'ANNULLED') {
      throw new Error('Este abono ya fue anulado previamente.');
    }

    const loanIdx = this.loans.findIndex((l) => l.id === payment.loanId);
    if (loanIdx === -1) {
      throw new Error('No se encontró el crédito asociado a este abono.');
    }
    const loan = this.loans[loanIdx];

    // Revertir los montos aplicados en cada cuota afectada
    const breakdownMap = new Map<string, number>();
    for (const item of payment.installmentsBreakdown || []) {
      breakdownMap.set(
        item.installmentId,
        (breakdownMap.get(item.installmentId) || 0) + item.amountApplied
      );
    }

    this.installments = this.installments.map((inst) => {
      if (inst.loanId !== loan.id) return inst;
      const appliedToRevert = breakdownMap.get(inst.id) || 0;
      if (appliedToRevert <= 0) return inst;

      const newPaid = Math.max(0, inst.paidAmount - appliedToRevert);
      const newPending = Math.min(inst.expectedAmount, inst.expectedAmount - newPaid);
      let newStatus = inst.status;
      if (newPaid <= 0) {
        newStatus = inst.dueDate < params.todayStr ? 'VENCIDA' : 'PENDIENTE';
      } else if (newPending > 0) {
        newStatus = 'PARCIAL';
      } else {
        newStatus = 'PAGADA';
      }

      return {
        ...inst,
        paidAmount: newPaid,
        pendingAmount: newPending,
        status: newStatus,
      };
    });

    // Si no tenía desglose por cuotas, revertir sobre las últimas cuotas pagadas del préstamo
    if (breakdownMap.size === 0 && payment.amountReceived > 0) {
      let remainingToRevert = payment.amountReceived;
      const loanInstallmentsDesc = this.installments
        .filter((i) => i.loanId === loan.id && i.paidAmount > 0)
        .sort((a, b) => b.installmentNumber - a.installmentNumber);

      const revertIds = new Map<string, number>();
      for (const inst of loanInstallmentsDesc) {
        if (remainingToRevert <= 0) break;
        const revertHere = Math.min(inst.paidAmount, remainingToRevert);
        revertIds.set(inst.id, revertHere);
        remainingToRevert -= revertHere;
      }

      this.installments = this.installments.map((inst) => {
        const rev = revertIds.get(inst.id);
        if (!rev) return inst;
        const newPaid = Math.max(0, inst.paidAmount - rev);
        const newPending = Math.min(inst.expectedAmount, inst.expectedAmount - newPaid);
        const newStatus =
          newPaid <= 0
            ? inst.dueDate < params.todayStr
              ? 'VENCIDA'
              : 'PENDIENTE'
            : newPending > 0
            ? 'PARCIAL'
            : 'PAGADA';
        return {
          ...inst,
          paidAmount: newPaid,
          pendingAmount: newPending,
          status: newStatus,
        };
      });
    }

    // Recalcular estado del préstamo (si estaba COMPLETED y ahora debe saldo, vuelve a ACTIVE)
    const remainingPending = this.installments
      .filter((i) => i.loanId === loan.id)
      .reduce((sum, i) => sum + i.pendingAmount, 0);

    const updatedLoan: Loan = {
      ...loan,
      status: remainingPending > 0 ? 'ACTIVE' : loan.status,
      updatedAt: params.todayStr,
    };
    this.loans[loanIdx] = updatedLoan;

    const reversedPayment: Payment = {
      ...payment,
      status: 'REVERSED',
      notes: `${payment.notes ? payment.notes + ' | ' : ''}[ANULADO por ${params.userRole}: ${cleanReason}]`,
    };
    this.payments[paymentIdx] = reversedPayment;

    // Registrar movimiento compensatorio en caja
    const reversalMovement: CashMovement = {
      id: `csm-rev-${Date.now()}`,
      routeId: loan.routeId,
      collectorId: params.userId,
      sessionId: this.activeSession?.id,
      type: 'EXPENSE',
      category: 'PAYMENT_REVERSAL',
      amount: payment.amountReceived,
      referenceId: payment.id,
      description: `Reverso auditado de abono (${loan.loanNumber}): ${cleanReason}`,
      createdAt: `${params.todayStr}T${new Date().toTimeString().split(' ')[0]}Z`,
    };
    this.cashMovements.unshift(reversalMovement);

    // Registrar en log de auditoría inmutable
    const audit: AuditLog = {
      id: `audit-rev-pay-${Date.now()}`,
      userId: params.userId,
      timestamp: new Date().toISOString(),
      entity: 'PAYMENT',
      entityId: payment.id,
      action: 'ANNUL',
      previousValue: JSON.stringify(payment),
      newValue: JSON.stringify(reversedPayment),
      reason: `[${params.userRole}] ${cleanReason}`,
    };
    this.auditLogs.unshift(audit);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return { reversedPayment, updatedLoan };
  }

  /**
   * Ítem 5: Anulación Auditada de Crédito mal desembolsado (EXCLUSIVO ADMIN y SUPERVISOR)
   * Prohibido para el rol COBRADOR / COLLECTOR.
   */
  public async cancelLoan(params: {
    loanId: string;
    reason: string;
    userRole: UserRole;
    userId: string;
    todayStr: string;
  }): Promise<Loan> {
    const isAuthorized =
      params.userRole === 'ADMIN' ||
      params.userRole === 'SUPERVISOR' ||
      params.userRole === 'SUPER_ADMIN';
    if (!isAuthorized) {
      throw new Error(
        'Acceso denegado: La anulación de créditos es exclusiva para el Administrador o Supervisor.'
      );
    }

    const cleanReason = (params.reason || '').trim();
    if (cleanReason.length < 5) {
      throw new Error(
        'Debe ingresar un motivo de auditoría válido (mínimo 5 caracteres) para anular el crédito.'
      );
    }

    const loanIdx = this.loans.findIndex((l) => l.id === params.loanId);
    if (loanIdx === -1) {
      throw new Error('El crédito especificado no existe.');
    }

    const loan = this.loans[loanIdx];
    if (loan.status === 'CANCELLED') {
      throw new Error('Este crédito ya se encuentra anulado.');
    }

    const updatedLoan: Loan = {
      ...loan,
      status: 'CANCELLED',
      notes: `${loan.notes ? loan.notes + ' | ' : ''}[ANULADO por ${params.userRole}: ${cleanReason}]`,
      updatedAt: params.todayStr,
    };
    this.loans[loanIdx] = updatedLoan;

    // Dejar las cuotas con saldo pendiente en 0 para que no sumen a cartera activa en la calle
    this.installments = this.installments.map((inst) =>
      inst.loanId === loan.id
        ? {
            ...inst,
            pendingAmount: 0,
          }
        : inst
    );

    // Revertir salida de caja por el desembolso anulado
    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const paperworkFee = isPaperworkEnabled
      ? calculatePaperworkFee(loan.principal, {
          rate: this.officeConfig.paperworkRate || 5000,
          base: 100000,
          calculationMode: 'PROPORTIONAL',
        })
      : 0;
    const netDisbursedToRestore = Math.max(0, loan.principal - paperworkFee);

    const cancelMovement: CashMovement = {
      id: `csm-can-${Date.now()}`,
      routeId: loan.routeId,
      collectorId: params.userId,
      sessionId: this.activeSession?.id,
      type: 'INCOME',
      category: 'LOAN_CANCELLATION',
      amount: netDisbursedToRestore,
      referenceId: loan.id,
      description: `Reintegro a caja por anulación de crédito ${loan.loanNumber}: ${cleanReason}`,
      createdAt: `${params.todayStr}T${new Date().toTimeString().split(' ')[0]}Z`,
    };
    this.cashMovements.unshift(cancelMovement);

    const audit: AuditLog = {
      id: `audit-can-loan-${Date.now()}`,
      userId: params.userId,
      timestamp: new Date().toISOString(),
      entity: 'LOAN',
      entityId: loan.id,
      action: 'ANNUL',
      previousValue: JSON.stringify(loan),
      newValue: JSON.stringify(updatedLoan),
      reason: `[${params.userRole}] ${cleanReason}`,
    };
    this.auditLogs.unshift(audit);

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return updatedLoan;
  }

  /**
   * Ítem 6: Reordenar cliente hacia arriba o abajo en su ruta (⬆ / ⬇)
   */
  public async reorderRouteCustomer(
    customerId: string,
    direction: 'UP' | 'DOWN',
    isCollector: boolean = false
  ): Promise<void> {
    if (isCollector && !this.officeConfig.allowRouteReorder) {
      throw new Error(
        'La política de Oficina actual no permite que el cobrador reordene la ruta. Solicite autorización al Administrador o Supervisor.'
      );
    }

    const target = this.customers.find((c) => c.id === customerId);
    if (!target) return;

    const routeCustomers = this.customers
      .filter((c) => c.routeId === target.routeId)
      .sort((a, b) => (a.orderIndex ?? 999) - (b.orderIndex ?? 999));

    const currentIdx = routeCustomers.findIndex((c) => c.id === customerId);
    if (currentIdx === -1) return;

    const swapIdx = direction === 'UP' ? currentIdx - 1 : currentIdx + 1;
    if (swapIdx < 0 || swapIdx >= routeCustomers.length) return;

    const temp = routeCustomers[currentIdx];
    routeCustomers[currentIdx] = routeCustomers[swapIdx];
    routeCustomers[swapIdx] = temp;

    const orderMap = new Map<string, number>();
    routeCustomers.forEach((c, idx) => {
      orderMap.set(c.id, idx + 1);
    });

    this.customers = this.customers.map((c) =>
      orderMap.has(c.id) ? { ...c, orderIndex: orderMap.get(c.id)! } : c
    );

    await safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers));
    this.notify();
  }

  /**
   * Ítem 6: Auto-Ordenar Ruta Inteligente por Prioridad Operativa:
   * 1) En Mora (Mayor número de días / saldo en mora primero)
   * 2) Cuota que vence Hoy
   * 3) Promesas de pago activas
   * 4) Al día / Ya visitados hoy
   */
  public async autoSortRouteByPriority(
    todayStr: string,
    routeIdFilter?: string,
    isCollector: boolean = false
  ): Promise<void> {
    if (isCollector && !this.officeConfig.allowRouteReorder) {
      throw new Error(
        'La política de Oficina actual no permite que el cobrador reordene la ruta. Solicite autorización al Administrador o Supervisor.'
      );
    }

    const targetRoutes =
      routeIdFilter && routeIdFilter !== 'ALL'
        ? [routeIdFilter]
        : Array.from(new Set(this.customers.map((c) => c.routeId)));

    const updatedOrderMap = new Map<string, number>();

    for (const rId of targetRoutes) {
      const routeCusts = this.customers.filter((c) => c.routeId === rId);
      const scored = routeCusts.map((cust) => {
        const activeLoan = this.loans.find(
          (l) => l.customerId === cust.id && l.status === 'ACTIVE'
        );
        if (!activeLoan) {
          return { cust, priorityGroup: 5, overdueAmount: 0 };
        }
        const loanInsts = this.installments.filter((i) => i.loanId === activeLoan.id);
        const delinq = calculateDelinquencyMetrics(loanInsts, todayStr);
        const paidToday = this.payments.some(
          (p) =>
            p.loanId === activeLoan.id &&
            p.status === 'COMPLETED' &&
            p.createdAt.startsWith(todayStr)
        );
        const hasTodayInst = loanInsts.some(
          (i) => i.dueDate === todayStr && i.pendingAmount > 0
        );
        const hasActivePromise = this.promises.some(
          (pr) => pr.loanId === activeLoan.id && pr.status === 'PENDIENTE'
        );

        let priorityGroup = 4;
        if (paidToday) {
          priorityGroup = 4;
        } else if (delinq.hasDelinquency) {
          priorityGroup = 1;
        } else if (hasTodayInst) {
          priorityGroup = 2;
        } else if (hasActivePromise) {
          priorityGroup = 3;
        }

        return {
          cust,
          priorityGroup,
          overdueAmount: delinq.overdueAmount,
        };
      });

      scored.sort((a, b) => {
        if (a.priorityGroup !== b.priorityGroup) {
          return a.priorityGroup - b.priorityGroup;
        }
        if (b.overdueAmount !== a.overdueAmount) {
          return b.overdueAmount - a.overdueAmount;
        }
        return (a.cust.orderIndex ?? 999) - (b.cust.orderIndex ?? 999);
      });

      scored.forEach((item, idx) => {
        updatedOrderMap.set(item.cust.id, idx + 1);
      });
    }

    this.customers = this.customers.map((c) =>
      updatedOrderMap.has(c.id) ? { ...c, orderIndex: updatedOrderMap.get(c.id)! } : c
    );

    await safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers));
    this.notify();
  }

  /**
   * Ítem 4: Exportación de Reporte Contable Estructurado en Excel (.csv con UTF-8 BOM y separador ;)
   */
  public generateAccountingReportCSV(todayStr: string, routeIdFilter?: string): string {
    const BOM = '\uFEFF';
    const sep = ';';
    const clean = (val: string | number | undefined | null): string => {
      if (val === undefined || val === null) return '';
      return String(val).replace(/;/g, ',').replace(/[\r\n]+/g, ' ').trim();
    };

    const filterByRoute = Boolean(routeIdFilter && routeIdFilter !== 'ALL');
    const metrics = this.getDailyRouteMetrics(todayStr, routeIdFilter);
    const scopedLoans = filterByRoute
      ? this.loans.filter((l) => l.routeId === routeIdFilter)
      : this.loans;
    const scopedLoanIds = new Set(scopedLoans.map((l) => l.id));
    const scopedPayments = this.payments.filter(
      (p) => !filterByRoute || scopedLoanIds.has(p.loanId)
    );
    const scopedCashMovements = filterByRoute
      ? this.cashMovements.filter((cm) => cm.routeId === routeIdFilter)
      : this.cashMovements;

    const activeLoans = scopedLoans.filter((l) => l.status === 'ACTIVE');
    const totalPrincipalPlaced = activeLoans.reduce((s, l) => s + l.principal, 0);
    const totalExpectedInterest = activeLoans.reduce((s, l) => s + l.interestAmount, 0);
    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const totalPaperworkGenerated = isPaperworkEnabled
      ? activeLoans.reduce(
          (s, l) =>
            s +
            calculatePaperworkFee(l.principal, {
              rate: this.officeConfig.paperworkRate || 5000,
              base: 100000,
              calculationMode: 'PROPORTIONAL',
            }),
          0
        )
      : 0;

    const lines: string[] = [];

    // SECCIÓN 1: RESUMEN EJECUTIVO DE RENTABILIDAD
    lines.push(`REPORTE CONTABLE ESTRUCTURADO - ${clean(this.officeConfig.companyName)}`);
    lines.push(`NIT${sep}${clean(this.officeConfig.taxId)}${sep}Fecha Operativa${sep}${todayStr}${sep}Filtro Ruta${sep}${filterByRoute ? routeIdFilter : 'TODAS LAS RUTAS'}`);
    lines.push('');
    lines.push('1. RESUMEN EJECUTIVO DE RENTABILIDAD Y CAJA');
    lines.push(['Indicador Financiero', 'Valor (COP)', 'Detalle Operativo'].join(sep));
    lines.push(['Administrativo Total de Ruta', metrics.totalAdministrativeCapital, 'Cartera Activa en Calle + Efectivo Disponible en Base'].join(sep));
    lines.push(['Cartera Activa en la Calle (Saldo Pendiente)', metrics.activeCapitalInStreet, `${activeLoans.length} creditos activos`].join(sep));
    lines.push(['Capital Principal Colocado (Activos)', totalPrincipalPlaced, 'Suma de capitales base'].join(sep));
    lines.push(['Utilidad Proyectada por Intereses (20%)', totalExpectedInterest, 'Intereses sobre creditos activos'].join(sep));
    lines.push(['Ingresos por Papeleria', totalPaperworkGenerated, 'Papeleria descontada en desembolsos'].join(sep));
    lines.push(['Pleno Recaudado Hoy (Total)', metrics.collectedToday, `Efectivo: ${metrics.collectedCashToday} | Digital: ${metrics.collectedDigitalToday}`].join(sep));
    lines.push(['Salidas / Desembolsos Hoy', metrics.disbursedToday, `${metrics.salidasCount} operaciones hoy`].join(sep));
    lines.push(['Gastos Operativos de Ruta Hoy', metrics.expensesToday, 'Gastos registrados en jornada'].join(sep));
    lines.push(['Recaudo Retirado a Oficina Hoy', metrics.recaudoRetiradoToday, 'Transferencia de base a oficina'].join(sep));
    lines.push(['Efectivo Disponible en Mano (Base Actual)', metrics.cashAvailableInHand, 'Arqueo esperado en efectivo'].join(sep));
    lines.push(['Cartera Vencida Acumulada (Mora)', metrics.overdueTotalAmount, `${metrics.overdueCustomersCount} clientes con atraso`].join(sep));
    lines.push('');

    // SECCIÓN 2: CARTERA ACTIVA Y VENCIDA POR CLIENTE
    lines.push('2. DETALLE DE CARTERA ACTIVA Y MOROSIDAD');
    lines.push(
      [
        'Ruta',
        'Orden',
        'Credito No.',
        'Cliente',
        'Cedula',
        'Telefono',
        'Capital Prestado',
        'Total Pactado',
        'Valor Cuota',
        'Saldo Pendiente',
        'Cuotas Vencidas',
        'Monto en Mora',
        'Estado Credito',
      ].join(sep)
    );

    for (const loan of scopedLoans) {
      const cust = this.customers.find((c) => c.id === loan.customerId);
      const route = this.routes.find((r) => r.id === loan.routeId);
      const loanInsts = this.installments.filter((i) => i.loanId === loan.id);
      const pendingBalance = loanInsts.reduce((s, i) => s + i.pendingAmount, 0);
      const delinq = calculateDelinquencyMetrics(loanInsts, todayStr);

      lines.push(
        [
          clean(route?.name || loan.routeId),
          cust?.orderIndex ?? 0,
          clean(loan.loanNumber),
          clean(cust?.fullName || loan.customerId),
          clean(cust?.documentNumber || ''),
          clean(cust?.phone || ''),
          loan.principal,
          loan.totalAgreed,
          loan.installmentAmount,
          pendingBalance,
          delinq.overdueInstallmentsCount,
          delinq.overdueAmount,
          clean(loan.status),
        ].join(sep)
      );
    }
    lines.push('');

    // SECCIÓN 3: HISTORIAL DE ABONOS Y REVERSOS AUDITADOS
    lines.push('3. HISTORIAL DE ABONOS Y RECAUDO');
    lines.push(
      [
        'ID Abono',
        'Fecha y Hora',
        'Credito No.',
        'Cliente',
        'Monto Recibido (COP)',
        'Medio de Pago',
        'Estado',
        'Observaciones / Auditoria',
      ].join(sep)
    );

    for (const pay of scopedPayments) {
      const loan = this.loans.find((l) => l.id === pay.loanId);
      const cust = this.customers.find((c) => c.id === pay.customerId);
      lines.push(
        [
          clean(pay.id),
          clean(pay.createdAt),
          clean(loan?.loanNumber || pay.loanId),
          clean(cust?.fullName || pay.customerId),
          pay.amountReceived,
          clean(pay.paymentMethod),
          clean(pay.status),
          clean(pay.notes || ''),
        ].join(sep)
      );
    }
    lines.push('');

    // SECCIÓN 4: FLUJO DE CAJA Y GASTOS DE RUTA
    lines.push('4. LIBRO MAYOR DE MOVIMIENTOS DE CAJA');
    lines.push(
      ['ID Movimiento', 'Fecha', 'Ruta', 'Tipo', 'Categoria', 'Monto (COP)', 'Descripcion'].join(sep)
    );
    for (const cm of scopedCashMovements) {
      const route = this.routes.find((r) => r.id === cm.routeId);
      lines.push(
        [
          clean(cm.id),
          clean(cm.createdAt),
          clean(route?.name || cm.routeId),
          clean(cm.type),
          clean(cm.category),
          cm.amount,
          clean(cm.description),
        ].join(sep)
      );
    }

    return BOM + lines.join('\r\n');
  }

  public async resetToCleanProduction(): Promise<void> {
    this.customers = [];
    this.loans = [];
    this.installments = [];
    this.payments = [];
    this.renewals = [];
    this.settlements = [];
    this.promises = [];
    this.cashMovements = [];
    this.nonPaymentVisits = [];
    this.activeSession = {
      id: `ses-${getLocalTodayStr()}`,
      routeId: 'route-norte',
      date: getLocalTodayStr(),
      collectorId: 'usr-col-1',
      status: 'OPEN',
      startTime: '07:30:00',
      expectedCollection: 0,
      collectedAmount: 0,
      expectedCustomersCount: 0,
      visitedCustomersCount: 0,
      notes: 'Operación limpia iniciada',
    };
    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
      safeStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify(this.renewals)),
      safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
      safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
      safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
    ]);
    this.notify();
  }

  /**
   * Restablecimiento integral de fábrica (Factory Reset):
   * Purga absolutamente todas las claves locales para actualizar dispositivos con versiones heredadas corruptas.
   */
  public async factoryResetAll(): Promise<void> {
    await Promise.all(Object.values(STORAGE_KEYS).map((k) => safeStorage.removeItem(k)));
    this.users = [];
    this.routes = [];
    this.customers = [];
    this.loans = [];
    this.installments = [];
    this.payments = [];
    this.renewals = [];
    this.settlements = [];
    this.promises = [];
    this.cashMovements = [];
    this.nonPaymentVisits = [];
    this.auditLogs = [];
    this.officeConfig = { ...DEFAULT_OFFICE_CONFIG, isSetupCompleted: false, companyName: '' };
    this.activeSession = null;
    this.notify();
  }
}

export const localStore = new LocalStore();
export { safeStorage };
