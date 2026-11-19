package com.cartera.renewals.application;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest
class RenewLoanUseCaseTest {
    @Autowired RenewLoanUseCase service;
    @Autowired TodayCollectionsService metrics;
    @Autowired LoanRepository loans;
    @Autowired InstallmentRepository installments;
    @Autowired CustomerRepository customers;
    @Autowired RouteRepository routes;
    @Autowired CashMovementRepository cash;
    @Autowired RenewalRepository renewals;
    @Autowired PaymentRepository payments;
    @Autowired CollectionSessionRepository sessions;
    @MockitoSpyBean AuditLogRepository audit;
    private LoanEntity previous;
    private String routeId;

    private static BigDecimal amount(String value) { return new BigDecimal(value); }
    private static void money(String expected, BigDecimal actual) {
        assertEquals(0, amount(expected).compareTo(actual));
    }

    @BeforeEach void prepare() {
        UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Admin", "ADMIN"));
        routeId = "test-renew-" + UUID.randomUUID();
        routes.save(new RouteEntity(routeId, "Ruta prueba renovación", "usr-col-1", 1, LocalDate.now().toString()));
        String customer = customers.findAll().getFirst().getId();
        previous = loans.save(new LoanEntity(UUID.randomUUID().toString(), customer, routeId, "usr-col-1",
                null, "NUEVO", amount("800000"), amount("0.4"), amount("320000"), amount("1120000"),
                1, "MENSUAL", LocalDate.now().minusMonths(1).toString(), LocalDate.now().plusMonths(1).toString(),
                "ACTIVO", LocalDate.now().toString()));
        installments.save(new InstallmentEntity(UUID.randomUUID().toString(), previous.getId(), 1,
                LocalDate.now().plusMonths(1).toString(), amount("1120000"), amount("500000"), "PARCIAL"));
        cash.save(new CashMovementEntity(UUID.randomUUID().toString(), routeId, "usr-col-1", null,
                "INGRESO", "CAPITAL_INJECTION", amount("500000"), null, "Base prueba", LocalDate.now().toString()));
    }

    @AfterEach void cleanup() {
        sessions.deleteAll(sessions.findAll().stream().filter(s -> routeId.equals(s.getRouteId())).toList());
        UserSessionContext.clear();
        reset(audit);
    }

    private RenewLoanUseCase.RenewLoanCommand command() {
        return new RenewLoanUseCase.RenewLoanCommand(previous.getId(), amount("700000"), amount("0.40"),
                amount("980000"), 2, "MENSUAL", LocalDate.now(), amount("35000"), "usr-admin-1");
    }

    @Test void previewHasNoWritesAndConfirmationMatchesExactCaseAndReplay() {
        long loanCount = loans.count(), movementCount = cash.count(), paymentCount = payments.count();
        var preview = service.preview(command());
        money("45000", preview.quote().actualCashDisbursed().amount());
        money("420000", preview.quote().cashAfter().amount());
        assertEquals(loanCount, loans.count());
        assertEquals(movementCount, cash.count());
        var result = service.execute(command().withPreview(preview));
        var after = metrics.getDailyMetricsForRoute(LocalDate.now(), routeId);
        money("420000", after.cashBalance());
        money("980000", after.totalActiveDebt());
        money("1400000", after.totalAdministrativeCapital());
        money("0", after.collectedToday());
        assertEquals(paymentCount, payments.count(), "Compensación no crea pago");
        var out = cash.findAll().stream().filter(m -> result.newLoanId().equals(m.getReferenceId())).toList();
        assertEquals(2, out.size());
        money("80000", out.stream().map(CashMovementEntity::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        assertTrue(out.stream().anyMatch(m -> "PAPELERIA_RENOVACION".equals(m.getCategory())));
        assertTrue(installments.findByLoanId(previous.getId()).stream().allMatch(i -> i.getPendingAmount().signum() == 0));
        assertEquals("usr-col-1", loans.findById(result.newLoanId()).orElseThrow().getCollectorId());
        money("980000", installments.findByLoanId(result.newLoanId()).stream()
                .map(InstallmentEntity::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        var replay = service.execute(command().withPreview(preview));
        assertEquals(result.newLoanId(), replay.newLoanId());
        assertEquals(loanCount + 1, loans.count());
        assertEquals(movementCount + 2, cash.count());
    }

    @Test void staleBalanceRejectsWithoutPartialWrites() {
        var cmd = command().withPreview(service.preview(command()));
        var inst = installments.findByLoanId(previous.getId()).getFirst();
        inst.setPaidAmount(amount("510000"));
        installments.save(inst);
        long count = cash.count();
        assertThrows(IllegalStateException.class, () -> service.execute(cmd));
        assertEquals("ACTIVO", loans.findById(previous.getId()).orElseThrow().getStatus());
        assertEquals(count, cash.count());
        assertTrue(renewals.findByPreviousLoanId(previous.getId()).isEmpty());
    }

    @Test void staleCashRejectsWithoutWrites() {
        var cmd = command().withPreview(service.preview(command()));
        cash.save(new CashMovementEntity(UUID.randomUUID().toString(), routeId, "usr-col-1", null,
                "EGRESO", "GASTO", amount("1000"), null, "Cambio de caja", LocalDate.now().toString()));
        assertThrows(IllegalStateException.class, () -> service.execute(cmd));
        assertTrue(renewals.findByPreviousLoanId(previous.getId()).isEmpty());
    }

    @Test void authorizationAndInconsistentTermsAreRejected() {
        UserSessionContext.clear();
        assertThrows(IllegalStateException.class, () -> service.execute(command()));
        UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Otro rol", "COBRADOR"));
        assertThrows(IllegalStateException.class, () -> service.execute(command()));
        UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Admin", "ADMIN"));
        var bad = new RenewLoanUseCase.RenewLoanCommand(previous.getId(), amount("700000"), amount("0.4"),
                amount("999000"), 2, "MENSUAL", LocalDate.now(), amount("35000"), "usr-admin-1");
        assertThrows(IllegalArgumentException.class, () -> service.execute(bad));
        assertTrue(renewals.findByPreviousLoanId(previous.getId()).isEmpty());
    }

    @Test void auditFailureRollsBackEntireOperation() {
        long loanCount = loans.count(), movementCount = cash.count();
        doThrow(new IllegalStateException("Fallo auditoría simulado")).when(audit).save(any(AuditLogEntity.class));
        assertThrows(IllegalStateException.class, () -> service.execute(command()));
        assertEquals("ACTIVO", loans.findById(previous.getId()).orElseThrow().getStatus());
        money("620000", installments.findByLoanId(previous.getId()).getFirst().getPendingAmount());
        assertEquals(loanCount, loans.count());
        assertEquals(movementCount, cash.count());
        assertTrue(renewals.findByPreviousLoanId(previous.getId()).isEmpty());
    }

    @Test void closedDayRejectsRenewal() {
        sessions.save(new CollectionSessionEntity(UUID.randomUUID().toString(), routeId, "usr-col-1",
                LocalDate.now().toString(), LocalDate.now().toString(), LocalDate.now().toString(),
                "CERRADA", BigDecimal.ZERO, BigDecimal.ZERO, null));
        assertThrows(IllegalStateException.class, () -> service.execute(command()));
        assertTrue(renewals.findByPreviousLoanId(previous.getId()).isEmpty());
    }

    @Test void replayWithDifferentTermsIsRejectedWithoutNewMovements() {
        service.execute(command());
        long count = cash.count();
        var different = new RenewLoanUseCase.RenewLoanCommand(previous.getId(), amount("700000"), amount("0.2"),
                amount("840000"), 2, "MENSUAL", LocalDate.now(), amount("35000"), "usr-admin-1");
        assertThrows(IllegalStateException.class, () -> service.execute(different));
        assertEquals(count, cash.count());
    }

    @Test void zeroPaperworkCreatesOnlyNetDisbursement() {
        var cmd = new RenewLoanUseCase.RenewLoanCommand(previous.getId(), amount("700000"), amount("0.4"),
                amount("980000"), 2, "MENSUAL", LocalDate.now(), BigDecimal.ZERO, "usr-admin-1");
        var result = service.execute(cmd.withPreview(service.preview(cmd)));
        money("80000", result.cashDisbursed());
        assertEquals(1, cash.findAll().stream().filter(m -> result.newLoanId().equals(m.getReferenceId())).count());
        money("420000", metrics.getDailyMetricsForRoute(LocalDate.now(), routeId).cashBalance());
    }

    @Test void assignedCollectorCanRenewWithoutChangingOwnership() {
        UserSessionContext.setSession(new UserSession("usr-col-1", "collector", "Cobrador", "COBRADOR"));
        var cmd = new RenewLoanUseCase.RenewLoanCommand(previous.getId(), amount("700000"), amount("0.4"),
                amount("980000"), 2, "MENSUAL", LocalDate.now(), amount("35000"), "usr-col-1");
        var result = service.execute(cmd.withPreview(service.preview(cmd)));
        assertEquals("usr-col-1", loans.findById(result.newLoanId()).orElseThrow().getCollectorId());
    }

    @Test void negativeLedgerCashReconcilesWithPreviewWithoutClamping() {
        cash.save(new CashMovementEntity(UUID.randomUUID().toString(), routeId, "usr-col-1", null,
                "EGRESO", "RETIRO", amount("500000"), null, "Retiro previo", LocalDate.now().toString()));
        var preview = service.preview(command());
        service.execute(command().withPreview(preview));
        var after = metrics.getDailyMetricsForRoute(LocalDate.now(), routeId);
        money("-80000", after.cashBalance());
        money("900000", after.totalAdministrativeCapital());
        money("900000", preview.quote().administrativeAfter().amount());
    }

    @Test void zeroNetRegistersOnlyPaperworkAndNoFabricatedPayment() {
        var cmd = new RenewLoanUseCase.RenewLoanCommand(previous.getId(), amount("655000"), amount("0.4"),
                amount("917000"), 2, "MENSUAL", LocalDate.now(), amount("35000"), "usr-admin-1");
        var result = service.execute(cmd.withPreview(service.preview(cmd)));
        money("0", result.cashDisbursed());
        var out = cash.findAll().stream().filter(m -> result.newLoanId().equals(m.getReferenceId())).toList();
        assertEquals(1, out.size());
        assertEquals("PAPELERIA_RENOVACION", out.getFirst().getCategory());
        money("465000", metrics.getDailyMetricsForRoute(LocalDate.now(), routeId).cashBalance());
    }

    @Test void fractionalHistoricalBalanceIsNotSilentlyRounded() {
        var inst = installments.findByLoanId(previous.getId()).getFirst();
        inst.setPaidAmount(amount("499999.50"));
        installments.save(inst);
        var error = assertThrows(IllegalStateException.class, () -> service.preview(command()));
        assertTrue(error.getMessage().contains("fracciones de peso"));
        assertThrows(IllegalStateException.class, () -> service.execute(command()));
        assertTrue(renewals.findByPreviousLoanId(previous.getId()).isEmpty());
        money("620000.50", installments.findByLoanId(previous.getId()).getFirst().getPendingAmount());
    }

    @Test void multipleSessionsOnSameDayDoNotBreakPreviewAndOwnClosedSessionIsProtected() {
        // Multiple sessions for the same route/date are allowed by the existing schema.
        sessions.save(new CollectionSessionEntity(UUID.randomUUID().toString(), routeId, "usr-admin-1",
                LocalDate.now().toString(), LocalDate.now().toString(), LocalDate.now().toString(),
                "CERRADA", BigDecimal.ZERO, BigDecimal.ZERO, null));
        sessions.save(new CollectionSessionEntity(UUID.randomUUID().toString(), routeId, "usr-col-1",
                LocalDate.now().toString(), LocalDate.now().toString(), null,
                "ABIERTA", BigDecimal.ZERO, BigDecimal.ZERO, null));
        assertNotNull(service.preview(command()));
        sessions.save(new CollectionSessionEntity(UUID.randomUUID().toString(), routeId, "usr-col-1",
                LocalDate.now().toString(), LocalDate.now().toString(), LocalDate.now().toString(),
                "CERRADA", BigDecimal.ZERO, BigDecimal.ZERO, null));
        assertThrows(IllegalStateException.class, () -> service.execute(command()));
    }
}
