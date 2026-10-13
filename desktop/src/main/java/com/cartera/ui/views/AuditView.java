package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.util.Comparator;
import java.util.List;

/**
 * Visor de auditoría y trazabilidad en tiempo real.
 * Permite a administradores inspeccionar todos los eventos y escrituras financieras.
 */
public class AuditView extends VBox {

    private final AuditLogRepository auditLogRepository;
    private final ObservableList<AuditLogEntity> logList = FXCollections.observableArrayList();
    private final TableView<AuditLogEntity> table = new TableView<>();
    private final Label lblCount = new Label();

    public AuditView(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildTableCard();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Auditoría y Trazabilidad");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Bitácora inmutable de eventos, autenticación y transacciones financieras");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar por acción, usuario o detalles...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(280);

        FilteredList<AuditLogEntity> filtered = new FilteredList<>(logList, p -> true);
        searchField.textProperty().addListener((obs, old, val) -> {
            filtered.setPredicate(log -> {
                if (val == null || val.isBlank()) return true;
                String q = val.toLowerCase().trim();
                return (log.getAction() != null && log.getAction().toLowerCase().contains(q))
                        || (log.getUserId() != null && log.getUserId().toLowerCase().contains(q))
                        || (log.getEntityType() != null && log.getEntityType().toLowerCase().contains(q))
                        || (log.getNewValue() != null && log.getNewValue().toLowerCase().contains(q))
                        || (log.getReason() != null && log.getReason().toLowerCase().contains(q));
            });
            lblCount.setText("Mostrando " + filtered.size() + " de " + logList.size() + " eventos registrados");
        });
        table.setItems(filtered);

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, searchField, btnRefresh);
        getChildren().add(top);
    }

    @SuppressWarnings("unchecked")
    private void buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Fecha / Hora
        TableColumn<AuditLogEntity, String> colDate = new TableColumn<>("FECHA / HORA");
        colDate.setCellValueFactory(d -> {
            String raw = d.getValue().getCreatedAt();
            if (raw != null && raw.length() >= 19) {
                return new SimpleStringProperty(raw.substring(0, 10) + " " + raw.substring(11, 19));
            }
            return new SimpleStringProperty(raw != null ? raw : "-");
        });
        colDate.setPrefWidth(140);

        // 2. Acción (Badge)
        TableColumn<AuditLogEntity, String> colAction = new TableColumn<>("ACCIÓN");
        colAction.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getAction()));
        colAction.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String action, boolean empty) {
                super.updateItem(action, empty);
                if (empty || action == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label(action);
                    badge.setAlignment(Pos.CENTER);
                    String base = "-fx-padding: 3 8; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px;";
                    if (action.contains("LOGIN") || action.contains("COBRO") || action.contains("CREAR")) {
                        badge.setStyle(base + "-fx-background-color: rgba(16, 185, 129, 0.2); -fx-text-fill: #34d399;");
                    } else if (action.contains("DESEMBOLSO") || action.contains("CERRADA")) {
                        badge.setStyle(base + "-fx-background-color: rgba(37, 99, 235, 0.2); -fx-text-fill: #60a5fa;");
                    } else {
                        badge.setStyle(base + "-fx-background-color: rgba(148, 163, 184, 0.2); -fx-text-fill: #cbd5e1;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colAction.setPrefWidth(160);

        // 3. Usuario
        TableColumn<AuditLogEntity, String> colUser = new TableColumn<>("USUARIO");
        colUser.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getUserId() != null ? d.getValue().getUserId() : "SISTEMA"));
        colUser.setPrefWidth(110);

        // 4. Entidad
        TableColumn<AuditLogEntity, String> colEntity = new TableColumn<>("ENTIDAD");
        colEntity.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getEntityType() + " #" + (d.getValue().getEntityId() != null && d.getValue().getEntityId().length() > 8 ? d.getValue().getEntityId().substring(0, 8) + "..." : d.getValue().getEntityId())));
        colEntity.setPrefWidth(140);

        // 5. Detalles
        TableColumn<AuditLogEntity, String> colDetails = new TableColumn<>("DETALLES / NUEVO VALOR");
        colDetails.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getNewValue() != null ? d.getValue().getNewValue() : "-"));
        colDetails.setPrefWidth(220);

        // 6. Justificación
        TableColumn<AuditLogEntity, String> colReason = new TableColumn<>("JUSTIFICACIÓN");
        colReason.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getReason() != null ? d.getValue().getReason() : "-"));
        colReason.setPrefWidth(180);

        table.getColumns().addAll(colDate, colAction, colUser, colEntity, colDetails, colReason);

        // Footer
        HBox footer = new HBox(16);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);
        lblCount.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        footer.getChildren().add(lblCount);

        tableCard.getChildren().addAll(table, footer);
        getChildren().add(tableCard);
    }

    public void refresh() {
        List<AuditLogEntity> list = auditLogRepository.findAll().stream()
                .sorted(Comparator.comparing(AuditLogEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        logList.setAll(list);
        lblCount.setText("Mostrando " + list.size() + " eventos registrados en el log de auditoría");
    }
}
