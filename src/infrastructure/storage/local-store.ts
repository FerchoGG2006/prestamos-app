/**
 * ALMACENAMIENTO LOCAL OFFLINE-FIRST (AsyncStorage + Memoria Reactiva)
 * 
 * Permite que el cobrador en la calle opere sin conexión a Internet.
 * Todas las operaciones se persisten inmediatamente en almacenamiento local.
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
import { applyPaymentToLoan, calculateRenewalDisbursement, calculateLoanSummary, generateInstallments } from '../../core/domain/calculator';

const STORAGE_KEYS = {
  USERS: '@prestamos_users_v1',
  ROUTES: '@prestamos_routes_v1',
  CUSTOMERS: '@prestamos_customers_v1',
  LOANS: '@prestamos_loans_v1',
  INSTALLMENTS: '@prestamos_installments_v1',
  SESSION: '@prestamos_session_v1',
  PAYMENTS: '@prestamos_payments_v1',
  RENEWALS: '@prestamos_renewals_v1',
  SETTLEMENTS: '@prestamos_settlements_v1',
  PROMISES: '@prestamos_promises_v1',
  CASH_MOVEMENTS: '@prestamos_cash_v1',
  AUDIT_LOGS: '@prestamos_audit_v1',
};

class LocalStore {
  private users: User[] = [];
  private routes: Route[] = [];
  private customers: Customer[] = [];
  private loans: Loan[] = [];
  private installments: Installment[] = [];
  private activeSession: CollectionSession | null = null;
  private payments: Payment[] = [];
  private renewals: Renewal[] = [];
  private settlements: DailySettlement[] = [];
  private promises: PaymentPromise[] = [];
  private cashMovements: CashMovement[] = [];
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
        AsyncStorage.getItem(STORAGE_KEYS.USERS),
        AsyncStorage.getItem(STORAGE_KEYS.ROUTES),
        AsyncStorage.getItem(STORAGE_KEYS.CUSTOMERS),
        AsyncStorage.getItem(STORAGE_KEYS.LOANS),
        AsyncStorage.getItem(STORAGE_KEYS.INSTALLMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.SESSION),
        AsyncStorage.getItem(STORAGE_KEYS.PAYMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.RENEWALS),
        AsyncStorage.getItem(STORAGE_KEYS.SETTLEMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.PROMISES),
        AsyncStorage.getItem(STORAGE_KEYS.CASH_MOVEMENTS),
        AsyncStorage.getItem(STORAGE_KEYS.AUDIT_LOGS),
      ]);

      this.users = savedUsers ? JSON.parse(savedUsers) : INITIAL_USERS;
      this.routes = savedRoutes ? JSON.parse(savedRoutes) : INITIAL_ROUTES;
      this.customers = savedCustomers ? JSON.parse(savedCustomers) : INITIAL_CUSTOMERS;
      this.loans = savedLoans ? JSON.parse(savedLoans) : INITIAL_LOANS;
      this.installments = savedInstallments ? JSON.parse(savedInstallments) : INITIAL_INSTALLMENTS;
      this.activeSession = savedSession ? JSON.parse(savedSession) : INITIAL_SESSION;
      this.payments = savedPayments ? JSON.parse(savedPayments) : [];
      this.renewals = savedRenewals ? JSON.parse(savedRenewals) : [];
      this.settlements = savedSettlements ? JSON.parse(savedSettlements) : [];
      this.promises = savedPromises ? JSON.parse(savedPromises) : INITIAL_PROMISES;
      this.cashMovements = savedCash ? JSON.parse(savedCash) : INITIAL_CASH_MOVEMENTS;
      this.auditLogs = savedAudit ? JSON.parse(savedAudit) : [];

      this.isInitialized = true;
      this.notify();
    } catch (error) {
      console.error('Error al inicializar LocalStore:', error);
      // Fallback a memoria
      this.users = INITIAL_USERS;
      this.routes = INITIAL_ROUTES;
      this.customers = INITIAL_CUSTOMERS;
      this.loans = INITIAL_LOANS;
      this.installments = INITIAL_INSTALLMENTS;
      this.activeSession = INITIAL_SESSION;
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

  // --- MUTACIONES OPERATIVAS Y FINANCIERAS ---

  /**
   * Registrar Pago (Flujo rápido de cobro)
   */
  public async recordPayment(params: {
    loanId: string;
    amountReceived: number;
    paymentMethod: PaymentMethod;
    collectorId: string;
    todayStr: string;
    notes?: string;
  }): Promise<{ payment: Payment; updatedLoan: Loan }> {
    const loan = this.loans.find((l) => l.id === params.loanId);
    if (!loan) throw new Error('Crédito no encontrado');

    const currentInstallments = this.installments.filter((i) => i.loanId === loan.id);
    const paymentId = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const idempotencyKey = `idem-${Date.now()}-${params.loanId}-${params.amountReceived}`;

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
    this.installments = this.installments.map((i) => (updatedIds.has(i.id) ? result.updatedInstallments.find((ui) => ui.id === i.id)! : i));
    this.payments.unshift(result.payment);

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
      createdAt: new Date().toISOString(),
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
      AsyncStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      AsyncStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      AsyncStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(this.payments)),
      AsyncStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
      AsyncStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
      AsyncStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return { payment: result.payment, updatedLoan: result.updatedLoan };
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

    // Marcar crédito anterior como RENOVADO
    const updatedPrevLoan: Loan = {
      ...prevLoan,
      status: 'RENEWED',
      updatedAt: params.todayStr,
    };

    // Crear nuevo crédito
    const summary = calculateLoanSummary(
      params.newPrincipal,
      params.interestRate || prevLoan.interestRate,
      params.installmentCount || prevLoan.installmentCount
    );

    const newLoanId = `loan-${Date.now()}`;
    const newLoanNumber = `#00${Math.floor(100 + Math.random() * 900)}`;

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
      endDate: '2026-10-30', // Aproximado
      status: 'ACTIVE',
      previousLoanId: prevLoan.id,
      createdAt: params.todayStr,
      updatedAt: params.todayStr,
    };

    const newInstallments = generateInstallments(newLoan.id, summary, params.todayStr);

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

    // Registrar salida de dinero real de caja
    const cashMov: CashMovement = {
      id: `cm-${Date.now()}`,
      routeId: prevLoan.routeId,
      collectorId: params.collectorId,
      type: 'EXPENSE',
      category: 'RENEWAL_DISBURSEMENT',
      amount: renewalCalc.actualCashDisbursed,
      referenceId: renewal.id,
      description: `Desembolso neto renovación ${prevLoan.loanNumber} -> ${newLoan.loanNumber}`,
      createdAt: new Date().toISOString(),
    };

    this.loans = this.loans.map((l) => (l.id === prevLoan.id ? updatedPrevLoan : l)).concat(newLoan);
    this.installments.push(...newInstallments);
    this.renewals.unshift(renewal);
    this.cashMovements.unshift(cashMov);

    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(this.loans)),
      AsyncStorage.setItem(STORAGE_KEYS.INSTALLMENTS, JSON.stringify(this.installments)),
      AsyncStorage.setItem(STORAGE_KEYS.RENEWALS, JSON.stringify(this.renewals)),
      AsyncStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(this.cashMovements)),
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
    notes?: string;
  }): Promise<PaymentPromise> {
    const promise: PaymentPromise = {
      id: `prom-${Date.now()}`,
      customerId: params.customerId,
      loanId: params.loanId,
      collectorId: params.collectorId,
      promisedAmount: params.promisedAmount,
      promisedDate: params.promisedDate,
      status: 'PENDIENTE',
      notes: params.notes,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };

    this.promises.unshift(promise);
    await AsyncStorage.setItem(STORAGE_KEYS.PROMISES, JSON.stringify(this.promises));
    this.notify();
    return promise;
  }

  /**
   * Cerrar Jornada y Liquidar Ruta con Arqueo de Caja
   */
  public async closeDailySettlement(params: {
    cashHandedOver: number;
    differenceJustification?: string;
    auditedBy?: string;
  }): Promise<DailySettlement> {
    if (!this.activeSession) throw new Error('No hay jornada activa para cerrar');

    const session = this.activeSession;
    const sessionPayments = this.payments.filter((p) => p.sessionId === session.id);
    const collectedCash = sessionPayments
      .filter((p) => p.paymentMethod === 'CASH')
      .reduce((sum, p) => sum + p.amountReceived, 0);
    const collectedTransfers = sessionPayments
      .filter((p) => p.paymentMethod === 'TRANSFER')
      .reduce((sum, p) => sum + p.amountReceived, 0);

    const actualCollection = collectedCash + collectedTransfers;
    const pendingCollection = Math.max(0, session.expectedCollection - actualCollection);

    const cashDifference = collectedCash - params.cashHandedOver;
    if (cashDifference !== 0 && !params.differenceJustification) {
      throw new Error('Es obligatoria una justificación cuando existe diferencia en el arqueo de caja');
    }

    const settlement: DailySettlement = {
      id: `set-${Date.now()}`,
      sessionId: session.id,
      date: session.date,
      routeId: session.routeId,
      collectorId: session.collectorId,
      expectedCollection: session.expectedCollection,
      actualCollection,
      pendingCollection,
      newLoansCount: 0,
      newLoansCapitalPlaced: 0,
      renewalsCount: this.renewals.length,
      renewalsCapitalPlaced: this.renewals.reduce((sum, r) => sum + r.newPrincipal, 0),
      actualCashDisbursedTotal: this.renewals.reduce((sum, r) => sum + r.actualCashDisbursed, 0),
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

    // Auditoría inmutable de cierre
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
      AsyncStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(this.activeSession)),
      AsyncStorage.setItem(STORAGE_KEYS.SETTLEMENTS, JSON.stringify(this.settlements)),
      AsyncStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(this.auditLogs)),
    ]);

    this.notify();
    return settlement;
  }
}

export const localStore = new LocalStore();
