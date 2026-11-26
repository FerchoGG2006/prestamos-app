package com.cartera.ui.util;

import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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
 * Utilidad para generar comprobantes oficiales con enlace verificable antifraude,
 * recordatorios cortos de crédito y reportes concisos de cuadre diario para WhatsApp.
 */
public final class WhatsAppReceiptUtil {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppReceiptUtil.class);
    public static final String PUBLIC_RECEIPT_BASE_URL = "https://cartera-movil.expo.app";

    private WhatsAppReceiptUtil() {}

    /**
     * Formatea moneda COP con espacio ASCII normal (evita \u00A0 que rompe negritas en WhatsApp y PDF).
     */
    public static String formatCurrencyPlain(BigDecimal amount) {
        NumberFormat nf = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
        nf.setMaximumFractionDigits(0);
        BigDecimal safe = amount != null ? amount : BigDecimal.ZERO;
        return nf.format(safe).replace('\u00A0', ' ').replace('\u202F', ' ').replaceAll("\\s+", " ").trim();
    }

    public static String buildOfficialReceiptUrl(String receiptCode) {
        String clean = receiptCode != null ? receiptCode.trim().toUpperCase(Locale.ROOT) : "";
        return PUBLIC_RECEIPT_BASE_URL + "/?r=" + URLEncoder.encode(clean, StandardCharsets.UTF_8);
    }

    /**
     * Genera mensaje antifraude para WhatsApp (1 toque al chat exacto del cliente).
     * Cuando el comprobante está publicado en nube (KRD-...), solo envía el enlace oficial inalterable sin cifras editables.
     */
    public static String formatOfficialReceiptWhatsAppMessage(OfficialReceiptModel receipt) {
        if (receipt == null) return "";
        String office = (receipt.companyName() != null && !receipt.companyName().isBlank())
                ? receipt.companyName().trim()
                : "Kredia";
        if (receipt.cloudVerified() && receipt.receiptCode() != null && receipt.receiptCode().startsWith("KRD-")) {
            return "*" + receipt.title() + " — " + office + "*\n"
                    + "Ver comprobante oficial y descargar PDF:\n"
                    + buildOfficialReceiptUrl(receipt.receiptCode());
        }

        // Respaldo offline corto
        StringBuilder sb = new StringBuilder();
        sb.append("*").append(receipt.title()).append(" — ").append(office).append("*\n");
        sb.append("Fecha: ").append(receipt.issuedAtDisplay() != null ? receipt.issuedAtDisplay() : "").append("\n");
        String type = receipt.receiptType() != null ? receipt.receiptType().toUpperCase(Locale.ROOT) : "PAYMENT";
        if ("PAYMENT".equals(type)) {
            sb.append("Pagó: ").append(formatCurrencyPlain(receipt.amount())).append("\n");
            BigDecimal rem = receipt.remainingBalance() != null ? receipt.remainingBalance().max(BigDecimal.ZERO) : BigDecimal.ZERO;
            sb.append("Saldo: ").append(formatCurrencyPlain(rem)).append("\n");
            if (receipt.installmentLabel() != null && !receipt.installmentLabel().isBlank()) {
                sb.append(receipt.installmentLabel()).append("\n");
            }
            if (rem.compareTo(BigDecimal.ZERO) <= 0) {
                sb.append("*Crédito cancelado. ¡Gracias!*\n");
            }
        } else if ("LOAN".equals(type)) {
            sb.append("Capital: ").append(formatCurrencyPlain(receipt.principal() != null ? receipt.principal() : receipt.amount())).append("\n");
            if (receipt.totalAgreed() != null) {
                sb.append("Total a pagar: ").append(formatCurrencyPlain(receipt.totalAgreed())).append("\n");
            }
            if (receipt.installmentAmount() != null && receipt.installmentAmount().compareTo(BigDecimal.ZERO) > 0) {
                sb.append("Cuota: ").append(formatCurrencyPlain(receipt.installmentAmount())).append("\n");
            }
        } else {
            if (receipt.principal() != null) {
                sb.append("Nuevo capital: ").append(formatCurrencyPlain(receipt.principal())).append("\n");
            }
            sb.append("Entregado neto: ").append(formatCurrencyPlain(receipt.netCashDelivered() != null ? receipt.netCashDelivered() : receipt.amount())).append("\n");
            if (receipt.totalAgreed() != null) {
                sb.append("Nuevo total: ").append(formatCurrencyPlain(receipt.totalAgreed())).append("\n");
            }
        }
        sb.append("Ref: ").append(receipt.receiptCode() != null ? receipt.receiptCode() : "LOCAL").append(" (Verificado por Kredia)");
        return sb.toString();
    }

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
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.trim() : "Kredia";
        String shortRec = receiptId != null && receiptId.length() > 8 ? receiptId.substring(0, 8).toUpperCase() : (receiptId != null ? receiptId.toUpperCase() : "N/A");
        String dt = (dateTimeStr != null && !dateTimeStr.isBlank())
                ? dateTimeStr
                : LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yy HH:mm"));
        BigDecimal safeBalance = remainingBalance != null ? remainingBalance.max(BigDecimal.ZERO) : BigDecimal.ZERO;

        StringBuilder sb = new StringBuilder();
        sb.append("*Comprobante de pago — ").append(comp).append("*\n");
        sb.append("Fecha: ").append(dt).append(" · Ref: #").append(shortRec).append("\n");
        sb.append("Pagó: ").append(formatCurrencyPlain(amountPaid)).append(" (").append(paymentMethod != null ? paymentMethod : "Efectivo").append(")\n");
        sb.append("*Saldo pendiente:* ").append(formatCurrencyPlain(safeBalance));
        if (safeBalance.compareTo(BigDecimal.ZERO) <= 0) {
            sb.append("\n*¡Crédito cancelado! Gracias por su pago.*");
        }
        return sb.toString();
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
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.trim() : "Kredia";
        StringBuilder sb = new StringBuilder();
        sb.append("*Resumen de crédito — ").append(comp).append("*\n");
        sb.append("Cuotas pagadas: ").append(paidInstallments).append("/").append(Math.max(1, totalInstallments)).append("\n");
        sb.append("*Saldo pendiente:* ").append(formatCurrencyPlain(pending != null ? pending.max(BigDecimal.ZERO) : BigDecimal.ZERO));
        if (overdueInstallments > 0) {
            sb.append("\n*Mora:* ").append(overdueInstallments).append(" cuota(s) vencida(s)");
        } else if (nextDueDate != null && !nextDueDate.isBlank() && !"-".equals(nextDueDate)) {
            sb.append("\nPróximo cobro: ").append(nextDueDate);
        }
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
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.trim() : "Kredia";
        StringBuilder sb = new StringBuilder();
        sb.append("*Resumen de crédito — ").append(comp).append("*\n");
        if (nextInstallmentAmount != null && nextInstallmentAmount.compareTo(BigDecimal.ZERO) > 0) {
            sb.append("Cuota: ").append(formatCurrencyPlain(nextInstallmentAmount)).append("\n");
        }
        sb.append("*Saldo pendiente:* ").append(formatCurrencyPlain(remainingBalance != null ? remainingBalance.max(BigDecimal.ZERO) : BigDecimal.ZERO));
        if (overdueInstallmentsCount > 0) {
            sb.append("\n*Mora:* ").append(overdueInstallmentsCount).append(" cuota(s) vencida(s)");
        } else if (nextDueDate != null && !nextDueDate.isBlank()) {
            sb.append("\nPróximo cobro: ").append(nextDueDate);
        }
        return sb.toString();
    }

    public static String generateDailySettlementMessage(
            String companyName,
            String routeName,
            String dateStr,
            String collectorName,
            BigDecimal totalCollected,
            BigDecimal collectedInCash,
            BigDecimal collectedDigitally,
            BigDecimal openingRouteBase,
            BigDecimal routeExpenses,
            BigDecimal netExpectedCash,
            boolean isClosed,
            BigDecimal actualDelivered,
            BigDecimal cashDifference,
            BigDecimal withdrawToOffice,
            BigDecimal projectedTomorrowBase,
            String notes,
            String denominationsBlock
    ) {
        String comp = (companyName != null && !companyName.isBlank()) ? companyName.trim() : "Kredia";
        String route = (routeName != null && !routeName.isBlank()) ? routeName.trim() : "Ruta";
        StringBuilder sb = new StringBuilder();
        sb.append("*Cuadre ").append(route).append(" — ").append(comp).append("*\n");
        sb.append("Fecha: ").append(dateStr != null ? dateStr : "").append(" · ").append(isClosed ? "Cerrado" : "En curso").append("\n");
        sb.append("Cobrador: ").append(collectorName != null ? collectorName : "Cobrador").append("\n");
        sb.append("Cobrado: ").append(formatCurrencyPlain(totalCollected))
                .append(" (Efec ").append(formatCurrencyPlain(collectedInCash))
                .append(" · Dig ").append(formatCurrencyPlain(collectedDigitally)).append(")\n");
        sb.append("Base inicio: ").append(formatCurrencyPlain(openingRouteBase))
                .append(" · Gastos: ").append(formatCurrencyPlain(routeExpenses)).append("\n");
        sb.append("*A entregar:* ").append(formatCurrencyPlain(netExpectedCash));
        if (isClosed && actualDelivered != null) {
            sb.append(" (Entregado ").append(formatCurrencyPlain(actualDelivered));
            if (cashDifference != null) {
                sb.append(" · Dif ").append(formatCurrencyPlain(cashDifference));
            }
            sb.append(")");
        }
        if (withdrawToOffice != null && withdrawToOffice.compareTo(BigDecimal.ZERO) > 0) {
            sb.append("\nRetiro a oficina: ").append(formatCurrencyPlain(withdrawToOffice));
        }
        if (projectedTomorrowBase != null && !isClosed) {
            sb.append("\nBase mañana: ").append(formatCurrencyPlain(projectedTomorrowBase));
        }
        if (notes != null && !notes.isBlank()) {
            sb.append("\nObs: ").append(notes.trim());
        }
        if (denominationsBlock != null && !denominationsBlock.isBlank()) {
            sb.append("\n").append(denominationsBlock.trim());
        }
        return sb.toString();
    }

    public static String normalizeColombianPhone(String rawPhone) {
        if (rawPhone == null) return "";
        String digits = rawPhone.replaceAll("[^0-9]", "");
        if (digits.length() < 7) {
            return "";
        }
        if (digits.length() == 10 && digits.startsWith("3")) {
            return "57" + digits;
        }
        return digits;
    }

    public static boolean sendViaWhatsApp(String phone, String message) {
        String safeMessage = message != null ? message : "";
        try {
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(safeMessage);
            clipboard.setContent(content);
        } catch (Throwable ignored) {
            // Headless tests
        }

        try {
            String normalizedPhone = normalizeColombianPhone(phone);
            String encodedText = URLEncoder.encode(safeMessage, StandardCharsets.UTF_8).replace("+", "%20");
            String url = normalizedPhone.isEmpty()
                    ? "https://wa.me/?text=" + encodedText
                    : "https://wa.me/" + normalizedPhone + "?text=" + encodedText;

            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
                return true;
            }
        } catch (Exception ex) {
            log.warn("No se pudo abrir WhatsApp automáticamente: {}", ex.getMessage());
        }
        return false;
    }
}
