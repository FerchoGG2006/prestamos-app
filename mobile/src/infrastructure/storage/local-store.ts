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

export const DEFAULT_OFFICE_CONFIG: OfficeCompanyConfig = {
  companyName: 'Inversiones & Cobranzas La Excelencia',
  taxId: '901.458.789-1',
  city: 'Barranquilla',
  address: 'Calle 72 # 48-25, Of. 302',
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
  routeInitialCashBase: 200000,
  allowRouteNewLoans: true,
  allowCollectorExpenses: true,
  allowRouteReorder: false,
  allowPartialPayments: true,
  officeServerUrl: 'http://192.168.1.10:8765',
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
  private customers: Customer[] = [...INITIAL_CUSTOMERS];
  private loans: Loan[] = [...INITIAL_LOANS];
  private installments: Installment[] = [...INITIAL_INSTALLMENTS];
  private activeSession: CollectionSession | null = { ...INITIAL_SESSION };
  private payments: Payment[] = [];
  private renewals: Renewal[] = [];
  private settlements: DailySettlement[] = [];
  private promises: PaymentPromise[] = [...INITIAL_PROMISES];
  private cashMovements: CashMovement[] = [...INITIAL_CASH_MOVEMENTS];
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

      if (needInitialSeed) {
        // Inicialización limpia para operación real en producción (sin datos demo)
        this.customers = [];
        this.loans = [];
        this.installments = [];
        this.cashMovements = [];
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
          notes: 'Inicio de operación limpia',
        };
        this.promises = [];
        this.payments = [];
        this.renewals = [];
        this.settlements = [];
        await Promise.all([
          safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
          safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
          safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
          safeStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
          safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
          safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
          safeStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
        ]);
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
        if (savedOfficeConfig) this.officeConfig = JSON.parse(savedOfficeConfig);
      }

      this.alignScenarioDatesIfNeeded();
      this.isInitialized = true;
      this.notify();
    } catch (error) {
      console.error('Error al inicializar LocalStore:', error);
      this.users = [...INITIAL_USERS];
      this.routes = [...INITIAL_ROUTES];
      this.customers = [...INITIAL_CUSTOMERS];
      this.loans = [...INITIAL_LOANS];
      this.installments = [...INITIAL_INSTALLMENTS];
      this.activeSession = { ...INITIAL_SESSION };
      this.promises = [...INITIAL_PROMISES];
      this.cashMovements = [...INITIAL_CASH_MOVEMENTS];
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
  public getActiveSession(): CollectionSession | null { return this.activeSession; }
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

    const expectedDailyGoal = Math.max(
      filterByRoute ? 0 : (this.activeSession?.expectedCollection || 0),
      expectedTodayFromInstallments + overdueTotalAmount,
      1
    );

    const progressRatio = Math.min(1, Math.max(0, collectedToday / expectedDailyGoal));
    const progressPercentage = Math.round(progressRatio * 100);

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

    // Desglose de Salidas / Salientes (Préstamos Paridos & Renovaciones)
    const todayNewLoans = scopedLoans.filter(
      (l) => l.createdAt.startsWith(todayStr) && !l.previousLoanId && l.status !== 'CANCELLED'
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

    // Base inicial de caja + efectivo cobrado - desembolsos en efectivo - gastos operativos de ruta - recaudo retirado
    const initialCashBase = scopedCashMovements
      .filter((cm) => cm.type === 'INCOME' && cm.category === 'ADJUSTMENT')
      .reduce((sum, cm) => sum + cm.amount, 0);

    const cashAvailableInHand = Math.max(
      0,
      initialCashBase + collectedCashToday - disbursedToday - expensesToday - recaudoRetiradoToday
    );

    // Administrativo de la Ruta (Audio 3: "El administrativo es toda la plata que tiene la ruta...")
    // Valor total activo = Cartera activa prestada en calle + Base en efectivo disponible
    const totalAdministrativeCapital = activeCapitalInStreet + cashAvailableInHand;

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
      cashAvailableInHand,
      totalAdministrativeCapital,
      visitedCustomersCount: visitedCustomerIds.size,
      expectedCustomersCount: activeLoans.length,

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
    force: boolean = false
  ): Promise<{ success: boolean; message: string }> {
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

    const isFixedDate = params.frequency === 'FIXED_DATE';
    const effectiveInstallmentCount = isFixedDate ? 1 : (params.installmentCount ?? 30);

    const summary = calculateLoanSummary(
      params.principal,
      params.interestRate ?? 0.20,
      effectiveInstallmentCount
    );
    const isPaperworkEnabled = this.officeConfig.paperworkFeeEnabled ?? true;
    const paperworkFee = isPaperworkEnabled
      ? calculatePaperworkFee(params.principal, {
          rate: this.officeConfig.paperworkRate || 5000,
          base: 100000,
          calculationMode: 'PROPORTIONAL',
        })
      : 0;
    const netDisbursed = Math.max(0, summary.principal - paperworkFee);

    const loanId = `loan-${Date.now()}`;
    const loanNumber = `#00${101 + this.loans.length}`;
    const collectorId = params.collectorId || customer.assignedCollectorId || 'usr-col-1';
    const routeId = params.routeId || customer.routeId || 'route-norte';

    const generatedInstallments = generateInstallments(
      loanId,
      summary,
      params.todayStr,
      params.frequency || 'DAILY',
      undefined,
      params.fixedDueDate
    );
    const endDate =
      isFixedDate && params.fixedDueDate
        ? params.fixedDueDate
        : generatedInstallments.length > 0
        ? generatedInstallments[generatedInstallments.length - 1].dueDate
        : params.todayStr;

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
      startDate: params.todayStr,
      endDate,
      status: 'ACTIVE',
      createdAt: params.todayStr,
      updatedAt: params.todayStr,
    };

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

    const audit: AuditLog = {
      id: `audit-${Date.now()}`,
      userId: collectorId,
      timestamp: new Date().toISOString(),
      entity: 'LOAN',
      entityId: newLoan.id,
      action: 'CREATE',
      newValue: JSON.stringify(newLoan),
    };

    this.loans.unshift(newLoan);
    this.installments.push(...generatedInstallments);
    this.cashMovements.unshift(cashMov);
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
    const metrics = this.getDailyRouteMetrics(dateStamp);

    if (params.amount > metrics.cashAvailableInHand) {
      throw new Error(
        `Base insuficiente. La base actual disponible es $${metrics.cashAvailableInHand.toLocaleString(
          'es-CO'
        )}. No se pueden retirar $${params.amount.toLocaleString('es-CO')}.`
      );
    }

    const session = this.activeSession;
    const movement: CashMovement = {
      id: `csm-rec-${Date.now()}`,
      routeId: params.routeId || session?.routeId || 'route-1',
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
   * Cerrar Jornada y Liquidar Ruta con Arqueo de Caja (Efectivo vs Digital Nequi/Transferencia)
   */
  public async closeDailySettlement(params: {
    cashHandedOver: number;
    differenceJustification?: string;
    auditedBy?: string;
    payrollDeductionAmount?: number;
    payrollDeductionReason?: string;
  }): Promise<DailySettlement> {
    if (!this.activeSession) throw new Error('No hay jornada activa para cerrar');

    const session = this.activeSession;
    const sessionPayments = this.payments.filter(
      (p) => p.sessionId === session.id && p.status === 'COMPLETED'
    );
    const collectedCash = sessionPayments
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + p.amountReceived, 0);
    const collectedTransfers = sessionPayments
      .filter((p) => p.paymentMethod === 'NEQUI' || p.paymentMethod === 'TRANSFER' || p.paymentMethod === 'OTHER')
      .reduce((sum, p) => sum + p.amountReceived, 0);
    const actualCollection = collectedCash + collectedTransfers;
    const pendingCollection = Math.max(0, session.expectedCollection - actualCollection);

    // Gastos operativos de la ruta que se descuentan del efectivo que la ruta rinde a la caja
    const sessionExpenses = this.cashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          cm.category === 'EXPENSE' &&
          cm.createdAt.startsWith(session.date)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    // Desembolsos en efectivo de hoy (préstamos nuevos + renovaciones netas)
    const disbursedToday = this.cashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          (cm.category === 'LOAN_DISBURSEMENT' || cm.category === 'RENEWAL_DISBURSEMENT') &&
          cm.createdAt.startsWith(session.date)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    // Avances / retiros de recaudo entregados a oficina durante el día
    const recaudoRetiradoToday = this.cashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          cm.category === 'RECAUDO_OFICINA' &&
          cm.createdAt.startsWith(session.date)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    const netCashExpected = Math.max(
      0,
      collectedCash - sessionExpenses - disbursedToday - recaudoRetiradoToday
    );
    const cashDifference = netCashExpected - params.cashHandedOver;
    if (cashDifference !== 0 && !params.differenceJustification) {
      throw new Error('Es obligatoria una justificación cuando existe diferencia en el arqueo de caja');
    }

    const todayNewLoans = this.loans.filter(
      (l) => l.createdAt.startsWith(session.date) && !l.previousLoanId
    );
    const todayRenewals = this.renewals.filter((r) => r.createdAt.startsWith(session.date));

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
        routeId: session.routeId,
        collectorId: session.collectorId,
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
      routeId: session.routeId,
      collectorId: session.collectorId,
      plenoCollection: actualCollection,
      expectedCollection: session.expectedCollection,
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
      userId: session.collectorId,
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
  }): Promise<CashMovement> {
    const routeId = this.activeSession?.routeId || 'route-norte';
    const collectorId = this.activeSession?.collectorId || 'usr-col-1';

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
   * Importa un paquete JSON de Ruta (proveniente de cartera.db o respaldo móvil) y lo persiste en AsyncStorage
   * haciendo merge inteligente por ID para nunca destruir registros existentes.
   */
  public async importMobileSyncPackage(rawJson: string): Promise<{
    importedCustomers: number;
    importedLoans: number;
  }> {
    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error('El texto JSON no tiene un formato válido.');
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
}

export const localStore = new LocalStore();
export { safeStorage };
