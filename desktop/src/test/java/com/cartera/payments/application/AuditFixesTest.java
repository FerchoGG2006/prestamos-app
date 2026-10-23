package com.cartera.payments.application;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.history.application.CreditHistoryService;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CancelLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.reports.application.ExcelReportExporter;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.sync.application.MobileSyncProcessorService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipFile;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
class AuditFixesTest {

    @Autowired
    private CreateCustomerUseCase createCustomerUseCase;

    @Autowired
    private CreateLoanUseCase createLoanUseCase;

    @Autowired
    private CancelLoanUseCase cancelLoanUseCase;

    @Autowired
    private RecordPaymentUseCase recordPaymentUseCase;

    @Autowired
    private ReversePaymentUseCase reversePaymentUseCase;

    @Autowired
    private RenewLoanUseCase renewLoanUseCase;

    @Autowired
    private TodayCollectionsService todayCollectionsService;

    @Autowired
    private CreditHistoryService creditHistoryService;

    @Autowired
    private SettlementUseCase settlementUseCase;

    @Autowired
    private ExcelReportExporter excelReportExporter;

    @Autowired
    private MobileSyncProcessorService mobileSyncProcessorService;

    @Autowired
    private LoanRepository loanRepository;

    @Autowired
    private InstallmentRepository installmentRepository;

    @Autowired
    private CashMovementRepository cashMovementRepository;

    @Autowired
    private AuditLogRepository auditLogRepository;

    @Test
    void testPaperworkDeductedOnDisbursementAndRenewalWithPartialInstallment() {
        String doc = "99" + UUID.randomUUID().toString().replaceAll("[^0-9]", "").substring(0, 6);
        CustomerEntity customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Auditoria",
                doc,
                "3001112233",
                null,
                "Calle 10 #20-30",
                "Centro",
                "Barranquilla",
                "Comerciante",
                "Tienda",
                null,
                "route-norte",
                "usr-col-1",
                "usr-admin-1"
        ));

        // 1. Crear préstamo de $300.000 con interés 20% ($360.000 total) y papelería $15.000
        LocalDate futureStart = LocalDate.now().plusDays(5);
        LoanEntity loan = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(),
                "route-norte",
                "usr-col-1",
                new BigDecimal("300000"),
                new BigDecimal("0.20"),
                new BigDecimal("360000"),
                24,
                "DIARIO",
                futureStart,
                "usr-admin-1",
                new BigDecimal("15000")
        ));

        // Verificar que el desembolso en caja sea el neto ($285.000 = $300.000 - $15.000)
        var loanDisbursement = cashMovementRepository.findAll().stream()
                .filter(m -> loan.getId().equals(m.getReferenceId()) && "DESEMBOLSO".equals(m.getCategory()))
                .findFirst()
                .orElseThrow();
        assertEquals(0, new BigDecimal("285000").compareTo(loanDisbursement.getAmount()));

        // Verificar que las cuotas futuras se marquen como PRÓXIMA CUOTA en TodayCollectionsService
        var todayItems = todayCollectionsService.getTodayCollectionItems(LocalDate.now());
        var itemForLoan = todayItems.stream().filter(i -> loan.getId().equals(i.loanId())).findFirst().orElseThrow();
        assertTrue(itemForLoan.statusText().contains("PRÓXIMA CUOTA"));

        // 2. Hacer un abono parcial de $5.000 (cuota es $15.000 -> queda PARCIAL con $10.000 pendiente)
        String key = "idem-" + UUID.randomUUID();
        var payRes1 = recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                loan.getId(),
                new BigDecimal("5000"),
                "EFECTIVO",
                "usr-col-1",
                LocalDate.now(),
                key
        ));
        assertFalse(payRes1.alreadyExisted());

        // Replay idempotente debe indicar alreadyExisted = true
        var payRes2 = recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                loan.getId(),
                new BigDecimal("5000"),
                "EFECTIVO",
                "usr-col-1",
                LocalDate.now(),
                key
        ));
        assertTrue(payRes2.alreadyExisted());

        // 3. Renovar el crédito por $500.000 con papelería de $25.000
        // Saldo pendiente debe ser $360.000 - $5.000 = $355.000 (incluyendo la cuota PARCIAL)
        var renewalRes = renewLoanUseCase.execute(new RenewLoanUseCase.RenewLoanCommand(
                loan.getId(),
                new BigDecimal("500000"),
                new BigDecimal("0.20"),
                new BigDecimal("600000"),
                24,
                "DIARIO",
                LocalDate.now().plusDays(1),
                new BigDecimal("25000"),
                "usr-admin-1"
        ));

        assertEquals(0, new BigDecimal("355000").compareTo(renewalRes.previousBalanceDeducted()));
        assertEquals(0, new BigDecimal("120000").compareTo(renewalRes.cashDisbursed()));

        // El préstamo anterior debe quedar en estado RENOVADO y todas sus cuotas PAGADA
        LoanEntity oldLoan = loanRepository.findById(loan.getId()).orElseThrow();
        assertEquals("RENOVADO", oldLoan.getStatus());
        List<InstallmentEntity> oldInsts = installmentRepository.findByLoanId(loan.getId());
        assertTrue(oldInsts.stream().allMatch(i -> "PAGADA".equals(i.getStatus()) && i.getPendingAmount().compareTo(BigDecimal.ZERO) == 0));

        // Historial crediticio debe reconocer el préstamo RENOVADO como completado
        var historyOpt = creditHistoryService.getReportByDocument(doc);
        assertTrue(historyOpt.isPresent());
        assertEquals(1, historyOpt.get().completedLoansCount());
        assertEquals(1, historyOpt.get().activeLoansCount());
    }

    @Test
    void testSettlementRequiresJustificationOnDifferenceAndBlocksClosedSessionExpenses() {
        LocalDate testDate = LocalDate.now().minusDays(45);
        var summary = settlementUseCase.getOrCreateDaySummary("usr-col-1", testDate);

        // Registrar un gasto de ruta de $10.000
        settlementUseCase.registerRouteExpense(
                "usr-col-1",
                "route-1",
                SettlementUseCase.CAT_GASTO_GASOLINA,
                new BigDecimal("10000"),
                "Gasolina prueba",
                "usr-col-1"
        );

        var updatedSummary = settlementUseCase.getOrCreateDaySummary("usr-col-1", testDate);
        BigDecimal expected = updatedSummary.netExpectedCash();

        // Intentar cerrar con descuadre sin justificación debe fallar
        assertThrows(IllegalArgumentException.class, () -> settlementUseCase.closeSettlement(
                updatedSummary.sessionId(),
                expected.subtract(new BigDecimal("5000")),
                BigDecimal.ZERO,
                null,
                "   ",
                "usr-admin-1"
        ));

        // Cerrar con justificación válida debe funcionar
        settlementUseCase.closeSettlement(
                updatedSummary.sessionId(),
                expected.subtract(new BigDecimal("5000")),
                new BigDecimal("5000"),
                "Almuerzo cobrador",
                "Faltante descontado por nómina",
                "usr-admin-1"
        );

        // Intentar cerrar de nuevo debe fallar
        assertThrows(IllegalStateException.class, () -> settlementUseCase.closeSettlement(
                updatedSummary.sessionId(),
                expected,
                BigDecimal.ZERO,
                null,
                "Reintento",
                "usr-admin-1"
        ));
    }

    @Test
    void testReversePaymentAndCancelLoanStrictRbacAndAccountingReversal() {
        try {
            String doc = "88" + UUID.randomUUID().toString().replaceAll("[^0-9]", "").substring(0, 6);
            CustomerEntity customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                    "Cliente Reverso",
                    doc,
                    "3009998877",
                    null,
                    "Carrera 45 #70-12",
                    "Prado",
                    "Barranquilla",
                    "Independiente",
                    "Miscelánea",
                    null,
                    "route-norte",
                    "usr-col-1",
                    "usr-admin-1"
            ));

            LoanEntity loan = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                    customer.getId(),
                    "route-norte",
                    "usr-col-1",
                    new BigDecimal("200000"),
                    new BigDecimal("0.20"),
                    new BigDecimal("240000"),
                    24,
                    "DIARIO",
                    LocalDate.now(),
                    "usr-admin-1",
                    new BigDecimal("10000")
            ));

            var payRes = recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                    loan.getId(),
                    new BigDecimal("10000"),
                    "EFECTIVO",
                    "usr-col-1",
                    LocalDate.now(),
                    "idem-rev-" + UUID.randomUUID()
            ));

            // 1. Si el usuario es COBRADOR, debe lanzar SecurityException al intentar reversar pago o anular crédito
            UserSessionContext.setSession(new UserSession("usr-col-1", "ruta1", "Carlos Cobrador", "COBRADOR"));
            assertFalse(UserSessionContext.canCurrentUserReverseOrCancel());

            assertThrows(SecurityException.class, () ->
                    reversePaymentUseCase.execute(payRes.paymentId(), "Intento no autorizado cobrador")
            );
            assertThrows(SecurityException.class, () ->
                    cancelLoanUseCase.execute(loan.getId(), "Intento no autorizado cobrador")
            );

            // 2. Si el usuario es ADMIN, puede reversar el pago y luego anular el crédito
            UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Administrador General", "ADMIN"));
            assertTrue(UserSessionContext.canCurrentUserReverseOrCancel());

            var revResult = reversePaymentUseCase.execute(payRes.paymentId(), "Pago aplicado al cliente equivocado");
            assertEquals(0, new BigDecimal("10000").compareTo(revResult.reversedAmount()));
            assertEquals(0, new BigDecimal("240000").compareTo(revResult.updatedLoanBalance()));

            // Verificar movimiento compensatorio EGRESO ANULACION_PAGO
            assertTrue(cashMovementRepository.findAll().stream()
                    .anyMatch(m -> payRes.paymentId().equals(m.getReferenceId())
                            && "EGRESO".equals(m.getType())
                            && "ANULACION_PAGO".equals(m.getCategory())));

            // Verificar registro en auditoría ANULAR_PAGO
            assertTrue(auditLogRepository.findAll().stream()
                    .anyMatch(a -> payRes.paymentId().equals(a.getEntityId())
                            && "ANULAR_PAGO".equals(a.getAction())));

            // 3. Ahora que los pagos están anulados, SUPERVISOR puede anular el crédito
            UserSessionContext.setSession(new UserSession("usr-sup-1", "supervisor", "Supervisor General", "SUPERVISOR"));
            assertTrue(UserSessionContext.canCurrentUserReverseOrCancel());

            LoanEntity voidedLoan = cancelLoanUseCase.execute(loan.getId(), "Crédito digitado con monto erróneo");
            assertEquals("ANULADO", voidedLoan.getStatus());

            assertTrue(cashMovementRepository.findAll().stream()
                    .anyMatch(m -> loan.getId().equals(m.getReferenceId())
                            && "INGRESO".equals(m.getType())
                            && "ANULACION_CREDITO".equals(m.getCategory())));
        } finally {
            UserSessionContext.clear();
        }
    }

    @Test
    void testExcelReportExporterAndMobileSyncProcessor() throws Exception {
        // 1. Verificar exportación de libro Excel (.xlsx) con 5 hojas contables
        Path tempXlsx = Files.createTempFile("reporte_contable_test_", ".xlsx");
        try {
            excelReportExporter.exportAccountingWorkbook(tempXlsx);
            assertTrue(Files.exists(tempXlsx));
            assertTrue(Files.size(tempXlsx) > 1000);

            try (ZipFile zip = new ZipFile(tempXlsx.toFile())) {
                assertNotNull(zip.getEntry("xl/workbook.xml"));
                assertNotNull(zip.getEntry("xl/worksheets/sheet1.xml"));
                assertNotNull(zip.getEntry("xl/worksheets/sheet2.xml"));
                assertNotNull(zip.getEntry("xl/worksheets/sheet3.xml"));
                assertNotNull(zip.getEntry("xl/worksheets/sheet4.xml"));
                assertNotNull(zip.getEntry("xl/worksheets/sheet5.xml"));
            }
        } finally {
            Files.deleteIfExists(tempXlsx);
        }

        // 2. Verificar exportación e importación de paquete JSON de sincronización móvil
        String exportedJson = mobileSyncProcessorService.exportRoutePackage("route-norte", LocalDate.now());
        assertNotNull(exportedJson);
        assertTrue(exportedJson.contains("\"routeId\""));
        assertTrue(exportedJson.contains("\"customers\""));
        assertTrue(exportedJson.contains("\"loans\""));

        var importRes = mobileSyncProcessorService.importPackage(exportedJson);
        assertNotNull(importRes);
        assertEquals("route-norte", importRes.routeId());
    }

    @Test
    void testMigratePreexistingLoanWithCartulina() {
        CustomerEntity customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Carlos Migracion",
                "99887766",
                "3009988776",
                null,
                "Calle 10 # 20-30",
                "El Prado",
                "Barranquilla",
                "Comerciante",
                "Tienda",
                null,
                "route-norte",
                "usr-col-1",
                "usr-admin-1"
        ));

        long initialCashMovements = cashMovementRepository.count();

        // 24 cuotas de $50.000 (total $1.200.000, capital $1.000.000).
        // El cliente ya pagó 14 cuotas en papel antes del software: {1..14}
        java.util.Set<Integer> paidOnPaper = new java.util.HashSet<>();
        for (int i = 1; i <= 14; i++) {
            paidOnPaper.add(i);
        }

        CreateLoanUseCase.CreateLoanCommand cmd = new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(),
                "route-norte",
                "usr-col-1",
                new BigDecimal("1000000"),
                new BigDecimal("0.20"),
                new BigDecimal("1200000"),
                24,
                "DIARIO",
                LocalDate.now().minusDays(18),
                "usr-admin-1",
                BigDecimal.ZERO,
                true, // isMigration
                paidOnPaper,
                "C:/cartulinas/foto_carlos.jpg",
                "Migración inicial de cartulina física"
        );

        LoanEntity loan = createLoanUseCase.execute(cmd);
        assertNotNull(loan);
        assertEquals("ACTIVO", loan.getStatus());
        assertEquals("MIGRACION", loan.getOperationType());

        // Verificar que las cuotas 1..14 están PAGADA y 15..24 PENDIENTE
        List<InstallmentEntity> insts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
        assertEquals(24, insts.size());

        long paidCount = insts.stream().filter(i -> "PAGADA".equals(i.getStatus())).count();
        assertEquals(14, paidCount);

        long pendingCount = insts.stream().filter(i -> "PENDIENTE".equals(i.getStatus())).count();
        assertEquals(10, pendingCount);

        // Verificar que cada cuota pagada tiene paidAmount == amount
        insts.stream()
                .filter(i -> i.getInstallmentNumber() <= 14)
                .forEach(i -> {
                    assertEquals("PAGADA", i.getStatus());
                    assertEquals(0, i.getAmount().compareTo(i.getPaidAmount()));
                });

        // Verificar que cada cuota pendiente tiene paidAmount == 0
        insts.stream()
                .filter(i -> i.getInstallmentNumber() > 14)
                .forEach(i -> {
                    assertEquals("PENDIENTE", i.getStatus());
                    assertEquals(0, BigDecimal.ZERO.compareTo(i.getPaidAmount()));
                });

        // REGLA CRÍTICA: NO debe haberse registrado ningún egreso en la caja de hoy
        long finalCashMovements = cashMovementRepository.count();
        assertEquals(initialCashMovements, finalCashMovements, "La migración de saldo inicial no debe generar movimientos en la caja de hoy");
    }
}
