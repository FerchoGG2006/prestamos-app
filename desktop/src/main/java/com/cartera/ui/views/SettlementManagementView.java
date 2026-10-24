package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.DailySettlementEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.DailySettlementRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.settlement.application.SettlementUseCase.DaySettlementSummary;
import com.cartera.ui.util.CurrencyInputUtil;
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
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Vista de Liquidaciones y Cierre Diario de Rutas para la administración.
 * Cierres inmutables según las directrices financieras de AGENTS.md.
 * Separa claramente los gastos operativos de la ruta de los consumos personales (descuento a nómina).
 */
public class SettlementManagementView extends VBox {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public record UserOption(String id, String displayName) {
        @Override
        public String toString() {
            return displayName;
        }
    }

    private final SettlementUseCase settlementUseCase;
    private final DailySettlementRepository settlementRepository;
    private final AppUserRepository userRepository;
    private final RouteRepository routeRepository;
    private final Stage ownerStage;

    private final DatePicker dpDate = new DatePicker(LocalDate.now());
    private final ComboBox<UserOption> cmbCollector = new ComboBox<>();

    private final Label lblCollected = new Label("$ 0");
    private final Label lblRouteExpenses = new Label("$ 0");
    private final Label lblNetExpected = new Label("$ 0");

    private final TextField txtDelivered = new TextField("0");
    private final Label lblDifference = new Label("$ 0 (CUADRADO)");
    private final CheckBox chkPayrollDeduction = new CheckBox("Imputar faltante como Descuento de Nómina al Cobrador");
    private final TextField txtPayrollAmount = new TextField("0");
    private final ComboBox<String> cmbPayrollReason = new ComboBox<>();
    private final VBox payrollBox = new VBox(8);

    private final TextField txtJustification = new TextField();
    private final Button btnCloseSettlement = new Button("Cerrar y Liquidar Jornada");
    private final Label lblStatusBadge = new Label("JORNADA ABIERTA");
    private final Label lblFeedback = new Label();

    // Calculadora y Desglose Rápido de Billetes y Monedas
    private final TextField txtDenom100k = new TextField();
    private final TextField txtDenom50k = new TextField();
    private final TextField txtDenom20k = new TextField();
    private final TextField txtDenom10k = new TextField();
    private final TextField txtDenom5k = new TextField();
    private final TextField txtDenom2k = new TextField();
    private final TextField txtDenomCoins = new TextField();
    private final Label lblDenomBillsTotal = new Label("Billetes: $ 0");
    private final Label lblDenomCoinsTotal = new Label("Monedas: $ 0");
    private final Label lblDenomGrandTotal = new Label("Total Contado: $ 0");
    private final VBox denominationPanel = new VBox(10);

    private DaySettlementSummary currentSummary;
    private final ObservableList<CashMovementEntity> routeExpensesObservable = FXCollections.observableArrayList();
    private final TableView<CashMovementEntity> expensesTable = new TableView<>();

    private final ObservableList<DailySettlementEntity> historyList = FXCollections.observableArrayList();
    private final TableView<DailySettlementEntity> historyTable = new TableView<>();

    private final VBox scrollableContent = new VBox(18);

    public SettlementManagementView(SettlementUseCase settlementUseCase, DailySettlementRepository settlementRepository) {
        this(settlementUseCase, settlementRepository, null, null, null);
    }

    public SettlementManagementView(
            SettlementUseCase settlementUseCase,
            DailySettlementRepository settlementRepository,
            AppUserRepository userRepository,
            Stage ownerStage
    ) {
        this(settlementUseCase, settlementRepository, userRepository, null, ownerStage);
    }

    public SettlementManagementView(
            SettlementUseCase settlementUseCase,
            DailySettlementRepository settlementRepository,
            AppUserRepository userRepository,
            RouteRepository routeRepository,
            Stage ownerStage
    ) {
        this.settlementUseCase = settlementUseCase;
        this.settlementRepository = settlementRepository;
        this.userRepository = userRepository;
        this.routeRepository = routeRepository;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();

        ScrollPane scrollPane = new ScrollPane(scrollableContent);
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background: transparent; -fx-background-color: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);

        buildMetrics();
        buildSettlementCard();
        buildExpensesCard();
        buildHistoryTableCard();

        getChildren().add(scrollPane);

        loadCollectors();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Liquidación y Arqueo Diario de Rutas");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Supervisión contable, deducción de gastos operativos y cuadre de efectivo por cobrador");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        dpDate.getStyleClass().add("search-field");
        dpDate.valueProperty().addListener((obs, old, val) -> refresh());

        cmbCollector.getStyleClass().add("search-field");
        cmbCollector.setPrefWidth(220);
        cmbCollector.valueProperty().addListener((obs, old, val) -> refreshInternal());

        Button btnAddExpense = new Button("+ Registrar Gasto");
        btnAddExpense.setStyle("-fx-background-color: #fffbeb; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 7 14; -fx-cursor: hand;");
        btnAddExpense.setOnAction(e -> openNewExpenseDialog());

        Button btnRefresh = new Button("Recalcular");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, new Label("Fecha:"), dpDate, new Label("Cobrador:"), cmbCollector, btnAddExpense, btnRefresh);
        getChildren().add(top);
    }

    private void buildMetrics() {
        HBox metrics = new HBox(16);

        lblCollected.getStyleClass().add("metric-value-green");
        lblRouteExpenses.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #d97706;");
        lblNetExpected.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #2563eb;");

        VBox card1 = createMetricCard("1. Total Cobrado en Sistema", lblCollected, "Suma bruta de abonos recaudados");
        VBox card2 = createMetricCard("2. (-) Gastos Operativos Ruta", lblRouteExpenses, "Pinchazos, datos, gasolina (Descontados)");
        VBox card3 = createMetricCard("3. (=) Efectivo Neto a Rendir", lblNetExpected, "Monto contractual a entregar a caja");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(card2, Priority.ALWAYS);
        HBox.setHgrow(card3, Priority.ALWAYS);

        metrics.getChildren().addAll(card1, card2, card3);
        scrollableContent.getChildren().add(metrics);
    }

    private VBox createMetricCard(String title, Label valueLabel, String subtitle) {
        VBox card = new VBox(6);
        card.getStyleClass().add("metric-card");
        Label lblTitle = new Label(title);
        lblTitle.getStyleClass().add("metric-title");
        Label lblSub = new Label(subtitle);
        lblSub.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
        card.getChildren().addAll(lblTitle, valueLabel, lblSub);
        return card;
    }

    private void buildSettlementCard() {
        VBox card = new VBox(14);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(20));

        HBox cardHeader = new HBox(12);
        cardHeader.setAlignment(Pos.CENTER_LEFT);
        Label cardTitle = new Label("Cuadre y Cierre de Jornada");
        cardTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 12;");
        cardHeader.getChildren().addAll(cardTitle, spacer, lblStatusBadge);

        GridPane grid = new GridPane();
        grid.setHgap(20);
        grid.setVgap(14);

        txtDelivered.getStyleClass().add("search-field");
        txtDelivered.setStyle("-fx-font-size: 15px; -fx-font-weight: bold;");
        txtDelivered.textProperty().addListener((obs, old, val) -> updateDifference());

        lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #059669;");

        txtJustification.setPromptText("Observaciones o notas de auditoría del cierre...");
        txtJustification.getStyleClass().add("search-field");

        grid.add(createFieldBox("Efectivo Físico Entregado en Mano ($) *", txtDelivered), 0, 0);
        grid.add(createFieldBox("Diferencia / Cuadre", lblDifference), 1, 0);
        grid.add(createFieldBox("Observaciones de Auditoría", txtJustification), 0, 1, 2, 1);

        buildDenominationPanel();
        buildPayrollPanel();

        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        HBox actionBox = new HBox(12);
        actionBox.setAlignment(Pos.CENTER_RIGHT);

        Button btnCopyWhatsAppReport = new Button("📲 Copiar Reporte WhatsApp");
        btnCopyWhatsAppReport.getStyleClass().add("btn-secondary");
        btnCopyWhatsAppReport.setStyle("-fx-font-size: 13px; -fx-padding: 8 16;");
        btnCopyWhatsAppReport.setOnAction(e -> copyCuadreWhatsAppReport());

        btnCloseSettlement.getStyleClass().add("btn-primary");
        btnCloseSettlement.setStyle("-fx-font-size: 13px; -fx-padding: 8 18;");
        btnCloseSettlement.setOnAction(e -> doCloseSettlement());

        actionBox.getChildren().addAll(btnCopyWhatsAppReport, btnCloseSettlement);

        card.getChildren().addAll(cardHeader, grid, denominationPanel, payrollBox, lblFeedback, actionBox);
        scrollableContent.getChildren().add(card);
    }

    private void buildDenominationPanel() {
        denominationPanel.setStyle("-fx-background-color: #f8fafc; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");

        HBox header = new HBox(8);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("💵 Calculadora y Desglose Rápido de Efectivo Físico");
        title.setStyle("-fx-font-size: 13px; -fx-font-weight: bold; -fx-text-fill: #1e293b;");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Button btnClear = new Button("Limpiar Conteo");
        btnClear.getStyleClass().add("btn-secondary");
        btnClear.setStyle("-fx-font-size: 11px; -fx-padding: 4 10; -fx-cursor: hand;");
        btnClear.setOnAction(e -> clearDenominations());
        header.getChildren().addAll(title, spacer, btnClear);

        FlowPane flow = new FlowPane(12, 10);
        flow.setAlignment(Pos.CENTER_LEFT);

        flow.getChildren().addAll(
                createDenomInput("Billetes $100.000", txtDenom100k),
                createDenomInput("Billetes $50.000", txtDenom50k),
                createDenomInput("Billetes $20.000", txtDenom20k),
                createDenomInput("Billetes $10.000", txtDenom10k),
                createDenomInput("Billetes $5.000", txtDenom5k),
                createDenomInput("Billetes $2.000", txtDenom2k),
                createDenomInput("Monedas ($)", txtDenomCoins)
        );

        HBox summary = new HBox(12);
        summary.setAlignment(Pos.CENTER_LEFT);
        lblDenomBillsTotal.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #2563eb;");
        lblDenomCoinsTotal.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #d97706;");
        lblDenomGrandTotal.setStyle("-fx-font-size: 12px; -fx-font-weight: 800; -fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-padding: 4 8; -fx-background-radius: 6;");

        Label sep1 = new Label("•");
        sep1.setStyle("-fx-text-fill: #cbd5e1;");
        Label sep2 = new Label("•");
        sep2.setStyle("-fx-text-fill: #cbd5e1;");

        summary.getChildren().addAll(lblDenomBillsTotal, sep1, lblDenomCoinsTotal, sep2, lblDenomGrandTotal);

        denominationPanel.getChildren().addAll(header, flow, summary);

        txtDenom100k.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
        txtDenom50k.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
        txtDenom20k.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
        txtDenom10k.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
        txtDenom5k.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
        txtDenom2k.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
        txtDenomCoins.textProperty().addListener((o, oldV, newV) -> calculateDenominations());
    }

    private VBox createDenomInput(String label, TextField field) {
        VBox box = new VBox(3);
        box.setPrefWidth(110);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-text-fill: #64748b;");
        field.setPromptText("0");
        field.getStyleClass().add("search-field");
        field.setStyle("-fx-font-size: 12px; -fx-padding: 6 8; -fx-font-weight: bold;");
        box.getChildren().addAll(lbl, field);
        return box;
    }

    private void clearDenominations() {
        txtDenom100k.clear();
        txtDenom50k.clear();
        txtDenom20k.clear();
        txtDenom10k.clear();
        txtDenom5k.clear();
        txtDenom2k.clear();
        txtDenomCoins.clear();
        calculateDenominations();
    }

    private void calculateDenominations() {
        long q100 = parseCount(txtDenom100k.getText());
        long q50 = parseCount(txtDenom50k.getText());
        long q20 = parseCount(txtDenom20k.getText());
        long q10 = parseCount(txtDenom10k.getText());
        long q5 = parseCount(txtDenom5k.getText());
        long q2 = parseCount(txtDenom2k.getText());
        BigDecimal coins = CurrencyInputUtil.parseAmount(txtDenomCoins.getText());

        BigDecimal billsTotal = BigDecimal.valueOf(q100 * 100_000L + q50 * 50_000L + q20 * 20_000L + q10 * 10_000L + q5 * 5_000L + q2 * 2_000L);
        BigDecimal grandTotal = billsTotal.add(coins.max(BigDecimal.ZERO));

        lblDenomBillsTotal.setText("Billetes: " + CURRENCY.format(billsTotal));
        lblDenomCoinsTotal.setText("Monedas: " + CURRENCY.format(coins));
        lblDenomGrandTotal.setText("Total Contado: " + CURRENCY.format(grandTotal));

        if (grandTotal.compareTo(BigDecimal.ZERO) > 0 || anyDenomTouched()) {
            txtDelivered.setText(grandTotal.toPlainString());
        }
    }

    private boolean anyDenomTouched() {
        return !txtDenom100k.getText().trim().isEmpty() ||
                !txtDenom50k.getText().trim().isEmpty() ||
                !txtDenom20k.getText().trim().isEmpty() ||
                !txtDenom10k.getText().trim().isEmpty() ||
                !txtDenom5k.getText().trim().isEmpty() ||
                !txtDenom2k.getText().trim().isEmpty() ||
                !txtDenomCoins.getText().trim().isEmpty();
    }

    private long parseCount(String text) {
        if (text == null || text.trim().isEmpty()) return 0;
        try {
            return Math.max(0, Long.parseLong(text.replaceAll("[^0-9]", "")));
        } catch (Exception e) {
            return 0;
        }
    }

    private void buildPayrollPanel() {
        payrollBox.setStyle("-fx-background-color: #fffbeb; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #fde68a; -fx-border-radius: 8;");
        payrollBox.setVisible(false);
        payrollBox.setManaged(false);

        chkPayrollDeduction.setStyle("-fx-text-fill: #92400e; -fx-font-weight: bold; -fx-font-size: 12px;");
        chkPayrollDeduction.selectedProperty().addListener((obs, old, isSelected) -> {
            txtPayrollAmount.setDisable(!isSelected);
            cmbPayrollReason.setDisable(!isSelected);
        });

        HBox inputs = new HBox(16);
        inputs.setAlignment(Pos.CENTER_LEFT);

        txtPayrollAmount.setPromptText("Monto a descontar");
        txtPayrollAmount.getStyleClass().add("search-field");
        txtPayrollAmount.setPrefWidth(160);
        txtPayrollAmount.setStyle("-fx-font-weight: bold;");

        cmbPayrollReason.getItems().setAll(
                "Consumo personal: almuerzo / refrigerio",
                "Consumo personal: gaseosa / bolsa de agua",
                "Faltante injustificado en ruta",
                "Anticipo de salario en ruta",
                "Otro consumo personal del cobrador"
        );
        cmbPayrollReason.setEditable(true);
        cmbPayrollReason.getSelectionModel().selectFirst();
        cmbPayrollReason.getStyleClass().add("search-field");
        cmbPayrollReason.setPrefWidth(320);

        inputs.getChildren().addAll(
                new Label("Monto Nómina ($):"),
                txtPayrollAmount,
                new Label("Concepto:"),
                cmbPayrollReason
        );

        Label help = new Label("💡 Política operativa: Los consumos personales del cobrador (almuerzo, bebidas o anticipos) no son gastos de ruta y se descuentan de su nómina.");
        help.setStyle("-fx-text-fill: #b45309; -fx-font-size: 11px; -fx-font-style: italic;");

        payrollBox.getChildren().addAll(chkPayrollDeduction, inputs, help);
    }

    @SuppressWarnings("unchecked")
    private void buildExpensesCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(16));

        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("Desglose de Gastos Operativos de la Ruta del Día");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnNewExpense = new Button("+ Añadir Gasto Operativo");
        btnNewExpense.getStyleClass().add("btn-secondary");
        btnNewExpense.setOnAction(e -> openNewExpenseDialog());

        header.getChildren().addAll(title, spacer, btnNewExpense);

        expensesTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        expensesTable.setPrefHeight(140);

        TableColumn<CashMovementEntity, String> colHour = new TableColumn<>("HORA");
        colHour.setCellValueFactory(d -> new SimpleStringProperty(formatHour(d.getValue().getCreatedAt())));
        colHour.setPrefWidth(90);

        TableColumn<CashMovementEntity, String> colCat = new TableColumn<>("CONCEPTO OPERATIVO");
        colCat.setCellValueFactory(d -> new SimpleStringProperty(friendlyCategory(d.getValue().getCategory())));
        colCat.setPrefWidth(180);

        TableColumn<CashMovementEntity, String> colAmount = new TableColumn<>("VALOR");
        colAmount.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getAmount())));
        colAmount.setPrefWidth(120);

        TableColumn<CashMovementEntity, String> colDesc = new TableColumn<>("DETALLE / COMPROBANTE");
        colDesc.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getDescription()));
        colDesc.setPrefWidth(280);

        expensesTable.getColumns().addAll(colHour, colCat, colAmount, colDesc);
        expensesTable.setItems(routeExpensesObservable);

        card.getChildren().addAll(header, expensesTable);
        scrollableContent.getChildren().add(card);
    }

    @SuppressWarnings("unchecked")
    private void buildHistoryTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        HBox titleBox = new HBox(12);
        titleBox.setAlignment(Pos.CENTER_LEFT);
        titleBox.setPadding(new Insets(14, 16, 8, 16));

        Label title = new Label("Historial de Liquidaciones Cerradas");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnViewVoucher = new Button("Ver Comprobante");
        btnViewVoucher.getStyleClass().add("btn-secondary");
        btnViewVoucher.setOnAction(e -> {
            DailySettlementEntity selected = historyTable.getSelectionModel().getSelectedItem();
            if (selected != null) {
                showVoucherDialog(selected);
            } else {
                showError("Selecciona una liquidación del historial para ver el comprobante.");
            }
        });

        titleBox.getChildren().addAll(title, spacer, btnViewVoucher);

        historyTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        historyTable.setPrefHeight(220);
        VBox.setVgrow(historyTable, Priority.ALWAYS);

        TableColumn<DailySettlementEntity, String> colDate = new TableColumn<>("FECHA CIERRE");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getSettledAt()));
        colDate.setPrefWidth(140);

        TableColumn<DailySettlementEntity, String> colExp = new TableColumn<>("NETO ESPERADO");
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
                        setStyle("-fx-text-fill: #059669; -fx-font-weight: bold;");
                    } else if (diff.compareTo(BigDecimal.ZERO) > 0) {
                        setStyle("-fx-text-fill: #2563eb; -fx-font-weight: bold;");
                    } else {
                        setStyle("-fx-text-fill: #dc2626; -fx-font-weight: bold;");
                    }
                }
            }
        });
        colDif.setPrefWidth(120);

        TableColumn<DailySettlementEntity, String> colJust = new TableColumn<>("OBSERVACIONES / DEDUCCIONES");
        colJust.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getDifferenceJustification()));
        colJust.setPrefWidth(260);

        historyTable.getColumns().addAll(colDate, colExp, colAct, colDif, colJust);
        historyTable.setItems(historyList);

        tableCard.getChildren().addAll(titleBox, historyTable);
        scrollableContent.getChildren().add(tableCard);
    }

    private void loadCollectors() {
        UserOption prevSelected = cmbCollector.getValue();
        cmbCollector.getItems().clear();
        if (userRepository != null) {
            List<AppUserEntity> users = userRepository.findAll().stream()
                    .filter(u -> u.getActive() != null && u.getActive() == 1)
                    .toList();
            for (AppUserEntity u : users) {
                cmbCollector.getItems().add(new UserOption(u.getId(), u.getFullName() != null ? u.getFullName() : u.getUsername()));
            }
        }
        if (cmbCollector.getItems().isEmpty()) {
            cmbCollector.getItems().add(new UserOption("usr-col-1", "Carlos Cobrador"));
        }

        // Si hay una ruta activa seleccionada globalmente, sincronizar con su cobrador asignado
        String selectedRoute = UserSessionContext.getSelectedRouteId();
        if (routeRepository != null && selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute)) {
            String assignedCollector = routeRepository.findById(selectedRoute)
                    .map(RouteEntity::getCollectorId)
                    .orElse(null);
            if (assignedCollector != null) {
                for (UserOption opt : cmbCollector.getItems()) {
                    if (assignedCollector.equalsIgnoreCase(opt.id())) {
                        cmbCollector.setValue(opt);
                        return;
                    }
                }
            }
        }

        if (prevSelected != null) {
            for (UserOption opt : cmbCollector.getItems()) {
                if (prevSelected.id().equals(opt.id())) {
                    cmbCollector.setValue(opt);
                    return;
                }
            }
        }
        cmbCollector.getSelectionModel().selectFirst();
    }

    private VBox createFieldBox(String label, javafx.scene.Node content) {
        VBox box = new VBox(4);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        box.getChildren().addAll(lbl, content);
        return box;
    }

    public void refresh() {
        loadCollectors();
        refreshInternal();
    }

    private void refreshInternal() {
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        UserOption selectedUser = cmbCollector.getValue();
        String collectorId = selectedUser != null ? selectedUser.id() : "usr-col-1";

        currentSummary = settlementUseCase.getOrCreateDaySummary(collectorId, date);

        lblCollected.setText(CURRENCY.format(currentSummary.totalCollected()));
        lblRouteExpenses.setText(CURRENCY.format(currentSummary.routeExpenses()));
        lblNetExpected.setText(CURRENCY.format(currentSummary.netExpectedCash()));

        routeExpensesObservable.setAll(currentSummary.routeExpensesList());

        if (currentSummary.isClosed()) {
            lblStatusBadge.setText("LIQUIDADA / CERRADA");
            lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 12;");
            txtDelivered.setDisable(true);
            txtJustification.setDisable(true);
            btnCloseSettlement.setDisable(true);
            denominationPanel.setDisable(true);
            payrollBox.setVisible(false);
            payrollBox.setManaged(false);

            if (currentSummary.settlement() != null) {
                txtDelivered.setText(currentSummary.settlement().getActualCollection().toString());
                txtJustification.setText(currentSummary.settlement().getDifferenceJustification());
            }
        } else {
            lblStatusBadge.setText("JORNADA ABIERTA");
            lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 12;");
            txtDelivered.setDisable(false);
            txtJustification.setDisable(false);
            btnCloseSettlement.setDisable(false);
            denominationPanel.setDisable(false);

            if ("0".equals(txtDelivered.getText().trim())) {
                txtDelivered.setText(currentSummary.netExpectedCash().toString());
            }
        }

        updateDifference();

        List<DailySettlementEntity> history = settlementRepository.findAll().stream()
                .sorted(Comparator.comparing(DailySettlementEntity::getSettledAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        historyList.setAll(history);
    }

    private void updateDifference() {
        try {
            BigDecimal delivered = CurrencyInputUtil.parseAmount(txtDelivered.getText());
            BigDecimal netExpected = currentSummary != null ? currentSummary.netExpectedCash() : BigDecimal.ZERO;

            BigDecimal diff = delivered.subtract(netExpected);
            if (diff.compareTo(BigDecimal.ZERO) == 0) {
                lblDifference.setText("$ 0 (CUADRADO EXACTO)");
                lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #059669;");
                txtJustification.setPromptText("Observaciones o notas de auditoría del cierre...");
                if (currentSummary != null && !currentSummary.isClosed()) {
                    payrollBox.setVisible(false);
                    payrollBox.setManaged(false);
                }
            } else if (diff.compareTo(BigDecimal.ZERO) > 0) {
                lblDifference.setText("+ " + CURRENCY.format(diff) + "  (SOBRANTE)");
                lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #2563eb;");
                txtJustification.setPromptText("Observaciones obligatorias para justificar el descuadre *");
                if (currentSummary != null && !currentSummary.isClosed()) {
                    payrollBox.setVisible(false);
                    payrollBox.setManaged(false);
                }
            } else {
                BigDecimal faltante = diff.abs();
                lblDifference.setText("- " + CURRENCY.format(faltante) + " (FALTANTE / DESCUADRE)");
                lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #dc2626;");
                txtJustification.setPromptText("Observaciones obligatorias para justificar el descuadre *");
                if (currentSummary != null && !currentSummary.isClosed()) {
                    payrollBox.setVisible(true);
                    payrollBox.setManaged(true);
                    chkPayrollDeduction.setSelected(true);
                    txtPayrollAmount.setText(faltante.toPlainString());
                }
            }
        } catch (Exception ignored) {
        }
    }

    private void openNewExpenseDialog() {
        UserOption selectedUser = cmbCollector.getValue();
        String collectorId = selectedUser != null ? selectedUser.id() : "usr-col-1";
        String activeRoute = UserSessionContext.getSelectedRouteId();
        String routeId = "ALL".equalsIgnoreCase(activeRoute) ? "route-norte" : activeRoute;
        RouteExpenseDialog.show(ownerStage, collectorId, routeId, settlementUseCase, saved -> {
            if (saved) {
                refresh();
            }
        });
    }

    private void doCloseSettlement() {
        if (currentSummary == null || currentSummary.isClosed()) {
            return;
        }

        try {
            if (txtDelivered.getText() == null || txtDelivered.getText().trim().isEmpty()) {
                showError("Ingresa el monto de efectivo físico entregado.");
                return;
            }

            BigDecimal delivered = CurrencyInputUtil.parseAmount(txtDelivered.getText());
            String justification = txtJustification.getText();

            BigDecimal payrollAmount = BigDecimal.ZERO;
            String payrollReason = null;

            if (chkPayrollDeduction.isSelected() && payrollBox.isVisible()) {
                payrollAmount = CurrencyInputUtil.parseAmount(txtPayrollAmount.getText());
                payrollReason = cmbPayrollReason.getValue();
            }

            String authorId = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("admin");

            settlementUseCase.closeSettlement(
                    currentSummary.sessionId(),
                    delivered,
                    payrollAmount,
                    payrollReason,
                    justification,
                    authorId
            );

            refresh();

            lblFeedback.setText("Liquidación diaria cerrada con éxito. El arqueo ha quedado registrado.");
            lblFeedback.setStyle("-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);
        } catch (Exception ex) {
            showError(ex.getMessage());
        }
    }

    private void showVoucherDialog(DailySettlementEntity settlement) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        if (ownerStage != null) {
            dialog.initOwner(ownerStage);
        }
        dialog.setTitle("Comprobante de Liquidación Diaria");
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(420);

        Label title = new Label("COMPROBANTE DE LIQUIDACIÓN");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        VBox card = new VBox(8);
        card.setStyle("-fx-background-color: #f8fafc; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #e2e8f0;");

        card.getChildren().addAll(
                new Label("Fecha Cierre: " + settlement.getSettledAt()),
                new Label("ID Sesión: " + settlement.getSessionId()),
                new Label("Efectivo Neto Esperado: " + CURRENCY.format(settlement.getExpectedCollection())),
                new Label("Efectivo Físico Recibido: " + CURRENCY.format(settlement.getActualCollection())),
                new Label("Diferencia: " + CURRENCY.format(settlement.getCashDifference())),
                new Label("Observaciones: " + settlement.getDifferenceJustification())
        );

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> dialog.close());

        HBox actions = new HBox(btnClose);
        actions.setAlignment(Pos.CENTER_RIGHT);

        root.getChildren().addAll(title, card, actions);
        Scene scene = new Scene(root);
        try {
            scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        } catch (Exception ignored) {}
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private String formatHour(String isoTime) {
        if (isoTime == null || !isoTime.contains("T")) return "";
        try {
            return isoTime.substring(isoTime.indexOf("T") + 1, Math.min(isoTime.indexOf("T") + 6, isoTime.length()));
        } catch (Exception e) {
            return "";
        }
    }

    private String friendlyCategory(String code) {
        if (code == null) return "Gasto de Ruta";
        return switch (code.toUpperCase()) {
            case SettlementUseCase.CAT_GASTO_PINCHAZO -> "Pinchazo / Taller Moto";
            case SettlementUseCase.CAT_GASTO_DATOS -> "Recarga / Plan Datos Celular";
            case SettlementUseCase.CAT_GASTO_GASOLINA -> "Combustible / Gasolina";
            case "GASTO_RUTA_VIATICOS" -> "Peaje / Viáticos";
            default -> "Gasto Operativo Ruta";
        };
    }

    private void copyCuadreWhatsAppReport() {
        if (currentSummary == null) return;
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        UserOption selectedUser = cmbCollector.getValue();
        String collectorName = selectedUser != null ? selectedUser.displayName() : "Cobrador";

        StringBuilder sb = new StringBuilder();
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("📊 *REPORTE DE CUADRE DIARIO*\n");
        sb.append("📅 *Fecha:* ").append(date).append("\n");
        sb.append("👤 *Cobrador:* ").append(collectorName).append("\n");
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n\n");
        sb.append("📥 *1. COBRADO HOY*\n");
        sb.append("• *Total Cobrado:* ").append(CURRENCY.format(currentSummary.totalCollected())).append("\n\n");
        sb.append("⛽ *2. GASTOS DE RUTA:* ").append(CURRENCY.format(currentSummary.routeExpenses())).append("\n");
        sb.append("💵 *3. NETO ESPERADO EN EFECTIVO:* ").append(CURRENCY.format(currentSummary.netExpectedCash())).append("\n\n");

        if (anyDenomTouched()) {
            sb.append("💵 *DESGLOSE DE EFECTIVO FÍSICO CONTADO:*\n");
            long q100 = parseCount(txtDenom100k.getText());
            long q50 = parseCount(txtDenom50k.getText());
            long q20 = parseCount(txtDenom20k.getText());
            long q10 = parseCount(txtDenom10k.getText());
            long q5 = parseCount(txtDenom5k.getText());
            long q2 = parseCount(txtDenom2k.getText());
            BigDecimal coins = CurrencyInputUtil.parseAmount(txtDenomCoins.getText());
            if (q100 > 0) sb.append("• Billetes $100.000: ").append(q100).append(" (").append(CURRENCY.format(q100 * 100_000L)).append(")\n");
            if (q50 > 0) sb.append("• Billetes $50.000: ").append(q50).append(" (").append(CURRENCY.format(q50 * 50_000L)).append(")\n");
            if (q20 > 0) sb.append("• Billetes $20.000: ").append(q20).append(" (").append(CURRENCY.format(q20 * 20_000L)).append(")\n");
            if (q10 > 0) sb.append("• Billetes $10.000: ").append(q10).append(" (").append(CURRENCY.format(q10 * 10_000L)).append(")\n");
            if (q5 > 0) sb.append("• Billetes $5.000: ").append(q5).append(" (").append(CURRENCY.format(q5 * 5_000L)).append(")\n");
            if (q2 > 0) sb.append("• Billetes $2.000: ").append(q2).append(" (").append(CURRENCY.format(q2 * 2_000L)).append(")\n");
            if (coins.compareTo(BigDecimal.ZERO) > 0) sb.append("• Monedas / Fracción: ").append(CURRENCY.format(coins)).append("\n");
            BigDecimal billsTotal = BigDecimal.valueOf(q100 * 100_000L + q50 * 50_000L + q20 * 20_000L + q10 * 10_000L + q5 * 5_000L + q2 * 2_000L);
            BigDecimal grandTotal = billsTotal.add(coins.max(BigDecimal.ZERO));
            sb.append("• *Total Físico Contado:* ").append(CURRENCY.format(grandTotal)).append("\n\n");
        }

        if (currentSummary.isClosed() && currentSummary.settlement() != null) {
            sb.append("✅ *ESTADO:* JORNADA CERRADA\n");
            sb.append("• *Efectivo Entregado:* ").append(CURRENCY.format(currentSummary.settlement().getActualCollection())).append("\n");
        } else {
            sb.append("⏳ *ESTADO:* JORNADA EN CURSO\n");
        }
        sb.append("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
        sb.append("_Generado desde Sistema de Cartera Desktop_");

        javafx.scene.input.ClipboardContent content = new javafx.scene.input.ClipboardContent();
        content.putString(sb.toString());
        javafx.scene.input.Clipboard.getSystemClipboard().setContent(content);

        lblFeedback.setText("¡Reporte de Cuadre copiado al portapapeles! Listo para pegar en WhatsApp.");
        lblFeedback.setStyle("-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }

    private void showError(String msg) {
        lblFeedback.setText(msg);
        lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }
}
