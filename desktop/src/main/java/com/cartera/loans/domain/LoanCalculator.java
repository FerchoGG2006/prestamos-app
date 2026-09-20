package com.cartera.loans.domain;

import com.cartera.domain.money.Money;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** Flat interest on original principal only; the rate is supplied by configuration, never hard-coded. */
public final class LoanCalculator {
    private LoanCalculator() { }

    public static LoanQuote quote(Money principal, BigDecimal interestRate, int installmentCount) {
        Objects.requireNonNull(principal, "principal is required");
        Objects.requireNonNull(interestRate, "interest rate is required");
        if (!principal.isPositive() || interestRate.signum() < 0 || installmentCount < 1) {
            throw new IllegalArgumentException("Invalid loan terms");
        }
        var interest = principal.multiply(interestRate);
        var total = principal.add(interest);
        var installment = new Money(total.amount().divide(BigDecimal.valueOf(installmentCount), 0, RoundingMode.HALF_UP));
        return new LoanQuote(principal, interestRate, interest, total, installmentCount, installment);
    }

    public record LoanQuote(Money principal, BigDecimal interestRate, Money interest,
                            Money totalAgreed, int installmentCount, Money regularInstallment) { }
}
