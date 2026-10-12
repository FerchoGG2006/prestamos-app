/**
 * DATOS INICIALES REALISTAS (SEMILLA) PARA OPERACIÓN EN VIVO
 * Simula una operación real de cobro diario en Colombia.
 */

import {
  User,
  Route,
  Customer,
  Loan,
  Installment,
  CollectionSession,
  PaymentPromise,
  CashMovement,
} from '../../core/domain/types';
import { calculateLoanSummary, generateInstallments } from '../../core/domain/calculator';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr-col-1',
    name: 'Carlos Cobrador',
    email: 'carlos@cobros.com',
    role: 'COBRADOR',
    phone: '3001234567',
    assignedRouteIds: ['route-norte'],
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'usr-adm-1',
    name: 'Ana Administradora',
    email: 'ana@cobros.com',
    role: 'ADMIN',
    phone: '3109876543',
    assignedRouteIds: ['route-norte', 'route-centro'],
    isActive: true,
    createdAt: '2026-09-01',
  },
];

export const INITIAL_ROUTES: Route[] = [
  {
    id: 'route-norte',
    name: 'Ruta Norte',
    code: 'RN-01',
    collectorId: 'usr-col-1',
    description: 'Sectores: El Prado, Bellavista, Boston',
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'route-centro',
    name: 'Ruta Centro',
    code: 'RC-02',
    collectorId: 'usr-col-1',
    description: 'Sectores: Centro, San Roque, Chiquinquirá',
    isActive: true,
    createdAt: '2026-09-01',
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    fullName: 'Juan Pérez',
    documentNumber: '1045234890',
    phone: '3012345678',
    address: 'Calle 54 # 43 - 21',
    neighborhood: 'Boston',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Panadería El Sol',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    status: 'ACTIVE',
    references: [
      { id: 'ref-1', fullName: 'Marta Pérez', relationship: 'Hermana', phone: '3019876543' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-2',
    fullName: 'Carlos Díaz',
    documentNumber: '1047890123',
    phone: '3023456789',
    address: 'Cra 38 # 28 - 15',
    neighborhood: 'San Roque',
    city: 'Barranquilla',
    occupation: 'Mecánico',
    businessName: 'Taller San Roque',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    status: 'ACTIVE',
    references: [
      { id: 'ref-2', fullName: 'Pedro Díaz', relationship: 'Padre', phone: '3123456789' },
    ],
    createdAt: '2026-08-15',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-3',
    fullName: 'María López',
    documentNumber: '1043210987',
    phone: '3009876543',
    address: 'Calle 68 # 52 - 10',
    neighborhood: 'El Prado',
    city: 'Barranquilla',
    occupation: 'Independiente',
    businessName: 'Miscelánea María',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    status: 'ACTIVE',
    references: [
      { id: 'ref-3', fullName: 'Lucía López', relationship: 'Prima', phone: '3001122334' },
    ],
    createdAt: '2026-09-05',
    updatedAt: '2026-09-05',
  },
  {
    id: 'cust-4',
    fullName: 'Pedro Gómez',
    documentNumber: '1049988776',
    phone: '3156789012',
    address: 'Calle 70 # 60 - 30',
    neighborhood: 'Bellavista',
    city: 'Barranquilla',
    occupation: 'Restaurantero',
    businessName: 'Comidas Rápidas Don Pedro',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    status: 'ACTIVE',
    references: [
      { id: 'ref-4', fullName: 'Carmen Gómez', relationship: 'Esposa', phone: '3159988776' },
    ],
    createdAt: '2026-08-20',
    updatedAt: '2026-09-10',
  },
  {
    id: 'cust-5',
    fullName: 'Luisa Martínez',
    documentNumber: '1041122334',
    phone: '3201234567',
    address: 'Cra 44 # 35 - 12',
    neighborhood: 'Centro',
    city: 'Barranquilla',
    occupation: 'Estilista',
    businessName: 'Peluquería Estilo',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    status: 'ACTIVE',
    references: [
      { id: 'ref-5', fullName: 'Jorge Martínez', relationship: 'Hermano', phone: '3207654321' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
];

// Helper para crear créditos iniciales
function buildInitialLoansAndInstallments(): { loans: Loan[]; installments: Installment[] } {
  const loans: Loan[] = [];
  const installments: Installment[] = [];

  // Crédito 1: Juan Pérez ($150.000 -> $180.000, 30 cuotas de $6.000, al día)
  const sum1 = calculateLoanSummary(150000, 0.20, 30);
  const loan1: Loan = {
    id: 'loan-001',
    loanNumber: '#00101',
    customerId: 'cust-1',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: sum1.principal,
    interestRate: sum1.interestRate,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: sum1.interestAmount,
    totalAgreed: sum1.totalAgreed,
    installmentCount: sum1.installmentCount,
    installmentAmount: sum1.installmentAmount,
    frequency: 'DAILY',
    startDate: '2026-09-01',
    endDate: '2026-10-06',
    status: 'ACTIVE',
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  };
  loans.push(loan1);
  const insts1 = generateInstallments(loan1.id, sum1, loan1.startDate);
  // Marcar primeras 15 cuotas como pagadas, la 16 es hoy
  insts1.forEach((inst, idx) => {
    if (idx < 15) {
      inst.paidAmount = inst.expectedAmount;
      inst.pendingAmount = 0;
      inst.status = 'PAGADA';
    } else if (idx === 15) {
      inst.status = 'PENDIENTE'; // Cobro de hoy
    }
  });
  installments.push(...insts1);

  // Crédito 2: Carlos Díaz ($200.000 -> $240.000, 30 cuotas de $8.000, 2 cuotas en mora)
  const sum2 = calculateLoanSummary(200000, 0.20, 30);
  const loan2: Loan = {
    id: 'loan-002',
    loanNumber: '#00102',
    customerId: 'cust-2',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: sum2.principal,
    interestRate: sum2.interestRate,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: sum2.interestAmount,
    totalAgreed: sum2.totalAgreed,
    installmentCount: sum2.installmentCount,
    installmentAmount: sum2.installmentAmount,
    frequency: 'DAILY',
    startDate: '2026-08-25',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-25',
    updatedAt: '2026-09-01',
  };
  loans.push(loan2);
  const insts2 = generateInstallments(loan2.id, sum2, loan2.startDate);
  // Marcar cuotas: 1 a 18 pagadas, 19 y 20 vencidas (mora), 21 hoy
  insts2.forEach((inst, idx) => {
    if (idx < 18) {
      inst.paidAmount = inst.expectedAmount;
      inst.pendingAmount = 0;
      inst.status = 'PAGADA';
    } else if (idx === 18 || idx === 19) {
      inst.status = 'VENCIDA'; // 2 cuotas en mora
    } else if (idx === 20) {
      inst.status = 'PENDIENTE'; // Hoy
    }
  });
  installments.push(...insts2);

  // Crédito 3: María López ($100.000 -> $120.000, 20 cuotas de $6.000, al día)
  const sum3 = calculateLoanSummary(100000, 0.20, 20);
  const loan3: Loan = {
    id: 'loan-003',
    loanNumber: '#00103',
    customerId: 'cust-3',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: sum3.principal,
    interestRate: sum3.interestRate,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: sum3.interestAmount,
    totalAgreed: sum3.totalAgreed,
    installmentCount: sum3.installmentCount,
    installmentAmount: sum3.installmentAmount,
    frequency: 'DAILY',
    startDate: '2026-09-08',
    endDate: '2026-10-01',
    status: 'ACTIVE',
    createdAt: '2026-09-08',
    updatedAt: '2026-09-08',
  };
  loans.push(loan3);
  const insts3 = generateInstallments(loan3.id, sum3, loan3.startDate);
  insts3.forEach((inst, idx) => {
    if (idx < 8) {
      inst.paidAmount = inst.expectedAmount;
      inst.pendingAmount = 0;
      inst.status = 'PAGADA';
    } else if (idx === 8) {
      inst.status = 'PENDIENTE'; // Hoy
    }
  });
  installments.push(...insts3);

  // Crédito 4: Pedro Gómez ($150.000 -> $180.000, restan $60.000 por pagar - candidato a renovación)
  const sum4 = calculateLoanSummary(150000, 0.20, 30);
  const loan4: Loan = {
    id: 'loan-004',
    loanNumber: '#00104',
    customerId: 'cust-4',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: sum4.principal,
    interestRate: sum4.interestRate,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: sum4.interestAmount,
    totalAgreed: sum4.totalAgreed,
    installmentCount: sum4.installmentCount,
    installmentAmount: sum4.installmentAmount,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-25',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-10',
  };
  loans.push(loan4);
  const insts4 = generateInstallments(loan4.id, sum4, loan4.startDate);
  // Pagadas 20 de 30 cuotas ($120.000 pagados, restan $60.000)
  insts4.forEach((inst, idx) => {
    if (idx < 20) {
      inst.paidAmount = inst.expectedAmount;
      inst.pendingAmount = 0;
      inst.status = 'PAGADA';
    } else if (idx === 20) {
      inst.status = 'PENDIENTE';
    }
  });
  installments.push(...insts4);

  return { loans, installments };
}

export const { loans: INITIAL_LOANS, installments: INITIAL_INSTALLMENTS } = buildInitialLoansAndInstallments();

export const INITIAL_SESSION: CollectionSession = {
  id: 'session-2026-09-19-norte',
  date: '2026-09-19',
  routeId: 'route-norte',
  collectorId: 'usr-col-1',
  status: 'OPEN',
  startTime: '07:30:00',
  expectedCollection: 46000, // Suma de cuotas exigibles hoy (incluye atrasadas)
  collectedAmount: 0,
  expectedCustomersCount: 5,
  visitedCustomersCount: 0,
  notes: 'Jornada iniciada con normalidad.',
};

export const INITIAL_PROMISES: PaymentPromise[] = [
  {
    id: 'prom-001',
    customerId: 'cust-5',
    loanId: 'loan-001',
    collectorId: 'usr-col-1',
    promisedAmount: 15000,
    promisedDate: '2026-09-19',
    status: 'PENDIENTE',
    notes: 'Promete pagar en la tarde después de las 4 PM',
    createdAt: '2026-09-18',
    updatedAt: '2026-09-18',
  },
];

export const INITIAL_CASH_MOVEMENTS: CashMovement[] = [
  {
    id: 'cm-001',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    sessionId: 'session-2026-09-19-norte',
    type: 'INCOME',
    category: 'ADJUSTMENT',
    amount: 50000,
    description: 'Base de caja inicial entregada para cambio/vueltos',
    createdAt: '2026-09-19 07:30:00',
  },
];
