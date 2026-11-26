package com.cartera.ui.views;

import com.cartera.receipts.application.OfficialReceiptService;
import com.cartera.receipts.application.OfficialReceiptService.DetailRow;
import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;
import com.cartera.ui.util.OfficialReceiptPdfGenerator;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.print.PrinterJob;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;

/**
 * Diálogo modal nativo JavaFX estilo fintech (Bemovil/Nequi) para visualizar, publicar en nube,
 * descargar PDF con logo Kredia, imprimir y compartir por WhatsApp en 1 toque comprobantes oficiales
 * de Pago, Nuevo Préstamo y Renovación.
 */
public class ReceiptDialog extends Stage {

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

    private OfficialReceiptModel model;
    private final VBox ticketCard = new VBox(8);
    private final Label lblCloudStatus = new Label();
    private final Label lblFeedback = new Label();
    private final VBox rowsContainer = new VBox(8);

    public ReceiptDialog(ReceiptData data, Stage ownerStage) {
        this(data, null, ownerStage);
    }

    public ReceiptDialog(ReceiptData data, String receiptTimestamp, Stage ownerStage) {
        this(fromLegacyReceiptData(data, receiptTimestamp), ownerStage);
    }

    public ReceiptDialog(OfficialReceiptModel initialModel, Stage ownerStage) {
        this.model = initialModel;

        initModality(Modality.WINDOW_MODAL);
        if (ownerStage != null) {
            initOwner(ownerStage);
        }
        setTitle(model.title() + " · " + (model.receiptCode() != null ? model.receiptCode() : "Kredia"));
        setResizable(false);

        buildUI();

        // Publicar en segundo plano en Supabase si aún no está verificado en la nube
        if (!model.cloudVerified()) {
            lblCloudStatus.setText("Publicando comprobante oficial en la nube...");
            lblCloudStatus.setStyle("-fx-text-fill: #0f766e; -fx-background-color: #ecfdf5; -fx-padding: 4 10; -fx-background-radius: 999; -fx-font-size: 11px; -fx-font-weight: bold;");
            CompletableFuture.supplyAsync(() -> OfficialReceiptService.publishOrFallback(model))
                    .thenAccept(published -> Platform.runLater(() -> {
                        if (published != null) {
                            this.model = published;
                            setTitle(model.title() + " · " + model.receiptCode());
                            refreshDynamicFields();
                        }
                    }));
        }
    }

    private static OfficialReceiptModel fromLegacyReceiptData(ReceiptData d, String ts) {
        String displayTs = (ts != null && !ts.isBlank()) ? ts : OfficialReceiptService.nowDisplay();
        String instLabel = d.installmentsAffected() > 1
                ? d.installmentsAffected() + " cuotas"
                : "Abono de cuota";
        String loanShort = d.loanId() != null && d.loanId().length() > 8
                ? "#" + d.loanId().substring(0, 8).toUpperCase(Locale.ROOT)
                : (d.loanId() != null ? d.loanId() : "");
        return new OfficialReceiptModel(
                OfficialReceiptService.localCode(d.receiptId()),
                "PAYMENT",
                d.receiptId() != null ? d.receiptId() : "pay-local",
                (d.companyName() != null && !d.companyName().isBlank()) ? d.companyName() : "Kredia",
                "",
                d.customerName() != null ? d.customerName() : "Cliente",
                d.customerDoc() != null ? d.customerDoc() : "",
                d.customerPhone() != null ? d.customerPhone() : "",
                loanShort,
                d.amountPaid() != null ? d.amountPaid() : BigDecimal.ZERO,
                "APPROVED",
                displayTs,
                "Pago de cuota · " + instLabel,
                instLabel,
                null,
                d.remainingBalance() != null ? d.remainingBalance().max(BigDecimal.ZERO) : BigDecimal.ZERO,
                d.paymentMethod() != null ? d.paymentMethod() : "EFECTIVO",
                null,
                null,
                0,
                "",
                null,
                null,
                null,
                "",
                "",
                d.collectorName() != null ? d.collectorName() : "",
                "",
                false
        );
    }

    private void buildUI() {
        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #f1f5f9;");
        root.setPrefWidth(460);

        VBox outerShell = new VBox(12);
        outerShell.setAlignment(Pos.CENTER);
        outerShell.setPadding(new Insets(20, 20, 18, 20));
        outerShell.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 20; -fx-border-color: #e2e8f0; -fx-border-radius: 20; -fx-effect: dropshadow(gaussian, rgba(15,23,42,0.08), 18, 0, 0, 6);");

        boolean isVoid = !"APPROVED".equalsIgnoreCase(model.status());
        String statusLabel = "REVERSED".equalsIgnoreCase(model.status())
                ? "Anulado"
                : "CANCELLED".equalsIgnoreCase(model.status())
                ? "Cancelado"
                : "Aprobado";

        Label lblTitle = new Label(model.title());
        lblTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        StackPane checkBadge = new StackPane();
        checkBadge.setMinSize(46, 46);
        checkBadge.setMaxSize(46, 46);
        checkBadge.setStyle(isVoid
                ? "-fx-background-color: #fef2f2; -fx-background-radius: 999;"
                : "-fx-background-color: #ecfdf5; -fx-background-radius: 999;");
        Label checkGlyph = new Label(isVoid ? "!" : "✓");
        checkGlyph.setStyle(isVoid
                ? "-fx-text-fill: #dc2626; -fx-font-size: 22px; -fx-font-weight: bold;"
                : "-fx-text-fill: #059669; -fx-font-size: 22px; -fx-font-weight: bold;");
        checkBadge.getChildren().add(checkGlyph);

        Label lblAmount = new Label(WhatsAppReceiptUtil.formatCurrencyPlain(model.amount()));
        lblAmount.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 28px; -fx-font-weight: bold;");

        HBox statusRow = new HBox(8);
        statusRow.setAlignment(Pos.CENTER);
        Label pill = new Label(statusLabel);
        pill.setStyle(isVoid
                ? "-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 3 10; -fx-background-radius: 999;"
                : "-fx-background-color: #dcfce7; -fx-text-fill: #047857; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 3 10; -fx-background-radius: 999;");
        Label lblTs = new Label(model.issuedAtDisplay() != null ? model.issuedAtDisplay() : "");
        lblTs.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11.5px; -fx-font-weight: bold;");
        statusRow.getChildren().addAll(pill, lblTs);

        VBox hero = new VBox(6, lblTitle, checkBadge, lblAmount, statusRow);
        hero.setAlignment(Pos.CENTER);
        if (model.subtitle() != null && !model.subtitle().isBlank()) {
            Label lblSub = new Label(model.subtitle());
            lblSub.setStyle("-fx-text-fill: #475569; -fx-font-size: 12px;");
            hero.getChildren().add(lblSub);
        }

        // Tarjeta interna (Oficina arriba + filas 2 columnas + Logo Kredia en el footer)
        ticketCard.setAlignment(Pos.CENTER);
        ticketCard.setPadding(new Insets(14, 16, 14, 16));
        ticketCard.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 14; -fx-border-color: #e2e8f0; -fx-border-radius: 14;");

        String officeTitle = (model.companyName() != null && !model.companyName().isBlank())
                ? model.companyName().trim().toUpperCase(Locale.ROOT)
                : "KREDIA";
        Label lblOffice = new Label(officeTitle);
        lblOffice.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");
        ticketCard.getChildren().add(lblOffice);
        if (model.routeName() != null && !model.routeName().isBlank()) {
            Label lblRoute = new Label(model.routeName());
            lblRoute.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
            ticketCard.getChildren().add(lblRoute);
        }

        ticketCard.getChildren().add(createDashedDivider());
        ticketCard.getChildren().add(rowsContainer);
        ticketCard.getChildren().add(createDashedDivider());

        // Footer con logo real de Kredia
        VBox footerBox = new VBox(5);
        footerBox.setAlignment(Pos.CENTER);
        Label lblVerif = new Label("Comprobante oficial verificado por");
        lblVerif.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10.5px;");
        footerBox.getChildren().add(lblVerif);

        try (InputStream is = getClass().getResourceAsStream("/ui/kredia.png")) {
            if (is != null) {
                ImageView logoView = new ImageView(new Image(is));
                logoView.setFitWidth(94);
                logoView.setPreserveRatio(true);
                logoView.setSmooth(true);
                footerBox.getChildren().add(logoView);
            } else {
                Label fallbackBrand = new Label("Kredia");
                fallbackBrand.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");
                footerBox.getChildren().add(fallbackBrand);
            }
        } catch (Exception ignored) {
            Label fallbackBrand = new Label("Kredia");
            fallbackBrand.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");
            footerBox.getChildren().add(fallbackBrand);
        }

        footerBox.getChildren().add(lblCloudStatus);
        if (model.footerMessage() != null && !model.footerMessage().isBlank()) {
            Label lblCustomFooter = new Label(model.footerMessage());
            lblCustomFooter.setWrapText(true);
            lblCustomFooter.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10.5px; -fx-text-alignment: center;");
            footerBox.getChildren().add(lblCustomFooter);
        }
        ticketCard.getChildren().add(footerBox);

        outerShell.getChildren().addAll(hero, ticketCard);

        refreshDynamicFields();

        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);
        lblFeedback.setWrapText(true);

        // Botones de acción
        Button btnWhatsApp = new Button("Enviar por WhatsApp");
        btnWhatsApp.setMaxWidth(Double.MAX_VALUE);
        btnWhatsApp.setStyle("-fx-background-color: #16a34a; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 13px; -fx-padding: 10 14; -fx-background-radius: 10; -fx-cursor: hand;");
        btnWhatsApp.setOnAction(e -> {
            String message = WhatsAppReceiptUtil.formatOfficialReceiptWhatsAppMessage(model);
            boolean opened = WhatsAppReceiptUtil.sendViaWhatsApp(model.customerPhone(), message);
            if (opened) {
                showFeedback(model.cloudVerified()
                        ? "Chat del cliente abierto con el enlace oficial inalterable."
                        : "Chat abierto en modo respaldo local (sin conexión a nube).", false);
            } else {
                showFeedback("Mensaje copiado al portapapeles. Verifique el número o navegador para abrir WhatsApp.", true);
            }
        });

        HBox secondaryActions = new HBox(8);
        secondaryActions.setAlignment(Pos.CENTER);

        Button btnPdf = new Button("Descargar PDF");
        btnPdf.setStyle("-fx-background-color: #0f172a; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 8 12; -fx-background-radius: 8; -fx-cursor: hand;");
        btnPdf.setOnAction(e -> handleDownloadPdf());

        Button btnPrint = new Button("Imprimir");
        btnPrint.getStyleClass().add("btn-secondary");
        btnPrint.setOnAction(e -> handlePrint(outerShell));

        Button btnCopy = new Button("Copiar");
        btnCopy.getStyleClass().add("btn-secondary");
        btnCopy.setOnAction(e -> {
            String msg = WhatsAppReceiptUtil.formatOfficialReceiptWhatsAppMessage(model);
            Clipboard clipboard = Clipboard.getSystemClipboard();
            ClipboardContent content = new ClipboardContent();
            content.putString(msg);
            clipboard.setContent(content);
            showFeedback(model.cloudVerified() ? "Enlace oficial copiado al portapapeles." : "Comprobante copiado al portapapeles.", false);
        });

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> close());

        secondaryActions.getChildren().addAll(btnPdf, btnPrint, btnCopy, btnClose);

        ScrollPane scroll = new ScrollPane(outerShell);
        scroll.setFitToWidth(true);
        scroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        scroll.setStyle("-fx-background-color: transparent; -fx-background: transparent; -fx-border-width: 0;");
        scroll.setPrefViewportHeight(470);

        root.getChildren().addAll(scroll, lblFeedback, btnWhatsApp, secondaryActions);

        var scene = new Scene(root);
        var css = getClass().getResource("/ui/theme.css");
        if (css != null) scene.getStylesheets().add(css.toExternalForm());
        setScene(scene);
    }

    private void refreshDynamicFields() {
        rowsContainer.getChildren().clear();
        List<DetailRow> rows = model.buildDetailRows();
        for (DetailRow r : rows) {
            rowsContainer.getChildren().add(createDetailRow(r));
        }
        if (model.cloudVerified()) {
            lblCloudStatus.setText("Enlace inalterable activo en la nube");
            lblCloudStatus.setStyle("-fx-text-fill: #047857; -fx-background-color: #ecfdf5; -fx-padding: 4 10; -fx-background-radius: 999; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        } else {
            lblCloudStatus.setText("Modo local · Puedes guardar o imprimir el PDF");
            lblCloudStatus.setStyle("-fx-text-fill: #b45309; -fx-background-color: #fffbeb; -fx-padding: 4 10; -fx-background-radius: 999; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        }
    }

    private void handleDownloadPdf() {
        try {
            byte[] pdfBytes = OfficialReceiptPdfGenerator.generatePdf(model);
            String safeCode = (model.receiptCode() != null ? model.receiptCode() : "KREDIA").replaceAll("[^a-zA-Z0-9_-]", "");
            FileChooser chooser = new FileChooser();
            chooser.setTitle("Guardar Ticket PDF Oficial Kredia");
            chooser.setInitialFileName("Comprobante-" + safeCode + ".pdf");
            chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Documento PDF (*.pdf)", "*.pdf"));
            File target = chooser.showSaveDialog(this);
            if (target == null) return;
            Files.write(target.toPath(), pdfBytes);
            showFeedback("Ticket PDF guardado en: " + target.getName(), false);
            try {
                if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                    Desktop.getDesktop().open(target);
                }
            } catch (Exception ignored) {}
        } catch (Exception ex) {
            showFeedback("No se pudo generar el PDF: " + ex.getMessage(), true);
        }
    }

    private void handlePrint(VBox printableNode) {
        try {
            PrinterJob job = PrinterJob.createPrinterJob();
            if (job == null) {
                showFeedback("No se encontró ninguna impresora disponible en el equipo.", true);
            } else if (job.showPrintDialog(this)) {
                boolean printed = job.printPage(printableNode);
                if (printed) {
                    job.endJob();
                    showFeedback("Comprobante enviado a la impresora.", false);
                } else {
                    showFeedback("No se pudo imprimir el comprobante.", true);
                }
            }
        } catch (Exception ex) {
            showFeedback("Error al imprimir: " + ex.getMessage(), true);
        }
    }

    private void showFeedback(String msg, boolean warning) {
        lblFeedback.setText(msg);
        lblFeedback.setStyle(warning
                ? "-fx-text-fill: #b45309; -fx-background-color: #fffbeb; -fx-border-color: #fde68a; -fx-border-radius: 8; -fx-padding: 7 10; -fx-background-radius: 8; -fx-font-size: 11.5px; -fx-font-weight: bold;"
                : "-fx-text-fill: #047857; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 8; -fx-padding: 7 10; -fx-background-radius: 8; -fx-font-size: 11.5px; -fx-font-weight: bold;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }

    private Region createDashedDivider() {
        Region line = new Region();
        line.setMinHeight(1);
        line.setMaxHeight(1);
        line.setMaxWidth(Double.MAX_VALUE);
        line.setStyle("-fx-border-color: #cbd5e1; -fx-border-width: 0 0 1 0; -fx-border-style: segments(4, 4);");
        VBox.setMargin(line, new Insets(4, 0, 4, 0));
        return line;
    }

    private HBox createDetailRow(DetailRow r) {
        HBox row = new HBox(10);
        row.setAlignment(Pos.CENTER_LEFT);
        Label lbl = new Label(r.label());
        lbl.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-font-weight: bold;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Label val = new Label(r.value());
        val.setWrapText(true);
        val.setAlignment(Pos.CENTER_RIGHT);
        String color = r.danger() ? "#dc2626" : r.highlight() ? "#047857" : "#0f172a";
        String weight = (r.highlight() || r.danger()) ? "bold" : "bold";
        val.setStyle("-fx-text-fill: " + color + "; -fx-font-size: 12px; -fx-font-weight: " + weight + ";");

        row.getChildren().addAll(lbl, sp, val);
        return row;
    }
}
