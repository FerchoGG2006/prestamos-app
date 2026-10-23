package com.cartera.ui.util;

import java.math.BigDecimal;

/**
 * Utilitario compartido para el parseo seguro de montos en pesos colombianos (COP) y porcentajes.
 * Interpreta correctamente separadores de miles como "300.000", "$ 300.000", "300,000" o "1.500.000"
 * como valores enteros en miles (300000 / 1500000), nunca como 300 pesos con decimales.
 */
public final class CurrencyInputUtil {

    private CurrencyInputUtil() {
    }

    /**
     * Parsea un texto ingresado por el usuario a {@link BigDecimal}.
     * Soporta formatos como "$ 300.000", "300.000", "300,000", "300000", "15.000,50", "20.5".
     * Si hay un único separador seguido de exactamente 3 dígitos (o múltiples separadores iguales),
     * se interpreta como separador de miles en pesos colombianos.
     *
     * @param input texto del campo de entrada
     * @return valor numérico o {@link BigDecimal#ZERO} si está vacío
     * @throws NumberFormatException si el formato no es numérico válido
     */
    public static BigDecimal parseAmount(String input) {
        if (input == null) {
            return BigDecimal.ZERO;
        }
        String s = input.trim()
                .replace("$", "")
                .replace("COP", "")
                .replace("cop", "")
                .replace(" ", "")
                .replace("\u00a0", "");
        if (s.isEmpty()) {
            return BigDecimal.ZERO;
        }

        int lastDot = s.lastIndexOf('.');
        int lastComma = s.lastIndexOf(',');

        if (lastDot >= 0 && lastComma >= 0) {
            char decimal = lastDot > lastComma ? '.' : ',';
            char group = decimal == '.' ? ',' : '.';
            int digitsAfterDecimal = s.length() - Math.max(lastDot, lastComma) - 1;
            if (digitsAfterDecimal == 3) {
                // Ambos actuando como separadores de miles (ej. "1,500.000")
                s = s.replace(".", "").replace(",", "");
            } else {
                s = s.replace(String.valueOf(group), "").replace(decimal, '.');
            }
        } else if (lastDot >= 0 || lastComma >= 0) {
            char sep = lastDot >= 0 ? '.' : ',';
            int count = (int) s.chars().filter(c -> c == sep).count();
            int digitsAfter = s.length() - s.lastIndexOf(sep) - 1;
            if (count > 1 || digitsAfter == 3) {
                s = s.replace(String.valueOf(sep), "");
            } else {
                s = s.replace(sep, '.');
            }
        }

        return new BigDecimal(s);
    }

    /**
     * Parsea un monto lanzando {@link NumberFormatException} si el texto está vacío.
     */
    public static BigDecimal parseRequiredAmount(String input) {
        if (input == null || input.trim().isEmpty()) {
            throw new NumberFormatException("Monto vacío");
        }
        BigDecimal val = parseAmount(input);
        String stripped = input.replaceAll("[\\s$\\u00a0]", "");
        if (stripped.isEmpty()) {
            throw new NumberFormatException("Monto vacío");
        }
        return val;
    }
}
