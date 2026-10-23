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
        var paperwork = calculatePaperworkFee(principal);
        var netDisbursement = principal.subtract(paperwork);
        return new LoanQuote(principal, interestRate, interest, total, installmentCount, installment, paperwork, netDisbursement);
    }

    /**
     * Calcula el descuento de papelería / cartulina ($5.000 por cada $100.000 de capital).
     * Si el resultado da fracciones intermedias (ej. $13.500, $15.500, $17.500),
     * se redondea hacia arriba al siguiente millar ($1.000):
     * $350.000 -> 5% = $17.500 -> $18.000
     * $270.000 -> 5% = $13.500 -> $14.000
     * $310.000 -> 5% = $15.500 -> $16.000
     * $200.000 -> 5% = $10.000 -> $10.000
     */
    public static Money calculatePaperworkFee(Money principal) {
        return calculatePaperworkFee(principal, BigDecimal.valueOf(5000));
    }

    public static Money calculatePaperworkFee(Money principal, BigDecimal feePer100k) {
        if (principal == null || !principal.isPositive()) {
            return Money.ZERO;
        }
        BigDecimal rate = (feePer100k != null && feePer100k.compareTo(BigDecimal.ZERO) >= 0)
                ? feePer100k
                : BigDecimal.valueOf(5000);
        if (rate.compareTo(BigDecimal.ZERO) == 0) {
            return Money.ZERO;
        }
        BigDecimal rawFee = principal.amount().multiply(rate)
                .divide(BigDecimal.valueOf(100000), 2, RoundingMode.HALF_UP);
        BigDecimal thousands = rawFee.divide(BigDecimal.valueOf(1000), 0, RoundingMode.CEILING);
        return new Money(thousands.multiply(BigDecimal.valueOf(1000)));
    }

    public record LoanQuote(Money principal, BigDecimal interestRate, Money interest,
                            Money totalAgreed, int installmentCount, Money regularInstallment,
                            Money paperworkFee, Money netDisbursement) {
        public LoanQuote(Money principal, BigDecimal interestRate, Money interest,
                         Money totalAgreed, int installmentCount, Money regularInstallment) {
            this(principal, interestRate, interest, totalAgreed, installmentCount, regularInstallment,
                 calculatePaperworkFee(principal), principal.subtract(calculatePaperworkFee(principal)));
        }
    }
}
