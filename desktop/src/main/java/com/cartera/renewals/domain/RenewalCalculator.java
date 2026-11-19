package com.cartera.renewals.domain;

import com.cartera.domain.money.Money;
import java.math.BigDecimal;
import java.util.Objects;

public final class RenewalCalculator {
    private RenewalCalculator() { }
    public static RenewalDisbursement calculate(Money newPrincipal, Money priorBalance, Money paperwork) {
        Objects.requireNonNull(newPrincipal);
        Objects.requireNonNull(priorBalance);
        Objects.requireNonNull(paperwork);
        if (!newPrincipal.isPositive() || priorBalance.isNegative() || paperwork.isNegative()) {
            throw new IllegalArgumentException("Capital positivo, saldo y papelería no negativos son obligatorios.");
        }
        var cash = newPrincipal.subtract(priorBalance).subtract(paperwork);
        if (cash.isNegative()) throw new IllegalArgumentException("El capital nuevo no cubre el saldo anterior y la papelería.");
        return new RenewalDisbursement(newPrincipal, priorBalance, paperwork, cash);
    }
    public record RenewalDisbursement(Money newPrincipal, Money priorBalanceDeducted,
                                      Money paperworkDeducted, Money actualCashDisbursed) { }

    public static RenewalQuote quote(Money principal, Money priorBalance, Money paperwork,
                                     BigDecimal totalRate, Money cashBefore, Money debtBefore) {
        return quote(principal, priorBalance, paperwork, totalRate, cashBefore, debtBefore, Money.ZERO);
    }
    public static RenewalQuote quote(Money principal, Money priorBalance, Money paperwork,
                                     BigDecimal totalRate, Money cashBefore, Money debtBefore, Money digitalBefore) {
        Objects.requireNonNull(totalRate, "La tasa total del plazo es obligatoria.");
        if (totalRate.signum() < 0) throw new IllegalArgumentException("El interés no puede ser negativo.");
        var disbursement = calculate(principal, priorBalance, paperwork);
        var interest = principal.multiply(totalRate);
        var total = principal.add(interest);
        var cashAfter = cashBefore.subtract(disbursement.actualCashDisbursed()).subtract(paperwork);
        var debtAfter = debtBefore.subtract(priorBalance).add(total);
        return new RenewalQuote(principal, priorBalance, paperwork, disbursement.actualCashDisbursed(),
                interest, total, cashBefore, cashAfter, debtBefore, debtAfter,
                cashBefore.add(debtBefore).add(digitalBefore), cashAfter.add(debtAfter).add(digitalBefore));
    }

    public record RenewalQuote(Money newPrincipal, Money priorBalanceDeducted, Money paperworkDeducted,
                               Money actualCashDisbursed, Money interest, Money totalAgreed,
                               Money cashBefore, Money cashAfter, Money debtBefore, Money debtAfter,
                               Money administrativeBefore, Money administrativeAfter) { }
}
