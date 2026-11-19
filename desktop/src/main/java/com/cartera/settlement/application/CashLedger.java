package com.cartera.settlement.application;

import com.cartera.payments.domain.PaymentMethods;

import com.cartera.infrastructure.persistence.entity.*;
import java.util.*;
import java.util.stream.Collectors;

/** Read-time account classification preserves legacy ledger rows and their payment references. */
public final class CashLedger {
    private CashLedger() { }
    public static Map<String, PaymentEntity> index(List<PaymentEntity> payments) {
        return payments.stream().collect(Collectors.toMap(PaymentEntity::getId, p -> p));
    }
    public static boolean isPhysical(CashMovementEntity movement, Map<String, PaymentEntity> payments) {
        if ("DESCUENTO_NOMINA_DESCUADRE".equals(movement.getCategory())) return false;
        if ("PAGO_CUOTA".equals(movement.getCategory()) || "ANULACION_PAGO".equals(movement.getCategory())) {
            var payment = payments.get(movement.getReferenceId());
            if (payment == null) throw new IllegalStateException("Movimiento de pago sin comprobante: " + movement.getId());
            return PaymentMethods.isCash(payment.getMethod());
        }
        return true;
    }
}
