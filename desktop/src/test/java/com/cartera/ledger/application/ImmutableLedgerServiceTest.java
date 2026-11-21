package com.cartera.ledger.application;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.infrastructure.persistence.entity.FinancialEventEntity;
import com.cartera.ledger.application.ImmutableLedgerService.AppendEventCommand;
import com.cartera.ledger.application.ImmutableLedgerService.LedgerBalanceSnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = CarteraInfrastructureApplication.class)
@ActiveProfiles("test")
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:sqlite:file:immutable_ledger_test?mode=memory&cache=shared",
        "cartera.demo-data.enabled=false"
})
class ImmutableLedgerServiceTest {

    @Autowired
    private ImmutableLedgerService ledgerService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void enforcesAppendOnlyImmutabilityIdempotencyAndExactBalances() {
        String officeId = "off-test-" + UUID.randomUUID().toString().substring(0, 6);

        // 1. Inyección de base inicial ($1.000.000)
        FinancialEventEntity e1 = ledgerService.appendIdempotent(new AppendEventCommand(
                officeId, "open-1", "CAPITAL_INJECTION", "ROUTE", "route-1", "route-1", null, "usr-adm",
                new BigDecimal("1000000"), new BigDecimal("1000000"), BigDecimal.ZERO, BigDecimal.ZERO,
                "{}", "2026-11-21T08:00:00Z"
        ));

        // 2. Desembolso préstamo de $200.000 al 20% ($240.000 cartera, -$200.000 base => +$40.000 administrativo)
        ledgerService.appendIdempotent(new AppendEventCommand(
                officeId, "loan-1", "LOAN_DISBURSED", "LOAN", "loan-1", "route-1", "cust-1", "usr-col",
                new BigDecimal("200000"), new BigDecimal("-200000"), BigDecimal.ZERO, new BigDecimal("240000"),
                "{}", "2026-11-21T09:00:00Z"
        ));

        // 3. Cobro de cuota $30.000 efectivo enviado DOS veces con la misma clave de idempotencia
        AppendEventCommand payCmd = new AppendEventCommand(
                officeId, "pay-1", "PAYMENT_RECEIVED", "PAYMENT", "pay-1", "route-1", "cust-1", "usr-col",
                new BigDecimal("30000"), new BigDecimal("30000"), BigDecimal.ZERO, new BigDecimal("-30000"),
                "{}", "2026-11-21T10:00:00Z"
        );
        FinancialEventEntity pFirst = ledgerService.appendIdempotent(payCmd);
        FinancialEventEntity pDuplicate = ledgerService.appendIdempotent(payCmd);
        assertEquals(pFirst.getId(), pDuplicate.getId());

        // 4. Verificación matemática exacta (BigDecimal):
        // Cartera = 240.000 - 30.000 = 210.000
        // Base = 1.000.000 - 200.000 + 30.000 = 830.000
        // Administrativo = 210.000 + 830.000 = 1.040.000 (Base inicial + $40.000 interés)
        LedgerBalanceSnapshot snap = ledgerService.computeBalance(officeId, "route-1");
        assertEquals(3, snap.eventsCount());
        assertEquals(new BigDecimal("210000.00"), snap.portfolioBalance());
        assertEquals(new BigDecimal("830000.00"), snap.cashBalance());
        assertEquals(new BigDecimal("0.00"), snap.digitalBalance());
        assertEquals(new BigDecimal("1040000.00"), snap.administrativeTotal());

        // 5. Inmutabilidad dura a nivel de motor SQLite: UPDATE y DELETE deben fallar
        assertThrows(DataAccessException.class, () ->
                jdbcTemplate.update("UPDATE financial_event SET amount = '999999.00' WHERE id = ?", e1.getId())
        );
        assertThrows(DataAccessException.class, () ->
                jdbcTemplate.update("DELETE FROM financial_event WHERE id = ?", e1.getId())
        );
    }
}
