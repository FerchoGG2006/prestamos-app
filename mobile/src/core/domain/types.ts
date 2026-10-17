/**
 * DOMAIN TYPES - SISTEMA MÓVIL DE GESTIÓN DE CARTERA Y COBROS
 * Definición estricta de entidades de dominio financiero y operativo (Offline-First).
 */

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'COBRADOR';

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export type LoanStatus = 'ACTIVE' | 'PAID' | 'RENEWED' | 'DEFAULTED' | 'CANCELLED';

export type InstallmentStatus =
  | 'PENDIENTE'   // No vencida, saldo total pendiente
  | 'PARCIAL'     // Abonada parcialmente, conserva número y fecha
  | 'PAGADA'      // Pagada en o antes de su fecha pactada
  | 'ADELANTADA'  // Pagada con anticipación antes de su fecha de exigibilidad
  | 'VENCIDA';    // Fecha de vencimiento superada sin pago total

export type PaymentMethod = 'CASH' | 'NEQUI' | 'TRANSFER' | 'OTHER';

export type PaymentStatus = 'COMPLETED' | 'ANNULLED';

export type PromiseStatus = 'PENDIENTE' | 'CUMPLIDA' | 'INCUMPLIDA' | 'CANCELADA';

export type SessionStatus = 'OPEN' | 'CLOSED';

export type LoanFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export type InterestType = 'FLAT_INITIAL_CAPITAL' | 'AMORTIZED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  assignedRouteIds: string[];
  isActive: boolean;
  createdAt: string;
}

export interface CustomerReference {
  id: string;
  fullName: string;
  relationship: string;
  phone: string;
  address?: string;
}

export interface Customer {
  id: string;
  fullName: string;
  documentNumber: string; // Cédula de ciudadanía / extranjería
  phone: string;
  altPhone?: string;
  address: string;
  neighborhood: string;   // Barrio
  city: string;
  references: CustomerReference[];
  occupation: string;
  businessName?: string;
  notes?: string;
  status: CustomerStatus;
  routeId: string;
  assignedCollectorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Route {
  id: string;
  name: string;
  code: string;
  collectorId: string;
  isActive: boolean;
  description?: string;
  createdAt: string;
}

export interface Loan {
  id: string;
  loanNumber: string;       // Consecutivo legible ej. #00124
  customerId: string;
  routeId: string;
  collectorId: string;

  // Regla financiera: 20% configurable sobre capital inicial
  principal: number;        // Capital inicial
  interestRate: number;     // Tasa ej: 0.20 (20%)
  interestType: InterestType;
  interestAmount: number;   // Interés monetario: principal * interestRate
  totalAgreed: number;      // Capital inicial + interés
  installmentCount: number; // Número de cuotas (ej. 30)
  installmentAmount: number;// Valor de cada cuota (totalAgreed / installmentCount)
  frequency: LoanFrequency;

  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD
  status: LoanStatus;

  // Trazabilidad de renovaciones
  previousLoanId?: string;
  renewalId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface Installment {
  id: string;
  loanId: string;
  installmentNumber: number; // 1..N
  dueDate: string;           // YYYY-MM-DD
  expectedAmount: number;    // Valor esperado de la cuota
  paidAmount: number;        // Total abonado acumulado
  pendingAmount: number;     // expectedAmount - paidAmount
  status: InstallmentStatus;
  lastPaymentDate?: string;
}

export interface PaymentBreakdownItem {
  installmentId: string;
  installmentNumber: number;
  amountApplied: number;
  previousPending: number;
  newPending: number;
  resultingStatus: InstallmentStatus;
}

export interface Payment {
  id: string;
  idempotencyKey: string;    // Prevención de duplicados en modo offline
  loanId: string;
  customerId: string;
  collectorId: string;
  sessionId: string;         // Jornada en la que se cobró
  amountReceived: number;
  paymentMethod: PaymentMethod;
  installmentsBreakdown: PaymentBreakdownItem[];
  notes?: string;
  status: PaymentStatus;
  annulmentReason?: string;
  createdAt: string;
}

export interface Renewal {
  id: string;
  customerId: string;
  previousLoanId: string;
  newLoanId: string;
  collectorId: string;
  newPrincipal: number;              // Capital nuevo pactado (ej. $200.000)
  previousBalanceDeducted: number;   // Saldo pendiente del crédito anterior (ej. $60.000)
  paperworkDeducted: number;         // Papelería deducida (ej. $10.000)
  actualCashDisbursed: number;       // Dinero real entregado (ej. $130.000)
  createdAt: string;
}

export interface CollectionSession {
  id: string;
  date: string;               // YYYY-MM-DD
  routeId: string;
  collectorId: string;
  status: SessionStatus;      // ABIERTA o CERRADA
  startTime: string;
  endTime?: string;
  expectedCollection: number; // Cobro esperado total del día en la ruta
  collectedAmount: number;    // Total efectivamente recaudado
  expectedCustomersCount: number;
  visitedCustomersCount: number;
  notes?: string;
}

export interface DailySettlement {
  id: string;
  sessionId: string;
  date: string;
  routeId: string;
  collectorId: string;

  // Cobro Pleno (Recaudo puro de cuotas, sin salidas de renovación)
  plenoCollection: number;
  expectedCollection: number;
  actualCollection: number; // Alias retrocompatible con plenoCollection
  pendingCollection: number;

  // Salidas / Salientes (Préstamos Paridos y Renovaciones)
  salidasCount: number;
  salidasCapitalPlaced: number;
  salidasRefinancedBalance: number; // Cruce de cartera (los $150k que van a Salidas y NO al Pleno)
  salidasNetCashDisbursed: number;

  // Colocaciones & Renovaciones (detalle histórico)
  newLoansCount: number;
  newLoansCapitalPlaced: number;
  renewalsCount: number;
  renewalsCapitalPlaced: number;
  actualCashDisbursedTotal: number; // Desembolso neto real

  // Mora
  recoveredDelinquency: number;

  // Arqueo físico de caja
  collectedCash: number;
  collectedTransfers: number;       // Incluye NEQUI y TRANSFER
  cashHandedOver: number;           // Efectivo físicamente entregado en caja
  cashDifference: number;           // collectedCash - cashHandedOver
  differenceJustification?: string; // Obligatoria si cashDifference != 0

  status: 'SETTLED' | 'ADJUSTED';
  settledAt: string;
  auditedBy?: string;
}

export interface PaymentPromise {
  id: string;
  customerId: string;
  loanId: string;
  collectorId: string;
  promisedAmount: number;
  promisedDate: string;       // YYYY-MM-DD
  status: PromiseStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashMovement {
  id: string;
  routeId: string;
  collectorId: string;
  sessionId?: string;
  type: 'INCOME' | 'EXPENSE';
  category: 'COLLECTION' | 'LOAN_DISBURSEMENT' | 'RENEWAL_DISBURSEMENT' | 'EXPENSE' | 'ADJUSTMENT';
  amount: number;
  referenceId?: string; // loanId, paymentId, etc.
  description: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  timestamp: string;
  entity: 'CUSTOMER' | 'LOAN' | 'INSTALLMENT' | 'PAYMENT' | 'RENEWAL' | 'SETTLEMENT' | 'CONFIG' | 'SESSION';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'ANNUL' | 'CLOSE' | 'ADJUST';
  previousValue?: string; // JSON serializado
  newValue: string;       // JSON serializado
  reason?: string;
}

/**
 * Métricas agregadas en tiempo real para el Hero Balance Card y Gráficos de Ruta (Figma 7020-3430)
 */
export interface DailyRouteMetrics {
  plenoCollected: number;        // Cobro Pleno de la ruta (recaudo puro de cuotas sin salidas)
  collectedToday: number;        // Alias retrocompatible
  expectedDailyGoal: number;
  progressRatio: number;         // 0.0 .. 1.0
  progressPercentage: number;    // 0 .. 100
  activeCapitalInStreet: number; // Suma de pendingAmount en préstamos ACTIVE
  overdueTotalAmount: number;    // Mora fáctica total acumulada
  overdueCustomersCount: number; // Clientes con cuotas vencidas
  collectedCashToday: number;    // Cobrado hoy en CASH
  collectedDigitalToday: number; // Cobrado hoy en NEQUI + TRANSFER
  disbursedToday: number;        // Desembolsos de hoy (préstamos nuevos + renovaciones netas)
  cashAvailableInHand: number;   // Efectivo físico en mano del cobrador
  visitedCustomersCount: number;
  expectedCustomersCount: number;

  // Desglose de Salidas / Salientes (Préstamos Paridos & Renovaciones)
  salidasCount: number;             // Préstamos paridos + renovaciones de hoy
  salidasCapitalPlaced: number;     // Capital total saliente colocado
  salidasRefinancedBalance: number; // Saldo anterior refinanciado / cruzado (los $150k que van a Salidas y NO al Pleno)
  salidasNetCashDisbursed: number;  // Efectivo neto desembolsado en mano
}

/**
 * Paquete de sincronización Offline-First compatible con cartera.db (SQLite / Spring Boot)
 * Todos los montos se exportan además como cadenas exactas para conversión directa a BigDecimal en Java 21.
 */
export interface MobileSyncPackage {
  packageVersion: string;
  exportedAt: string;
  operatingDate: string;
  routeId: string;
  collectorId: string;
  metrics: DailyRouteMetrics;
  payments: Array<{
    id: string;
    idempotencyKey: string;
    loanId: string;
    customerId: string;
    amountReceived: string; // Representación exacta para new BigDecimal(str)
    paymentMethod: PaymentMethod;
    createdAt: string;
    notes?: string;
    allocations: Array<{
      installmentId: string;
      installmentNumber: number;
      amountApplied: string;
      resultingStatus: InstallmentStatus;
    }>;
  }>;
  promises: PaymentPromise[];
  newCustomers: Customer[];
  newLoans: Loan[];
  renewals: Renewal[];
  settlements: DailySettlement[];
  cashMovements?: CashMovement[];
  nonPaymentVisits?: NonPaymentVisit[];
}

export type NonPaymentReason =
  | 'NO_ESTABA'       // No se encontraba en el domicilio
  | 'LOCAL_CERRADO'   // Negocio / local cerrado
  | 'PASAR_TARDE'     // Pidió pasar más tarde
  | 'SIN_DINERO'      // Sin dinero hoy
  | 'OTRO';           // Otro motivo

export interface NonPaymentVisit {
  id: string;
  customerId: string;
  loanId: string;
  reason: NonPaymentReason;
  reasonLabel: string;
  notes?: string;
  date: string;       // YYYY-MM-DD
  createdAt: string;  // ISO
}
