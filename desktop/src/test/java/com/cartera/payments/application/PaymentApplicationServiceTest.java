package com.cartera.payments.application;

import com.cartera.domain.money.Money;
import com.cartera.installments.domain.Installment;
import com.cartera.installments.domain.InstallmentStatus;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.assertEquals;

class PaymentApplicationServiceTest {
    private final PaymentApplicationService service = new PaymentApplicationService();
    private final LocalDate today = LocalDate.of(2026, 9, 20);
    @Test void preserves_a_partial_installment() {
        var result = service.allocate(Money.of(3_000), List.of(installment(1, today)), today);
        assertEquals(Money.of(3_000), result.installments().getFirst().pending());
        assertEquals(InstallmentStatus.PARCIAL, result.installments().getFirst().status());
    }
    @Test void allocates_one_payment_to_multiple_installments() {
        var result = service.allocate(Money.of(12_000), List.of(installment(1, today), installment(2, today.plusDays(1))), today);
        assertEquals(2, result.allocations().size());
        assertEquals(InstallmentStatus.PAGADA, result.installments().get(0).status());
        assertEquals(InstallmentStatus.ADELANTADA, result.installments().get(1).status());
    }
    private Installment installment(int number, LocalDate dueDate) {
        return new Installment(UUID.randomUUID(), number, dueDate, Money.of(6_000), Money.ZERO, InstallmentStatus.PENDIENTE);
    }
}
