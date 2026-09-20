package com.cartera.installments.domain;

import com.cartera.domain.money.Money;
import java.time.LocalDate;
import java.util.UUID;

public record Installment(UUID id, int number, LocalDate dueDate, Money value, Money paid,
                          InstallmentStatus status) {
    public Money pending() { return value.subtract(paid); }
    public Installment apply(Money amount, LocalDate paymentDate) {
        if (!amount.isPositive() || amount.compareTo(pending()) > 0) throw new IllegalArgumentException("Invalid allocation");
        var newPaid = paid.add(amount);
        var newStatus = newPaid.compareTo(value) < 0 ? InstallmentStatus.PARCIAL
                : dueDate.isAfter(paymentDate) ? InstallmentStatus.ADELANTADA : InstallmentStatus.PAGADA;
        return new Installment(id, number, dueDate, value, newPaid, newStatus);
    }
}
