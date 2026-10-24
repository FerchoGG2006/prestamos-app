package com.cartera.ui.util;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

import java.util.Locale;
import java.util.Map;

/**
 * Traducción centralizada de códigos internos a lenguaje comercial para la interfaz.
 * Ninguna pantalla debe mostrar códigos crudos (GASTO_RUTA_DATOS, EGRESO, route-norte…).
 */
public final class UiLabels {

    private UiLabels() {}

    private static final Map<String, String> CASH_CATEGORIES = Map.ofEntries(
            Map.entry("BASE_INICIAL", "Base inicial / Fondeo"),
            Map.entry("RECAUDO_OFICINA", "Entrega de recaudo a oficina"),
            Map.entry("RETIRO_CAJA_PRINCIPAL", "Retiro a caja principal"),
            Map.entry("AJUSTE_ARQUEO", "Ajuste de arqueo"),
            Map.entry("GASTO_GASOLINA", "Gasolina"),
            Map.entry("GASTO_VIATICOS", "Viáticos"),
            Map.entry("GASTO_RUTA_GASOLINA", "Gasolina (ruta)"),
            Map.entry("GASTO_RUTA_PINCHAZO", "Pinchazo / Taller"),
            Map.entry("GASTO_RUTA_DATOS", "Recarga de datos"),
            Map.entry("GASTO_RUTA_VIATICOS", "Peaje / Viáticos"),
            Map.entry("GASTO_RUTA_OTRO", "Gasto operativo de ruta"),
            Map.entry("DESCUENTO_NOMINA_DESCUADRE", "Descuento de nómina"),
            Map.entry("DESEMBOLSO", "Desembolso de crédito"),
            Map.entry("DESEMBOLSO_CREDITO", "Desembolso de crédito"),
            Map.entry("COBRO", "Cobro de cuota"),
            Map.entry("COBRO_CUOTA", "Cobro de cuota"),
            Map.entry("PAGO_CUOTA", "Cobro de cuota"),
            Map.entry("PAPELERIA", "Papelería"),
            Map.entry("OTRO", "Otro")
    );

    /** Etiqueta comercial para una categoría de caja; humaniza códigos desconocidos. */
    public static String cashCategory(String code) {
        if (code == null || code.isBlank()) return "Sin concepto";
        String key = code.trim().toUpperCase(Locale.ROOT);
        String known = CASH_CATEGORIES.get(key);
        return known != null ? known : humanize(key);
    }

    /** Convierte "ALGO_ASI" en "Algo así" de forma legible. */
    public static String humanize(String code) {
        if (code == null || code.isBlank()) return "";
        String s = code.replace('_', ' ').replace('-', ' ').trim().toLowerCase(Locale.forLanguageTag("es-CO"));
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /** Formato "dd/MM/yyyy HH:mm" a partir de una marca ISO; tolera valores incompletos. */
    public static String formatDateTime(String iso) {
        if (iso == null || iso.length() < 10) return "—";
        String date = iso.substring(8, 10) + "/" + iso.substring(5, 7) + "/" + iso.substring(0, 4);
        if (iso.length() >= 16 && iso.charAt(10) == 'T') {
            return date + " " + iso.substring(11, 16);
        }
        return date;
    }

    /** Estado vacío consistente para tablas y listas. */
    public static Node emptyState(String title, String hint) {
        Label t = new Label(title);
        t.getStyleClass().add("empty-title");
        Label h = new Label(hint);
        h.getStyleClass().add("empty-hint");
        h.setWrapText(true);
        VBox box = new VBox(4, t, h);
        box.setAlignment(Pos.CENTER);
        return box;
    }
}
