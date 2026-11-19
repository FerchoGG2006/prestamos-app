package com.cartera.payments.domain;

import com.cartera.domain.money.Money;
import java.util.UUID;

/** A persisted child of Payment; it is never merely a serialized UI breakdown. */
public record PaymentAllocation(String installmentId, Money amount) {
    public PaymentAllocation(UUID installmentId, Money amount) { this(installmentId.toString(), amount); }
}
