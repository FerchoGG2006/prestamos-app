package com.cartera.payments.application;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.*;
import com.cartera.loans.application.*;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.settlement.application.*;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.math.BigDecimal;
import java.nio.file.*;
import java.sql.DriverManager;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real SQLite/service regressions, each with its own collector to isolate immutable days. */
@SpringBootTest
class DesktopFinancialJourneyTest {
    @Autowired ApplicationContext ctx;
    String collector, route;
    CustomerEntity customer;
    LoanEntity loan;
    <T> T bean(Class<T> type) { return ctx.getBean(type); }
    static BigDecimal n(String value) { return new BigDecimal(value); }
    static void money(String value, BigDecimal actual) { assertEquals(0, n(value).compareTo(actual)); }
    void admin() { UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Admin", "ADMIN")); }
    @BeforeEach void prepare() {
        admin();
        collector = "usr-col-test-" + UUID.randomUUID(); route = "route-" + UUID.randomUUID();
        bean(AppUserRepository.class).save(new AppUserEntity(collector, collector, "unused-test-only", "Test Collector", 1, LocalDate.now().toString()));
        bean(RouteRepository.class).save(new RouteEntity(route, "Test route", collector, 1, LocalDate.now().toString()));
        customer = bean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand(
            "Test customer", UUID.randomUUID().toString(), "3000000000", null, "Address", "Zone", "City", null, null, null,
            route, collector, "usr-admin-1"));
        loan = bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(customer.getId(), route, collector,
            n("300000"), n("0.2"), n("360000"), 24, "DIARIO", LocalDate.now(), "usr-admin-1", n("15000")));
    }
    @AfterEach void clear() { UserSessionContext.clear(); }
    RecordPaymentUseCase.RecordPaymentCommand command(String amount, String method, String key) {
        return new RecordPaymentUseCase.RecordPaymentCommand(loan.getId(), n(amount), method, collector, LocalDate.now(), key);
    }
    RecordPaymentUseCase.PaymentExecutionResult pay(String amount, String method) {
        return bean(RecordPaymentUseCase.class).execute(command(amount, method, UUID.randomUUID().toString()));
    }
    TodayCollectionsService.DailyMetrics metrics() { return bean(TodayCollectionsService.class).getDailyMetricsForRoute(LocalDate.now(), route); }
    ObjectNode renewalPackage() {
        var pkg = new ObjectMapper().createObjectNode().put("operatingDate", LocalDate.now().toString()).put("routeId", route).put("collectorId", collector);
        String next = "mobile-loan-" + UUID.randomUUID();
        pkg.putArray("newLoans").addObject().put("id", next).put("customerId", customer.getId()).put("routeId", route)
            .put("collectorId", collector).put("principal", 700000).put("interestRate", n("0.4")).put("totalAgreed", 980000)
            .put("installmentCount", 2).put("frequency", "MENSUAL").put("startDate", LocalDate.now().toString()).put("previousLoanId", loan.getId());
        pkg.putArray("renewals").addObject().put("id", "mobile-renewal-" + UUID.randomUUID()).put("previousLoanId", loan.getId())
            .put("newLoanId", next).put("newPrincipal", 700000).put("previousBalanceDeducted", 360000)
            .put("paperworkDeducted", 35000).put("actualCashDisbursed", 305000);
        return pkg;
    }
    @Test void digitalMoneyIsAnAssetButCannotBeDeliveredOrWithdrawnAsCash() {
        pay("10000", "NEQUI");
        // Spec 008: papelería ($15.000) permanece en caja física (-$285.000) pero NUNCA suma al Efectivo base operativo (-$300.000) ni al Administrativo ($60.000)
        money("-300000", metrics().cashBalance()); money("15000", metrics().paperworkBalance());
        money("-285000", metrics().totalPhysicalCashInBox()); money("10000", metrics().digitalBalance());
        money("60000", metrics().totalAdministrativeCapital()); money("350000", metrics().totalActiveDebt());
        var summary = bean(SettlementUseCase.class).getOrCreateDaySummary(collector, LocalDate.now());
        money("10000", summary.totalCollected()); money("0", summary.netExpectedCash());
        assertEquals(route, bean(CollectionSessionRepository.class).findById(summary.sessionId()).orElseThrow().getRouteId());
        money("-285000", bean(CashMovementUseCase.class).availableBalance(route));
        var renewal = new RenewLoanUseCase.RenewLoanCommand(loan.getId(), n("700000"), n("0.4"), n("980000"), 2,
                "MENSUAL", LocalDate.now(), n("35000"), "usr-admin-1");
        var quote = bean(RenewLoanUseCase.class).preview(renewal);
        money("60000", quote.quote().administrativeBefore().amount());
        money("340000", quote.quote().administrativeAfter().amount());
        assertThrows(IllegalArgumentException.class, () -> bean(CashMovementUseCase.class).register(new CashMovementUseCase.CashMovementCommand(
            UUID.randomUUID().toString(), route, "EGRESO", "OTRO", n("1"), "Not physical money", null)));
    }
    @Test void digitalReversalKeepsOriginalAllocationsAndRestoresBothAccounts() {
        var payment = pay("10000", "NEQUI");
        var original = bean(PaymentAllocationRepository.class).findByPaymentId(payment.paymentId());
        bean(ReversePaymentUseCase.class).execute(payment.paymentId(), "Test reversal");
        assertEquals(original.stream().map(PaymentAllocationEntity::getId).toList(),
            bean(PaymentAllocationRepository.class).findByPaymentId(payment.paymentId()).stream().map(PaymentAllocationEntity::getId).toList());
        money("-300000", metrics().cashBalance()); money("-285000", metrics().totalPhysicalCashInBox());
        money("0", metrics().digitalBalance()); money("360000", metrics().totalActiveDebt());
        long movements = bean(CashMovementRepository.class).count();
        assertThrows(IllegalStateException.class, () -> bean(ReversePaymentUseCase.class).execute(payment.paymentId(), "Again"));
        assertEquals(movements, bean(CashMovementRepository.class).count());
    }
    @Test void paymentChecksAuthenticationOwnershipAndReplayPayload() {
        UserSessionContext.clear();
        assertThrows(IllegalStateException.class, () -> pay("1000", "EFECTIVO"));
        UserSessionContext.setSession(new UserSession("usr-col-1", "collector", "Collector", "COBRADOR"));
        assertThrows(SecurityException.class, () -> pay("1000", "EFECTIVO"));
        admin(); String key = UUID.randomUUID().toString();
        var payment = bean(RecordPaymentUseCase.class).execute(command("1000", "EFECTIVO", key));
        assertTrue(bean(RecordPaymentUseCase.class).execute(command("1000", "CASH", key)).alreadyExisted());
        assertThrows(IllegalArgumentException.class, () -> bean(RecordPaymentUseCase.class).execute(command("2000", "EFECTIVO", key)));
        assertThrows(IllegalArgumentException.class, () -> pay("0.5", "EFECTIVO"));
        assertNotNull(payment.paymentId());
    }
    @Test void closedDayRejectsPaymentReversalAndBackdatingButAllowsExactReplay() throws Exception {
        String key = UUID.randomUUID().toString();
        var payment = bean(RecordPaymentUseCase.class).execute(command("10000", "EFECTIVO", key));
        var summary = bean(SettlementUseCase.class).getOrCreateDaySummary(collector, LocalDate.now());
        var closed = bean(SettlementUseCase.class).closeSettlement(summary.sessionId(), n("10000"), "", "usr-admin-1");
        assertThrows(IllegalStateException.class, () -> pay("1000", "EFECTIVO"));
        assertThrows(IllegalStateException.class, () -> bean(ReversePaymentUseCase.class).execute(payment.paymentId(), "After close"));
        assertTrue(bean(RecordPaymentUseCase.class).execute(command("10000", "EFECTIVO", key)).alreadyExisted());
        var file = bean(DatabaseBackupService.class).listBackups().getFirst();
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + file);
             var statement = connection.prepareStatement("SELECT count(*) FROM daily_settlement WHERE id = ?")) {
            statement.setString(1, closed.getId());
            try (var rows = statement.executeQuery()) { assertTrue(rows.next()); assertEquals(1, rows.getInt(1)); }
        }
        // A prior closed day cannot receive backdated payments either.
        var past = bean(SettlementUseCase.class).getOrCreateDaySummary(collector, LocalDate.now().minusDays(1));
        bean(SettlementUseCase.class).closeSettlement(past.sessionId(), BigDecimal.ZERO, "Empty prior day", "usr-admin-1");
        assertThrows(IllegalStateException.class, () -> bean(RecordPaymentUseCase.class).execute(new RecordPaymentUseCase.RecordPaymentCommand(
            loan.getId(), n("1000"), "EFECTIVO", collector, LocalDate.now().minusDays(1), UUID.randomUUID().toString())));
    }
    @Test void importedRenewalPostsOnceAndInvalidPackageRollsBackCompletely() {
        var pkg = renewalPackage();
        var sync = bean(MobileSyncProcessorService.class);
        assertEquals(1, sync.importPackage(pkg.toString()).renewalsImported());
        money("-640000", metrics().cashBalance()); money("50000", metrics().paperworkBalance());
        money("-590000", metrics().totalPhysicalCashInBox()); money("980000", metrics().totalActiveDebt());
        assertEquals(0, sync.importPackage(pkg.toString()).renewalsImported());
        money("-640000", metrics().cashBalance());
        var tampered = pkg.deepCopy(); ((ObjectNode) tampered.path("renewals").get(0)).put("actualCashDisbursed", 1);
        assertThrows(IllegalArgumentException.class, () -> sync.importPackage(tampered.toString()));
        money("-640000", metrics().cashBalance());
    }
    @Test void invalidFirstRenewalDoesNotCreateNewLoanOrCloseOldLoan() {
        var pkg = renewalPackage(); ((ObjectNode) pkg.path("renewals").get(0)).put("previousBalanceDeducted", 1);
        long count = bean(LoanRepository.class).count(), movements = bean(CashMovementRepository.class).count();
        assertThrows(IllegalArgumentException.class, () -> bean(MobileSyncProcessorService.class).importPackage(pkg.toString()));
        assertEquals(count, bean(LoanRepository.class).count()); assertEquals(movements, bean(CashMovementRepository.class).count());
        assertEquals("ACTIVO", bean(LoanRepository.class).findById(loan.getId()).orElseThrow().getStatus());
        money("360000", metrics().totalActiveDebt());
    }
    @Test void cannotReversePaymentOnCreditAlreadyRenewed() {
        var payment = pay("10000", "EFECTIVO");
        bean(RenewLoanUseCase.class).execute(new RenewLoanUseCase.RenewLoanCommand(loan.getId(), n("700000"), n("0.4"),
            n("980000"), 2, "MENSUAL", LocalDate.now(), n("35000"), "usr-admin-1"));
        assertThrows(IllegalStateException.class, () -> bean(ReversePaymentUseCase.class).execute(payment.paymentId(), "Invalid old reversal"));
        assertThrows(IllegalStateException.class, () -> bean(CancelLoanUseCase.class).execute(loan.getId(), "Invalid old cancellation"));
        money("980000", metrics().totalActiveDebt());
    }
    @Test void closedCollectorDayAlsoBlocksNewLoansRenewalsAndImportedExpenses() {
        var settlement = bean(SettlementUseCase.class);
        var summary = settlement.getOrCreateDaySummary(collector, LocalDate.now());
        settlement.closeSettlement(summary.sessionId(), BigDecimal.ZERO, "Empty QA day", "usr-admin-1");
        long count = bean(LoanRepository.class).count(), movementCount = bean(CashMovementRepository.class).count();
        assertThrows(IllegalStateException.class, () -> bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(
            customer.getId(), route, collector, n("100000"), n("0.2"), n("120000"), 12, "DIARIO", LocalDate.now(), "usr-admin-1")));
        assertThrows(IllegalStateException.class, () -> bean(RenewLoanUseCase.class).preview(new RenewLoanUseCase.RenewLoanCommand(
            loan.getId(), n("700000"), n("0.4"), n("980000"), 2, "MENSUAL", LocalDate.now(), n("35000"), "usr-admin-1")));
        var pkg = new ObjectMapper().createObjectNode().put("routeId", route).put("collectorId", collector).put("operatingDate", LocalDate.now().toString());
        pkg.putArray("cashMovements").addObject().put("id", "expense-" + UUID.randomUUID()).put("amount", 1000)
            .put("type", "EXPENSE").put("category", "GASOLINA");
        assertThrows(IllegalArgumentException.class, () -> bean(MobileSyncProcessorService.class).importPackage(pkg.toString()));
        assertEquals(count, bean(LoanRepository.class).count()); assertEquals(movementCount, bean(CashMovementRepository.class).count());
    }
    @Test void inactiveActorAndUnauthenticatedOriginationAreRejected() {
        UserSessionContext.clear();
        assertThrows(IllegalStateException.class, () -> bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(
            customer.getId(), route, collector, n("100000"), n("0.2"), n("120000"), 12, "DIARIO", LocalDate.now(), "usr-admin-1")));
        var user = bean(AppUserRepository.class).findById(collector).orElseThrow(); user.setActive(0); bean(AppUserRepository.class).save(user);
        UserSessionContext.setSession(new UserSession(collector, collector, "Inactive collector", "COBRADOR"));
        assertThrows(SecurityException.class, () -> pay("1000", "EFECTIVO"));
    }
    @Test void backupIsUniqueAndIntegrityCheckedAndRollbackProducesNoAutomaticCopy() throws Exception {
        var backups = bean(DatabaseBackupService.class); int count = backups.getBackupCount();
        new TransactionTemplate(bean(PlatformTransactionManager.class)).executeWithoutResult(status -> {
            backups.createAfterCommit("Rolled back"); status.setRollbackOnly();
        });
        assertEquals(count, backups.getBackupCount());
        var first = backups.createBackup("First"); var second = backups.createBackup("Second"); assertNotEquals(first, second);
        try (var connection = DriverManager.getConnection("jdbc:sqlite:" + first);
             var statement = connection.createStatement(); var rows = statement.executeQuery("PRAGMA integrity_check")) {
            assertTrue(rows.next()); assertEquals("ok", rows.getString(1));
        }
        assertEquals(backups.getDatabasePath().getParent().resolve("backups"), first.getParent());
    }
}
