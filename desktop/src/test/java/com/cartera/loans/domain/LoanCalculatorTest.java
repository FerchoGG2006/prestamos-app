package com.cartera.loans.domain;

import com.cartera.domain.money.Money;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.assertEquals;

class LoanCalculatorTest {
    @Test void calculates_flat_interest_on_initial_principal() {
        var quote = LoanCalculator.quote(Money.of(150_000), new BigDecimal("0.20"), 30);
        assertEquals(Money.of(30_000), quote.interest());
        assertEquals(Money.of(180_000), quote.totalAgreed());
        assertEquals(Money.of(6_000), quote.regularInstallment());
    }
}
