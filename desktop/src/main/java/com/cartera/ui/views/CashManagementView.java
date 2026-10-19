package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Vista de control y arqueo de caja con historial de movimientos y registro manual de ingresos/egresos.
 */
public class CashManagementView extends VBox {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final CashMovementRepository cashMovementRepository;
    private final AuditLogRepository auditLogRepository;
    private final Stage ownerStage;

    private final Label lblBalance = new Label("$ 0");
    private final Label lblInflow = new Label("$ 0");
    private final Label lblOutflow = new Label("$ 0");
    private final ObservableList<CashMovementEntity> movementsList = FXCollections.observableArrayList();
    private final TableView<CashMovementEntity> table = new TableView<>();

    public CashManagementView(CashMovementRepository cashMovementRepository,
                              AuditLogRepository auditLogRepository,
                              Stage ownerStage) {
        this.cashMovementRepository = cashMovementRepository;
        this.auditLogRepository = auditLogRepository;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildMetrics();
        buildTableCard();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Arqueo y Flujo de Caja");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Control de dinero disponible, ingresos por cobranza y egresos operativos");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        Button btnRecaudo = new Button("💰 Retirar Recaudo a Oficina");
        btnRecaudo.setStyle("-fx-background-color: #0284c7; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnRecaudo.setOnAction(e -> openRecaudoDialog());

        Button btnNewMovement = new Button("+ Movimiento de Caja");
        btnNewMovement.getStyleClass().add("btn-primary");
        btnNewMovement.setOnAction(e -> openNewMovementDialog());

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, btnRecaudo, btnNewMovement, btnRefresh);
        getChildren().add(top);
    }

    private void buildMetrics() {
        HBox metrics = new HBox(16);

        lblBalance.getStyleClass().add("metric-value-green");
        lblInflow.getStyleClass().add("metric-value");
        lblOutflow.getStyleClass().add("metric-value-red");

        metrics.getChildren().addAll(
                createMetricCard("Saldo Disponible en Caja", lblBalance),
                createMetricCard("Total Ingresos / Cobros", lblInflow),
                createMetricCard("Total Salidas / Desembolsos", lblOutflow)
        );
        getChildren().add(metrics);
    }

    private VBox createMetricCard(String title, Label valueLabel) {
        VBox card = new VBox(6);
        card.getStyleClass().add("metric-card");
        HBox.setHgrow(card, Priority.ALWAYS);
        Label lbl = new Label(title);
        lbl.getStyleClass().add("muted");
        card.getChildren().addAll(lbl, valueLabel);
        return card;
    }

    @SuppressWarnings("unchecked")
    private void buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Fecha / Hora
        TableColumn<CashMovementEntity, String> colDate = new TableColumn<>("FECHA / HORA");
        colDate.setCellValueFactory(d -> {
            String raw = d.getValue().getCreatedAt();
            if (raw != null && raw.length() >= 16) {
                return new SimpleStringProperty(raw.substring(0, 10) + " " + raw.substring(11, 16));
            }
            return new SimpleStringProperty(raw != null ? raw : "-");
        });
        colDate.setPrefWidth(140);

        // 2. Tipo (Badge)
        TableColumn<CashMovementEntity, String> colType = new TableColumn<>("TIPO");
        colType.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getMovementType()));
        colType.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String type, boolean empty) {
                super.updateItem(type, empty);
                if (empty || type == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label(type);
                    badge.setAlignment(Pos.CENTER);
                    String base = "-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px;";
                    if ("INGRESO".equalsIgnoreCase(type)) {
                        badge.setStyle(base + "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 12;");
                    } else {
                        badge.setStyle(base + "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 12;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colType.setPrefWidth(110);

        // 3. Categoría
        TableColumn<CashMovementEntity, String> colCat = new TableColumn<>("CATEGORÍA");
        colCat.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getCategory()));
        colCat.setPrefWidth(130);

        // 4. Monto
        TableColumn<CashMovementEntity, CashMovementEntity> colAmount = new TableColumn<>("MONTO");
        colAmount.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAmount.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CashMovementEntity m, boolean empty) {
                super.updateItem(m, empty);
                if (empty || m == null) {
                    setText(null);
                } else {
                    boolean isIncome = "INGRESO".equalsIgnoreCase(m.getMovementType());
                    String sign = isIncome ? "+ " : "- ";
                    setText(sign + CURRENCY.format(m.getAmount()));
                    setStyle(isIncome ? "-fx-text-fill: #059669; -fx-font-weight: bold;" : "-fx-text-fill: #dc2626; -fx-font-weight: bold;" );
                }
            }
        });
        colAmount.setPrefWidth(130);

        // 5. Descripción
        TableColumn<CashMovementEntity, String> colDesc = new TableColumn<>("DESCRIPCIÓN");
        colDesc.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getDescription()));
        colDesc.setPrefWidth(240);

        table.getColumns().addAll(colDate, colType, colCat, colAmount, colDesc);
        table.setItems(movementsList);

        tableCard.getChildren().add(table);
        getChildren().add(tableCard);
    }

    public void refresh() {
        List<CashMovementEntity> list = cashMovementRepository.findAll().stream()
                .sorted(Comparator.comparing(CashMovementEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        movementsList.setAll(list);

        BigDecimal inflow = list.stream()
                .filter(m -> "INGRESO".equalsIgnoreCase(m.getMovementType()))
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal outflow = list.stream()
                .filter(m -> "EGRESO".equalsIgnoreCase(m.getMovementType()))
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal net = inflow.subtract(outflow);

        lblInflow.setText(CURRENCY.format(inflow));
        lblOutflow.setText(CURRENCY.format(outflow));
        lblBalance.setText(CURRENCY.format(net));
    }

    private void openNewMovementDialog() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Registrar Movimiento de Caja");
        dialog.setResizable(false);

        VBox root = new VBox(16);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(420);

        Label title = new Label("Nuevo Movimiento de Efectivo");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        ComboBox<String> cmbType = new ComboBox<>(FXCollections.observableArrayList("INGRESO", "EGRESO"));
        cmbType.setValue("EGRESO");
        cmbType.setMaxWidth(Double.MAX_VALUE);
        cmbType.getStyleClass().add("search-field");

        ComboBox<String> cmbCategory = new ComboBox<>(FXCollections.observableArrayList(
                "GASTO_GASOLINA", "GASTO_VIATICOS", "BASE_INICIAL", "RECAUDO_OFICINA", "RETIRO_CAJA_PRINCIPAL", "AJUSTE_ARQUEO", "OTRO"
        ));
        cmbCategory.setValue("GASTO_GASOLINA");
        cmbCategory.setMaxWidth(Double.MAX_VALUE);
        cmbCategory.getStyleClass().add("search-field");

        TextField txtAmount = new TextField();
        txtAmount.setPromptText("Ej. 20000");
        txtAmount.getStyleClass().add("search-field");

        TextField txtDesc = new TextField();
        txtDesc.setPromptText("Ej. Tanqueo de moto para ruta norte");
        txtDesc.getStyleClass().add("search-field");

        Label lblFeedback = new Label();
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Guardar Movimiento");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                String clean = txtAmount.getText().replaceAll("[^0-9.]", "").trim();
                if (clean.isEmpty() || new BigDecimal(clean).compareTo(BigDecimal.ZERO) <= 0) {
                    lblFeedback.setText("Ingresa un monto mayor a cero.");
                    lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                    lblFeedback.setVisible(true);
                    lblFeedback.setManaged(true);
                    return;
                }

                BigDecimal amount = new BigDecimal(clean);
                String desc = txtDesc.getText() != null && !txtDesc.getText().isBlank() ? txtDesc.getText().trim() : cmbCategory.getValue();
                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                String userId = UserSessionContext.getSession()
                        .map(com.cartera.infrastructure.security.UserSession::userId)
                        .orElse("usr-col-1");

                CashMovementEntity mov = new CashMovementEntity(
                        UUID.randomUUID().toString(),
                        "route-norte",
                        userId,
                        null,
                        cmbType.getValue(),
                        cmbCategory.getValue(),
                        amount,
                        null,
                        desc,
                        now
                );
                cashMovementRepository.save(mov);

                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        userId,
                        "CASH_MOVEMENT",
                        mov.getId(),
                        "REGISTRO_MOVIMIENTO_CAJA",
                        null,
                        cmbType.getValue() + " " + amount + " (" + cmbCategory.getValue() + ")",
                        desc,
                        now
                ));

                refresh();
                dialog.close();
            } catch (Exception ex) {
                lblFeedback.setText("Error: " + ex.getMessage());
                lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                lblFeedback.setVisible(true);
                lblFeedback.setManaged(true);
            }
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        root.getChildren().addAll(
                title,
                new VBox(4, new Label("Tipo de Movimiento *") {{ setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px;"); }}, cmbType),
                new VBox(4, new Label("Categoría *") {{ setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px;"); }}, cmbCategory),
                new VBox(4, new Label("Monto ($) *") {{ setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px;"); }}, txtAmount),
                new VBox(4, new Label("Descripción / Justificación *") {{ setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px;"); }}, txtDesc),
                lblFeedback,
                actions
        );

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void openRecaudoDialog() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Retirar Recaudo a Oficina Central");
        dialog.setResizable(false);

        VBox root = new VBox(16);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(440);

        Label title = new Label("💰 Retiro de Recaudo de Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        // Calcular base disponible actual
        List<CashMovementEntity> list = cashMovementRepository.findAll();
        BigDecimal inflow = list.stream()
                .filter(m -> "INGRESO".equalsIgnoreCase(m.getMovementType()) || "ENTRADA".equalsIgnoreCase(m.getMovementType()))
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal outflow = list.stream()
                .filter(m -> "EGRESO".equalsIgnoreCase(m.getMovementType()) || "SALIDA".equalsIgnoreCase(m.getMovementType()))
                .map(CashMovementEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal currentBase = inflow.subtract(outflow).max(BigDecimal.ZERO);

        VBox baseBox = new VBox(4);
        baseBox.setStyle("-fx-background-color: #0f172a; -fx-padding: 14; -fx-background-radius: 10;");
        Label lblBaseTitle = new Label("BASE DISPONIBLE EN CAJA:");
        lblBaseTitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 10px; -fx-font-weight: bold;");
        Label lblBaseVal = new Label(CURRENCY.format(currentBase));
        lblBaseVal.setStyle("-fx-text-fill: #38bdf8; -fx-font-size: 22px; -fx-font-weight: bold;");
        baseBox.getChildren().addAll(lblBaseTitle, lblBaseVal);

        TextField txtAmount = new TextField();
        txtAmount.setPromptText("Ej. 300000");
        txtAmount.getStyleClass().add("search-field");

        ComboBox<String> cmbDestination = new ComboBox<>(FXCollections.observableArrayList(
                "🏢 Entrega a Oficina Central",
                "💼 Retiro Utilidad / Dueño",
                "🏦 Consignación Bancaria / Nequi",
                "🔄 Traslado de Fondeo a Otra Ruta"
        ));
        cmbDestination.setValue("🏢 Entrega a Oficina Central");
        cmbDestination.setMaxWidth(Double.MAX_VALUE);
        cmbDestination.getStyleClass().add("search-field");

        TextField txtNotes = new TextField();
        txtNotes.setPromptText("Ej. Entregado en efectivo a administración central");
        txtNotes.getStyleClass().add("search-field");

        Label lblFeedback = new Label();
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Confirmar Retiro (-)");
        btnSave.setStyle("-fx-background-color: #0284c7; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 16; -fx-background-radius: 8;");
        btnSave.setOnAction(e -> {
            try {
                String clean = txtAmount.getText().replaceAll("[^0-9.]", "").trim();
                if (clean.isBlank()) {
                    throw new IllegalArgumentException("Debe ingresar el monto a recaudar.");
                }
                BigDecimal amount = new BigDecimal(clean);
                if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new IllegalArgumentException("El monto a recaudar debe ser mayor a cero.");
                }
                if (amount.compareTo(currentBase) > 0) {
                    throw new IllegalArgumentException("Base insuficiente (" + CURRENCY.format(currentBase) + "). No se puede retirar de donde no hay plata.");
                }

                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                String userId = com.cartera.infrastructure.security.UserSessionContext.getSession()
                        .map(com.cartera.infrastructure.security.UserSession::userId)
                        .orElse("usr-admin-1");

                String reason = cmbDestination.getValue();
                if (!txtNotes.getText().isBlank()) {
                    reason += " - " + txtNotes.getText().trim();
                }

                CashMovementEntity mov = new CashMovementEntity(
                        UUID.randomUUID().toString(),
                        "route-norte",
                        userId,
                        null,
                        "EGRESO",
                        "RECAUDO_OFICINA",
                        amount,
                        null,
                        reason,
                        now
                );
                cashMovementRepository.save(mov);

                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        userId,
                        "CASH_MOVEMENT",
                        mov.getId(),
                        "RECAUDO_OFICINA_RETIRO",
                        null,
                        "EGRESO " + amount + " (RECAUDO_OFICINA)",
                        reason,
                        now
                ));

                refresh();
                dialog.close();
            } catch (Exception ex) {
                lblFeedback.setText("Error: " + ex.getMessage());
                lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                lblFeedback.setVisible(true);
                lblFeedback.setManaged(true);
            }
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        root.getChildren().addAll(
                title,
                baseBox,
                new VBox(4, new Label("Monto a Recaudar / Retirar ($) *") {{ setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;"); }}, txtAmount),
                new VBox(4, new Label("Destino del Recaudo *") {{ setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;"); }}, cmbDestination),
                new VBox(4, new Label("Detalle / Observación") {{ setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;"); }}, txtNotes),
                lblFeedback,
                actions
        );

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }
}
