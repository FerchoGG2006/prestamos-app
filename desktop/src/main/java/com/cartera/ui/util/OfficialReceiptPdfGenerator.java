package com.cartera.ui.util;

import com.cartera.receipts.application.OfficialReceiptService.DetailRow;
import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Generador puro de archivos PDF 1.4 estilo fintech para comprobantes oficiales Kredia Desktop.
 * Incrusta el logo real de Kredia (/ui/kredia-logo.jpg) en el pie de página sin dependencias pesadas.
 */
public final class OfficialReceiptPdfGenerator {

    private static final int LOGO_WIDTH = 320;
    private static final int LOGO_HEIGHT = 76;

    private OfficialReceiptPdfGenerator() {}

    public static byte[] generatePdf(OfficialReceiptModel receipt) {
        List<DetailRow> rows = receipt.buildDetailRows();
        double pageW = 340.0;
        double margin = 20.0;
        double cardX = margin;
        double cardW = pageW - margin * 2.0;
        double innerPad = 18.0;
        double valueMaxW = cardW - innerPad * 2.0 - 102.0;

        record WrappedRow(DetailRow row, List<String> valueLines) {}
        List<WrappedRow> wrapped = new ArrayList<>();
        double rowsTotalHeight = 0.0;
        for (DetailRow r : rows) {
            List<String> lines = wrapText(r.value(), valueMaxW, 9.5, r.highlight() || r.danger());
            wrapped.add(new WrappedRow(r, lines));
            rowsTotalHeight += Math.max(20.0, lines.size() * 13.0 + 7.0);
        }

        String footerMsg = receipt.footerMessage() != null ? receipt.footerMessage().trim() : "";
        List<String> footerLines = footerMsg.isEmpty() ? List.of() : wrapText(footerMsg, cardW - 36.0, 8.0, false);
        double footerExtraH = footerLines.isEmpty() ? 0.0 : footerLines.size() * 11.0 + 8.0;

        double headerSectionH = 148.0;
        boolean hasRoute = receipt.routeName() != null && !receipt.routeName().isBlank();
        double ticketHeaderH = hasRoute ? 56.0 : 44.0;
        double ticketFooterH = 74.0 + footerExtraH;
        double ticketBoxH = ticketHeaderH + rowsTotalHeight + ticketFooterH + 18.0;
        double pageH = Math.max(460.0, headerSectionH + ticketBoxH + 38.0);

        boolean isVoid = !"APPROVED".equalsIgnoreCase(receipt.status());
        String statusLabel = "REVERSED".equalsIgnoreCase(receipt.status())
                ? "Anulado"
                : "CANCELLED".equalsIgnoreCase(receipt.status())
                ? "Cancelado"
                : "Aprobado";

        StringBuilder ops = new StringBuilder();
        // Fondo blanco
        ops.append("1 1 1 rg\n");
        ops.append(fmt(0)).append(" ").append(fmt(0)).append(" ").append(fmt(pageW)).append(" ").append(fmt(pageH)).append(" re f\n");

        // Título superior
        drawCenteredText(ops, receipt.title(), pageW, pageH, margin, 30.0, 12.5, true, 0.06, 0.09, 0.16);

        // Círculo estado
        double circleCy = pageH - 58.0;
        if (isVoid) {
            ops.append("0.996 0.949 0.949 rg\n");
            ops.append(circlePath(pageW / 2.0, circleCy, 17.0)).append("f\n");
            ops.append("0.863 0.149 0.149 RG 2.2 w 1 J\n");
            ops.append(fmt(pageW / 2.0 - 5.5)).append(" ").append(fmt(circleCy - 5.5)).append(" m ")
                    .append(fmt(pageW / 2.0 + 5.5)).append(" ").append(fmt(circleCy + 5.5)).append(" l S\n");
            ops.append(fmt(pageW / 2.0 + 5.5)).append(" ").append(fmt(circleCy - 5.5)).append(" m ")
                    .append(fmt(pageW / 2.0 - 5.5)).append(" ").append(fmt(circleCy + 5.5)).append(" l S\n");
        } else {
            ops.append("0.925 0.992 0.961 rg\n");
            ops.append(circlePath(pageW / 2.0, circleCy, 17.0)).append("f\n");
            ops.append("0.020 0.588 0.412 RG 2.2 w 1 J 1 j\n");
            ops.append(fmt(pageW / 2.0 - 6.0)).append(" ").append(fmt(circleCy - 0.5)).append(" m ")
                    .append(fmt(pageW / 2.0 - 1.5)).append(" ").append(fmt(circleCy - 5.0)).append(" l ")
                    .append(fmt(pageW / 2.0 + 6.5)).append(" ").append(fmt(circleCy + 4.5)).append(" l S\n");
        }

        // Monto grande
        String amountStr = WhatsAppReceiptUtil.formatCurrencyPlain(receipt.amount() != null ? receipt.amount() : BigDecimal.ZERO);
        drawCenteredText(ops, amountStr, pageW, pageH, margin, 102.0, 23.0, true, 0.06, 0.09, 0.16);

        // Píldora estado + timestamp
        String ts = receipt.issuedAtDisplay() != null ? receipt.issuedAtDisplay() : "";
        double pillW = isVoid ? 58.0 : 64.0;
        double pillH = 16.0;
        double tsW = approxTextWidth(ts, 8.5, false);
        double groupW = pillW + 8.0 + tsW;
        double groupX = (pageW - groupW) / 2.0;
        double pillTopY = 111.0;

        ops.append(isVoid ? "0.996 0.949 0.949 rg\n" : "0.925 0.992 0.961 rg\n");
        ops.append(roundedRectPath(groupX, pageH - (pillTopY + pillH), pillW, pillH, 8.0)).append("f\n");
        double statusW = approxTextWidth(statusLabel, 8.5, true);
        drawText(ops, statusLabel, groupX + (pillW - statusW) / 2.0, pageH - (pillTopY + 11.2), 8.5, true,
                isVoid ? 0.863 : 0.02, isVoid ? 0.149 : 0.48, isVoid ? 0.149 : 0.34);
        drawText(ops, ts, groupX + pillW + 8.0, pageH - (pillTopY + 11.2), 8.5, false, 0.42, 0.47, 0.54);

        if (receipt.subtitle() != null && !receipt.subtitle().isBlank()) {
            drawCenteredText(ops, receipt.subtitle(), pageW, pageH, margin, 141.0, 9.2, false, 0.35, 0.41, 0.49);
        }

        // Tarjeta interna
        double boxTopY = headerSectionH + 4.0;
        ops.append("0.976 0.980 0.988 rg\n0.886 0.910 0.941 RG 0.8 w\n");
        ops.append(roundedRectPath(cardX, pageH - (boxTopY + ticketBoxH), cardW, ticketBoxH, 14.0)).append("B\n");

        // Oficina arriba (Opción 2A)
        double cursorY = boxTopY + 24.0;
        String comp = (receipt.companyName() != null && !receipt.companyName().isBlank())
                ? receipt.companyName().trim().toUpperCase(Locale.ROOT)
                : "KREDIA";
        drawCenteredText(ops, comp, pageW, pageH, margin, cursorY, 11.5, true, 0.06, 0.09, 0.16);
        if (hasRoute) {
            cursorY += 13.0;
            drawCenteredText(ops, receipt.routeName(), pageW, pageH, margin, cursorY, 8.5, false, 0.42, 0.47, 0.54);
        }

        // Línea punteada 1
        cursorY += 12.0;
        ops.append("q 0.82 0.85 0.89 RG 0.8 w [3 3] 0 d\n")
                .append(fmt(cardX + innerPad)).append(" ").append(fmt(pageH - cursorY)).append(" m ")
                .append(fmt(cardX + cardW - innerPad)).append(" ").append(fmt(pageH - cursorY)).append(" l S Q\n");

        // Filas detalle
        cursorY += 18.0;
        for (WrappedRow wr : wrapped) {
            DetailRow r = wr.row();
            drawText(ops, r.label(), cardX + innerPad, pageH - cursorY, 9.2, false, 0.45, 0.50, 0.58);
            double vr = r.danger() ? 0.82 : r.highlight() ? 0.02 : 0.08;
            double vg = r.danger() ? 0.15 : r.highlight() ? 0.45 : 0.12;
            double vb = r.danger() ? 0.15 : r.highlight() ? 0.34 : 0.20;
            boolean bold = r.highlight() || r.danger();
            for (int i = 0; i < wr.valueLines().size(); i++) {
                String line = wr.valueLines().get(i);
                double w = approxTextWidth(line, 9.4, bold);
                drawText(ops, line, (cardX + cardW - innerPad) - w, pageH - (cursorY + i * 13.0), 9.4, bold, vr, vg, vb);
            }
            cursorY += Math.max(20.0, wr.valueLines().size() * 13.0 + 7.0);
        }

        // Línea punteada 2
        cursorY += 2.0;
        ops.append("q 0.82 0.85 0.89 RG 0.8 w [3 3] 0 d\n")
                .append(fmt(cardX + innerPad)).append(" ").append(fmt(pageH - cursorY)).append(" m ")
                .append(fmt(cardX + cardW - innerPad)).append(" ").append(fmt(pageH - cursorY)).append(" l S Q\n");

        // Footer Kredia Logo (Opción 2A)
        cursorY += 15.0;
        drawCenteredText(ops, "Comprobante oficial verificado por", pageW, pageH, margin, cursorY, 8.0, false, 0.45, 0.50, 0.58);

        byte[] logoBytes = loadLogoJpegBytes();
        double logoDrawW = 76.0;
        double logoDrawH = logoDrawW * ((double) LOGO_HEIGHT / (double) LOGO_WIDTH);
        double logoX = (pageW - logoDrawW) / 2.0;
        double logoTopY = cursorY + 7.0;

        if (logoBytes != null && logoBytes.length > 0) {
            ops.append("1 1 1 rg\n");
            ops.append(roundedRectPath(logoX - 8.0, pageH - (logoTopY + logoDrawH + 5.0), logoDrawW + 16.0, logoDrawH + 10.0, 6.0)).append("f\n");
            ops.append("q\n")
                    .append(fmt(logoDrawW)).append(" 0 0 ").append(fmt(logoDrawH)).append(" ")
                    .append(fmt(logoX)).append(" ").append(fmt(pageH - (logoTopY + logoDrawH))).append(" cm\n")
                    .append("/Im1 Do\nQ\n");
        } else {
            drawCenteredText(ops, "Kredia", pageW, pageH, margin, logoTopY + 14.0, 14.0, true, 0.06, 0.09, 0.16);
        }

        if (!footerLines.isEmpty()) {
            double fy = logoTopY + logoDrawH + 16.0;
            for (String fl : footerLines) {
                drawCenteredText(ops, fl, pageW, pageH, margin, fy, 7.8, false, 0.42, 0.47, 0.54);
                fy += 10.5;
            }
        }

        byte[] contentBytes = ops.toString().getBytes(StandardCharsets.ISO_8859_1);
        return assemblePdf(pageW, pageH, contentBytes, logoBytes);
    }

    private static byte[] assemblePdf(double pageW, double pageH, byte[] contentBytes, byte[] logoBytes) {
        List<byte[]> objects = new ArrayList<>();
        objects.add(ascii("<< /Type /Catalog /Pages 2 0 R >>"));
        objects.add(ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));

        boolean hasLogo = logoBytes != null && logoBytes.length > 0;
        if (hasLogo) {
            objects.add(ascii(String.format(Locale.US,
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] "
                            + "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> "
                            + "/Contents 7 0 R >>", pageW, pageH)));
        } else {
            objects.add(ascii(String.format(Locale.US,
                    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] "
                            + "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> "
                            + "/Contents 6 0 R >>", pageW, pageH)));
        }
        objects.add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
        objects.add(ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));

        if (hasLogo) {
            ByteArrayOutputStream imgObj = new ByteArrayOutputStream();
            imgObj.writeBytes(ascii(String.format(Locale.US,
                    "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB "
                            + "/BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n",
                    LOGO_WIDTH, LOGO_HEIGHT, logoBytes.length)));
            imgObj.writeBytes(logoBytes);
            imgObj.writeBytes(ascii("\nendstream"));
            objects.add(imgObj.toByteArray());
        }

        ByteArrayOutputStream contentObj = new ByteArrayOutputStream();
        contentObj.writeBytes(ascii("<< /Length " + contentBytes.length + " >>\nstream\n"));
        contentObj.writeBytes(contentBytes);
        contentObj.writeBytes(ascii("endstream"));
        objects.add(contentObj.toByteArray());

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[]{'%', 'P', 'D', 'F', '-', '1', '.', '4', '\n', '%', (byte) 0xE2, (byte) 0xE3, (byte) 0xCF, (byte) 0xD3, '\n'});

        List<Integer> offsets = new ArrayList<>();
        for (int i = 0; i < objects.size(); i++) {
            offsets.add(out.size());
            out.writeBytes(ascii((i + 1) + " 0 obj\n"));
            out.writeBytes(objects.get(i));
            out.writeBytes(ascii("\nendobj\n"));
        }

        int xrefOffset = out.size();
        StringBuilder xref = new StringBuilder();
        xref.append("xref\n0 ").append(objects.size() + 1).append("\n0000000000 65535 f \n");
        for (int off : offsets) {
            xref.append(String.format(Locale.US, "%010d 00000 n \n", off));
        }
        xref.append("trailer\n<< /Size ").append(objects.size() + 1)
                .append(" /Root 1 0 R >>\nstartxref\n").append(xrefOffset).append("\n%%EOF\n");
        out.writeBytes(ascii(xref.toString()));
        return out.toByteArray();
    }

    private static byte[] loadLogoJpegBytes() {
        try (InputStream is = OfficialReceiptPdfGenerator.class.getResourceAsStream("/ui/kredia-logo.jpg")) {
            if (is != null) {
                return is.readAllBytes();
            }
        } catch (Exception ignored) {}
        return null;
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.ISO_8859_1);
    }

    private static String fmt(double v) {
        return String.format(Locale.US, "%.2f", v);
    }

    private static void drawText(StringBuilder ops, String text, double x, double pdfY, double size, boolean bold, double r, double g, double b) {
        ops.append("BT\n/")
                .append(bold ? "F2" : "F1").append(" ").append(String.format(Locale.US, "%.1f", size)).append(" Tf\n")
                .append(String.format(Locale.US, "%.3f %.3f %.3f rg\n", r, g, b))
                .append("1 0 0 1 ").append(fmt(x)).append(" ").append(fmt(pdfY)).append(" Tm\n(")
                .append(encodePdfText(text)).append(") Tj\nET\n");
    }

    private static void drawCenteredText(StringBuilder ops, String text, double pageW, double pageH, double margin, double topY, double size, boolean bold, double r, double g, double b) {
        double w = approxTextWidth(text, size, bold);
        double x = Math.max(margin, (pageW - w) / 2.0);
        drawText(ops, text, x, pageH - topY, size, bold, r, g, b);
    }

    private static String encodePdfText(String raw) {
        if (raw == null) return "";
        String normalized = raw
                .replace('\u2013', '-')
                .replace('\u2014', '-')
                .replace('\u2018', '\'')
                .replace('\u2019', '\'')
                .replace('\u201C', '"')
                .replace('\u201D', '"')
                .replace('\u00A0', ' ')
                .replace('\u202F', ' ')
                .replace('\u2022', '\u00B7');
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < normalized.length(); i++) {
            char c = normalized.charAt(i);
            if (c == '(' || c == ')' || c == '\\') {
                sb.append('\\').append(c);
            } else if (c >= 0x20 && c <= 0x7E) {
                sb.append(c);
            } else if (c >= 0xA0 && c <= 0xFF) {
                sb.append(String.format(Locale.US, "\\%03o", (int) c));
            } else {
                sb.append(' ');
            }
        }
        return sb.toString();
    }

    private static double approxTextWidth(String text, double fontSize, boolean bold) {
        if (text == null) return 0.0;
        double units = 0.0;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if ("ilI1.,:;|!· ".indexOf(ch) >= 0) units += 0.28;
            else if ("mwMW@%".indexOf(ch) >= 0) units += 0.85;
            else if (ch >= 'A' && ch <= 'Z') units += 0.68;
            else if (ch >= '0' && ch <= '9') units += 0.56;
            else units += 0.53;
        }
        return units * fontSize * (bold ? 1.04 : 1.0);
    }

    private static List<String> wrapText(String text, double maxWidth, double fontSize, boolean bold) {
        if (text == null || text.isBlank()) return List.of("");
        String[] words = text.trim().split("\\s+");
        List<String> lines = new ArrayList<>();
        String current = words[0];
        for (int i = 1; i < words.length; i++) {
            String candidate = current + " " + words[i];
            if (approxTextWidth(candidate, fontSize, bold) <= maxWidth) {
                current = candidate;
            } else {
                lines.add(current);
                current = words[i];
            }
        }
        lines.add(current);
        return lines;
    }

    private static String roundedRectPath(double x, double y, double w, double h, double r) {
        double k = r * 0.5522847498;
        return fmt(x + r) + " " + fmt(y) + " m\n"
                + fmt(x + w - r) + " " + fmt(y) + " l\n"
                + fmt(x + w - r + k) + " " + fmt(y) + " " + fmt(x + w) + " " + fmt(y + r - k) + " " + fmt(x + w) + " " + fmt(y + r) + " c\n"
                + fmt(x + w) + " " + fmt(y + h - r) + " l\n"
                + fmt(x + w) + " " + fmt(y + h - r + k) + " " + fmt(x + w - r + k) + " " + fmt(y + h) + " " + fmt(x + w - r) + " " + fmt(y + h) + " c\n"
                + fmt(x + r) + " " + fmt(y + h) + " l\n"
                + fmt(x + r - k) + " " + fmt(y + h) + " " + fmt(x) + " " + fmt(y + h - r + k) + " " + fmt(x) + " " + fmt(y + h - r) + " c\n"
                + fmt(x) + " " + fmt(y + r) + " l\n"
                + fmt(x) + " " + fmt(y + r - k) + " " + fmt(x + r - k) + " " + fmt(y) + " " + fmt(x + r) + " " + fmt(y) + " c\n";
    }

    private static String circlePath(double cx, double cy, double r) {
        double k = r * 0.5522847498;
        return fmt(cx + r) + " " + fmt(cy) + " m\n"
                + fmt(cx + r) + " " + fmt(cy + k) + " " + fmt(cx + k) + " " + fmt(cy + r) + " " + fmt(cx) + " " + fmt(cy + r) + " c\n"
                + fmt(cx - k) + " " + fmt(cy + r) + " " + fmt(cx - r) + " " + fmt(cy + k) + " " + fmt(cx - r) + " " + fmt(cy) + " c\n"
                + fmt(cx - r) + " " + fmt(cy - k) + " " + fmt(cx - k) + " " + fmt(cy - r) + " " + fmt(cx) + " " + fmt(cy - r) + " c\n"
                + fmt(cx + k) + " " + fmt(cy - r) + " " + fmt(cx + r) + " " + fmt(cy - k) + " " + fmt(cx + r) + " " + fmt(cy) + " c\n";
    }
}
