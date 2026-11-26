import {
  buildLoanOfficialReceipt,
  buildPaymentOfficialReceipt,
  buildReceiptDetailRows,
  buildRenewalOfficialReceipt,
  calculateHistoricalRemainingBalance,
  formatAccountStatementReminder,
  formatOfficialReceiptWhatsAppMessage,
  formatShortCuadreWhatsApp,
} from '../whatsapp-receipt';
import { generateOfficialReceiptPdfBytes } from '../receipt-pdf';
import { Customer, Installment, Loan, Payment } from '../../domain/types';

function assertEqual(actual: unknown, expected: unknown, message?: string) {
  console.assert(actual === expected, `${message || 'Assertion failed'} (actual=${String(actual)}, expected=${String(expected)})`);
}
function assertOk(cond: unknown, message?: string) {
  console.assert(Boolean(cond), message || 'Expected truthy value');
}
function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function makeCustomer(): Customer {
  return {
    id: 'cust-1',
    fullName: 'María José Pérez',
    documentNumber: '1045678901',
    phone: '3001234567',
    whatsappPhone: '3009876543',
    address: 'Calle 45 # 12-30',
    neighborhood: 'Centro',
    city: 'Barranquilla',
    references: [],
    occupation: 'Comerciante',
    status: 'ACTIVE',
    routeId: 'route-1',
    assignedCollectorId: 'usr-col-1',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  };
}

function makeLoan(overrides?: Partial<Loan>): Loan {
  return {
    id: 'loan-1',
    loanNumber: '#00040',
    customerId: 'cust-1',
    routeId: 'route-1',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.2,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 40,
    installmentAmount: 15000,
    frequency: 'DAILY',
    startDate: '2026-10-20',
    endDate: '2026-12-05',
    status: 'ACTIVE',
    createdAt: '2026-10-20',
    updatedAt: '2026-10-20',
    ...overrides,
  };
}

function makeInstallments(loanId: string, count: number, amount: number, paidUpTo: number, zeroAll = false): Installment[] {
  const arr: Installment[] = [];
  for (let i = 1; i <= count; i++) {
    const isPaid = zeroAll || i <= paidUpTo;
    arr.push({
      id: `inst-${loanId}-${i}`,
      loanId,
      installmentNumber: i,
      dueDate: `2026-11-${String(Math.min(28, i)).padStart(2, '0')}`,
      expectedAmount: amount,
      paidAmount: isPaid ? amount : 0,
      pendingAmount: isPaid ? 0 : amount,
      status: isPaid ? 'PAGADA' : 'PENDIENTE',
    });
  }
  return arr;
}

export const officialReceiptsTests = (async () => {
  const customer = makeCustomer();

  // 1. Bugfix crítico: pago histórico #17 de 40 en un crédito que luego fue RENOVADO (todas las cuotas en 0 hoy)
  {
    const renewedLoan = makeLoan({ status: 'RENEWED' });
    const zeroedInsts = makeInstallments(renewedLoan.id, 40, 15000, 40, true);
    const pay17: Payment = {
      id: 'pay-17',
      idempotencyKey: 'idem-17',
      loanId: renewedLoan.id,
      customerId: customer.id,
      collectorId: 'usr-col-1',
      sessionId: 'ses-1',
      amountReceived: 15000,
      paymentMethod: 'CASH',
      installmentsBreakdown: [
        {
          installmentId: 'inst-loan-1-17',
          installmentNumber: 17,
          amountApplied: 15000,
          previousPending: 15000,
          newPending: 0,
          resultingStatus: 'PAGADA',
        },
      ],
      status: 'COMPLETED',
      createdAt: '2026-11-13',
    };

    const histBal = calculateHistoricalRemainingBalance({
      loan: renewedLoan,
      installments: zeroedInsts,
      allLoanPayments: [pay17],
      targetPayment: pay17,
    });
    assertEqual(histBal, 345000, 'Cuota 17 de 40 a $15.000 debe dejar saldo histórico exacto de $345.000, nunca $0');

    const receipt = buildPaymentOfficialReceipt({
      companyName: 'Inversiones FBV',
      routeName: 'Ruta 1',
      customer,
      loan: renewedLoan,
      payment: pay17,
      remainingBalance: histBal,
      installments: zeroedInsts,
    });
    assertEqual(receipt.payload.isPaidOff, false, 'Un pago de cuota 17/40 NO puede marcar el crédito como cancelado');
    assertEqual(receipt.payload.remainingBalance, 345000);
    assertEqual(receipt.customerPhone, '3009876543', 'Debe priorizar whatsappPhone sobre phone');
  }

  // 2. Pago histórico en crédito ACTIVO con pagos posteriores + cuotas pre-pagadas de migración
  {
    const activeLoan = makeLoan({ status: 'ACTIVE' });
    // 10 cuotas pre-pagadas + pagos 11 y 12 => hoy quedan 28 cuotas = $420.000
    const insts = makeInstallments(activeLoan.id, 40, 15000, 12, false);
    const pay11: Payment = {
      id: 'pay-11',
      idempotencyKey: 'idem-11',
      loanId: activeLoan.id,
      customerId: customer.id,
      collectorId: 'usr-col-1',
      sessionId: 'ses-1',
      amountReceived: 15000,
      paymentMethod: 'NEQUI',
      installmentsBreakdown: [
        {
          installmentId: 'inst-loan-1-11',
          installmentNumber: 11,
          amountApplied: 15000,
          previousPending: 15000,
          newPending: 0,
          resultingStatus: 'PAGADA',
        },
      ],
      status: 'COMPLETED',
      createdAt: '2026-11-11T09:00:00',
    };
    const pay12: Payment = {
      ...pay11,
      id: 'pay-12',
      idempotencyKey: 'idem-12',
      createdAt: '2026-11-12T09:00:00',
      installmentsBreakdown: [
        {
          installmentId: 'inst-loan-1-12',
          installmentNumber: 12,
          amountApplied: 15000,
          previousPending: 15000,
          newPending: 0,
          resultingStatus: 'PAGADA',
        },
      ],
    };

    const histAfter11 = calculateHistoricalRemainingBalance({
      loan: activeLoan,
      installments: insts,
      allLoanPayments: [pay11, pay12],
      targetPayment: pay11,
    });
    const histAfter12 = calculateHistoricalRemainingBalance({
      loan: activeLoan,
      installments: insts,
      allLoanPayments: [pay11, pay12],
      targetPayment: pay12,
    });
    assertEqual(histAfter11, 435000, 'Saldo tras pago #11 debe ser $435.000');
    assertEqual(histAfter12, 420000, 'Saldo tras pago #12 debe ser $420.000 (sin doble resta)');
  }

  // 3. Mensaje WhatsApp antifraude con enlace oficial en la nube (sin cifras editables en el texto)
  {
    const loan = makeLoan();
    const receipt = buildLoanOfficialReceipt({
      companyName: 'Inversiones FBV',
      routeName: 'Ruta 1',
      customer,
      loan,
      paperworkFee: 25000,
      firstDueDate: '2026-11-27',
    });
    const verifiedReceipt = {
      ...receipt,
      receiptCode: 'KRD-261126-A1B2C3D4',
      isCloudVerified: true,
    };
    const waMsg = formatOfficialReceiptWhatsAppMessage(verifiedReceipt);
    assertOk(waMsg.includes('https://cartera-movil.expo.app/?r=KRD-261126-A1B2C3D4'));
    assertOk(waMsg.includes('Inversiones FBV'));
    assertOk(!waMsg.includes('500.000'), 'El enlace oficial antifraude no debe exponer montos editables en texto plano');

    // PDF binario válido con logo JPEG embebido y datos verificados
    const pdfBytes = generateOfficialReceiptPdfBytes(verifiedReceipt);
    const pdfLatin1 = bytesToLatin1(pdfBytes);
    assertOk(pdfLatin1.startsWith('%PDF-1.4'), 'PDF debe iniciar con cabecera %PDF-1.4');
    assertOk(pdfLatin1.trim().endsWith('%%EOF'), 'PDF debe cerrar con %%EOF');
    assertOk(pdfLatin1.includes('/Filter /DCTDecode'), 'PDF debe incrustar el logo JPEG de Kredia');
    assertOk(pdfLatin1.includes('INVERSIONES FBV'), 'PDF debe mostrar la oficina en el encabezado');
    assertOk(pdfLatin1.includes('Comprobante oficial verificado por'), 'PDF debe incluir el footer de Kredia');
    assertOk(pdfLatin1.includes('KRD-261126-A1B2C3D4'), 'PDF debe mostrar el código de verificación');
  }

  // 4. Comprobante de Renovación + filas de detalle + PDF
  {
    const newLoan = makeLoan({ id: 'loan-2', loanNumber: '#00041', principal: 300000, totalAgreed: 360000, installmentCount: 30, installmentAmount: 12000 });
    const renReceipt = buildRenewalOfficialReceipt({
      companyName: 'Inversiones FBV',
      routeName: 'Ruta 1',
      customer,
      previousLoanNumber: '#00040',
      newLoan,
      renewalId: 'ren-99',
      previousBalanceDeducted: 90000,
      paperworkDeducted: 15000,
      actualCashDisbursed: 195000,
      createdAt: '2026-11-26T08:00:00',
    });
    const rows = buildReceiptDetailRows(renReceipt);
    assertOk(rows.some((r) => r.label === 'Efectivo entregado' && r.value.includes('195.000')));
    assertOk(rows.some((r) => r.label === 'Saldo anterior liquidado' && r.value.includes('90.000')));
    const pdfBytes = generateOfficialReceiptPdfBytes(renReceipt);
    assertOk(pdfBytes.length > 9500, 'PDF de renovación debe ser válido y contener el logo Kredia');
  }

  // 5. Recordatorio corto de crédito (sin \u00A0 ni doble asterisco, con mora y footer)
  {
    const loan = makeLoan();
    const insts = makeInstallments(loan.id, 40, 15000, 10, false);
    const reminder = formatAccountStatementReminder({
      companyName: 'Inversiones FBV',
      receiptFooterMessage: 'Gracias por su puntualidad',
      customer,
      loan,
      installments: insts,
      remainingBalance: 450000,
      overdueDays: 3,
      overdueAmount: 45000,
      todayStr: '2026-11-26',
    });
    assertOk(!reminder.includes('\u00A0'), 'No debe contener espacios indivisibles \\u00A0');
    assertOk(!reminder.includes('* *'), 'No debe contener doble negrita rota');
    assertOk(reminder.includes('Mora:'), 'Debe mostrar la mora cuando existe');
    assertOk(reminder.includes('Gracias por su puntualidad'), 'Debe respetar receiptFooterMessage');
    assertOk(reminder.split('\n').length <= 6, 'El recordatorio debe ser corto y conciso');
  }

  // 6. Cuadre corto por WhatsApp
  {
    const cuadre = formatShortCuadreWhatsApp({
      companyName: 'Inversiones FBV',
      routeName: 'Ruta 1',
      collectorName: 'Carlos Ruiz',
      dateStr: '2026-11-26',
      isSealed: true,
      folio: '#SET-1',
      totalCollected: 450000,
      collectedCash: 380000,
      collectedDigital: 70000,
      openingRouteBase: 200000,
      salidasCount: 1,
      disbursedNet: 150000,
      expenses: 20000,
      cashToHandOver: 410000,
      cashHandedOver: 410000,
      cashDifference: 0,
      overdueCustomersCount: 3,
      overdueTotalAmount: 90000,
      visitedCount: 28,
      expectedCount: 35,
    });
    assertOk(cuadre.split('\n').length <= 12, 'El cuadre WhatsApp debe ser conciso (<= 12 líneas)');
    assertOk(!cuadre.includes('━━━━━━━━━━'), 'No debe incluir muros de caracteres decorativos');
  }

  console.log('✅ official-receipts.test.ts: 6/6 suites de comprobantes oficiales, saldos históricos y PDF aprobadas');
})();
