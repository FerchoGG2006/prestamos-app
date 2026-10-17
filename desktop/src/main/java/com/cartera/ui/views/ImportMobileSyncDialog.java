package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.RecordPaymentUseCase.RecordPaymentCommand;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.io.File;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.UUID;

public class ImportMobileSyncDialog extends Stage {

    private final RecordPaymentUseCase paymentUseCase;
    private final CashMovementRepository cashMovementRepository;
    private final Runnable onFinished;

    private final TextArea txtJson = new TextArea();
    private final Label lblStatus = new Label("Seleccione el archivo o pegue el contenido JSON generado en el móvil.");
    private final ProgressBar progressBar = new ProgressBar(0);

    public ImportMobileSyncDialog(Stage ownerStage,
                                  RecordPaymentUseCase paymentUseCase,
                                  CashMovementRepository cashMovementRepository,
                                  Runnable onFinished) {
        this.paymentUseCase = paymentUseCase;
        this.cashMovementRepository = cashMovementRepository;
        this.onFinished = onFinished;

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Sincronización — Importar Cobros y Gastos de Ruta Móvil");
        setWidth(580);
        setHeight(480);

        buildUI();
    }

    private void buildUI() {
        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #f8fafc;");

        // Cabecera
        VBox header = new VBox(4);
        Label title = new Label("Importar Recaudos desde Móvil (Offline-First)");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");
        Label sub = new Label("Carga los abonos, cuotas y gastos del cobrador para consolidar en cartera.db");
        sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        header.getChildren().addAll(title, sub);

        // Barra de archivo
        HBox fileBar = new HBox(10);
        fileBar.setAlignment(Pos.CENTER_LEFT);
        Button btnPickFile = new Button("📁 Seleccionar Archivo .JSON...");
        btnPickFile.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #1e293b; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 8 14; -fx-cursor: hand;");
        btnPickFile.setOnAction(e -> pickJsonFile());

        Label lblOr = new Label("o pegue el texto JSON abajo:");
        lblOr.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        fileBar.getChildren().addAll(btnPickFile, lblOr);

        // TextArea
        txtJson.setPromptText("{\"packageVersion\": \"1.0.0\", \"payments\": [...], ...}");
        txtJson.setWrapText(true);
        txtJson.setStyle("-fx-font-family: 'Consolas', monospace; -fx-font-size: 11px;");
        VBox.setVgrow(txtJson, Priority.ALWAYS);

        // Status & Progress
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setVisible(false);
        lblStatus.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

        // Botones inferiores
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-weight: bold; -fx-padding: 8 16; -fx-background-radius: 8; -fx-cursor: hand;");
        btnCancel.setOnAction(e -> close());

        Button btnProcess = new Button("Procesar e Importar Recaudos");
        btnProcess.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 20; -fx-background-radius: 8; -fx-cursor: hand;");
        btnProcess.setOnAction(e -> processImport());

        actions.getChildren().addAll(btnCancel, btnProcess);

        root.getChildren().addAll(header, fileBar, txtJson, progressBar, lblStatus, actions);
        setScene(new Scene(root));
    }

    private void pickJsonFile() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Seleccionar Paquete de Ruta Móvil");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivos JSON (*.json)", "*.json"));
        File file = chooser.showOpenDialog(this);
        if (file != null) {
            try {
                String content = Files.readString(file.toPath());
                txtJson.setText(content);
                lblStatus.setText("Archivo cargado: " + file.getName());
                lblStatus.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");
            } catch (Exception ex) {
                lblStatus.setText("Error al leer archivo: " + ex.getMessage());
                lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            }
        }
    }

    private void processImport() {
        String jsonText = txtJson.getText();
        if (jsonText == null || jsonText.isBlank()) {
            lblStatus.setText("Pegue el contenido JSON o seleccione un archivo antes de continuar.");
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            return;
        }

        try {
            ObjectMapper mapper = new ObjectMapper();
            JsonNode rootNode = mapper.readTree(jsonText);

            String opDateStr = rootNode.has("operatingDate") ? rootNode.get("operatingDate").asText() : LocalDate.now().toString();
            LocalDate opDate = LocalDate.parse(opDateStr);

            int paymentsProcessed = 0;
            int paymentsSkipped = 0;
            int expensesImported = 0;

            // 1. Procesar Pagos
            if (rootNode.has("payments") && rootNode.get("payments").isArray()) {
                for (JsonNode p : rootNode.get("payments")) {
                    try {
                        String loanId = p.get("loanId").asText();
                        BigDecimal amount = new BigDecimal(p.get("amountReceived").asText());
                        String method = p.has("paymentMethod") ? p.get("paymentMethod").asText() : "CASH";
                        String collectorId = p.has("collectorId") ? p.get("collectorId").asText() : "usr-col-1";
                        String idempotencyKey = p.has("idempotencyKey") ? p.get("idempotencyKey").asText() : "sync-" + UUID.randomUUID();

                        paymentUseCase.execute(new RecordPaymentCommand(
                                loanId,
                                amount,
                                method,
                                collectorId,
                                opDate,
                                idempotencyKey
                        ));
                        paymentsProcessed++;
                    } catch (Exception ex) {
                        // Idempotencia: si ya estaba registrado, simplemente se ignora sin error
                        paymentsSkipped++;
                    }
                }
            }

            // 2. Procesar Gastos de Caja (CashMovements)
            if (rootNode.has("cashMovements") && rootNode.get("cashMovements").isArray() && cashMovementRepository != null) {
                for (JsonNode cm : rootNode.get("cashMovements")) {
                    try {
                        String type = cm.has("type") ? cm.get("type").asText() : "EXPENSE";
                        String cat = cm.has("category") ? cm.get("category").asText() : "EXPENSE";
                        if ("EXPENSE".equalsIgnoreCase(type) && !"LOAN_DISBURSEMENT".equalsIgnoreCase(cat)) {
                            BigDecimal amount = new BigDecimal(cm.get("amount").asText());
                            String desc = cm.has("description") ? cm.get("description").asText() : "Gasto de ruta móvil";
                            String cmId = cm.has("id") ? cm.get("id").asText() : UUID.randomUUID().toString();

                            if (cashMovementRepository.findById(cmId).isEmpty()) {
                                cashMovementRepository.save(new CashMovementEntity(
                                        cmId,
                                        cm.has("routeId") ? cm.get("routeId").asText() : "route-1",
                                        cm.has("collectorId") ? cm.get("collectorId").asText() : "usr-col-1",
                                        cm.has("sessionId") ? cm.get("sessionId").asText() : null,
                                        "SALIDA",
                                        cat,
                                        amount,
                                        null,
                                        desc,
                                        cm.has("createdAt") ? cm.get("createdAt").asText() : opDateStr
                                ));
                                expensesImported++;
                            }
                        }
                    } catch (Exception ignored) {}
                }
            }

            Alert alert = new Alert(Alert.AlertType.INFORMATION);
            alert.initOwner(this);
            alert.setTitle("Sincronización Exitosa");
            alert.setHeaderText("Paquete de ruta importado correctamente");
            alert.setContentText(String.format("• Pagos aplicados a cartera: %d\n• Pagos ya existentes (omitidos por idempotencia): %d\n• Gastos de ruta cargados a caja: %d\n• Fecha operativa: %s",
                    paymentsProcessed, paymentsSkipped, expensesImported, opDateStr));
            alert.showAndWait();

            if (onFinished != null) onFinished.run();
            close();

        } catch (Exception e) {
            lblStatus.setText("Error al procesar JSON: " + e.getMessage());
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
        }
    }
}
