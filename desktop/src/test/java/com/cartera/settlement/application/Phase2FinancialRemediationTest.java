package com.cartera.settlement.application;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.history.application.CreditHistoryService;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CancelLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.reports.application.ExcelReportExporter;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipFile;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class Phase2FinancialRemediationTest {

    @Autowired private TodayCollectionsService collectionsService;
    @Autowired private CreateCustomerUseCase createCustomerUseCase;
    @Autowired private CreateLoanUseCase createLoanUseCase;
    @Autowired private CancelLoanUseCase cancelLoanUseCase;
    @Autowired private RenewLoanUseCase renewLoanUseCase;
    @Autowired private RecordPaymentUseCase recordPaymentUseCase;
    @Autowired private CashMovementUseCase cashMovementUseCase;
    @Autowired private SettlementUseCase settlementUseCase;
    @Autowired private ExcelReportExporter excelReportExporter;
    @Autowired private CreditHistoryService creditHistoryService;

    @Autowired private AppUserRepository userRepository;
    @Autowired private RouteRepository routeRepository;
    @Autowired private InstallmentRepository installmentRepository;
    @Autowired private CashMovementRepository cashMovementRepository;
    @Autowired private CollectionSessionRepository sessionRepository;

    @TempDir Path tempDir;

    private String routeA;
    private String routeB;
    private String colA;
    private String colB;

    private static BigDecimal bd(String s) { return new BigDecimal(s); }
    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, bd(expected).compareTo(actual), "Esperado " + expected + " pero fue " + actual);
    }

    @BeforeEach
    void setup() {
        UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Admin", "ADMIN"));
        String now = LocalDateTime.now().toString();
        colA = "usr-col-p2a-" + UUID.randomUUID().toString().substring(0, 6);
        colB = "usr-col-p2b-" + UUID.randomUUID().toString().substring(0, 6);
        routeA = "rt-p2a-" + UUID.randomUUID().toString().substring(0, 6);
        routeB = "rt-p2b-" + UUID.randomUUID().toString().substring(0, 6);
        userRepository.saveAndFlush(new AppUserEntity(colA, colA, "x", "Cobrador A", 1, now));
        userRepository.saveAndFlush(new AppUserEntity(colB, colB, "x", "Cobrador B", 1, now));
        routeRepository.saveAndFlush(new RouteEntity(routeA, "Ruta P2 A", colA, 1, now));
        routeRepository.saveAndFlush(new RouteEntity(routeB, "Ruta P2 B", colB, 1, now));
    }

    @AfterEach
    void tearDown() {
        UserSessionContext.clear();
    }

    @Test
    void spec008Caso1AAnd1C_NewLoanPaperworkNeverInflatesAdministrativeAndWithdrawalWorks() {
        // Base inicial $380.000
        cashMovementUseCase.register(new CashMovementUseCase.CashMovementCommand(
                UUID.randomUUID().toString(), routeA, "INGRESO", "BASE_INICIAL", bd("380000"), "Base inicial 1A", "BASE"));

        var cust = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Caso 1A", "DOC1A-" + UUID.randomUUID().toString().substring(0, 6), "3001112233",
                null, "Calle 1", "Centro", "Sincelejo", null, null, null, routeA, colA, "usr-admin-1"));

        // Préstamo $300.000 al 20% ($360.000), papelería $15.000 -> neto entregado $285.000
        createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                cust.getId(), routeA, colA, bd("300000"), bd("0.20"), bd("360000"), 30, "DIARIO",
                LocalDate.now(), "usr-admin-1", bd("15000")));

        var mBefore = collectionsService.getDailyMetricsForRoute(LocalDate.now(), routeA);
        assertMoney("360000", mBefore.totalActiveDebt());
        assertMoney("80000", mBefore.cashBalance()); // Efectivo base operativo
        assertMoney("15000", mBefore.paperworkBalance()); // Papelería disponible
        assertMoney("95000", mBefore.totalPhysicalCashInBox()); // Efectivo físico total en caja
        assertMoney("440000", mBefore.totalAdministrativeCapital()); // 360k + 80k = 440k (NUNCA 455k!)

        // Retirar más papelería que la disponible debe fallar
        assertThrows(IllegalArgumentException.class, () -> cashMovementUseCase.withdrawPaperwork(
                UUID.randomUUID().toString(), routeA, bd("20000"), "Exceso"));

        // Caso 1C: Retirar $15.000 de papelería -> papelería = $0, caja física baja $95k -> $80k, Administrativo sigue $440k
        cashMovementUseCase.withdrawPaperwork(UUID.randomUUID().toString(), routeA, bd("15000"), "Retiro dueño");

        var mAfter = collectionsService.getDailyMetricsForRoute(LocalDate.now(), routeA);
        assertMoney("0", mAfter.paperworkBalance());
        assertMoney("80000", mAfter.cashBalance());
        assertMoney("80000", mAfter.totalPhysicalCashInBox());
        assertMoney("440000", mAfter.totalAdministrativeCapital());
    }

    @Test
    void integerInstallmentsAllowPaymentAndRenewalWithoutFractionErrorsAndSupportFechaFija() {
        cashMovementUseCase.register(new CashMovementUseCase.CashMovementCommand(
                UUID.randomUUID().toString(), routeA, "INGRESO", "BASE_INICIAL", bd("500000"), "Base", "BASE"));

        var cust = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente 28 Cuotas", "DOC28-" + UUID.randomUUID().toString().substring(0, 6), "3002223344",
                null, "Calle 2", "Centro", "Sincelejo", null, null, null, routeA, colA, "usr-admin-1"));

        // $360.000 / 28 cuotas solía generar $12.857,14 y bloquear cobro y renovación
        var loan = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                cust.getId(), routeA, colA, bd("300000"), bd("0.20"), bd("360000"), 28, "DIARIO",
                LocalDate.now(), "usr-admin-1", BigDecimal.ZERO));

        List<InstallmentEntity> insts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
        assertEquals(28, insts.size());
        for (InstallmentEntity i : insts) {
            assertEquals(0, i.getAmount().stripTrailingZeros().scale() <= 0 ? 0 : 1,
                    "Cada cuota debe ser en pesos enteros: " + i.getAmount());
        }
        BigDecimal totalSchedule = insts.stream().map(InstallmentEntity::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertMoney("360000", totalSchedule);

        // Cobrar exactamente la cuota #1 (en pesos enteros) funciona sin error
        var payRes = recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                loan.getId(), insts.get(0).getAmount(), "EFECTIVO", colA, LocalDate.now(), UUID.randomUUID().toString()));
        assertNotNull(payRes.paymentId());

        // Renovar hacia modalidad FECHA FIJA funciona sin error de fracciones ni rechazo de modalidad
        var renewCmd = new RenewLoanUseCase.RenewLoanCommand(
                loan.getId(), bd("500000"), bd("0.20"), bd("600000"), 1, "FECHA FIJA",
                LocalDate.now().plusMonths(1), BigDecimal.ZERO, "usr-admin-1");
        var preview = renewLoanUseCase.preview(renewCmd);
        var renewed = renewLoanUseCase.execute(renewCmd.withPreview(preview));
        assertNotNull(renewed.newLoanId());
    }

    @Test
    void routeTransferPreservesConsolidatedCashAndRejectsDecimals() {
        cashMovementUseCase.register(new CashMovementUseCase.CashMovementCommand(
                UUID.randomUUID().toString(), routeA, "INGRESO", "BASE_INICIAL", bd("200000"), "Base A", "BASE"));

        // Decimales rechazados
        assertThrows(IllegalArgumentException.class, () -> cashMovementUseCase.register(
                new CashMovementUseCase.CashMovementCommand(
                        UUID.randomUUID().toString(), routeA, "EGRESO", "OTRO", bd("50.50"), "Decimal inválido", "EGRESO")));

        String transferId = UUID.randomUUID().toString();
        cashMovementUseCase.transferBetweenRoutes(transferId, routeA, routeB, bd("75000"), "Apoyo ruta B");
        // Replay idempotente no duplica
        cashMovementUseCase.transferBetweenRoutes(transferId, routeA, routeB, bd("75000"), "Apoyo ruta B");

        assertMoney("125000", cashMovementUseCase.availableBalance(routeA));
        assertMoney("75000", cashMovementUseCase.availableBalance(routeB));
    }

    @Test
    void closedSettlementKeepsPersistedValuesAndExpenseRespectsPastDateAndIdempotency() {
        LocalDate pastDay = LocalDate.now().minusDays(20);
        // Vista previa solo lectura NO crea collection_session
        long sessionsBefore = sessionRepository.count();
        var preview = settlementUseCase.previewDaySummary(colA, pastDay, bd("50000"));
        assertNull(preview.sessionId());
        assertEquals(sessionsBefore, sessionRepository.count());

        // Gasto de ruta en fecha pasada con idempotencia
        String expId = UUID.randomUUID().toString();
        settlementUseCase.registerRouteExpense(colA, routeA, SettlementUseCase.CAT_GASTO_GASOLINA,
                bd("10000"), "Gasolina fecha pasada", "usr-admin-1", pastDay, expId);
        settlementUseCase.registerRouteExpense(colA, routeA, SettlementUseCase.CAT_GASTO_GASOLINA,
                bd("10000"), "Gasolina fecha pasada", "usr-admin-1", pastDay, expId);

        var summary = settlementUseCase.getOrCreateDaySummary(colA, pastDay, bd("50000"));
        assertMoney("10000", summary.routeExpenses());
        assertMoney("40000", summary.netExpectedCash());

        // Retiro a oficina mayor al efectivo entregado debe rechazarse
        assertThrows(IllegalArgumentException.class, () -> settlementUseCase.closeSettlement(
                summary.sessionId(), bd("40000"), bd("50000"), bd("999999"), BigDecimal.ZERO, null, null, "usr-admin-1"));

        // Cerrar con base manual $50.000 -> neto esperado $40.000, entregado $40.000, diff $0
        settlementUseCase.closeSettlement(
                summary.sessionId(), bd("40000"), bd("50000"), BigDecimal.ZERO, BigDecimal.ZERO, null, null, "usr-admin-1");

        // Al recargar con autoOpeningBase=$0, el cierre inmutable DEBE conservar expected=$40.000 (NO mostrar sobrante falso!)
        var reloaded = settlementUseCase.previewDaySummary(colA, pastDay, BigDecimal.ZERO);
        assertTrue(reloaded.isClosed());
        assertMoney("40000", reloaded.netExpectedCash());
        assertMoney("0", reloaded.settlement().getCashDifference());
    }

    @Test
    void cancelledLoanExcludedFromCreditHistoryPaidTotalsAndExcelSanitizesControlChars() throws Exception {
        var cust = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Control\u0007Char", "DOCCAN-" + UUID.randomUUID().toString().substring(0, 6), "3009998877",
                null, "Calle \u000B Test", "Centro", "Sincelejo", null, null, null, routeA, colA, "usr-admin-1"));

        var loan = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                cust.getId(), routeA, colA, bd("200000"), bd("0.20"), bd("240000"), 10, "DIARIO",
                LocalDate.now(), "usr-admin-1", bd("10000")));

        cancelLoanUseCase.execute(loan.getId(), "Error de digitación");

        // 1. Historial crediticio NO cuenta el crédito anulado como pagado ni liquidado
        var report = creditHistoryService.getReportByCustomerId(cust.getId()).orElseThrow();
        assertEquals(0, report.totalLoansCount());
        assertMoney("0", report.totalPaid());
        assertEquals(1, report.loans().size());
        assertMoney("0", report.loans().get(0).totalPaid());
        assertTrue(report.loans().get(0).behaviorVerdict().contains("Anulado"));

        // 2. Base automática del día siguiente NO pierde los $10.000 de papelería del crédito anulado
        assertMoney("0", settlementUseCase.computeAutomaticOpeningRouteBase(colA, LocalDate.now().plusDays(1)));

        // 3. Excel exporta limpio sin caracteres de control XML ilegales y con mergeCells + autoFilter excluyendo TOTALES
        Path xlsx = excelReportExporter.exportAccountingWorkbook(tempDir.resolve("reporte.xlsx"), routeA);
        try (ZipFile zip = new ZipFile(xlsx.toFile())) {
            String sheet2 = new String(zip.getInputStream(zip.getEntry("xl/worksheets/sheet2.xml")).readAllBytes());
            assertFalse(sheet2.contains("\u0007"), "Caracteres de control XML ilegales deben depurarse");
            assertTrue(sheet2.contains("<mergeCells"), "Banner debe incluir mergeCells");
            assertTrue(sheet2.contains("ANULADO"));
        }
    }
}
