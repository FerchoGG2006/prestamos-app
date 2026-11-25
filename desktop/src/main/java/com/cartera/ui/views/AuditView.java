package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.ui.util.UiLabels;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Visor de auditoría y trazabilidad en tiempo real.
 * Permite a administradores inspeccionar todos los eventos y escrituras financieras.
 */
public class AuditView extends VBox {

    private final AuditLogRepository auditLogRepository;
    private final AppUserRepository userRepository;
    private final boolean embedded;
    private final ObservableList<AuditLogEntity> logList = FXCollections.observableArrayList();
    private FilteredList<AuditLogEntity> filtered;
    private TextField searchField;
    private final TableView<AuditLogEntity> table = new TableView<>();
    private final Label lblCount = new Label();
    private Map<String, String> userNameCache = new HashMap<>();

    public AuditView(AuditLogRepository auditLogRepository) {
        this(auditLogRepository, null, false);
    }

    public AuditView(AuditLogRepository auditLogRepository, AppUserRepository userRepository, boolean embedded) {
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
        this.embedded = embedded;

        setSpacing(embedded ? 12 : 18);
        setPadding(embedded ? new Insets(0) : new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildTableCard();
    }

    private void buildHeader() {
        HBox top = new HBox(12);
        top.setAlignment(Pos.CENTER_LEFT);

        if (!embedded) {
            VBox titleBox = new VBox(4);
            Label title = new Label("Auditoría y Trazabilidad");
            title.getStyleClass().add("section-title");
            Label subtitle = new Label("Registro inmutable de actividades y movimientos del sistema");
            subtitle.getStyleClass().add("muted");
            titleBox.getChildren().addAll(title, subtitle);
            HBox.setHgrow(titleBox, Priority.ALWAYS);
            top.getChildren().add(titleBox);
        }

        searchField = new TextField();
        searchField.setPromptText("Buscar por acción, usuario, fecha, entidad o detalle...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(embedded ? 360 : 300);
        if (embedded) {
            HBox.setHgrow(searchField, Priority.ALWAYS);
        }

        filtered = new FilteredList<>(logList, p -> true);
        SortedList<AuditLogEntity> sorted = new SortedList<>(filtered);
        sorted.comparatorProperty().bind(table.comparatorProperty());
        table.setItems(sorted);

        searchField.textProperty().addListener((obs, old, val) -> applyFilterAndCount());

        Button btnDetail = new Button("Ver Detalle");
        btnDetail.getStyleClass().add("btn-secondary");
        btnDetail.setOnAction(e -> {
            AuditLogEntity sel = table.getSelectionModel().getSelectedItem();
            if (sel != null) {
                showDetailModal(sel);
            }
        });

        top.getChildren().addAll(searchField, btnDetail);

        if (!embedded) {
            Button btnRefresh = new Button("Actualizar");
            btnRefresh.getStyleClass().add("btn-secondary");
            btnRefresh.setOnAction(e -> refresh());
            top.getChildren().add(btnRefresh);
        }

        getChildren().add(top);
    }

    private void applyFilterAndCount() {
        String val = searchField != null ? searchField.getText() : null;
        filtered.setPredicate(log -> {
            if (val == null || val.isBlank()) return true;
            String q = val.toLowerCase(Locale.ROOT).trim();
            String resolvedUser = resolveUserName(log.getUserId()).toLowerCase(Locale.ROOT);
            return contains(log.getAction(), q)
                    || contains(log.getUserId(), q)
                    || resolvedUser.contains(q)
                    || contains(log.getEntityType(), q)
                    || contains(log.getEntityId(), q)
                    || contains(log.getPreviousValue(), q)
                    || contains(log.getNewValue(), q)
                    || contains(log.getReason(), q)
                    || contains(log.getCreatedAt(), q);
        });
        lblCount.setText("Mostrando " + filtered.size() + " de " + logList.size() + " eventos registrados");
    }

    private static boolean contains(String source, String needleLower) {
        return source != null && source.toLowerCase(Locale.ROOT).contains(needleLower);
    }

    private String resolveUserName(String userId) {
        if (userId == null || userId.isBlank()) return "SISTEMA";
        return userNameCache.getOrDefault(userId, userId);
    }

    @SuppressWarnings("unchecked")
    private void buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        table.setPlaceholder(UiLabels.emptyState("Sin eventos de auditoría", "No hay registros que coincidan con el criterio de búsqueda."));
        table.setRowFactory(tv -> {
            TableRow<AuditLogEntity> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty()) {
                    showDetailModal(row.getItem());
                }
            });
            return row;
        });
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Fecha / Hora
        TableColumn<AuditLogEntity, String> colDate = new TableColumn<>("FECHA / HORA");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDateTime(d.getValue().getCreatedAt())));
        colDate.setPrefWidth(135);

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
                    String upper = action.toUpperCase(Locale.ROOT);
                    Label badge = new Label(action);
                    badge.setAlignment(Pos.CENTER);
                    String base = "-fx-padding: 3 8; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 10.5px;";
                    if (upper.contains("ANULAR") || upper.contains("REVERSAR") || upper.contains("ELIMINAR")
                            || upper.contains("FALLIDO") || upper.contains("DESACTIVAR") || upper.contains("INACTIVAR")) {
                        badge.setStyle(base + "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 12;");
                    } else if (upper.contains("DESCUENTO_NOMINA") || upper.contains("RETIRO") || upper.contains("GASTO") || upper.contains("AJUSTE")) {
                        badge.setStyle(base + "-fx-background-color: #fffbeb; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 12;");
                    } else if (upper.contains("LOGIN") || upper.contains("COBRO") || upper.contains("CREAR") || upper.contains("REACTIVAR")) {
                        badge.setStyle(base + "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 12;");
                    } else if (upper.contains("DESEMBOLSO") || upper.contains("CERRADA") || upper.contains("RENOVACION")) {
                        badge.setStyle(base + "-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 12;");
                    } else {
                        badge.setStyle(base + "-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-border-color: #e2e8f0; -fx-border-radius: 12;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colAction.setPrefWidth(165);

        // 3. Usuario (nombre legible en vez de UUID)
        TableColumn<AuditLogEntity, String> colUser = new TableColumn<>("USUARIO");
        colUser.setCellValueFactory(d -> new SimpleStringProperty(resolveUserName(d.getValue().getUserId())));
        colUser.setPrefWidth(120);

        // 4. Entidad (null-safe)
        TableColumn<AuditLogEntity, String> colEntity = new TableColumn<>("ENTIDAD");
        colEntity.setCellValueFactory(d -> {
            String type = d.getValue().getEntityType() != null ? d.getValue().getEntityType() : "SISTEMA";
            String eid = d.getValue().getEntityId();
            String shortId = (eid == null || eid.isBlank()) ? "-" : (eid.length() > 10 ? eid.substring(0, 10) + "…" : eid);
            return new SimpleStringProperty(type + " #" + shortId);
        });
        colEntity.setPrefWidth(140);

        // 5. Valor Anterior
        TableColumn<AuditLogEntity, String> colPrev = new TableColumn<>("VALOR ANTERIOR");
        colPrev.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getPreviousValue() != null && !d.getValue().getPreviousValue().isBlank()
                        ? d.getValue().getPreviousValue() : "—"));
        colPrev.setPrefWidth(140);

        // 6. Detalles / Nuevo Valor
        TableColumn<AuditLogEntity, String> colDetails = new TableColumn<>("NUEVO VALOR / DETALLE");
        colDetails.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getNewValue() != null && !d.getValue().getNewValue().isBlank()
                        ? d.getValue().getNewValue() : "—"));
        colDetails.setPrefWidth(200);

        // 7. Justificación
        TableColumn<AuditLogEntity, String> colReason = new TableColumn<>("JUSTIFICACIÓN");
        colReason.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getReason() != null && !d.getValue().getReason().isBlank()
                        ? d.getValue().getReason() : "—"));
        colReason.setPrefWidth(160);

        table.getColumns().addAll(colDate, colAction, colUser, colEntity, colPrev, colDetails, colReason);

        // Footer
        HBox footer = new HBox(16);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);
        lblCount.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        Label lblHint = new Label("Doble clic en una fila para ver el detalle completo");
        lblHint.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        footer.getChildren().addAll(lblCount, sp, lblHint);

        tableCard.getChildren().addAll(table, footer);
        getChildren().add(tableCard);
    }

    private void showDetailModal(AuditLogEntity log) {
        Stage modal = new Stage();
        if (getScene() != null && getScene().getWindow() != null) {
            modal.initOwner(getScene().getWindow());
        }
        modal.initModality(Modality.WINDOW_MODAL);
        modal.setTitle("Detalle de Evento de Auditoría");

        StringBuilder sb = new StringBuilder();
        sb.append("ID Evento:       ").append(log.getId()).append("\n");
        sb.append("Fecha / Hora:    ").append(log.getCreatedAt() != null ? log.getCreatedAt() : "—").append("\n");
        sb.append("Acción:          ").append(log.getAction() != null ? log.getAction() : "—").append("\n");
        sb.append("Usuario:         ").append(resolveUserName(log.getUserId()))
          .append(log.getUserId() != null ? " (" + log.getUserId() + ")" : "").append("\n");
        sb.append("Entidad:         ").append(log.getEntityType() != null ? log.getEntityType() : "—")
          .append(" #").append(log.getEntityId() != null ? log.getEntityId() : "—").append("\n");
        sb.append("--------------------------------------------------\n");
        sb.append("Valor Anterior:\n").append(log.getPreviousValue() != null ? log.getPreviousValue() : "(ninguno)").append("\n\n");
        sb.append("Nuevo Valor / Detalle:\n").append(log.getNewValue() != null ? log.getNewValue() : "(ninguno)").append("\n\n");
        sb.append("Justificación / Motivo:\n").append(log.getReason() != null ? log.getReason() : "(ninguno)");

        TextArea area = new TextArea(sb.toString());
        area.setEditable(false);
        area.setWrapText(true);
        area.setStyle("-fx-font-family: 'Consolas', monospace; -fx-font-size: 12px;");
        VBox.setVgrow(area, Priority.ALWAYS);

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> modal.close());
        HBox bot = new HBox(btnClose);
        bot.setAlignment(Pos.CENTER_RIGHT);

        VBox root = new VBox(12, area, bot);
        root.setPadding(new Insets(18));
        root.setPrefSize(560, 400);
        Scene scene = new Scene(root);
        var css = getClass().getResource("/ui/theme.css");
        if (css != null) scene.getStylesheets().add(css.toExternalForm());
        modal.setScene(scene);
        modal.showAndWait();
    }

    public void refresh() {
        Map<String, String> freshUsers = new HashMap<>();
        if (userRepository != null) {
            for (AppUserEntity u : userRepository.findAll()) {
                String display = (u.getFullName() != null && !u.getFullName().isBlank())
                        ? u.getFullName()
                        : u.getUsername();
                freshUsers.put(u.getId(), display);
            }
        }
        userNameCache = freshUsers;

        List<AuditLogEntity> list = auditLogRepository.findAll().stream()
                .sorted(Comparator.comparing(AuditLogEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        logList.setAll(list);
        applyFilterAndCount();
    }
}
