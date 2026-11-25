package com.cartera.settlement.application;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class SettlementOpeningBaseTest {

    @Autowired
    private SettlementUseCase settlementUseCase;

    @Autowired
    private TodayCollectionsService todayCollectionsService;

    @Autowired
    private PaymentRepository paymentRepository;

    @Autowired
    private CashMovementRepository cashMovementRepository;

    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private LoanRepository loanRepository;

    @Autowired
    private RouteRepository routeRepository;

    @BeforeEach
    void authenticate() {
        UserSessionContext.setSession(new UserSession("usr-admin-1", "admin", "Admin", "ADMIN"));
    }

    @AfterEach
    void clearSession() {
        UserSessionContext.clear();
    }

    @Test
    void openingRouteBaseAddsToCollectedTodayAndClosesExact() {
        LocalDate testDate = LocalDate.of(2026, 12, 2);
        String dateStr = testDate.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String collectorId = "usr-col-1";
        String[] ids = createSampleCustomerAndLoan("route-norte", collectorId, new BigDecimal("300000"));
        String customerId = ids[0];
        String loanId = ids[1];

        // Cobrado hoy: $175.000 en efectivo
        paymentRepository.save(new PaymentEntity(
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
                loanId,
                customerId,
                collectorId,
                null,
                new BigDecimal("175000"),
                "EFECTIVO",
                "APLICADO",
                dateStr + "T10:15:00",
                null
        ));

        // 1. Compatibilidad hacia atrás (sin base -> openingRouteBase = 0)
        var legacySummary = settlementUseCase.getOrCreateDaySummary(collectorId, testDate);
        assertEquals(0, BigDecimal.ZERO.compareTo(legacySummary.openingRouteBase()));
        assertEquals(0, new BigDecimal("175000").compareTo(legacySummary.collectedPlusBase()));
        assertEquals(0, new BigDecimal("175000").compareTo(legacySummary.netExpectedCash()));

        // 2. Opción B: Base de inicio $50.000 -> Cobrado + Base = $225.000
        var withBase = settlementUseCase.getOrCreateDaySummary(collectorId, testDate, new BigDecimal("50000"));
        assertEquals(0, new BigDecimal("50000").compareTo(withBase.openingRouteBase()));
        assertEquals(0, new BigDecimal("225000").compareTo(withBase.collectedPlusBase()));
        assertEquals(0, new BigDecimal("225000").compareTo(withBase.netExpectedCash()));

        // 3. Rechaza base negativa
        assertThrows(IllegalArgumentException.class, () -> settlementUseCase.closeSettlement(
                withBase.sessionId(),
                new BigDecimal("225000"),
                new BigDecimal("-1000"),
                BigDecimal.ZERO,
                null,
                null,
                "usr-admin-1"
        ));

        // 4. Cierre exacto entregando $225.000 -> diferencia = $0, inmutable
        var closed = settlementUseCase.closeSettlement(
                withBase.sessionId(),
                new BigDecimal("225000"),
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                null,
                null,
                "usr-admin-1"
        );
        assertEquals(0, new BigDecimal("225000").compareTo(closed.getExpectedCollection()));
        assertEquals(0, new BigDecimal("225000").compareTo(closed.getActualCollection()));
        assertEquals(0, BigDecimal.ZERO.compareTo(closed.getCashDifference()));
        assertTrue(closed.getDifferenceJustification().contains("Base inicio ruta"));
    }

    @Test
    void openingRouteBaseSubtractsRouteExpensesAccurately() {
        LocalDate testDate = LocalDate.of(2026, 12, 3);
        String dateStr = testDate.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String collectorId = "usr-col-1";
        String[] ids = createSampleCustomerAndLoan("route-norte", collectorId, new BigDecimal("300000"));
        String customerId = ids[0];
        String loanId = ids[1];

        paymentRepository.save(new PaymentEntity(
                UUID.randomUUID().toString(),
                UUID.randomUUID().toString(),
                loanId,
                customerId,
                collectorId,
                null,
                new BigDecimal("175000"),
                "EFECTIVO",
                "APLICADO",
                dateStr + "T10:30:00",
                null
        ));

        var initial = settlementUseCase.getOrCreateDaySummary(collectorId, testDate, new BigDecimal("50000"));
        cashMovementRepository.save(new CashMovementEntity(
                UUID.randomUUID().toString(),
                "route-norte",
                collectorId,
                initial.sessionId(),
                "EGRESO",
                SettlementUseCase.CAT_GASTO_GASOLINA,
                new BigDecimal("10000"),
                initial.sessionId(),
                "Gasolina",
                dateStr + "T11:00:00"
        ));

        var updated = settlementUseCase.getOrCreateDaySummary(collectorId, testDate, new BigDecimal("50000"));
        assertEquals(0, new BigDecimal("225000").compareTo(updated.collectedPlusBase()));
        assertEquals(0, new BigDecimal("10000").compareTo(updated.routeExpenses()));
        assertEquals(0, new BigDecimal("215000").compareTo(updated.netExpectedCash()));
    }

    @Test
    void paperworkWithdrawalDropsPaperworkWithoutChangingAdministrative() {
        String routeId = "route-pap-test-" + UUID.randomUUID().toString().substring(0, 6);
        String collectorId = "usr-col-1";
        LocalDate today = LocalDate.now();
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        routeRepository.save(new RouteEntity(routeId, "Ruta Papelería Test", collectorId, 1, now));
        String loanId = createSampleCustomerAndLoan(routeId, collectorId, new BigDecimal("300000"))[1];

        // Simular préstamo nuevo de $300.000 con $15.000 de papelería retenida (desembolso físico = $285.000)
        cashMovementRepository.save(new CashMovementEntity(
                UUID.randomUUID().toString(),
                routeId,
                collectorId,
                null,
                "EGRESO",
                "DESEMBOLSO",
                new BigDecimal("285000"),
                loanId,
                "Desembolso neto prueba papelería",
                now
        ));

        assertEquals(0, new BigDecimal("15000").compareTo(todayCollectionsService.getPaperworkAvailableBalance(routeId)));
        BigDecimal adminBefore = todayCollectionsService.getDailyMetricsForRoute(today, routeId).totalAdministrativeCapital();

        // Retirar $15.000 de papelería -> papelería queda en $0 y Administrativo permanece idéntico
        cashMovementRepository.save(new CashMovementEntity(
                UUID.randomUUID().toString(),
                routeId,
                collectorId,
                null,
                "EGRESO",
                "RETIRO_PAPELERIA",
                new BigDecimal("15000"),
                null,
                "Retiro utilidad papelería",
                now
        ));

        assertEquals(0, BigDecimal.ZERO.compareTo(todayCollectionsService.getPaperworkAvailableBalance(routeId)));
        BigDecimal adminAfter = todayCollectionsService.getDailyMetricsForRoute(today, routeId).totalAdministrativeCapital();
        assertEquals(0, adminBefore.compareTo(adminAfter), "Retirar papelería nunca debe cambiar el Administrativo");
    }

    @Test
    void automaticOpeningBaseExcludesPaperworkAndReflectsClosingWithdrawal() {
        String collectorId = "usr-col-1";
        LocalDate day1 = LocalDate.of(2026, 12, 10);
        LocalDate day2 = LocalDate.of(2026, 12, 11);
        LocalDate day3 = LocalDate.of(2026, 12, 12);
        String day1Str = day1.format(DateTimeFormatter.ISO_LOCAL_DATE);
        String day2Str = day2.format(DateTimeFormatter.ISO_LOCAL_DATE);

        // Limpiar saldo previo de route-norte midiendo delta sobre la base automática existente
        BigDecimal baselineBefore = settlementUseCase.computeAutomaticOpeningRouteBase(collectorId, day1);
        String[] ids = createSampleCustomerAndLoan("route-norte", collectorId, new BigDecimal("300000"));
        String customerId = ids[0];
        String loanId = ids[1];

        // Día 1: Inyección de $380.000 + préstamo de $300.000 con $15.000 papelería (desembolso físico $285.000)
        cashMovementRepository.save(new CashMovementEntity(
                UUID.randomUUID().toString(),
                "route-norte",
                collectorId,
                null,
                "INGRESO",
                "INYECCION_CAPITAL",
                new BigDecimal("380000"),
                null,
                "Base inicial prueba automática",
                day1Str + "T07:00:00"
        ));
        cashMovementRepository.save(new CashMovementEntity(
                UUID.randomUUID().toString(),
                "route-norte",
                collectorId,
                null,
                "EGRESO",
                "DESEMBOLSO",
                new BigDecimal("285000"),
                loanId,
                "Desembolso neto con $15k papelería",
                day1Str + "T09:00:00"
        ));

        // En Día 2 (dejando en ruta), la base automática debe subir exactamente +$80.000 ($380k - $300k), EXCLUYENDO los $15k de papelería!
        BigDecimal day2AutoBase = settlementUseCase.computeAutomaticOpeningRouteBase(collectorId, day2);
        assertEquals(0, baselineBefore.add(new BigDecimal("80000")).compareTo(day2AutoBase),
                "La base automática del Día 2 debe excluir los $15.000 de papelería");

        // En Día 2, cerrar con retiro a oficina de $50.000 -> Día 3 baja exactamente $50.000
        var day2Summary = settlementUseCase.getOrCreateDaySummary(collectorId, day2, day2AutoBase);
        settlementUseCase.closeSettlement(
                day2Summary.sessionId(),
                day2Summary.netExpectedCash(),
                day2AutoBase,
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                null,
                null,
                "usr-admin-1"
        );

        BigDecimal day3AutoBase = settlementUseCase.computeAutomaticOpeningRouteBase(collectorId, day3);
        assertEquals(0, day2AutoBase.subtract(new BigDecimal("50000")).compareTo(day3AutoBase),
                "Retirar $50.000 al cierre debe bajar exactamente $50.000 la base automática de mañana");
    }

    private String[] createSampleCustomerAndLoan(String routeId, String collectorId, BigDecimal principal) {
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        String customerId = "cust-" + UUID.randomUUID();
        customerRepository.save(new CustomerEntity(
                customerId,
                "Cliente Test " + customerId.substring(0, 8),
                "DOC-" + UUID.randomUUID().toString().substring(0, 8),
                "3000000000",
                null,
                "Calle Test",
                "Centro",
                "Sincelejo",
                "Comerciante",
                "Negocio",
                null,
                "ACTIVO",
                routeId,
                collectorId,
                now
        ));

        String loanId = "loan-" + UUID.randomUUID();
        BigDecimal interest = principal.multiply(new BigDecimal("0.20"));
        BigDecimal totalAgreed = principal.add(interest);
        loanRepository.save(new LoanEntity(
                loanId,
                customerId,
                routeId,
                collectorId,
                null,
                "NUEVO",
                principal,
                new BigDecimal("20"),
                interest,
                totalAgreed,
                30,
                "DIARIO",
                LocalDate.now().toString(),
                LocalDate.now().plusDays(30).toString(),
                "ACTIVO",
                now
        ));
        return new String[]{customerId, loanId};
    }
}
