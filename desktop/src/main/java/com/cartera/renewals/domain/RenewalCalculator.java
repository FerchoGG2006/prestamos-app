package com.cartera.renewals.domain;

import com.cartera.domain.money.Money;

public final class RenewalCalculator {
    private RenewalCalculator() { }
    public static RenewalDisbursement calculate(Money newPrincipal, Money priorBalance, Money paperwork) {
        var cash = newPrincipal.subtract(priorBalance).subtract(paperwork);
        if (cash.isNegative()) throw new IllegalArgumentException("Renewal deductions exceed new principal");
        return new RenewalDisbursement(newPrincipal, priorBalance, paperwork, cash);
    }
    public record RenewalDisbursement(Money newPrincipal, Money priorBalanceDeducted,
                                      Money paperworkDeducted, Money actualCashDisbursed) { }
}
