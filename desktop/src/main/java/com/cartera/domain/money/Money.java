package com.cartera.domain.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/** Colombian peso values use integral COP in the current rules, but remain BigDecimal by contract. */
public record Money(BigDecimal amount) implements Comparable<Money> {
    public static final Money ZERO = new Money(BigDecimal.ZERO);

    public Money {
        Objects.requireNonNull(amount, "amount is required");
        amount = amount.setScale(0, RoundingMode.HALF_UP);
    }
    public static Money of(long value) { return new Money(BigDecimal.valueOf(value)); }
    public Money add(Money other) { return new Money(amount.add(other.amount)); }
    public Money subtract(Money other) { return new Money(amount.subtract(other.amount)); }
    public Money multiply(BigDecimal multiplier) { return new Money(amount.multiply(multiplier)); }
    public boolean isNegative() { return amount.signum() < 0; }
    public boolean isPositive() { return amount.signum() > 0; }
    public Money min(Money other) { return compareTo(other) <= 0 ? this : other; }
    @Override public int compareTo(Money other) { return amount.compareTo(other.amount); }
}
