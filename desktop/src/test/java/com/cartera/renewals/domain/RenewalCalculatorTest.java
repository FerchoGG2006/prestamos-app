package com.cartera.renewals.domain;

import com.cartera.domain.money.Money;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class RenewalCalculatorTest {
    @Test
    void exactUserCaseProjectsAllBalances() {
        var q = RenewalCalculator.quote(Money.of(700000), Money.of(620000), Money.of(35000),
                new BigDecimal("0.40"), Money.of(500000), Money.of(620000));
        assertEquals(Money.of(45000), q.actualCashDisbursed());
        assertEquals(Money.of(280000), q.interest());
        assertEquals(Money.of(980000), q.totalAgreed());
        assertEquals(Money.of(420000), q.cashAfter());
        assertEquals(Money.of(980000), q.debtAfter());
        assertEquals(Money.of(1120000), q.administrativeBefore());
        assertEquals(Money.of(1400000), q.administrativeAfter());
    }

    @Test
    void zeroPaperworkAndZeroNetRemainExplicit() {
        var q = RenewalCalculator.quote(Money.of(620000), Money.of(620000), Money.ZERO,
                BigDecimal.ZERO, Money.of(500000), Money.of(620000));
        assertEquals(Money.ZERO, q.actualCashDisbursed());
        assertEquals(q.cashBefore(), q.cashAfter());
        assertEquals(q.administrativeBefore(), q.administrativeAfter());
    }

    @Test
    void negativeCashIsShownWithoutClamping() {
        var q = RenewalCalculator.quote(Money.of(700000), Money.of(620000), Money.of(35000),
                new BigDecimal("0.40"), Money.of(10000), Money.of(620000));
        assertEquals(Money.of(-70000), q.cashAfter());
        assertEquals(q.debtAfter().add(q.cashAfter()), q.administrativeAfter());
    }

    @Test
    void invalidTermsAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> RenewalCalculator.calculate(Money.ZERO, Money.ZERO, Money.ZERO));
        assertThrows(IllegalArgumentException.class, () -> RenewalCalculator.calculate(Money.of(100), Money.of(-1), Money.ZERO));
        assertThrows(IllegalArgumentException.class, () -> RenewalCalculator.calculate(Money.of(100), Money.ZERO, Money.of(-1)));
        assertThrows(IllegalArgumentException.class, () -> RenewalCalculator.calculate(Money.of(100), Money.of(90), Money.of(20)));
        assertThrows(IllegalArgumentException.class, () -> RenewalCalculator.quote(Money.of(100), Money.ZERO,
                Money.ZERO, new BigDecimal("-0.2"), Money.ZERO, Money.ZERO));
    }
}
