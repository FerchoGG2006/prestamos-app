package com.cartera.ui.util;

import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;

import java.awt.Desktop;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Utilidad para generar recibos digitales y estados de cuenta formateados para WhatsApp
 * y abrirlos directamente en WhatsApp Web / Desktop (además de copiarlos al portapapeles).
 */
public final class WhatsAppReceiptUtil {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private WhatsAppReceiptUtil() {}

    public static String generatePaymentReceiptMessage(
            String companyName,
            String receiptId,
            String customerName,
            String customerDoc,
            BigDecimal amountPaid,
            BigDecimal remainingBalance,
            int installmentsAffected,
            String paymentMethod,
            String collectorName,
            String dateTimeStr
    ) {
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.toUpperCase() : "SISTEMA DE CARTERA";
        String shortRec = receiptId != null && receiptId.length() > 8 ? receiptId.substring(0, 8).toUpperCase() : (receiptId != null ? receiptId.toUpperCase() : "N/A");
        String dt = (dateTimeStr != null && !dateTimeStr.isBlank())
                ? dateTimeStr
                : LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));

        return "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                "🧾 *COMPROBANTE OFICIAL DE PAGO*\n" +
                "🏢 *" + comp + "*\n" +
                "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                "📅 *Fecha:* " + dt + "\n" +
                "🔢 *Recibo No:* #" + shortRec + "\n" +
                "👤 *Cliente:* " + (customerName != null ? customerName : "Cliente") + "\n" +
                "🪪 *Documento:* " + (customerDoc != null ? customerDoc : "-") + "\n" +
                "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                "✅ *VALOR ABONADO:* *" + CURRENCY.format(amountPaid != null ? amountPaid : BigDecimal.ZERO) + "*\n" +
                "📌 *Cuotas cubiertas:* " + installmentsAffected + "\n" +
                "💳 *Medio de pago:* " + (paymentMethod != null ? paymentMethod : "EFECTIVO") + "\n" +
                "📉 *SALDO RESTANTE:* *" + CURRENCY.format(remainingBalance != null ? remainingBalance : BigDecimal.ZERO) + "*\n" +
                "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
                "🛵 *Atendido por:* " + (collectorName != null ? collectorName : "Cobrador de Ruta") + "\n" +
                "🙏 _¡Gracias por su puntual pago! Conserve este mensaje como comprobante digital._";
    }

    public static String formatAccountStatement(
            String companyName,
            String customerName,
            String customerDoc,
            String loanId,
            BigDecimal principal,
            BigDecimal totalAgreed,
            BigDecimal paid,
            BigDecimal pending,
            int paidInstallments,
            int totalInstallments,
            int overdueInstallments,
            String nextDueDate
    ) {
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.toUpperCase() : "SISTEMA DE CARTERA";
        String shortLoan = loanId != null && loanId.length() > 8 ? loanId.substring(0, 8).toUpperCase() : (loanId != null ? loanId.toUpperCase() : "N/A");

        StringBuilder sb = new StringBuilder();
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("📊 *ESTADO DE CUENTA DE CRÉDITO*\n");
        sb.append("🏢 *").append(comp).append("*\n");
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("👤 *Cliente:* ").append(customerName != null ? customerName : "Cliente").append("\n");
        if (customerDoc != null && !customerDoc.isBlank()) {
            sb.append("🪪 *Documento:* ").append(customerDoc).append("\n");
        }
        sb.append("📄 *Contrato:* #").append(shortLoan).append("\n");
        if (principal != null) {
            sb.append("💰 *Capital Prestado:* ").append(CURRENCY.format(principal)).append("\n");
        }
        sb.append("💵 *Total Pactado:* ").append(CURRENCY.format(totalAgreed != null ? totalAgreed : BigDecimal.ZERO)).append("\n");
        sb.append("✅ *Total Abonado:* ").append(CURRENCY.format(paid != null ? paid : BigDecimal.ZERO)).append("\n");
        sb.append("📉 *SALDO PENDIENTE:* *").append(CURRENCY.format(pending != null ? pending : BigDecimal.ZERO)).append("*\n");
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("📌 *Progreso:* Cuota ").append(paidInstallments).append(" de ").append(totalInstallments).append("\n");

        if (overdueInstallments > 0) {
            sb.append("⚠️ *Estado:* Presenta *").append(overdueInstallments).append(" cuota(s) vencida(s)*.\n");
        } else {
            sb.append("✅ *Estado:* Al día.\n");
        }
        if (nextDueDate != null && !nextDueDate.isBlank() && !"-".equals(nextDueDate)) {
            sb.append("📅 *Próximo Vencimiento:* ").append(nextDueDate).append("\n");
        }
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("_Por favor comuníquese con nosotros para coordinar su abono. ¡Muchas gracias!_");
        return sb.toString();
    }

    public static String generateAccountStatementMessage(
            String companyName,
            String customerName,
            String loanId,
            BigDecimal totalAgreed,
            BigDecimal totalPaid,
            BigDecimal remainingBalance,
            int overdueInstallmentsCount,
            BigDecimal nextInstallmentAmount,
            String nextDueDate
    ) {
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.toUpperCase() : "SISTEMA DE CARTERA";
        String shortLoan = loanId != null && loanId.length() > 8 ? loanId.substring(0, 8).toUpperCase() : (loanId != null ? loanId.toUpperCase() : "N/A");

        StringBuilder sb = new StringBuilder();
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("📊 *ESTADO DE CUENTA DE CRÉDITO*\n");
        sb.append("🏢 *").append(comp).append("*\n");
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("👤 *Cliente:* ").append(customerName != null ? customerName : "Cliente").append("\n");
        sb.append("📄 *Contrato:* #").append(shortLoan).append("\n");
        sb.append("💵 *Total Pactado:* ").append(CURRENCY.format(totalAgreed != null ? totalAgreed : BigDecimal.ZERO)).append("\n");
        sb.append("✅ *Total Abonado:* ").append(CURRENCY.format(totalPaid != null ? totalPaid : BigDecimal.ZERO)).append("\n");
        sb.append("📉 *SALDO PENDIENTE:* *").append(CURRENCY.format(remainingBalance != null ? remainingBalance : BigDecimal.ZERO)).append("*\n");
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        if (overdueInstallmentsCount > 0) {
            sb.append("⚠️ *Estado:* Presenta *").append(overdueInstallmentsCount).append(" cuota(s) vencida(s)*.\n");
        } else {
            sb.append("✅ *Estado:* Al día.\n");
        }
        if (nextInstallmentAmount != null && nextInstallmentAmount.compareTo(BigDecimal.ZERO) > 0) {
            sb.append("🔔 *Valor Cuota a Cobrar:* *").append(CURRENCY.format(nextInstallmentAmount)).append("*\n");
        }
        if (nextDueDate != null && !nextDueDate.isBlank()) {
            sb.append("📅 *Fecha de Vencimiento:* ").append(nextDueDate).append("\n");
        }
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("_Por favor comuníquese con nosotros para coordinar su abono. ¡Muchas gracias!_");
        return sb.toString();
    }

    public static String normalizeColombianPhone(String rawPhone) {
        if (rawPhone == null) return "";
        String digits = rawPhone.replaceAll("[^0-9]", "");
        if (digits.length() == 10 && digits.startsWith("3")) {
            return "57" + digits;
        }
        return digits;
    }

    public static boolean sendViaWhatsApp(String phone, String message) {
        // 1. Copiar al portapapeles como respaldo inmediato
        try {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(message);
            clipboard.setContent(content);
        } catch (Throwable ignored) {
            // Puede ocurrir en entornos headless de pruebas
        }

        // 2. Abrir enlace wa.me en navegador predeterminado / app de WhatsApp
        try {
            String normalizedPhone = normalizeColombianPhone(phone);
            String encodedText = URLEncoder.encode(message, StandardCharsets.UTF_8);
            String url = normalizedPhone.isEmpty()
                    ? "https://wa.me/?text=" + encodedText
                    : "https://wa.me/" + normalizedPhone + "?text=" + encodedText;

            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }
}
