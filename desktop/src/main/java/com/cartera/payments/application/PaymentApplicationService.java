package com.cartera.payments.application;

import com.cartera.domain.money.Money;
import com.cartera.installments.domain.Installment;
import com.cartera.payments.domain.PaymentAllocation;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Pure domain application service. Persistence later enforces the idempotency key in one transaction. */
public final class PaymentApplicationService {
    public PaymentApplicationResult allocate(Money received, List<Installment> installments, LocalDate paymentDate) {
        if (!received.isPositive()) throw new IllegalArgumentException("Payment must be positive");
        var remaining = received;
        var updated = new ArrayList<Installment>();
        var allocations = new ArrayList<PaymentAllocation>();
        for (var installment : installments.stream().sorted(Comparator.comparing(Installment::number)).toList()) {
            if (!remaining.isPositive() || !installment.pending().isPositive()) { updated.add(installment); continue; }
            var allocated = remaining.min(installment.pending());
            updated.add(installment.apply(allocated, paymentDate));
            allocations.add(new PaymentAllocation(installment.id(), allocated));
            remaining = remaining.subtract(allocated);
        }
        if (remaining.isPositive()) throw new IllegalArgumentException("Payment exceeds pending installments; business policy is pending");
        return new PaymentApplicationResult(List.copyOf(updated), List.copyOf(allocations));
    }
    public record PaymentApplicationResult(List<Installment> installments, List<PaymentAllocation> allocations) { }
}
