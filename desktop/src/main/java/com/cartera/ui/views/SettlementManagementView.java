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
import com.cartera.ui.util.UiLabels;
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
    private final TextField txtOpeningBase = new TextField("0");
    private final Label lblCollectedPlusBase = new Label("$ 0");
    private final Label lblRouteExpenses = new Label("$ 0");
    private final Label lblNetExpected = new Label("$ 0");
    private boolean updatingOpeningBase = false;

    private final TextField txtDelivered = new TextField("0");
    private final Label lblDifference = new Label("$ 0 (CUADRADO)");
    private final ToggleGroup dispositionGroup = new ToggleGroup();
    private final RadioButton rbKeepInRoute = new RadioButton("Dejar en la ruta (base para mañana / sábado)");
    private final RadioButton rbWithdrawToOffice = new RadioButton("Retirar a oficina central (diario o corte)");
    private final TextField txtWithdrawToOffice = new TextField("0");
    private final Label lblTomorrowBasePreview = new Label("Base de inicio automática para mañana: $ 0");
    private final VBox dispositionBox = new VBox(8);
    private final HBox withdrawInputRow = new HBox(10);
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
    }

    private boolean loadingCollectors = false;
    private Button btnHeaderAddExpense;
    private Button btnCardAddExpense;

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
        cmbCollector.valueProperty().addListener((obs, old, val) -> {
            if (!loadingCollectors) {
                refreshInternal();
            }
        });

        btnHeaderAddExpense = new Button("+ Registrar Gasto");
        btnHeaderAddExpense.setStyle("-fx-background-color: #fffbeb; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 7 14; -fx-cursor: hand;");
        btnHeaderAddExpense.setOnAction(e -> openNewExpenseDialog());

        Button btnRefresh = new Button("Recalcular");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, new Label("Fecha:"), dpDate, new Label("Cobrador:"), cmbCollector, btnHeaderAddExpense, btnRefresh);
        getChildren().add(top);
    }

    private final Label lblPaymentBreakdown = new Label();

    private void buildMetrics() {
        VBox metricsWrapper = new VBox(12);
        HBox metrics = new HBox(14);

        lblCollected.getStyleClass().add("metric-value-green");
        lblCollectedPlusBase.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #15803d;");
        lblRouteExpenses.setStyle("-fx-font-size: 20px; -fx-font-weight: bold; -fx-text-fill: #d97706;");
        lblNetExpected.setStyle("-fx-font-size: 22px; -fx-font-weight: bold; -fx-text-fill: #2563eb;");

        VBox card1 = createMetricCard("1. Cobrado Hoy", lblCollected, "Suma bruta de cuotas cobradas");
        lblPaymentBreakdown.setStyle("-fx-font-size: 11px; -fx-text-fill: #64748b;");
        card1.getChildren().add(lblPaymentBreakdown);

        VBox cardBase = new VBox(6);
        cardBase.getStyleClass().add("metric-card");
        cardBase.setStyle("-fx-background-color: #eff6ff; -fx-border-color: #bfdbfe; -fx-border-radius: 12; -fx-background-radius: 12;");
        Label lblBaseTitle = new Label("2. (+) Base de Inicio (Ruta)");
        lblBaseTitle.getStyleClass().add("metric-title");
        lblBaseTitle.setStyle("-fx-text-fill: #1d4ed8; -fx-font-weight: bold;");
        txtOpeningBase.getStyleClass().add("search-field");
        txtOpeningBase.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #1e3a8a;");
        txtOpeningBase.setPromptText("0");
        txtOpeningBase.textProperty().addListener((obs, oldV, newV) -> {
            if (!updatingOpeningBase) {
                recalculateFromOpeningBase();
            }
        });
        txtOpeningBase.focusedProperty().addListener((obs, wasFocused, isFocused) -> {
            if (wasFocused && !isFocused && !updatingOpeningBase && currentSummary != null && !currentSummary.isClosed()) {
                persistCurrentOpeningBaseOverride();
            }
        });
        txtOpeningBase.setOnAction(e -> {
            if (!updatingOpeningBase && currentSummary != null && !currentSummary.isClosed()) {
                persistCurrentOpeningBaseOverride();
            }
        });
        Hyperlink lnkResetBase = new Hyperlink("Restaurar automático");
        lnkResetBase.setStyle("-fx-font-size: 10.5px; -fx-text-fill: #2563eb; -fx-padding: 0;");
        lnkResetBase.setOnAction(e -> restoreAutomaticOpeningBase());
        HBox baseSubRow = new HBox(8);
        baseSubRow.setAlignment(Pos.CENTER_LEFT);
        Label lblBaseSub = new Label("Efectivo entregado al iniciar la ruta");
        lblBaseSub.setStyle("-fx-text-fill: #1e40af; -fx-font-size: 11px;");
        baseSubRow.getChildren().addAll(lblBaseSub, lnkResetBase);
        cardBase.getChildren().addAll(lblBaseTitle, txtOpeningBase, baseSubRow);

        VBox cardPlusBase = createMetricCard("3. (=) Cobrado Hoy + Base", lblCollectedPlusBase, "Efectivo cobrado + Base de inicio");
        cardPlusBase.setStyle("-fx-background-color: #f0fdf4; -fx-border-color: #86efac; -fx-border-radius: 12; -fx-background-radius: 12;");

        VBox cardExpenses = createMetricCard("4. (-) Gastos Operativos Ruta", lblRouteExpenses, "Pinchazos, datos, gasolina");

        HBox.setHgrow(card1, Priority.ALWAYS);
        HBox.setHgrow(cardBase, Priority.ALWAYS);
        HBox.setHgrow(cardPlusBase, Priority.ALWAYS);
        HBox.setHgrow(cardExpenses, Priority.ALWAYS);
        metrics.getChildren().addAll(card1, cardBase, cardPlusBase, cardExpenses);

        VBox cardNet = createMetricCard("5. (=) Efectivo Neto a Rendir a Oficina", lblNetExpected, "Cobrado hoy + Base de inicio menos gastos de ruta");
        cardNet.setStyle("-fx-background-color: #eff6ff; -fx-border-color: #93c5fd; -fx-border-radius: 12; -fx-background-radius: 12;");

        metricsWrapper.getChildren().addAll(metrics, cardNet);
        scrollableContent.getChildren().add(metricsWrapper);
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
        buildDispositionPanel();
        buildPayrollPanel();

        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        HBox actionBox = new HBox(12);
        actionBox.setAlignment(Pos.CENTER_RIGHT);

        Button btnCopyWhatsAppReport = new Button("Copiar Resumen");
        btnCopyWhatsAppReport.getStyleClass().add("btn-secondary");
        btnCopyWhatsAppReport.setStyle("-fx-font-size: 13px; -fx-padding: 8 14;");
        btnCopyWhatsAppReport.setOnAction(e -> copyCuadreWhatsAppReport(false));

        Button btnSendWhatsAppReport = new Button("Enviar por WhatsApp");
        btnSendWhatsAppReport.setStyle("-fx-background-color: #16a34a; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 13px; -fx-padding: 8 16; -fx-background-radius: 8; -fx-cursor: hand;");
        btnSendWhatsAppReport.setOnAction(e -> copyCuadreWhatsAppReport(true));

        btnCloseSettlement.getStyleClass().add("btn-primary");
        btnCloseSettlement.setStyle("-fx-font-size: 13px; -fx-padding: 8 18;");
        btnCloseSettlement.setOnAction(e -> doCloseSettlement());

        actionBox.getChildren().addAll(btnCopyWhatsAppReport, btnSendWhatsAppReport, btnCloseSettlement);

        card.getChildren().addAll(cardHeader, grid, dispositionBox, denominationPanel, payrollBox, lblFeedback, actionBox);
        scrollableContent.getChildren().add(card);
    }

    private void buildDispositionPanel() {
        dispositionBox.setStyle("-fx-background-color: #f0fdf4; -fx-padding: 12 14; -fx-background-radius: 8; -fx-border-color: #bbf7d0; -fx-border-radius: 8;");
        Label title = new Label("Destino del Efectivo Base al Cerrar (la papelería se gestiona aparte)");
        title.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #166534;");

        rbKeepInRoute.setToggleGroup(dispositionGroup);
        rbWithdrawToOffice.setToggleGroup(dispositionGroup);
        rbKeepInRoute.setSelected(true);
        rbKeepInRoute.setStyle("-fx-font-weight: bold; -fx-text-fill: #14532d;");
        rbWithdrawToOffice.setStyle("-fx-font-weight: bold; -fx-text-fill: #1d4ed8;");

        HBox radioRow = new HBox(20, rbKeepInRoute, rbWithdrawToOffice);
        radioRow.setAlignment(Pos.CENTER_LEFT);

        txtWithdrawToOffice.getStyleClass().add("search-field");
        txtWithdrawToOffice.setPrefWidth(180);
        txtWithdrawToOffice.setPromptText("Monto a retirar ($)");
        txtWithdrawToOffice.textProperty().addListener((o, oldV, newV) -> updateTomorrowBasePreview());

        Button btnWithdrawAll = new Button("Retirar todo");
        btnWithdrawAll.getStyleClass().add("btn-secondary");
        btnWithdrawAll.setStyle("-fx-font-size: 11px; -fx-padding: 5 10;");
        btnWithdrawAll.setOnAction(e -> {
            BigDecimal available = parseDeliveredOrExpected();
            txtWithdrawToOffice.setText(available.toPlainString());
            updateTomorrowBasePreview();
        });

        withdrawInputRow.setAlignment(Pos.CENTER_LEFT);
        withdrawInputRow.getChildren().setAll(new Label("Monto a retirar ($):"), txtWithdrawToOffice, btnWithdrawAll);
        withdrawInputRow.setVisible(false);
        withdrawInputRow.setManaged(false);

        dispositionGroup.selectedToggleProperty().addListener((obs, oldT, newT) -> {
            boolean isWithdraw = newT == rbWithdrawToOffice;
            withdrawInputRow.setVisible(isWithdraw);
            withdrawInputRow.setManaged(isWithdraw);
            if (isWithdraw && currentSummary != null && parseWithdrawToOffice().compareTo(BigDecimal.ZERO) == 0) {
                txtWithdrawToOffice.setText(parseDeliveredOrExpected().toPlainString());
            }
            updateTomorrowBasePreview();
        });

        lblTomorrowBasePreview.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #0f172a;");
        dispositionBox.getChildren().setAll(title, radioRow, withdrawInputRow, lblTomorrowBasePreview);
    }

    private BigDecimal parseDeliveredOrExpected() {
        try {
            BigDecimal delivered = CurrencyInputUtil.parseAmount(txtDelivered.getText());
            if (delivered != null && delivered.compareTo(BigDecimal.ZERO) >= 0) {
                return delivered;
            }
        } catch (Exception ignored) {}
        return currentSummary != null && currentSummary.netExpectedCash() != null
                ? currentSummary.netExpectedCash()
                : BigDecimal.ZERO;
    }

    private BigDecimal parseWithdrawToOffice() {
        if (!rbWithdrawToOffice.isSelected()) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal parsed = CurrencyInputUtil.parseAmount(txtWithdrawToOffice.getText());
            return parsed != null && parsed.compareTo(BigDecimal.ZERO) > 0 ? parsed : BigDecimal.ZERO;
        } catch (Exception ignored) {
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal parseWithdrawToOfficeStrict() {
        if (!rbWithdrawToOffice.isSelected()) {
            return BigDecimal.ZERO;
        }
        String raw = txtWithdrawToOffice.getText();
        if (raw == null || raw.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal parsed = CurrencyInputUtil.parseAmount(raw);
            if (parsed.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("El monto a retirar a oficina no puede ser negativo.");
            }
            return parsed;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Monto inválido en 'Monto a retirar a oficina'. Ingrese pesos enteros.");
        }
    }

    private BigDecimal parseOpeningBaseStrict() {
        String raw = txtOpeningBase.getText();
        if (raw == null || raw.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal parsed = CurrencyInputUtil.parseAmount(raw);
            if (parsed.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("La base de inicio de ruta no puede ser negativa.");
            }
            return parsed;
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Monto inválido en 'Base de inicio'. Ingrese pesos enteros.");
        }
    }

    private void updateTomorrowBasePreview() {
        BigDecimal currentAvailable = parseDeliveredOrExpected();
        BigDecimal withdraw = parseWithdrawToOffice();
        BigDecimal tomorrowBase = currentAvailable.subtract(withdraw).max(BigDecimal.ZERO);
        lblTomorrowBasePreview.setText("Base de inicio automática que quedará para mañana: " + CURRENCY.format(tomorrowBase));
    }

    private void buildDenominationPanel() {
        denominationPanel.setStyle("-fx-background-color: #f8fafc; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");

        HBox header = new HBox(8);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("Calculadora y Desglose Rápido de Efectivo Físico");
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
        if (currentSummary != null && !currentSummary.isClosed()) {
            txtDelivered.setText("0");
        }
    }

    private BigDecimal computeBillsTotal() {
        return BigDecimal.valueOf(parseCount(txtDenom100k.getText())).multiply(BigDecimal.valueOf(100_000))
                .add(BigDecimal.valueOf(parseCount(txtDenom50k.getText())).multiply(BigDecimal.valueOf(50_000)))
                .add(BigDecimal.valueOf(parseCount(txtDenom20k.getText())).multiply(BigDecimal.valueOf(20_000)))
                .add(BigDecimal.valueOf(parseCount(txtDenom10k.getText())).multiply(BigDecimal.valueOf(10_000)))
                .add(BigDecimal.valueOf(parseCount(txtDenom5k.getText())).multiply(BigDecimal.valueOf(5_000)))
                .add(BigDecimal.valueOf(parseCount(txtDenom2k.getText())).multiply(BigDecimal.valueOf(2_000)));
    }

    private BigDecimal parseCoinsSafe() {
        String raw = txtDenomCoins.getText();
        if (raw == null || raw.isBlank()) return BigDecimal.ZERO;
        try {
            return CurrencyInputUtil.parseAmount(raw).max(BigDecimal.ZERO);
        } catch (Exception ex) {
            return BigDecimal.ZERO;
        }
    }

    private void calculateDenominations() {
        BigDecimal coins = parseCoinsSafe();
        BigDecimal billsTotal = computeBillsTotal();
        BigDecimal grandTotal = billsTotal.add(coins);

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

        Label help = new Label("Política operativa: Los consumos personales del cobrador (almuerzo, bebidas o anticipos) no son gastos de ruta y se descuentan de su nómina.");
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

        btnCardAddExpense = new Button("+ Añadir Gasto Operativo");
        btnCardAddExpense.getStyleClass().add("btn-secondary");
        btnCardAddExpense.setOnAction(e -> openNewExpenseDialog());

        header.getChildren().addAll(title, spacer, btnCardAddExpense);

        expensesTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        expensesTable.setPrefHeight(140);
        expensesTable.setPlaceholder(UiLabels.emptyState("Sin gastos operativos hoy", "Los pinchazos, combustible o datos registrados en ruta aparecerán aquí."));

        TableColumn<CashMovementEntity, String> colHour = new TableColumn<>("HORA");
        colHour.setCellValueFactory(d -> new SimpleStringProperty(formatHour(d.getValue().getCreatedAt())));
        colHour.setPrefWidth(90);

        TableColumn<CashMovementEntity, String> colCat = new TableColumn<>("CONCEPTO OPERATIVO");
        colCat.setCellValueFactory(d -> new SimpleStringProperty(friendlyCategory(d.getValue().getCategory())));
        colCat.setPrefWidth(180);

        TableColumn<CashMovementEntity, BigDecimal> colAmount = new TableColumn<>("VALOR");
        colAmount.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getAmount() != null ? d.getValue().getAmount() : BigDecimal.ZERO));
        colAmount.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(BigDecimal val, boolean empty) {
                super.updateItem(val, empty);
                setText(empty || val == null ? null : CURRENCY.format(val));
            }
        });
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
        historyTable.setPlaceholder(UiLabels.emptyState("Sin liquidaciones registradas", "El historial de cierres y arqueos diarios de ruta aparecerá aquí."));
        VBox.setVgrow(historyTable, Priority.ALWAYS);

        TableColumn<DailySettlementEntity, String> colDate = new TableColumn<>("FECHA CIERRE");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDateTime(d.getValue().getSettledAt())));
        colDate.setPrefWidth(145);

        TableColumn<DailySettlementEntity, BigDecimal> colExp = new TableColumn<>("NETO ESPERADO");
        colExp.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getExpectedCollection() != null ? d.getValue().getExpectedCollection() : BigDecimal.ZERO));
        colExp.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(BigDecimal val, boolean empty) {
                super.updateItem(val, empty);
                setText(empty || val == null ? null : CURRENCY.format(val));
            }
        });
        colExp.setPrefWidth(120);

        TableColumn<DailySettlementEntity, BigDecimal> colAct = new TableColumn<>("ENTREGADO");
        colAct.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getActualCollection() != null ? d.getValue().getActualCollection() : BigDecimal.ZERO));
        colAct.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(BigDecimal val, boolean empty) {
                super.updateItem(val, empty);
                setText(empty || val == null ? null : CURRENCY.format(val));
            }
        });
        colAct.setPrefWidth(120);

        TableColumn<DailySettlementEntity, DailySettlementEntity> colDif = new TableColumn<>("DIFERENCIA");
        colDif.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colDif.setComparator(Comparator.comparing(s -> s != null && s.getCashDifference() != null ? s.getCashDifference() : BigDecimal.ZERO));
        colDif.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(DailySettlementEntity s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) {
                    setText(null);
                    setStyle("");
                } else {
                    BigDecimal diff = s.getCashDifference() != null ? s.getCashDifference() : BigDecimal.ZERO;
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
        loadingCollectors = true;
        try {
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
                cmbCollector.setValue(null);
                return;
            }

            // Si hay una ruta activa seleccionada globalmente, sincronizar con su cobrador asignado
            String selectedRoute = UserSessionContext.getSelectedRouteId();
            if (routeRepository != null && selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute) && !"NONE".equalsIgnoreCase(selectedRoute)) {
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
        } finally {
            loadingCollectors = false;
        }
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

    private BigDecimal parseOpeningBase() {
        try {
            BigDecimal parsed = CurrencyInputUtil.parseAmount(txtOpeningBase.getText());
            return parsed != null && parsed.compareTo(BigDecimal.ZERO) > 0 ? parsed : BigDecimal.ZERO;
        } catch (Exception ignored) {
            return BigDecimal.ZERO;
        }
    }

    private void recalculateFromOpeningBase() {
        if (currentSummary == null || currentSummary.isClosed()) {
            return;
        }
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        UserOption selectedUser = cmbCollector.getValue();
        if (selectedUser == null) {
            return;
        }
        String collectorId = selectedUser.id();
        BigDecimal prevExpected = currentSummary.netExpectedCash();
        BigDecimal openingBase = parseOpeningBase();

        currentSummary = settlementUseCase.previewDaySummary(collectorId, date, openingBase);
        lblCollectedPlusBase.setText(CURRENCY.format(currentSummary.collectedPlusBase()));
        lblNetExpected.setText(CURRENCY.format(currentSummary.netExpectedCash()));

        // Si el campo de entregado seguía igual al esperado anterior o en 0, actualizar automáticamente al nuevo esperado
        BigDecimal currentDelivered = BigDecimal.ZERO;
        try {
            currentDelivered = CurrencyInputUtil.parseAmount(txtDelivered.getText());
        } catch (Exception ignored) {}
        if (currentDelivered.compareTo(BigDecimal.ZERO) == 0 || currentDelivered.compareTo(prevExpected) == 0) {
            txtDelivered.setText(currentSummary.netExpectedCash().toPlainString());
        }
        updateTomorrowBasePreview();
        updateDifference();
    }

    private void refreshInternal() {
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        UserOption selectedUser = cmbCollector.getValue();
        if (selectedUser == null) {
            currentSummary = null;
            setExpenseButtonsDisabled(true);
            showError("No hay usuarios o rutas activas configuradas todavía para liquidar.");
            return;
        }
        String collectorId = selectedUser.id();
        BigDecimal autoOpeningBase;
        try {
            autoOpeningBase = settlementUseCase.resolveOpeningRouteBase(collectorId, date);
        } catch (Exception ex) {
            currentSummary = null;
            setExpenseButtonsDisabled(true);
            showError(ex.getMessage() != null ? ex.getMessage() : "No hay ruta activa asignada para este usuario.");
            return;
        }

        try {
            currentSummary = settlementUseCase.previewDaySummary(collectorId, date, autoOpeningBase);
        } catch (Exception ex) {
            currentSummary = null;
            setExpenseButtonsDisabled(true);
            showError(ex.getMessage() != null ? ex.getMessage() : "No se pudo cargar el resumen de liquidación.");
            return;
        }

        updatingOpeningBase = true;
        try {
            txtOpeningBase.setText(currentSummary.openingRouteBase().toPlainString());
        } finally {
            updatingOpeningBase = false;
        }

        lblCollected.setText(CURRENCY.format(currentSummary.totalCollected()));
        lblPaymentBreakdown.setText("Efectivo: " + CURRENCY.format(currentSummary.collectedInCash())
                + " · Digital: " + CURRENCY.format(currentSummary.collectedDigitally()));
        lblCollectedPlusBase.setText(CURRENCY.format(currentSummary.collectedPlusBase()));
        lblRouteExpenses.setText(CURRENCY.format(currentSummary.routeExpenses()));
        lblNetExpected.setText(CURRENCY.format(currentSummary.netExpectedCash()));

        routeExpensesObservable.setAll(currentSummary.routeExpensesList());

        if (currentSummary.isClosed()) {
            lblStatusBadge.setText("LIQUIDADA / CERRADA");
            lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 12;");
            setExpenseButtonsDisabled(true);
            txtOpeningBase.setDisable(true);
            dispositionBox.setDisable(true);
            txtDelivered.setDisable(true);
            txtJustification.setDisable(true);
            btnCloseSettlement.setDisable(true);
            denominationPanel.setDisable(true);
            payrollBox.setVisible(false);
            payrollBox.setManaged(false);

            if (currentSummary.settlement() != null) {
                txtDelivered.setText(currentSummary.settlement().getActualCollection().toPlainString());
                String savedJust = currentSummary.settlement().getDifferenceJustification();
                txtJustification.setText(savedJust != null ? savedJust : "");
            }
        } else {
            lblStatusBadge.setText("JORNADA ABIERTA");
            lblStatusBadge.setStyle("-fx-padding: 3 10; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 11px; -fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 12;");
            setExpenseButtonsDisabled(false);
            txtOpeningBase.setDisable(false);
            dispositionBox.setDisable(false);
            rbKeepInRoute.setSelected(true);
            txtWithdrawToOffice.setText("0");
            txtDelivered.setDisable(false);
            txtJustification.setDisable(false);
            txtJustification.clear();
            btnCloseSettlement.setDisable(false);
            denominationPanel.setDisable(false);
            txtDenom100k.clear();
            txtDenom50k.clear();
            txtDenom20k.clear();
            txtDenom10k.clear();
            txtDenom5k.clear();
            txtDenom2k.clear();
            txtDenomCoins.clear();
            lblDenomBillsTotal.setText("Billetes: $ 0");
            lblDenomCoinsTotal.setText("Monedas: $ 0");
            lblDenomGrandTotal.setText("Total Contado: $ 0");

            txtDelivered.setText(currentSummary.netExpectedCash().toPlainString());
        }

        updateTomorrowBasePreview();
        updateDifference();

        List<DailySettlementEntity> history = settlementRepository.findAll().stream()
                .sorted(Comparator.comparing(DailySettlementEntity::getSettledAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        historyList.setAll(history);
    }

    private void setExpenseButtonsDisabled(boolean disabled) {
        if (btnHeaderAddExpense != null) btnHeaderAddExpense.setDisable(disabled);
        if (btnCardAddExpense != null) btnCardAddExpense.setDisable(disabled);
    }

    private void updateDifference() {
        try {
            if (currentSummary != null && currentSummary.isClosed() && currentSummary.settlement() != null) {
                BigDecimal diff = currentSummary.settlement().getCashDifference() != null
                        ? currentSummary.settlement().getCashDifference()
                        : BigDecimal.ZERO;
                renderDifferenceBadge(diff, true);
                return;
            }
            BigDecimal delivered = CurrencyInputUtil.parseAmount(txtDelivered.getText());
            BigDecimal netExpected = currentSummary != null ? currentSummary.netExpectedCash() : BigDecimal.ZERO;
            BigDecimal diff = delivered.subtract(netExpected);
            renderDifferenceBadge(diff, false);
            updateTomorrowBasePreview();
        } catch (Exception ex) {
            lblDifference.setText("Monto entregado inválido");
            lblDifference.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-text-fill: #dc2626;");
        }
    }

    private void renderDifferenceBadge(BigDecimal diff, boolean closed) {
        if (diff.compareTo(BigDecimal.ZERO) == 0) {
            lblDifference.setText("$ 0 (CUADRADO EXACTO)");
            lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #059669;");
            txtJustification.setPromptText("Observaciones o notas de auditoría del cierre...");
            if (!closed) {
                payrollBox.setVisible(false);
                payrollBox.setManaged(false);
            }
        } else if (diff.compareTo(BigDecimal.ZERO) > 0) {
            lblDifference.setText("+ " + CURRENCY.format(diff) + "  (SOBRANTE)");
            lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #2563eb;");
            txtJustification.setPromptText("Observaciones obligatorias para justificar el descuadre *");
            if (!closed) {
                payrollBox.setVisible(false);
                payrollBox.setManaged(false);
            }
        } else {
            BigDecimal faltante = diff.abs();
            lblDifference.setText("- " + CURRENCY.format(faltante) + " (FALTANTE / DESCUADRE)");
            lblDifference.setStyle("-fx-font-size: 16px; -fx-font-weight: bold; -fx-text-fill: #dc2626;");
            txtJustification.setPromptText("Observaciones obligatorias para justificar el descuadre *");
            if (!closed) {
                boolean wasHidden = !payrollBox.isVisible();
                payrollBox.setVisible(true);
                payrollBox.setManaged(true);
                if (wasHidden) {
                    chkPayrollDeduction.setSelected(true);
                    txtPayrollAmount.setText(faltante.toPlainString());
                }
            }
        }
    }

    private void openNewExpenseDialog() {
        if (currentSummary != null && currentSummary.isClosed()) {
            showError("Esta jornada ya está cerrada; no se pueden registrar gastos operativos.");
            return;
        }
        UserOption selectedUser = cmbCollector.getValue();
        if (selectedUser == null) {
            showError("Seleccione primero un cobrador.");
            return;
        }
        String collectorId = selectedUser.id();
        String routeId = null;
        if (routeRepository != null) {
            routeId = routeRepository.findAll().stream()
                    .filter(r -> Integer.valueOf(1).equals(r.getActive()) && collectorId.equalsIgnoreCase(r.getCollectorId()))
                    .map(RouteEntity::getId)
                    .findFirst()
                    .orElse(null);
        }
        if (routeId == null) {
            String activeRoute = UserSessionContext.getSelectedRouteId();
            if (activeRoute != null && !"ALL".equalsIgnoreCase(activeRoute) && !"NONE".equalsIgnoreCase(activeRoute)) {
                routeId = activeRoute;
            }
        }
        LocalDate targetDate = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        RouteExpenseDialog.show(ownerStage, collectorId, routeId, targetDate, settlementUseCase, saved -> {
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

            BigDecimal delivered;
            try {
                delivered = CurrencyInputUtil.parseAmount(txtDelivered.getText());
            } catch (Exception parseEx) {
                throw new IllegalArgumentException("Monto inválido en 'Efectivo Físico Entregado'. Ingrese pesos enteros.");
            }
            BigDecimal openingBase = parseOpeningBaseStrict();
            BigDecimal withdrawToOffice = parseWithdrawToOfficeStrict();
            String justification = txtJustification.getText();

            BigDecimal payrollAmount = BigDecimal.ZERO;
            String payrollReason = null;

            if (chkPayrollDeduction.isSelected() && payrollBox.isVisible()) {
                try {
                    payrollAmount = CurrencyInputUtil.parseAmount(txtPayrollAmount.getText());
                } catch (Exception parseEx) {
                    throw new IllegalArgumentException("Monto inválido en 'Monto Nómina'. Ingrese pesos enteros.");
                }
                String editorText = cmbPayrollReason.getEditor() != null ? cmbPayrollReason.getEditor().getText() : null;
                payrollReason = (editorText != null && !editorText.isBlank()) ? editorText.trim() : cmbPayrollReason.getValue();
            }

            String authorId = UserSessionContext.requireSession().userId();

            // Asegurar sesión creada en BD solo en el momento real de cerrar la liquidación
            String sessionId = currentSummary.sessionId();
            if (sessionId == null || sessionId.isBlank()) {
                LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
                sessionId = settlementUseCase.getOrCreateDaySummary(currentSummary.collectorId(), date, openingBase).sessionId();
            }

            settlementUseCase.closeSettlement(
                    sessionId,
                    delivered,
                    openingBase,
                    withdrawToOffice,
                    payrollAmount,
                    payrollReason,
                    justification,
                    authorId
            );

            refresh();

            lblFeedback.setText("Liquidación diaria cerrada con éxito. El arqueo ha quedado registrado.");
            lblFeedback.setStyle("-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
            String backupWarning = settlementUseCase.getBackupWarning();
            if (backupWarning != null) {
                lblFeedback.setText("Liquidación confirmada. Atención: " + backupWarning);
                lblFeedback.setStyle("-fx-text-fill: #92400e; -fx-background-color: #fef3c7; -fx-padding: 8 12;");
            }
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);
        } catch (Exception ex) {
            showError(ex.getMessage() != null && !ex.getMessage().isBlank() ? ex.getMessage() : "No se pudo cerrar la liquidación.");
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
        root.setPrefWidth(460);

        Label title = new Label("COMPROBANTE DE LIQUIDACIÓN");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        String voucherNo = settlement.getId() != null ? settlement.getId().substring(0, Math.min(8, settlement.getId().length())).toUpperCase() : "-";
        String dateFmt = UiLabels.formatDateTime(settlement.getSettledAt());
        String obsText = (settlement.getDifferenceJustification() != null && !settlement.getDifferenceJustification().isBlank())
                ? settlement.getDifferenceJustification()
                : "Sin observaciones";
        BigDecimal exp = settlement.getExpectedCollection() != null ? settlement.getExpectedCollection() : BigDecimal.ZERO;
        BigDecimal act = settlement.getActualCollection() != null ? settlement.getActualCollection() : BigDecimal.ZERO;
        BigDecimal dif = settlement.getCashDifference() != null ? settlement.getCashDifference() : BigDecimal.ZERO;

        Label lblObs = new Label("Observaciones: " + obsText);
        lblObs.setWrapText(true);

        VBox card = new VBox(8);
        card.setStyle("-fx-background-color: #f8fafc; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #e2e8f0;");
        card.getChildren().addAll(
                new Label("Fecha de Cierre: " + dateFmt),
                new Label("Comprobante N°: " + voucherNo),
                new Label("Efectivo Neto Esperado: " + CURRENCY.format(exp)),
                new Label("Efectivo Físico Recibido: " + CURRENCY.format(act)),
                new Label("Diferencia: " + CURRENCY.format(dif)),
                lblObs
        );

        Button btnCopy = new Button("Copiar Comprobante");
        btnCopy.getStyleClass().add("btn-primary");
        btnCopy.setOnAction(e -> {
            String txt = "COMPROBANTE DE LIQUIDACIÓN #" + voucherNo
                    + "\nFecha: " + dateFmt
                    + "\nNeto Esperado: " + CURRENCY.format(exp)
                    + "\nEfectivo Recibido: " + CURRENCY.format(act)
                    + "\nDiferencia: " + CURRENCY.format(dif)
                    + "\nObservaciones: " + obsText;
            javafx.scene.input.ClipboardContent cc = new javafx.scene.input.ClipboardContent();
            cc.putString(txt);
            javafx.scene.input.Clipboard.getSystemClipboard().setContent(cc);
            btnCopy.setText("¡Copiado!");
        });

        Button btnSendWa = new Button("Enviar por WhatsApp");
        btnSendWa.setStyle("-fx-background-color: #16a34a; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 7 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnSendWa.setOnAction(e -> {
            String txt = "━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    + "*COMPROBANTE DE LIQUIDACIÓN #" + voucherNo + "*\n"
                    + "*Fecha:* " + dateFmt + "\n"
                    + "• *Neto Esperado:* " + CURRENCY.format(exp) + "\n"
                    + "• *Efectivo Recibido:* " + CURRENCY.format(act) + "\n"
                    + "• *Diferencia:* " + CURRENCY.format(dif) + "\n"
                    + "• *Observaciones:* " + obsText + "\n"
                    + "━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                    + "_Generado desde Kredia Desktop v" + com.cartera.infrastructure.version.AppVersion.CURRENT + "_";
            com.cartera.ui.util.WhatsAppReceiptUtil.sendViaWhatsApp("", txt);
            btnSendWa.setText("¡Abierto en WhatsApp!");
        });

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> dialog.close());

        HBox actions = new HBox(10, btnCopy, btnSendWa, btnClose);
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

    private void persistCurrentOpeningBaseOverride() {
        UserOption selectedUser = cmbCollector.getValue();
        if (selectedUser == null) return;
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        try {
            String routeId = settlementUseCase.resolveRouteIdForCollector(selectedUser.id());
            if (routeId != null && !routeId.isBlank()) {
                BigDecimal val = parseOpeningBase();
                settlementUseCase.saveOpeningRouteBase(routeId, date, val);
            }
        } catch (Exception ignored) {}
    }

    private void restoreAutomaticOpeningBase() {
        if (currentSummary != null && currentSummary.isClosed()) return;
        UserOption selectedUser = cmbCollector.getValue();
        if (selectedUser == null) return;
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        try {
            String routeId = settlementUseCase.resolveRouteIdForCollector(selectedUser.id());
            if (routeId != null && !routeId.isBlank()) {
                settlementUseCase.clearSavedOpeningRouteBase(routeId, date);
            }
            BigDecimal auto = settlementUseCase.computeAutomaticOpeningRouteBase(selectedUser.id(), date);
            updatingOpeningBase = true;
            try {
                txtOpeningBase.setText(auto.toPlainString());
            } finally {
                updatingOpeningBase = false;
            }
            recalculateFromOpeningBase();
            lblFeedback.setText("Base de inicio restaurada al cálculo automático: " + CURRENCY.format(auto));
            lblFeedback.setStyle("-fx-text-fill: #0369a1; -fx-background-color: #f0f9ff; -fx-padding: 8 12; -fx-background-radius: 6;");
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);
        } catch (Exception ex) {
            showError("No se pudo restaurar la base automática: " + ex.getMessage());
        }
    }

    private void copyCuadreWhatsAppReport(boolean openWhatsApp) {
        if (currentSummary == null) return;
        LocalDate date = dpDate.getValue() != null ? dpDate.getValue() : LocalDate.now();
        UserOption selectedUser = cmbCollector.getValue();
        String collectorName = selectedUser != null ? selectedUser.displayName() : "Cobrador";
        String routeName = "";
        if (routeRepository != null && selectedUser != null) {
            try {
                String rid = settlementUseCase.resolveRouteIdForCollector(selectedUser.id());
                if (rid != null && !rid.isBlank()) {
                    routeName = routeRepository.findById(rid).map(RouteEntity::getName).orElse(rid);
                }
            } catch (Exception ignored) {}
        }

        StringBuilder denomSb = new StringBuilder();
        if (anyDenomTouched()) {
            denomSb.append("*DESGLOSE DE EFECTIVO FÍSICO CONTADO:*\n");
            long q100 = parseCount(txtDenom100k.getText());
            long q50 = parseCount(txtDenom50k.getText());
            long q20 = parseCount(txtDenom20k.getText());
            long q10 = parseCount(txtDenom10k.getText());
            long q5 = parseCount(txtDenom5k.getText());
            long q2 = parseCount(txtDenom2k.getText());
            BigDecimal coins = parseCoinsSafe();
            if (q100 > 0) denomSb.append("• Billetes $100.000: ").append(q100).append(" (").append(CURRENCY.format(BigDecimal.valueOf(q100).multiply(BigDecimal.valueOf(100_000)))).append(")\n");
            if (q50 > 0) denomSb.append("• Billetes $50.000: ").append(q50).append(" (").append(CURRENCY.format(BigDecimal.valueOf(q50).multiply(BigDecimal.valueOf(50_000)))).append(")\n");
            if (q20 > 0) denomSb.append("• Billetes $20.000: ").append(q20).append(" (").append(CURRENCY.format(BigDecimal.valueOf(q20).multiply(BigDecimal.valueOf(20_000)))).append(")\n");
            if (q10 > 0) denomSb.append("• Billetes $10.000: ").append(q10).append(" (").append(CURRENCY.format(BigDecimal.valueOf(q10).multiply(BigDecimal.valueOf(10_000)))).append(")\n");
            if (q5 > 0) denomSb.append("• Billetes $5.000: ").append(q5).append(" (").append(CURRENCY.format(BigDecimal.valueOf(q5).multiply(BigDecimal.valueOf(5_000)))).append(")\n");
            if (q2 > 0) denomSb.append("• Billetes $2.000: ").append(q2).append(" (").append(CURRENCY.format(BigDecimal.valueOf(q2).multiply(BigDecimal.valueOf(2_000)))).append(")\n");
            if (coins.compareTo(BigDecimal.ZERO) > 0) denomSb.append("• Monedas / Fracción: ").append(CURRENCY.format(coins)).append("\n");
            BigDecimal grandTotal = computeBillsTotal().add(coins);
            denomSb.append("• *Total Físico Contado:* ").append(CURRENCY.format(grandTotal)).append("\n");
        }

        BigDecimal withdraw = parseWithdrawToOffice();
        BigDecimal tomorrowBase = parseDeliveredOrExpected().subtract(withdraw).max(BigDecimal.ZERO);
        String msg = com.cartera.ui.util.WhatsAppReceiptUtil.generateDailySettlementMessage(
                null,
                routeName,
                date.toString(),
                collectorName,
                currentSummary.totalCollected(),
                currentSummary.collectedInCash(),
                currentSummary.collectedDigitally(),
                currentSummary.openingRouteBase(),
                currentSummary.routeExpenses(),
                currentSummary.netExpectedCash(),
                currentSummary.isClosed(),
                currentSummary.settlement() != null ? currentSummary.settlement().getActualCollection() : null,
                currentSummary.settlement() != null ? currentSummary.settlement().getCashDifference() : null,
                withdraw,
                tomorrowBase,
                currentSummary.settlement() != null ? currentSummary.settlement().getDifferenceJustification() : null,
                denomSb.toString()
        );

        if (openWhatsApp) {
            boolean opened = com.cartera.ui.util.WhatsAppReceiptUtil.sendViaWhatsApp("", msg);
            lblFeedback.setText(opened
                    ? "Resumen copiado y WhatsApp abierto para enviar el cuadre diario."
                    : "Resumen copiado al portapapeles. Pégalo en WhatsApp para compartirlo.");
        } else {
            javafx.scene.input.ClipboardContent content = new javafx.scene.input.ClipboardContent();
            content.putString(msg);
            javafx.scene.input.Clipboard.getSystemClipboard().setContent(content);
            lblFeedback.setText("¡Reporte de Cuadre copiado al portapapeles! Listo para pegar en WhatsApp.");
        }
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
