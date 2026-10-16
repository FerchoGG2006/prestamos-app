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
} from '../../core/domain/calculator';

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
  AUDIT_LOGS: '@prestamos_mobile_audit_v1',
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
  private auditLogs: AuditLog[] = [];

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
        savedAudit,
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
        safeStorage.getItem(STORAGE_KEYS.AUDIT_LOGS),
      ]);

      if (savedUsers) this.users = JSON.parse(savedUsers);
      if (savedRoutes) this.routes = JSON.parse(savedRoutes);
      if (savedCustomers) this.customers = JSON.parse(savedCustomers);
      if (savedLoans) this.loans = JSON.parse(savedLoans);
      if (savedInstallments) this.installments = JSON.parse(savedInstallments);
      if (savedSession) this.activeSession = JSON.parse(savedSession);
      if (savedPayments) this.payments = JSON.parse(savedPayments);
      if (savedRenewals) this.renewals = JSON.parse(savedRenewals);
      if (savedSettlements) this.settlements = JSON.parse(savedSettlements);
      if (savedPromises) this.promises = JSON.parse(savedPromises);
      if (savedCash) this.cashMovements = JSON.parse(savedCash);
      if (savedAudit) this.auditLogs = JSON.parse(savedAudit);

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
      this.isInitialized = true;
      this.notify();
    }
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

  /**
   * Calcula las métricas en tiempo real para el Hero Balance Card, Quick Pills y Gráficos (Figma 7020-3430)
   */
  public getDailyRouteMetrics(todayStr: string): DailyRouteMetrics {
    const activeLoans = this.loans.filter((l) => l.status === 'ACTIVE');
    const activeLoanIds = new Set(activeLoans.map((l) => l.id));

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
      }
    });

    const sessionId = this.activeSession?.id;
    const todayPayments = this.payments.filter(
      (p) =>
        p.status === 'COMPLETED' &&
        (p.sessionId === sessionId || p.createdAt.startsWith(todayStr))
    );

    const collectedCashToday = todayPayments
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + p.amountReceived, 0);

    const collectedDigitalToday = todayPayments
      .filter((p) => p.paymentMethod === 'NEQUI' || p.paymentMethod === 'TRANSFER' || p.paymentMethod === 'OTHER')
      .reduce((sum, p) => sum + p.amountReceived, 0);

    const collectedToday = collectedCashToday + collectedDigitalToday;

    const expectedDailyGoal = Math.max(
      this.activeSession?.expectedCollection || 0,
      expectedTodayFromInstallments + overdueTotalAmount,
      1
    );

    const progressRatio = Math.min(1, Math.max(0, collectedToday / expectedDailyGoal));
    const progressPercentage = Math.round(progressRatio * 100);

    // Desembolsos de hoy (préstamos nuevos + renovaciones netas)
    const disbursedToday = this.cashMovements
      .filter(
        (cm) =>
          cm.type === 'EXPENSE' &&
          (cm.category === 'LOAN_DISBURSEMENT' || cm.category === 'RENEWAL_DISBURSEMENT') &&
          cm.createdAt.startsWith(todayStr)
      )
      .reduce((sum, cm) => sum + cm.amount, 0);

    // Base inicial de caja + efectivo cobrado - desembolsos en efectivo
    const initialCashBase = this.cashMovements
      .filter((cm) => cm.type === 'INCOME' && cm.category === 'ADJUSTMENT')
      .reduce((sum, cm) => sum + cm.amount, 0);

    const cashAvailableInHand = initialCashBase + collectedCashToday - disbursedToday;

    const visitedCustomerIds = new Set(todayPayments.map((p) => p.customerId));

    return {
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
      cashAvailableInHand,
      visitedCustomersCount: visitedCustomerIds.size,
      expectedCustomersCount: activeLoans.length,
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

    const currentInstallments = this.installments.filter((i) => i.loanId === loan.id);
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

    const customerId = `cust-${Date.now()}`;
    const newCustomer: Customer = {
      id: customerId,
      fullName: params.fullName.trim(),
      documentNumber: params.documentNumber.trim(),
      phone: params.phone.trim() || '3000000000',
      address: params.address.trim() || 'Dirección pendiente',
      neighborhood: params.neighborhood.trim() || 'Centro',
      city: params.city?.trim() || 'Barranquilla',
      occupation: params.occupation?.trim() || 'Comerciante',
      businessName: params.businessName?.trim() || undefined,
      routeId: params.routeId || 'route-norte',
      assignedCollectorId: params.collectorId || 'usr-col-1',
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
   * Crear Nuevo Préstamo desde la Ruta Móvil (Quick Action Pill: + Nuevo Préstamo)
   */
  public async createLoan(params: {
    customerId: string;
    principal: number;
    interestRate?: number;
    installmentCount?: number;
    frequency?: LoanFrequency;
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

    const summary = calculateLoanSummary(
      params.principal,
      params.interestRate ?? 0.20,
      params.installmentCount ?? 30
    );
    const paperworkFee = calculatePaperworkFee(params.principal);
    const netDisbursed = Math.max(0, summary.principal - paperworkFee);

    const loanId = `loan-${Date.now()}`;
    const loanNumber = `#00${101 + this.loans.length}`;
    const collectorId = params.collectorId || customer.assignedCollectorId || 'usr-col-1';
    const routeId = params.routeId || customer.routeId || 'route-norte';

    const generatedInstallments = generateInstallments(loanId, summary, params.todayStr);
    const endDate =
      generatedInstallments.length > 0
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

    const renewalCalc = calculateRenewalDisbursement(
      params.newPrincipal,
      previousBalanceDeducted,
      params.paperworkFee
    );

    const updatedPrevLoan: Loan = {
      ...prevLoan,
      status: 'RENEWED',
      updatedAt: params.todayStr,
    };

    const summary = calculateLoanSummary(
      params.newPrincipal,
      params.interestRate || prevLoan.interestRate,
      params.installmentCount || prevLoan.installmentCount
    );

    const newLoanId = `loan-${Date.now()}`;
    const newLoanNumber = `#00${101 + this.loans.length}`;
    const newInstallments = generateInstallments(newLoanId, summary, params.todayStr);
    const endDate =
      newInstallments.length > 0
        ? newInstallments[newInstallments.length - 1].dueDate
        : '2026-10-30';

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
      frequency: prevLoan.frequency,
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
    const dateStamp = params.todayStr || new Date().toISOString().split('T')[0];
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
   * Cerrar Jornada y Liquidar Ruta con Arqueo de Caja (Efectivo vs Digital Nequi/Transferencia)
   */
  public async closeDailySettlement(params: {
    cashHandedOver: number;
    differenceJustification?: string;
    auditedBy?: string;
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

    const cashDifference = collectedCash - params.cashHandedOver;
    if (cashDifference !== 0 && !params.differenceJustification) {
      throw new Error('Es obligatoria una justificación cuando existe diferencia en el arqueo de caja');
    }

    const todayNewLoans = this.loans.filter(
      (l) => l.createdAt === session.date && !l.previousLoanId
    );

    const settlement: DailySettlement = {
      id: `set-${Date.now()}`,
      sessionId: session.id,
      date: session.date,
      routeId: session.routeId,
      collectorId: session.collectorId,
      expectedCollection: session.expectedCollection,
      actualCollection,
      pendingCollection,
      newLoansCount: todayNewLoans.length,
      newLoansCapitalPlaced: todayNewLoans.reduce((sum, l) => sum + l.principal, 0),
      renewalsCount: this.renewals.length,
      renewalsCapitalPlaced: this.renewals.reduce((sum, r) => sum + r.newPrincipal, 0),
      actualCashDisbursedTotal:
        this.renewals.reduce((sum, r) => sum + r.actualCashDisbursed, 0) +
        todayNewLoans.reduce((sum, l) => sum + (l.principal - calculatePaperworkFee(l.principal)), 0),
      recoveredDelinquency: 0,
      collectedCash,
      collectedTransfers,
      cashHandedOver: params.cashHandedOver,
      cashDifference,
      differenceJustification: params.differenceJustification,
      status: 'SETTLED',
      settledAt: new Date().toISOString(),
      auditedBy: params.auditedBy,
    };

    // Marcar sesión cerrada
    this.activeSession = {
      ...session,
      status: 'CLOSED',
      endTime: new Date().toLocaleTimeString('es-CO', { hour12: false }),
    };

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
      safeStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
      safeStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
      safeStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return settlement;
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
      payments: this.payments.map((p) => ({
        id: p.id,
        idempotencyKey: p.idempotencyKey,
        loanId: p.loanId,
        customerId: p.customerId,
        amountReceived: Math.round(p.amountReceived).toString(),
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
        notes: p.notes,
        allocations: p.installmentsBreakdown.map((b) => ({
          installmentId: b.installmentId,
          installmentNumber: b.installmentNumber,
          amountApplied: Math.round(b.amountApplied).toString(),
          resultingStatus: b.resultingStatus,
        })),
      })),
      promises: this.promises,
      newCustomers: this.customers,
      newLoans: this.loans,
      renewals: this.renewals,
      settlements: this.settlements,
    };
  }

  /**
   * Importa un paquete JSON de Ruta (proveniente de cartera.db o respaldo móvil) y lo persiste en AsyncStorage
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

    if (Array.isArray(parsed.newCustomers) && parsed.newCustomers.length > 0) {
      this.customers = parsed.newCustomers;
    } else if (Array.isArray(parsed.customers) && parsed.customers.length > 0) {
      this.customers = parsed.customers;
    }

    if (Array.isArray(parsed.newLoans) && parsed.newLoans.length > 0) {
      this.loans = parsed.newLoans;
    } else if (Array.isArray(parsed.loans) && parsed.loans.length > 0) {
      this.loans = parsed.loans;
    }

    if (Array.isArray(parsed.installments) && parsed.installments.length > 0) {
      this.installments = parsed.installments;
    }

    if (Array.isArray(parsed.promises)) {
      this.promises = parsed.promises;
    }

    await Promise.all([
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(this.customers)),
      safeStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      safeStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      safeStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises)),
    ]);

    this.notify();
    return {
      importedCustomers: this.customers.length,
      importedLoans: this.loans.length,
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
}

export const localStore = new LocalStore();
export { safeStorage };
