/**
 * DOMAIN TYPES - SISTEMA DE GESTIÓN DE CARTERA Y COBROS
 * Definición estricta de entidades de dominio financiero y operativo.
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

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'OTHER';

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
  
  // Cobro
  expectedCollection: number;
  actualCollection: number;
  pendingCollection: number;
  
  // Colocaciones & Renovaciones
  newLoansCount: number;
  newLoansCapitalPlaced: number;
  renewalsCount: number;
  renewalsCapitalPlaced: number;
  actualCashDisbursedTotal: number; // Desembolso neto real
  
  // Mora
  recoveredDelinquency: number;
  
  // Arqueo físico de caja
  collectedCash: number;
  collectedTransfers: number;
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
