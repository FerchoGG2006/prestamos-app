package com.cartera.ui.views;

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
 * Diálogo modal para visualizar, imprimir o compartir el comprobante de cobro oficial.
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
            String companyPhone
    ) {}

    private final ReceiptData data;

    public ReceiptDialog(ReceiptData data, Stage ownerStage) {
        this.data = data;

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Comprobante de Pago #" + (data.receiptId().length() > 8 ? data.receiptId().substring(0, 8) : data.receiptId()));
        setResizable(false);

        buildUI();
    }

    private void buildUI() {
        VBox root = new VBox(16);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #0f172a;");
        root.setPrefWidth(420);

        // Tarjeta estilo Ticket Térmico
        VBox ticketCard = new VBox(8);
        ticketCard.setAlignment(Pos.CENTER);
        ticketCard.setPadding(new Insets(20));
        ticketCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 8; -fx-effect: dropshadow(gaussian, rgba(0,0,0,0.5), 15, 0, 0, 4);");

        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss"));

        Label company = new Label(data.companyName() != null && !data.companyName().isBlank() ? data.companyName().toUpperCase() : "SISTEMA DE CARTERA");
        company.setStyle("-fx-text-fill: #111827; -fx-font-weight: bold; -fx-font-size: 15px; -fx-font-family: 'Consolas', monospace;");

        Label sub = new Label("RECIBO OFICIAL DE COBRO");
        sub.setStyle("-fx-text-fill: #4b5563; -fx-font-size: 11px; -fx-font-family: 'Consolas', monospace;");

        Label divider1 = new Label("----------------------------------------");
        divider1.setStyle("-fx-text-fill: #9ca3af; -fx-font-family: 'Consolas', monospace;");

        VBox details = new VBox(4);
        details.setAlignment(Pos.CENTER_LEFT);
        details.getChildren().addAll(
                createTicketLine("Fecha/Hora:", now),
                createTicketLine("Recibo No:", data.receiptId().substring(0, Math.min(8, data.receiptId().length())).toUpperCase()),
                createTicketLine("Cliente:", data.customerName()),
                createTicketLine("Documento:", data.customerDoc()),
                createTicketLine("Método:", data.paymentMethod()),
                createTicketLine("Cobrador:", data.collectorName())
        );

        Label divider2 = new Label("----------------------------------------");
        divider2.setStyle("-fx-text-fill: #9ca3af; -fx-font-family: 'Consolas', monospace;");

        VBox financial = new VBox(4);
        financial.setAlignment(Pos.CENTER_LEFT);
        financial.getChildren().addAll(
                createTicketLine("VALOR PAGADO:", CURRENCY.format(data.amountPaid()), true),
                createTicketLine("Cuotas aplicadas:", String.valueOf(data.installmentsAffected())),
                createTicketLine("SALDO RESTANTE:", CURRENCY.format(data.remainingBalance()), true)
        );

        Label divider3 = new Label("----------------------------------------");
        divider3.setStyle("-fx-text-fill: #9ca3af; -fx-font-family: 'Consolas', monospace;");

        Label footer = new Label("¡Gracias por su puntual cumplimiento!\nConserve este recibo como soporte.");
        footer.setStyle("-fx-text-fill: #6b7280; -fx-font-size: 10px; -fx-text-alignment: center; -fx-font-family: 'Consolas', monospace;");

        ticketCard.getChildren().addAll(company, sub, divider1, details, divider2, financial, divider3, footer);

        // Feedback de copia
        Label lblCopied = new Label();
        lblCopied.setVisible(false);
        lblCopied.setManaged(false);

        // Botones de acción
        HBox actions = new HBox(10);
        actions.setAlignment(Pos.CENTER);

        Button btnPrint = new Button("Imprimir Recibo");
        btnPrint.getStyleClass().add("btn-primary");
        btnPrint.setOnAction(e -> printTicket(ticketCard));

        Button btnCopy = new Button("Copiar Texto");
        btnCopy.getStyleClass().add("btn-success");
        btnCopy.setOnAction(e -> {
            copyToClipboard(now);
            lblCopied.setText("Texto de recibo copiado al portapapeles.");
            lblCopied.setStyle("-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 6 10; -fx-background-radius: 6;");
            lblCopied.setVisible(true);
            lblCopied.setManaged(true);
        });

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> close());

        actions.getChildren().addAll(btnPrint, btnCopy, btnClose);

        root.getChildren().addAll(ticketCard, lblCopied, actions);

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
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

    private void printTicket(javafx.scene.Node node) {
        PrinterJob job = PrinterJob.createPrinterJob();
        if (job != null) {
            boolean proceed = job.showPrintDialog(this);
            if (proceed) {
                boolean success = job.printPage(node);
                if (success) {
                    job.endJob();
                }
            }
        }
    }

    private void copyToClipboard(String now) {
        String text = String.format("""
                COMPROBANTE DE PAGO
                %s
                ===================================
                Fecha: %s
                Recibo No: %s
                Cliente: %s
                Documento: %s
                Valor Pagado: %s
                Saldo Pendiente: %s
                Cobrador: %s
                ===================================
                Comprobante emitido por el sistema.
                """,
                data.companyName() != null ? data.companyName() : "SISTEMA DE CARTERA",
                now,
                data.receiptId().substring(0, Math.min(8, data.receiptId().length())).toUpperCase(),
                data.customerName(),
                data.customerDoc(),
                CURRENCY.format(data.amountPaid()),
                CURRENCY.format(data.remainingBalance()),
                data.collectorName()
        );

        Clipboard clipboard = Clipboard.getSystemClipboard();
        ClipboardContent content = new ClipboardContent();
        content.putString(text);
        clipboard.setContent(content);
    }
}
