package com.cartera.payments.domain;

import java.util.*;

/** Canonical payment methods accepted by native services and imported packages. */
public final class PaymentMethods {
    private PaymentMethods() { }
    public static String normalize(String method) {
        if (method == null || method.isBlank()) return "EFECTIVO";
        return switch (method.trim().toUpperCase(Locale.ROOT)) {
            case "CASH", "EFECTIVO" -> "EFECTIVO";
            case "NEQUI" -> "NEQUI";
            case "TRANSFER", "TRANSFERENCIA", "TRANSF", "TRANSFERNEQUI", "TRANSFERENCIA/NEQUI" -> "TRANSFERENCIA";
            default -> throw new IllegalArgumentException("Medio de pago no soportado: " + method);
        };
    }
    public static boolean isCash(String method) { return "EFECTIVO".equals(normalize(method)); }
}
