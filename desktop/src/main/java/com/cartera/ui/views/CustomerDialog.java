package com.cartera.ui.views;

import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.customers.application.CreateCustomerUseCase.CreateCustomerCommand;
import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase.CreateLoanCommand;
import com.cartera.loans.domain.LoanCalculator;
import com.cartera.ui.util.CurrencyInputUtil;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Diálogo unificado para registrar nuevos clientes y originar su primer préstamo
 * inmediatamente, evitando doble trabajo operativo.
 */
public class CustomerDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public record RouteOption(String id, String name, String collectorId) {
        @Override
        public String toString() {
            return name + " (" + id + ")";
        }
    }

    private final CreateCustomerUseCase createCustomerUseCase;
    private final CreateLoanUseCase createLoanUseCase;
    private final SystemSettingRepository settingRepository;
    private final RouteRepository routeRepository;
    private final Consumer<CustomerEntity> onSuccess;

    // Campos de Cliente
    private final TextField txtFullName = new TextField();
    private final TextField txtDoc = new TextField();
    private final TextField txtPhone = new TextField();
    private final TextField txtAltPhone = new TextField();
    private final TextField txtAddress = new TextField();
    private final TextField txtNeighborhood = new TextField();
    private final TextField txtCity = new TextField("Barranquilla");
    private final TextField txtBusiness = new TextField();
    private final TextField txtOccupation = new TextField();
    private final TextField txtNotes = new TextField();
    private final ComboBox<RouteOption> cmbRoute = new ComboBox<>();

    // Campos de Préstamo Inmediato
    private final CheckBox chkDisburseNow = new CheckBox("Otorgar Préstamo y Desembolso Inmediato");
    private final VBox boxLoanSection = new VBox(12);
    private final TextField txtPrincipal = new TextField("300000");
    private final ComboBox<String> cmbFrequency = new ComboBox<>();
    private final TextField txtInstallmentCount = new TextField("30");
    private final TextField txtInterestPercent = new TextField("20");
    private final DatePicker dpStartDate = new DatePicker(LocalDate.now());

    // Resumen Financiero en Vivo
    private final Label lblSummaryPrincipal = new Label("$ 300.000");
    private final Label lblSummaryCartulina = new Label("- $ 15.000");
    private final Label lblSummaryNetDisbursed = new Label("$ 285.000");
    private final Label lblSummaryTotal = new Label("$ 360.000");
    private final Label lblSummaryCuota = new Label("$ 15.000");

    private final Label lblFeedback = new Label();
    private final Button btnSave = new Button("Registrar Cliente y Desembolsar");
    private final Button btnCancel = new Button("Cancelar");

    public CustomerDialog(CreateCustomerUseCase createCustomerUseCase, Stage ownerStage, Consumer<CustomerEntity> onSuccess) {
        this(createCustomerUseCase, null, null, null, ownerStage, onSuccess);
    }

    public CustomerDialog(
            CreateCustomerUseCase createCustomerUseCase,
            CreateLoanUseCase createLoanUseCase,
            Stage ownerStage,
            Consumer<CustomerEntity> onSuccess
    ) {
        this(createCustomerUseCase, createLoanUseCase, null, null, ownerStage, onSuccess);
    }

    public CustomerDialog(
            CreateCustomerUseCase createCustomerUseCase,
            CreateLoanUseCase createLoanUseCase,
            SystemSettingRepository settingRepository,
            Stage ownerStage,
            Consumer<CustomerEntity> onSuccess
    ) {
        this(createCustomerUseCase, createLoanUseCase, settingRepository, null, ownerStage, onSuccess);
    }

    public CustomerDialog(
            CreateCustomerUseCase createCustomerUseCase,
            CreateLoanUseCase createLoanUseCase,
            SystemSettingRepository settingRepository,
            RouteRepository routeRepository,
            Stage ownerStage,
            Consumer<CustomerEntity> onSuccess
    ) {
        this.createCustomerUseCase = createCustomerUseCase;
        this.createLoanUseCase = createLoanUseCase;
        this.settingRepository = settingRepository;
        this.routeRepository = routeRepository;
        this.onSuccess = onSuccess;

        if (settingRepository != null) {
            settingRepository.findById("default_interest_percent")
                    .map(s -> s.getSettingValue())
                    .filter(v -> v != null && !v.isBlank())
                    .ifPresent(txtInterestPercent::setText);
        }

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Registrar Nuevo Cliente");
        setResizable(true);

        loadRoutes();
        buildUI();
        recalculateLoanPreview();
    }

    private void loadRoutes() {
        cmbRoute.getItems().clear();
        String activeFilter = UserSessionContext.getSelectedRouteId();
        RouteOption defaultOpt = null;

        if (routeRepository != null) {
            List<RouteEntity> routes = routeRepository.findAll();
            for (RouteEntity r : routes) {
                if (r.getActive() != null && r.getActive() == 0) continue;
                RouteOption opt = new RouteOption(r.getId(), r.getName(), r.getCollectorId());
                cmbRoute.getItems().add(opt);
                if (activeFilter != null && activeFilter.equalsIgnoreCase(r.getId())) {
                    defaultOpt = opt;
                }
            }
        }
        if (cmbRoute.getItems().isEmpty()) {
            defaultOpt = new RouteOption("ruta-principal", "Ruta Principal", "admin");
            cmbRoute.getItems().add(defaultOpt);
        }
        if (defaultOpt == null && !cmbRoute.getItems().isEmpty()) {
            defaultOpt = cmbRoute.getItems().get(0);
        }
        cmbRoute.setValue(defaultOpt);
    }

    private void buildUI() {
        VBox root = new VBox(18);
        root.setPadding(new Insets(24, 28, 24, 28));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(640);

        // Header
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label icon = new Label("REGISTRO");
        icon.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 12; -fx-background-radius: 8; -fx-border-color: #bfdbfe; -fx-border-radius: 8;");
        VBox titleBox = new VBox(2);
        Label title = new Label("Ficha de Nuevo Cliente");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");
        Label subtitle = new Label("Ingresa los datos personales, ruta asignada y su primer crédito en un solo paso");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        titleBox.getChildren().addAll(title, subtitle);
        header.getChildren().addAll(icon, titleBox);

        // SECCIÓN 1: DATOS PERSONALES
        Label sec1 = new Label("1. DATOS PERSONALES, RUTA Y CONTACTO");
        sec1.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 4 0 0 0;");

        GridPane grid = new GridPane();
        grid.setHgap(16);
        grid.setVgap(10);

        setupField(grid, "Nombres Completos *", txtFullName, 0, 0, 1);

        cmbRoute.setMaxWidth(Double.MAX_VALUE);
        cmbRoute.getStyleClass().add("search-field");
        VBox routeBox = new VBox(4);
        Label lblRoute = new Label("Ruta Asignada *");
        lblRoute.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        routeBox.getChildren().addAll(lblRoute, cmbRoute);
        grid.add(routeBox, 1, 0, 1, 1);

        setupField(grid, "Cédula / Documento (solo números) *", txtDoc, 0, 1, 1);
        txtDoc.setTextFormatter(new TextFormatter<>(change -> change.getControlNewText().matches("\\d*") ? change : null));
        setupField(grid, "Teléfono para Llamadas *", txtPhone, 1, 1, 1);
        setupField(grid, "Dirección Principal *", txtAddress, 0, 2, 1);
        setupField(grid, "Barrio", txtNeighborhood, 1, 2, 1);
        setupField(grid, "Teléfono de WhatsApp *", txtAltPhone, 0, 3, 1);
        setupField(grid, "Ciudad", txtCity, 1, 3, 1);
        setupField(grid, "Nombre de Negocio / Local", txtBusiness, 0, 4, 1);
        setupField(grid, "Ocupación / Actividad", txtOccupation, 1, 4, 1);
        setupField(grid, "Notas / Referencias adicionales", txtNotes, 0, 5, 2);

        // SECCIÓN 2: PRÉSTAMO INMEDIATO
        chkDisburseNow.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px; -fx-cursor: hand;");
        chkDisburseNow.setSelected(createLoanUseCase != null);
        chkDisburseNow.setVisible(createLoanUseCase != null);
        chkDisburseNow.setManaged(createLoanUseCase != null);
        chkDisburseNow.setOnAction(e -> {
            boolean active = chkDisburseNow.isSelected();
            boxLoanSection.setVisible(active);
            boxLoanSection.setManaged(active);
            btnSave.setText(active ? "Registrar Cliente y Desembolsar" : "Guardar Solo Cliente");
        });

        buildLoanSection();

        // Feedback
        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        // Acciones
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> close());

        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> saveCustomerAndLoan());

        actions.getChildren().addAll(spacer, btnCancel, btnSave);

        root.getChildren().addAll(header, sec1, grid, chkDisburseNow, boxLoanSection, lblFeedback, actions);

        ScrollPane scroll = new ScrollPane(root);
        scroll.setFitToWidth(true);
        scroll.setStyle("-fx-background-color: transparent; -fx-border-color: transparent;");

        var scene = new Scene(scroll, 680, 680);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private void buildLoanSection() {
        boxLoanSection.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 12; -fx-border-width: 1; -fx-padding: 14 18;");
        boxLoanSection.setVisible(createLoanUseCase != null);
        boxLoanSection.setManaged(createLoanUseCase != null);

        Label sec2 = new Label("2. PARÁMETROS DEL PRIMER PRÉSTAMO Y DESEMBOLSO");
        sec2.setStyle("-fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold;");

        GridPane loanGrid = new GridPane();
        loanGrid.setHgap(14);
        loanGrid.setVgap(10);

        setupField(loanGrid, "Capital a Prestar ($) *", txtPrincipal, 0, 0, 1);
        cmbFrequency.getItems().setAll("DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFrequency.setValue("DIARIO");
        cmbFrequency.setMaxWidth(Double.MAX_VALUE);
        cmbFrequency.getStyleClass().add("search-field");
        VBox boxFreq = new VBox(4, new Label("Modalidad / Frecuencia *") {{
            setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, cmbFrequency);
        loanGrid.add(boxFreq, 1, 0);

        setupField(loanGrid, "Número de Cuotas *", txtInstallmentCount, 0, 1, 1);
        setupField(loanGrid, "Tasa Interés (%) *", txtInterestPercent, 1, 1, 1);

        dpStartDate.setMaxWidth(Double.MAX_VALUE);
        dpStartDate.getStyleClass().add("search-field");
        VBox boxDate = new VBox(4, new Label("Fecha Primer Cobro *") {{
            setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, dpStartDate);
        loanGrid.add(boxDate, 0, 2, 2, 1);

        // Tarjeta de Resumen Financiero en Vivo
        VBox cardSummary = new VBox(8);
        cardSummary.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 10; -fx-padding: 12 16; -fx-border-color: #cbd5e1; -fx-border-radius: 10; -fx-border-width: 1;");

        Label sumHeader = new Label("Desglose Financiero del Desembolso:");
        sumHeader.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;");

        HBox rCapital = makeSummaryRow("Capital Solicitado:", lblSummaryPrincipal, "#0f172a", false);
        HBox rCartulina = makeSummaryRow("Cartulina / Papelería:", lblSummaryCartulina, "#dc2626", false);
        HBox rNeto = makeSummaryRow("💵 EFECTIVO NETO A ENTREGAR:", lblSummaryNetDisbursed, "#059669", true);
        HBox rTotal = makeSummaryRow("Total a Recaudar:", lblSummaryTotal, "#0f172a", false);
        HBox rCuota = makeSummaryRow("Valor Cuota Pactada:", lblSummaryCuota, "#2563eb", true);

        cardSummary.getChildren().addAll(sumHeader, rCapital, rCartulina, new Separator(), rNeto, new Separator(), rTotal, rCuota);

        boxLoanSection.getChildren().addAll(sec2, loanGrid, cardSummary);

        // Listeners para recálculo dinámico en tiempo real
        txtPrincipal.textProperty().addListener((obs, old, val) -> recalculateLoanPreview());
        cmbFrequency.valueProperty().addListener((obs, old, val) -> recalculateLoanPreview());
        txtInstallmentCount.textProperty().addListener((obs, old, val) -> recalculateLoanPreview());
        txtInterestPercent.textProperty().addListener((obs, old, val) -> recalculateLoanPreview());
    }

    private HBox makeSummaryRow(String label, Label valueLabel, String colorHex, boolean bold) {
        HBox row = new HBox(8);
        row.setAlignment(Pos.CENTER_LEFT);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px;" + (bold ? " -fx-font-weight: bold;" : ""));
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        valueLabel.setStyle("-fx-text-fill: " + colorHex + "; -fx-font-size: 12px; -fx-font-weight: bold;");
        row.getChildren().addAll(lbl, sp, valueLabel);
        return row;
    }

    private BigDecimal computeConfiguredPaperwork(BigDecimal principal) {
        boolean isPaperworkEnabled = settingRepository == null || settingRepository.findById("paperwork_enabled")
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
        if (!isPaperworkEnabled) {
            return BigDecimal.ZERO;
        }
        BigDecimal feePer100k = new BigDecimal("5000");
        if (settingRepository != null) {
            try {
                String raw = settingRepository.findById("paperwork_fee").map(s -> s.getSettingValue()).orElse("5000");
                BigDecimal parsed = CurrencyInputUtil.parseAmount(raw);
                if (parsed.compareTo(BigDecimal.ZERO) >= 0) {
                    feePer100k = parsed;
                }
            } catch (Exception ignored) {}
        }
        return LoanCalculator.calculatePaperworkFee(new Money(principal), feePer100k).amount();
    }

    private void recalculateLoanPreview() {
        try {
            BigDecimal principal = parseAmount(txtPrincipal.getText());
            BigDecimal interestPercent = parseAmount(txtInterestPercent.getText());
            int count = Integer.parseInt(txtInstallmentCount.getText().trim());

            if (principal.compareTo(BigDecimal.ZERO) <= 0 || count <= 0) return;

            BigDecimal rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal interest = principal.multiply(rateDecimal);
            BigDecimal total = principal.add(interest);
            BigDecimal cuota = total.divide(BigDecimal.valueOf(count), 0, RoundingMode.HALF_UP);

            boolean isPaperworkEnabled = settingRepository == null || settingRepository.findById("paperwork_enabled")
                    .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                    .orElse(true);
            BigDecimal cartulina = computeConfiguredPaperwork(principal);
            BigDecimal netDisbursed = principal.subtract(cartulina);

            lblSummaryPrincipal.setText(CURRENCY.format(principal));
            if (!isPaperworkEnabled) {
                lblSummaryCartulina.setText("$ 0 (Desactivada por admin)");
                lblSummaryCartulina.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-font-weight: bold;");
            } else if (cartulina.compareTo(BigDecimal.ZERO) > 0) {
                lblSummaryCartulina.setText("- " + CURRENCY.format(cartulina));
                lblSummaryCartulina.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 12px; -fx-font-weight: bold;");
            } else {
                lblSummaryCartulina.setText("$ 0 (No aplica)");
                lblSummaryCartulina.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-font-weight: bold;");
            }
            lblSummaryNetDisbursed.setText(CURRENCY.format(netDisbursed));
            lblSummaryTotal.setText(CURRENCY.format(total));
            lblSummaryCuota.setText(CURRENCY.format(cuota));
        } catch (Exception ignored) {
        }
    }

    private void setupField(GridPane grid, String labelText, TextField field, int col, int row, int colSpan) {
        VBox box = new VBox(4);
        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        field.getStyleClass().add("search-field");
        field.setMaxWidth(Double.MAX_VALUE);
        box.getChildren().addAll(lbl, field);
        grid.add(box, col, row, colSpan, 1);
    }

    private void saveCustomerAndLoan() {
        String name = txtFullName.getText();
        String doc = txtDoc.getText();
        String phone = txtPhone.getText();

        if (name == null || name.trim().isEmpty()) {
            showError("El nombre completo del cliente es obligatorio.");
            txtFullName.requestFocus();
            return;
        }
        if (doc == null || doc.trim().isEmpty()) {
            showError("La cédula o documento del cliente es obligatorio.");
            txtDoc.requestFocus();
            return;
        }
        if (phone == null || phone.trim().isEmpty()) {
            showError("El teléfono del cliente es obligatorio.");
            txtPhone.requestFocus();
            return;
        }

        boolean willDisburse = chkDisburseNow.isSelected() && createLoanUseCase != null;
        BigDecimal principal = BigDecimal.ZERO;
        BigDecimal rateDecimal = BigDecimal.ZERO;
        BigDecimal totalAgreed = BigDecimal.ZERO;
        int count = 0;
        String frequency = cmbFrequency.getValue() != null ? cmbFrequency.getValue() : "DIARIO";
        LocalDate startDate = dpStartDate.getValue() != null ? dpStartDate.getValue() : LocalDate.now();

        if (willDisburse) {
            try {
                principal = parseAmount(txtPrincipal.getText());
                BigDecimal interestPercent = parseAmount(txtInterestPercent.getText());
                count = Integer.parseInt(txtInstallmentCount.getText().trim());

                if (principal.compareTo(BigDecimal.ZERO) <= 0) {
                    showError("El capital a desembolsar debe ser mayor a cero.");
                    txtPrincipal.requestFocus();
                    return;
                }
                if (count <= 0) {
                    showError("El número de cuotas debe ser mayor a cero.");
                    txtInstallmentCount.requestFocus();
                    return;
                }
                if (settingRepository != null) {
                    BigDecimal maxAllowed = settingRepository.findById("max_new_loan_amount")
                            .map(s -> CurrencyInputUtil.parseAmount(s.getSettingValue()))
                            .orElse(BigDecimal.ZERO);
                    if (maxAllowed.compareTo(BigDecimal.ZERO) > 0 && principal.compareTo(maxAllowed) > 0) {
                        showError("El capital solicitado supera el tope máximo permitido (" + CURRENCY.format(maxAllowed) + ").");
                        return;
                    }
                }

                rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
                BigDecimal interest = principal.multiply(rateDecimal);
                totalAgreed = principal.add(interest);
            } catch (Exception ex) {
                showError("Verifique los valores numéricos del préstamo.");
                return;
            }
        }

        btnSave.setDisable(true);
        lblFeedback.setText("Guardando cliente y procesando desembolso...");
        lblFeedback.setStyle("-fx-text-fill: #2563eb; -fx-background-color: #eff6ff; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);

        try {
            String authorId = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("sistema");

            RouteOption selectedRoute = cmbRoute.getValue();
            if (selectedRoute == null) {
                showError("Debe seleccionar una ruta para registrar al cliente.");
                btnSave.setDisable(false);
                return;
            }
            String routeId = selectedRoute.id();
            String collectorId = (selectedRoute.collectorId() != null && !selectedRoute.collectorId().isBlank())
                    ? selectedRoute.collectorId()
                    : authorId;

            var cmd = new CreateCustomerCommand(
                    name.trim(),
                    doc.trim(),
                    phone.trim(),
                    txtAltPhone.getText(),
                    txtAddress.getText(),
                    txtNeighborhood.getText(),
                    txtCity.getText(),
                    txtOccupation.getText(),
                    txtBusiness.getText(),
                    txtNotes.getText(),
                    routeId,
                    collectorId,
                    authorId
            );

            // 1. Guardar cliente
            CustomerEntity customer = createCustomerUseCase.execute(cmd);

            // 2. Si se solicitó préstamo inmediato, originarlo y desembolsar
            if (willDisburse) {
                BigDecimal cartulina = computeConfiguredPaperwork(principal);
                var loanCmd = new CreateLoanCommand(
                        customer.getId(),
                        routeId,
                        collectorId,
                        principal,
                        rateDecimal,
                        totalAgreed,
                        count,
                        frequency,
                        startDate,
                        authorId,
                        cartulina
                );
                createLoanUseCase.execute(loanCmd);
            }

            if (onSuccess != null) {
                onSuccess.accept(customer);
            }
            close();
        } catch (Exception ex) {
            btnSave.setDisable(false);
            showError(ex.getMessage());
        }
    }

    private BigDecimal parseAmount(String text) {
        return CurrencyInputUtil.parseAmount(text);
    }

    private void showError(String msg) {
        lblFeedback.setText(msg);
        lblFeedback.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }
}
