package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.DailySettlementEntity;
import com.cartera.infrastructure.persistence.repository.DailySettlementRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.settlement.application.SettlementUseCase.DaySettlementSummary;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Vista de Liquidaciones y Cierre Diario de Rutas.
 * Cierres inmutables según las directrices financieras de AGENTS.md.
 */
public class SettlementManagementView extends VBox {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final SettlementUseCase settlementUseCase;
    private final DailySettlementRepository settlementRepository;

    private final DatePicker dpDate = new DatePicker(LocalDate.now());
    private final Label lblExpected = new Label("$ 0");
    private final Label lblCollected = new Label("$ 0");
    private final TextField txtDelivered = new TextField("0");
    private final Label lblDifference = new Label("$ 0 (CUADRADO)");
    private final TextField txtJustification = new TextField();
    private final Button btnCloseSettlement = new Button("Cerrar y Liquidar Jornada");
    private final Label lblStatusBadge = new Label("ABIERTA");
    private final Label lblFeedback = new Label();

    private DaySettlementSummary currentSummary;
    private final ObservableList<DailySettlementEntity> historyList = FXCollections.observableArrayList();
    private final TableView<DailySettlementEntity> historyTable = new TableView<>();

    public SettlementManagementView(SettlementUseCase settlementUseCase, DailySettlementRepository settlementRepository) {
        this.settlementUseCase = settlementUseCase;
        this.settlementRepository = settlementRepository;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildSettlementCard();
        buildHistoryTableCard();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Liquidación y Cierre de Rutas");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Cuadre diario inmutable de recaudos contra efectivo físico entregado");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        dpDate.getStyleClass().add("search-field");
        dpDate.valueProperty().addListener((obs, old, val) -> refresh());

        Button btnRefresh = new Button("Recalcular");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, dpDate, btnRefresh);
        getChildren().add(top);
    }

    private void buildSettlementCard() {
        VBox card = new VBox(14);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(20));

        HBox cardHeader = new HBox(12);
        cardHeader.setAlignment(Pos.CENTER_LEFT);
        Label cardTitle = new Label("Liquidación de la Jornada");
        cardTitle.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 15px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: rgba(37, 99, 235, 0.2); -fx-text-fill: #60a5fa;");
        cardHeader.getChildren().addAll(cardTitle, spacer, lblStatusBadge);

        // Grid de Cuadre
        GridPane grid = new GridPane();
        grid.setHgap(20);
        grid.setVgap(12);

        lblCollected.setStyle("-fx-text-fill: #34d399; -fx-font-size: 18px; -fx-font-weight: bold;");
        lblExpected.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 18px; -fx-font-weight: bold;");

        txtDelivered.getStyleClass().add("search-field");
        txtDelivered.setStyle("-fx-font-size: 14px; -fx-font-weight: bold;");
        txtDelivered.textProperty().addListener((obs, old, val) -> updateDifference());

        lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #10b981;");

        txtJustification.setPromptText("Notas o explicación en caso de diferencia/descuadre...");
        txtJustification.getStyleClass().add("search-field");

        grid.add(createFieldBox("Total Recaudado en Sistema", lblCollected), 0, 0);
        grid.add(createFieldBox("Efectivo Físico Entregado ($) *", txtDelivered), 1, 0);
        grid.add(createFieldBox("Diferencia / Cuadre", lblDifference), 2, 0);
        grid.add(createFieldBox("Observaciones de Cierre", txtJustification), 0, 1, 3, 1);

        // Feedback
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        // Acción
        HBox actionBox = new HBox(12);
        actionBox.setAlignment(Pos.CENTER_RIGHT);

        btnCloseSettlement.getStyleClass().add("btn-primary");
        btnCloseSettlement.setOnAction(e -> doCloseSettlement());

        actionBox.getChildren().add(btnCloseSettlement);

        card.getChildren().addAll(cardHeader, grid, lblFeedback, actionBox);
        getChildren().add(card);
    }

    private VBox createFieldBox(String label, javafx.scene.Node content) {
        VBox box = new VBox(4);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px; -fx-font-weight: bold;");
        box.getChildren().addAll(lbl, content);
        return box;
    }

    @SuppressWarnings("unchecked")
    private void buildHistoryTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        Label title = new Label("Historial de Liquidaciones Cerradas");
        title.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 13px; -fx-font-weight: bold; -fx-padding: 14 16 8 16;");

        historyTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(historyTable, Priority.ALWAYS);

        TableColumn<DailySettlementEntity, String> colDate = new TableColumn<>("FECHA CIERRE");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getSettledAt()));
        colDate.setPrefWidth(140);

        TableColumn<DailySettlementEntity, String> colExp = new TableColumn<>("ESPERADO");
        colExp.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getExpectedCollection())));
        colExp.setPrefWidth(120);

        TableColumn<DailySettlementEntity, String> colAct = new TableColumn<>("ENTREGADO");
        colAct.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getActualCollection())));
        colAct.setPrefWidth(120);

        TableColumn<DailySettlementEntity, DailySettlementEntity> colDif = new TableColumn<>("DIFERENCIA");
        colDif.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colDif.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(DailySettlementEntity s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) {
                    setText(null);
                } else {
                    BigDecimal diff = s.getCashDifference();
                    setText(CURRENCY.format(diff));
                    if (diff.compareTo(BigDecimal.ZERO) == 0) {
                        setStyle("-fx-text-fill: #10b981; -fx-font-weight: bold;");
                    } else if (diff.compareTo(BigDecimal.ZERO) > 0) {
                        setStyle("-fx-text-fill: #38bdf8; -fx-font-weight: bold;");
                    } else {
                        setStyle("-fx-text-fill: #ef4444; -fx-font-weight: bold;");
                    }
                }
            }
        });
        colDif.setPrefWidth(120);

        TableColumn<DailySettlementEntity, String> colJust = new TableColumn<>("OBSERVACIONES");
        colJust.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getDifferenceJustification()));
        colJust.setPrefWidth(220);

        historyTable.getColumns().addAll(colDate, colExp, colAct, colDif, colJust);
        historyTable.setItems(historyList);

        tableCard.getChildren().addAll(title, historyTable);
        getChildren().add(tableCard);
    }

    public void refresh() {
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        String collectorId = UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::userId)
                .orElse("usr-col-1");

        currentSummary = settlementUseCase.getOrCreateDaySummary(collectorId, date);

        lblCollected.setText(CURRENCY.format(currentSummary.totalCollected()));
        lblExpected.setText(CURRENCY.format(currentSummary.expectedAmount()));

        if (currentSummary.isClosed()) {
            lblStatusBadge.setText("LIQUIDADA / CERRADA");
            lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: rgba(16, 185, 129, 0.2); -fx-text-fill: #34d399;");
            txtDelivered.setDisable(true);
            txtJustification.setDisable(true);
            btnCloseSettlement.setDisable(true);

            if (currentSummary.settlement() != null) {
                txtDelivered.setText(currentSummary.settlement().getActualCollection().toString());
                txtJustification.setText(currentSummary.settlement().getDifferenceJustification());
            }
        } else {
            lblStatusBadge.setText("JORNADA ABIERTA");
            lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: rgba(37, 99, 235, 0.2); -fx-text-fill: #60a5fa;");
            txtDelivered.setDisable(false);
            txtJustification.setDisable(false);
            btnCloseSettlement.setDisable(false);
            if ("0".equals(txtDelivered.getText().trim())) {
                txtDelivered.setText(currentSummary.totalCollected().toString());
            }
        }

        updateDifference();

        // Cargar historial
        List<DailySettlementEntity> history = settlementRepository.findAll().stream()
                .sorted(Comparator.comparing(DailySettlementEntity::getSettledAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        historyList.setAll(history);
    }

    private void updateDifference() {
        try {
            String clean = txtDelivered.getText().replaceAll("[^0-9.]", "").trim();
            BigDecimal delivered = clean.isEmpty() ? BigDecimal.ZERO : new BigDecimal(clean);
            BigDecimal expected = currentSummary != null ? currentSummary.totalCollected() : BigDecimal.ZERO;

            BigDecimal diff = delivered.subtract(expected);
            if (diff.compareTo(BigDecimal.ZERO) == 0) {
                lblDifference.setText("$ 0 (CUADRADO)");
                lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #10b981;");
            } else if (diff.compareTo(BigDecimal.ZERO) > 0) {
                lblDifference.setText("+ " + CURRENCY.format(diff) + "  (SOBRANTE)");
                lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #38bdf8;");
            } else {
                lblDifference.setText("- " + CURRENCY.format(diff.abs()) + " (FALTANTE)");
                lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #ef4444;");
            }
        } catch (Exception ignored) {
        }
    }

    private void doCloseSettlement() {
        if (currentSummary == null || currentSummary.isClosed()) {
            return;
        }

        try {
            String clean = txtDelivered.getText().replaceAll("[^0-9.]", "").trim();
            if (clean.isEmpty()) {
                showError("Ingresa el monto de efectivo físico entregado.");
                return;
            }

            BigDecimal delivered = new BigDecimal(clean);
            String justification = txtJustification.getText();

            String authorId = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("usr-col-1");

            settlementUseCase.closeSettlement(currentSummary.sessionId(), delivered, justification, authorId);
            refresh();

            lblFeedback.setText("Liquidación cerrada exitosamente.");
            lblFeedback.setStyle("-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);
        } catch (Exception ex) {
            showError(ex.getMessage());
        }
    }

    private void showError(String msg) {
        lblFeedback.setText(msg);
        lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }
}
