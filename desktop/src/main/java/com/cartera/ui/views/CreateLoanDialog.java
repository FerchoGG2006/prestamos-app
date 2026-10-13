package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase.CreateLoanCommand;
import com.cartera.loans.application.CreateLoanUseCase.InstallmentPlanItem;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.util.StringConverter;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Diálogo modal para simular y otorgar nuevos créditos con plan de cuotas y desembolso de caja.
 */
public class CreateLoanDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final CreateLoanUseCase createLoanUseCase;
    private final CustomerRepository customerRepository;
    private final Consumer<LoanEntity> onSuccess;

    private final ComboBox<CustomerEntity> cmbCustomer = new ComboBox<>();
    private final TextField txtPrincipal = new TextField("300000");
    private final TextField txtInterestPercent = new TextField("20");
    private final TextField txtInstallmentCount = new TextField("24");
    private final ComboBox<String> cmbFrequency = new ComboBox<>();
    private final DatePicker dpStartDate = new DatePicker(LocalDate.now());

    private final Label lblSummaryTotal = new Label("$ 360.000");
    private final Label lblSummaryInstallment = new Label("$ 15.000");
    private final Label lblSummaryInterest = new Label("$ 60.000");
    private final Label lblFeedback = new Label();

    private final TableView<InstallmentPlanItem> planTable = new TableView<>();
    private final Button btnDisburse = new Button("Aprobar y Desembolsar Crédito");

    public CreateLoanDialog(
            CreateLoanUseCase createLoanUseCase,
            CustomerRepository customerRepository,
            Stage ownerStage,
            Consumer<LoanEntity> onSuccess
    ) {
        this.createLoanUseCase = createLoanUseCase;
        this.customerRepository = customerRepository;
        this.onSuccess = onSuccess;

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Simulador y Desembolso de Nuevo Crédito");
        setResizable(false);

        buildUI();
        recalculateAndSimulate();
    }

    private void buildUI() {
        VBox root = new VBox(20);
        root.setPadding(new Insets(24, 28, 24, 28));
        root.setStyle("-fx-background-color: #1e293b;");
        root.setPrefWidth(720);

        // Header
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label icon = new Label("NUEVO CRÉDITO");
        icon.setStyle("-fx-font-size: 24px;");
        VBox titleBox = new VBox(2);
        Label title = new Label("Nuevo Crédito y Desembolso");
        title.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 18px; -fx-font-weight: bold;");
        Label subtitle = new Label("Simula las cuotas, calcula intereses y aprueba el desembolso");
        subtitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        titleBox.getChildren().addAll(title, subtitle);
        header.getChildren().addAll(icon, titleBox);

        // Formulario y Simulador en 2 columnas
        HBox body = new HBox(20);

        // Columna Izquierda: Parámetros del Crédito
        VBox leftForm = new VBox(12);
        leftForm.setPrefWidth(320);

        // Combo Cliente
        Label lblCust = new Label("Seleccionar Cliente *");
        lblCust.setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px; -fx-font-weight: bold;");
        cmbCustomer.setMaxWidth(Double.MAX_VALUE);
        cmbCustomer.getStyleClass().add("search-field");
        loadCustomers();

        // Capital
        VBox boxPrincipal = createFieldBox("Capital Desembolsado ($) *", txtPrincipal);
        // Interés %
        VBox boxInterest = createFieldBox("Tasa de Interés (%) *", txtInterestPercent);
        // Frecuencia
        cmbFrequency.getItems().addAll("DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFrequency.setValue("DIARIO");
        cmbFrequency.setMaxWidth(Double.MAX_VALUE);
        cmbFrequency.getStyleClass().add("search-field");
        VBox boxFreq = new VBox(4, new Label("Modalidad / Frecuencia *") {{
            setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, cmbFrequency);

        // Cuotas
        VBox boxCount = createFieldBox("Número de Cuotas *", txtInstallmentCount);

        // Fecha Inicio
        dpStartDate.setMaxWidth(Double.MAX_VALUE);
        dpStartDate.getStyleClass().add("search-field");
        VBox boxDate = new VBox(4, new Label("Fecha Primer Cobro *") {{
            setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, dpStartDate);

        leftForm.getChildren().addAll(lblCust, cmbCustomer, boxPrincipal, boxInterest, boxFreq, boxCount, boxDate);

        // Eventos de recálculo dinámico en tiempo real
        txtPrincipal.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        txtInterestPercent.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        txtInstallmentCount.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        cmbFrequency.valueProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        dpStartDate.valueProperty().addListener((obs, old, val) -> recalculateAndSimulate());

        // Columna Derecha: Tarjeta de Resumen y Plan de Cuotas
        VBox rightPreview = new VBox(12);
        HBox.setHgrow(rightPreview, Priority.ALWAYS);

        // Summary Card
        VBox summaryCard = new VBox(8);
        summaryCard.getStyleClass().add("table-card");
        summaryCard.setPadding(new Insets(14));

        Label sumTitle = new Label("Resumen del Plan");
        sumTitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px; -fx-font-weight: bold;");

        HBox sumMetrics = new HBox(12);
        sumMetrics.setAlignment(Pos.CENTER_LEFT);

        VBox mTotal = new VBox(2, new Label("Total a Cobrar") {{ setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 10px;"); }}, lblSummaryTotal);
        lblSummaryTotal.setStyle("-fx-text-fill: #38bdf8; -fx-font-size: 16px; -fx-font-weight: bold;");

        VBox mCuota = new VBox(2, new Label("Valor Cuota") {{ setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 10px;"); }}, lblSummaryInstallment);
        lblSummaryInstallment.setStyle("-fx-text-fill: #10b981; -fx-font-size: 16px; -fx-font-weight: bold;");

        VBox mInteres = new VBox(2, new Label("Ganancia") {{ setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 10px;"); }}, lblSummaryInterest);
        lblSummaryInterest.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 16px; -fx-font-weight: bold;");

        sumMetrics.getChildren().addAll(mTotal, mCuota, mInteres);
        summaryCard.getChildren().addAll(sumTitle, sumMetrics);

        // Tabla previa
        setupPlanTable();
        VBox.setVgrow(planTable, Priority.ALWAYS);

        rightPreview.getChildren().addAll(summaryCard, planTable);

        body.getChildren().addAll(leftForm, rightPreview);

        // Feedback
        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        // Acciones
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> close());

        btnDisburse.getStyleClass().add("btn-primary");
        btnDisburse.setOnAction(e -> disburseLoan());

        actions.getChildren().addAll(spacer, btnCancel, btnDisburse);

        root.getChildren().addAll(header, body, lblFeedback, actions);

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private VBox createFieldBox(String label, TextField field) {
        VBox box = new VBox(4);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px; -fx-font-weight: bold;");
        field.getStyleClass().add("search-field");
        field.setMaxWidth(Double.MAX_VALUE);
        box.getChildren().addAll(lbl, field);
        return box;
    }

    private void loadCustomers() {
        List<CustomerEntity> list = customerRepository.findAll();
        cmbCustomer.setItems(FXCollections.observableArrayList(list));
        if (!list.isEmpty()) {
            cmbCustomer.setValue(list.get(0));
        }

        cmbCustomer.setConverter(new StringConverter<>() {
            @Override
            public String toString(CustomerEntity c) {
                if (c == null) return "";
                return c.getFullName() + " (" + c.getDocumentNumber() + ")";
            }

            @Override
            public CustomerEntity fromString(String string) {
                return null;
            }
        });
    }

    public void setSelectedCustomer(String customerId) {
        if (customerId == null || cmbCustomer == null) return;
        for (var c : cmbCustomer.getItems()) {
            if (customerId.equals(c.getId())) {
                cmbCustomer.setValue(c);
                break;
            }
        }
    }

    @SuppressWarnings("unchecked")
    private void setupPlanTable() {
        planTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        planTable.setPrefHeight(220);

        TableColumn<InstallmentPlanItem, Integer> colNum = new TableColumn<>("#");
        colNum.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().installmentNumber()));
        colNum.setPrefWidth(45);

        TableColumn<InstallmentPlanItem, String> colDate = new TableColumn<>("VENCIMIENTO");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().dueDate().format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))));
        colDate.setPrefWidth(120);

        TableColumn<InstallmentPlanItem, String> colAmount = new TableColumn<>("VALOR CUOTA");
        colAmount.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().amount())));
        colAmount.setPrefWidth(120);

        planTable.getColumns().addAll(colNum, colDate, colAmount);
    }

    private void recalculateAndSimulate() {
        try {
            BigDecimal principal = parseAmount(txtPrincipal.getText());
            BigDecimal interestPercent = parseAmount(txtInterestPercent.getText());
            int count = Integer.parseInt(txtInstallmentCount.getText().trim());
            String frequency = cmbFrequency.getValue();
            LocalDate start = dpStartDate.getValue() != null ? dpStartDate.getValue() : LocalDate.now();

            if (principal.compareTo(BigDecimal.ZERO) <= 0 || count <= 0) {
                return;
            }

            BigDecimal rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal interestAmount = principal.multiply(rateDecimal);
            BigDecimal totalAgreed = principal.add(interestAmount);

            List<InstallmentPlanItem> plan = createLoanUseCase.simulatePlan(totalAgreed, count, frequency, start);
            planTable.setItems(FXCollections.observableArrayList(plan));

            lblSummaryTotal.setText(CURRENCY.format(totalAgreed));
            lblSummaryInterest.setText(CURRENCY.format(interestAmount));
            if (!plan.isEmpty()) {
                lblSummaryInstallment.setText(CURRENCY.format(plan.get(0).amount()));
            }

            btnDisburse.setDisable(false);
            lblFeedback.setVisible(false);
            lblFeedback.setManaged(false);
        } catch (Exception ex) {
            btnDisburse.setDisable(true);
        }
    }

    private void disburseLoan() {
        CustomerEntity customer = cmbCustomer.getValue();
        if (customer == null) {
            showError("Debes seleccionar un cliente de la lista.");
            return;
        }

        try {
            BigDecimal principal = parseAmount(txtPrincipal.getText());
            BigDecimal interestPercent = parseAmount(txtInterestPercent.getText());
            int count = Integer.parseInt(txtInstallmentCount.getText().trim());
            String frequency = cmbFrequency.getValue();
            LocalDate start = dpStartDate.getValue() != null ? dpStartDate.getValue() : LocalDate.now();

            BigDecimal rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal interestAmount = principal.multiply(rateDecimal);
            BigDecimal totalAgreed = principal.add(interestAmount);

            btnDisburse.setDisable(true);
            lblFeedback.setText("Procesando crédito y desembolso transaccional en SQLite...");
            lblFeedback.setStyle("-fx-text-fill: #38bdf8; -fx-background-color: rgba(56, 189, 248, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);

            String authorId = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("usr-col-1");

            var cmd = new CreateLoanCommand(
                    customer.getId(),
                    customer.getRouteId() != null ? customer.getRouteId() : "route-norte",
                    authorId,
                    principal,
                    rateDecimal,
                    totalAgreed,
                    count,
                    frequency,
                    start,
                    authorId
            );

            LoanEntity loan = createLoanUseCase.execute(cmd);
            if (onSuccess != null) {
                onSuccess.accept(loan);
            }
            close();
        } catch (Exception ex) {
            btnDisburse.setDisable(false);
            showError(ex.getMessage());
        }
    }

    private void showError(String msg) {
        lblFeedback.setText(msg);
        lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }

    private static BigDecimal parseAmount(String text) {
        if (text == null || text.isBlank()) return BigDecimal.ZERO;
        String clean = text.replaceAll("[^0-9.]", "").trim();
        if (clean.isEmpty()) return BigDecimal.ZERO;
        return new BigDecimal(clean);
    }
}
