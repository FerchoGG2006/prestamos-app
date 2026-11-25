package com.cartera.ui.views;

import com.cartera.ui.util.WhatsAppReceiptUtil;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.print.PrinterJob;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Diálogo modal para visualizar, imprimir y compartir el comprobante digital de cobro por WhatsApp o portapapeles.
 */
public class ReceiptDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public record ReceiptData(
            String receiptId,
            String customerName,
            String customerDoc,
            String loanId,
            BigDecimal amountPaid,
            BigDecimal remainingBalance,
            int installmentsAffected,
            String collectorName,
            String paymentMethod,
            String companyName,
            String customerPhone
    ) {
        public String companyPhone() {
            return customerPhone;
        }
    }

    private final ReceiptData data;
    private final String receiptTimestamp;

    public ReceiptDialog(ReceiptData data, Stage ownerStage) {
        this(data, null, ownerStage);
    }

    public ReceiptDialog(ReceiptData data, String receiptTimestamp, Stage ownerStage) {
        this.data = data;
        this.receiptTimestamp = (receiptTimestamp != null && !receiptTimestamp.isBlank())
                ? receiptTimestamp
                : LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss"));

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        String safeId = data.receiptId() != null ? data.receiptId() : "N/A";
        setTitle("Comprobante Digital de Pago #" + (safeId.length() > 8 ? safeId.substring(0, 8) : safeId));
        setResizable(false);

        buildUI();
    }

    private void buildUI() {
        VBox root = new VBox(16);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #f1f5f9;");
        root.setPrefWidth(460);

        VBox ticketCard = new VBox(8);
        ticketCard.setAlignment(Pos.CENTER);
        ticketCard.setPadding(new Insets(20));
        ticketCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 12; -fx-effect: dropshadow(gaussian, rgba(0,0,0,0.08), 20, 0, 0, 4);");

        String safeId = data.receiptId() != null && !data.receiptId().isBlank() ? data.receiptId() : "N/A";
        String shortId = safeId.substring(0, Math.min(8, safeId.length())).toUpperCase();
        BigDecimal safePaid = data.amountPaid() != null ? data.amountPaid() : BigDecimal.ZERO;
        BigDecimal safeBalance = data.remainingBalance() != null ? data.remainingBalance() : BigDecimal.ZERO;

        Label company = new Label(data.companyName() != null && !data.companyName().isBlank() ? data.companyName().toUpperCase() : "SISTEMA DE CARTERA");
        company.setStyle("-fx-text-fill: #111827; -fx-font-weight: bold; -fx-font-size: 15px; -fx-font-family: 'Consolas', monospace;");

        Label sub = new Label("RECIBO DIGITAL DE COBRO");
        sub.setStyle("-fx-text-fill: #4b5563; -fx-font-size: 11px; -fx-font-family: 'Consolas', monospace;");

        Label divider1 = new Label("----------------------------------------");
        divider1.setStyle("-fx-text-fill: #9ca3af; -fx-font-family: 'Consolas', monospace;");

        VBox details = new VBox(4);
        details.setAlignment(Pos.CENTER_LEFT);
        details.getChildren().addAll(
                createTicketLine("Fecha/Hora:", receiptTimestamp),
                createTicketLine("Recibo No:", shortId),
                createTicketLine("Cliente:", data.customerName() != null ? data.customerName() : "-"),
                createTicketLine("Documento:", data.customerDoc() != null ? data.customerDoc() : "-"),
                createTicketLine("Método:", data.paymentMethod() != null ? data.paymentMethod() : "EFECTIVO"),
                createTicketLine("Cobrador:", data.collectorName() != null ? data.collectorName() : "Cobrador de Ruta")
        );

        Label divider2 = new Label("----------------------------------------");
        divider2.setStyle("-fx-text-fill: #9ca3af; -fx-font-family: 'Consolas', monospace;");

        VBox financial = new VBox(4);
        financial.setAlignment(Pos.CENTER_LEFT);
        financial.getChildren().addAll(
                createTicketLine("VALOR PAGADO:", CURRENCY.format(safePaid), true),
                createTicketLine("Cuotas aplicadas:", String.valueOf(data.installmentsAffected())),
                createTicketLine("SALDO RESTANTE:", CURRENCY.format(safeBalance), true)
        );

        Label divider3 = new Label("----------------------------------------");
        divider3.setStyle("-fx-text-fill: #9ca3af; -fx-font-family: 'Consolas', monospace;");

        Label footer = new Label("¡Gracias por su puntual cumplimiento!\nComprobante digital oficial.");
        footer.setStyle("-fx-text-fill: #6b7280; -fx-font-size: 10px; -fx-text-alignment: center; -fx-font-family: 'Consolas', monospace;");

        ticketCard.getChildren().addAll(company, sub, divider1, details, divider2, financial, divider3, footer);

        Label lblCopied = new Label();
        lblCopied.setVisible(false);
        lblCopied.setManaged(false);
        lblCopied.setWrapText(true);

        HBox actions = new HBox(8);
        actions.setAlignment(Pos.CENTER);

        Button btnWhatsApp = new Button("Enviar WhatsApp");
        btnWhatsApp.setStyle("-fx-background-color: #16a34a; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 12; -fx-background-radius: 8; -fx-cursor: hand;");
        btnWhatsApp.setOnAction(e -> {
            String message = WhatsAppReceiptUtil.generatePaymentReceiptMessage(
                    data.companyName(),
                    safeId,
                    data.customerName(),
                    data.customerDoc(),
                    safePaid,
                    safeBalance,
                    data.installmentsAffected(),
                    data.paymentMethod(),
                    data.collectorName(),
                    receiptTimestamp
            );
            boolean opened = WhatsAppReceiptUtil.sendViaWhatsApp(data.customerPhone(), message);
            if (opened) {
                lblCopied.setText("Recibo copiado y enviado a WhatsApp.");
                lblCopied.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
            } else {
                lblCopied.setText("Texto copiado al portapapeles, pero no se pudo abrir WhatsApp automáticamente. Verifique el número o el navegador.");
                lblCopied.setStyle("-fx-text-fill: #b45309; -fx-background-color: #fffbeb; -fx-border-color: #fde68a; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
            }
            lblCopied.setVisible(true);
            lblCopied.setManaged(true);
        });

        Button btnPrint = new Button("Imprimir");
        btnPrint.getStyleClass().add("btn-secondary");
        btnPrint.setOnAction(e -> {
            try {
                PrinterJob job = PrinterJob.createPrinterJob();
                if (job == null) {
                    lblCopied.setText("No se encontró ninguna impresora disponible en el equipo.");
                    lblCopied.setStyle("-fx-text-fill: #b45309; -fx-background-color: #fffbeb; -fx-border-color: #fde68a; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
                } else if (job.showPrintDialog(this)) {
                    boolean printed = job.printPage(ticketCard);
                    if (printed) {
                        job.endJob();
                        lblCopied.setText("Comprobante enviado a la impresora.");
                        lblCopied.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
                    } else {
                        lblCopied.setText("No se pudo imprimir el comprobante.");
                        lblCopied.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
                    }
                }
            } catch (Exception ex) {
                lblCopied.setText("Error al imprimir: " + ex.getMessage());
                lblCopied.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
            }
            lblCopied.setVisible(true);
            lblCopied.setManaged(true);
        });

        Button btnCopy = new Button("Copiar");
        btnCopy.getStyleClass().add("btn-secondary");
        btnCopy.setOnAction(e -> {
            String message = WhatsAppReceiptUtil.generatePaymentReceiptMessage(
                    data.companyName(),
                    safeId,
                    data.customerName(),
                    data.customerDoc(),
                    safePaid,
                    safeBalance,
                    data.installmentsAffected(),
                    data.paymentMethod(),
                    data.collectorName(),
                    receiptTimestamp
            );
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(message);
            clipboard.setContent(content);

            lblCopied.setText("Recibo copiado al portapapeles.");
            lblCopied.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
            lblCopied.setVisible(true);
            lblCopied.setManaged(true);
        });

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> close());

        actions.getChildren().addAll(btnWhatsApp, btnPrint, btnCopy, btnClose);

        root.getChildren().addAll(ticketCard, lblCopied, actions);

        var scene = new Scene(root);
        var css = getClass().getResource("/ui/theme.css");
        if (css != null) scene.getStylesheets().add(css.toExternalForm());
        setScene(scene);
    }

    private HBox createTicketLine(String label, String value) {
        return createTicketLine(label, value, false);
    }

    private HBox createTicketLine(String label, String value, boolean bold) {
        HBox row = new HBox(8);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #374151; -fx-font-size: 11px; -fx-font-family: 'Consolas', monospace;" + (bold ? " -fx-font-weight: bold;" : ""));

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label v = new Label(value);
        v.setStyle("-fx-text-fill: #111827; -fx-font-size: 11px; -fx-font-family: 'Consolas', monospace;" + (bold ? " -fx-font-weight: bold; -fx-font-size: 12px;" : ""));

        row.getChildren().addAll(l, sp, v);
        return row;
    }
}
