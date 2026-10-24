package com.cartera.ui.views;

import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.loans.application.CreateLoanUseCase.CreateLoanCommand;
import com.cartera.loans.application.CreateLoanUseCase.InstallmentPlanItem;
import com.cartera.loans.domain.LoanCalculator;
import com.cartera.ui.util.CurrencyInputUtil;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.util.StringConverter;

import java.io.File;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * Diálogo modal para simular y otorgar nuevos créditos o migrar créditos preexistentes
 * desde cartulinas físicas de papel con marcado interactivo de cuotas y respaldo fotográfico.
 * Incluye alerta de créditos cruzados multi-ruta para la administración central.
 */
public class CreateLoanDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final CreateLoanUseCase createLoanUseCase;
    private final CustomerRepository customerRepository;
    private final SystemSettingRepository settingRepository;
    private final LoanRepository loanRepository;
    private final RouteRepository routeRepository;
    private final Consumer<LoanEntity> onSuccess;

    // Alerta de Créditos Cruzados Multi-Ruta
    private final VBox crossRouteAlertBox = new VBox(4);
    private final Label lblCrossRouteAlert = new Label();

    // Componentes del Formulario
    private final ComboBox<CustomerEntity> cmbCustomer = new ComboBox<>();
    private final TextField txtPrincipal = new TextField("300000");
    private final TextField txtInterestPercent = new TextField("20");
    private final TextField txtInstallmentCount = new TextField("30");
    private final ComboBox<String> cmbFrequency = new ComboBox<>();
    private final DatePicker dpStartDate = new DatePicker(LocalDate.now());

    // Switch de Crédito Anterior
    private final CheckBox chkMigration = new CheckBox("📋 Crédito Anterior (Cartulina ya iniciada)");
    private final Set<Integer> paidInstallmentNumbers = new HashSet<>();
    private String cardPhotoPath = null;

    // Elementos de Encabezado dinámico
    private final Label lblHeaderIcon = new Label("NUEVO CRÉDITO");
    private final Label lblHeaderTitle = new Label("Nuevo Crédito y Desembolso");
    private final Label lblHeaderSubtitle = new Label("Simula las cuotas, calcula intereses y aprueba el desembolso");

    // Resumen Superior
    private final Label lblSummaryTotal = new Label("$ 360.000");
    private final Label lblSummaryInstallment = new Label("$ 15.000");
    private final Label lblCuotaDateHint = new Label("1ª cuota: --/--/----");
    private final Label lblSummaryInterest = new Label("$ 60.000");
    private final Label lblSummaryCartulinaTitle = new Label("Cartulina / Papelería");
    private final Label lblSummaryCartulina = new Label("- $ 15.000");
    private final Label lblSummaryNetTitle = new Label("💵 Neto a Entregar");
    private final Label lblSummaryNet = new Label("$ 285.000");
    private final Label lblFeedback = new Label();

    // Vistas alternables en Columna Derecha:
    // 1. Tabla de Cuotas (Modo Nuevo Crédito)
    private final TableView<InstallmentPlanItem> planTable = new TableView<>();

    // 2. Cartulina Digital Interactiva (Modo Migración de Cartulina)
    private final VBox boxCartulinaSection = new VBox(10);
    private final FlowPane gridCartulina = new FlowPane();
    private final TextField txtQuickPaidCount = new TextField();
    private final Label lblCartulinaSummary = new Label();
    private final Label lblAttachedPhoto = new Label("Sin foto adjunta");

    private final Button btnDisburse = new Button("Aprobar y Desembolsar Crédito");

    public CreateLoanDialog(
            CreateLoanUseCase createLoanUseCase,
            CustomerRepository customerRepository,
            Stage ownerStage,
            Consumer<LoanEntity> onSuccess
    ) {
        this(createLoanUseCase, customerRepository, null, null, null, ownerStage, onSuccess);
    }

    public CreateLoanDialog(
            CreateLoanUseCase createLoanUseCase,
            CustomerRepository customerRepository,
            SystemSettingRepository settingRepository,
            Stage ownerStage,
            Consumer<LoanEntity> onSuccess
    ) {
        this(createLoanUseCase, customerRepository, settingRepository, null, null, ownerStage, onSuccess);
    }

    public CreateLoanDialog(
            CreateLoanUseCase createLoanUseCase,
            CustomerRepository customerRepository,
            SystemSettingRepository settingRepository,
            LoanRepository loanRepository,
            RouteRepository routeRepository,
            Stage ownerStage,
            Consumer<LoanEntity> onSuccess
    ) {
        this.createLoanUseCase = createLoanUseCase;
        this.customerRepository = customerRepository;
        this.settingRepository = settingRepository;
        this.loanRepository = loanRepository;
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
        setTitle("Otorgar Crédito / Ingresar Cartulina Anterior");
        setResizable(true);

        buildUI();
        recalculateAndSimulate();
    }

    private void buildUI() {
        VBox root = new VBox(18);
        root.setPadding(new Insets(20, 24, 20, 24));
        root.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12;");
        root.setPrefWidth(840);

        // Header
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        lblHeaderIcon.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 12; -fx-background-radius: 8; -fx-border-color: #bfdbfe; -fx-border-radius: 8;");
        VBox titleBox = new VBox(2);
        lblHeaderTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");
        lblHeaderSubtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        titleBox.getChildren().addAll(lblHeaderTitle, lblHeaderSubtitle);
        header.getChildren().addAll(lblHeaderIcon, titleBox);

        // Formulario y Simulador en 2 columnas
        HBox body = new HBox(20);

        // Columna Izquierda: Parámetros del Crédito
        VBox leftForm = new VBox(10);
        leftForm.setPrefWidth(310);

        // Interruptor destacado de Migración
        chkMigration.setStyle("-fx-text-fill: #92400e; -fx-font-weight: 800; -fx-font-size: 11.5px; -fx-cursor: hand; -fx-background-color: #fef3c7; -fx-padding: 8 10; -fx-background-radius: 8; -fx-border-color: #fde68a; -fx-border-radius: 8;");
        chkMigration.setMaxWidth(Double.MAX_VALUE);
        chkMigration.selectedProperty().addListener((obs, old, isMig) -> applyMigrationMode(isMig));

        // Combo Cliente
        Label lblCust = new Label("Seleccionar Cliente *");
        lblCust.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        cmbCustomer.setMaxWidth(Double.MAX_VALUE);
        cmbCustomer.getStyleClass().add("search-field");

        crossRouteAlertBox.getChildren().setAll(lblCrossRouteAlert);
        crossRouteAlertBox.setVisible(false);
        crossRouteAlertBox.setManaged(false);

        cmbCustomer.valueProperty().addListener((obs, old, customer) -> checkCrossRouteAlert(customer));
        loadCustomers();

        // Capital
        VBox boxPrincipal = createFieldBox("Capital Prestado / Original ($) *", txtPrincipal);
        // Interés %
        VBox boxInterest = createFieldBox("Tasa de Interés (%) *", txtInterestPercent);
        // Frecuencia
        cmbFrequency.getItems().addAll("DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFrequency.setValue("DIARIO");
        cmbFrequency.setMaxWidth(Double.MAX_VALUE);
        cmbFrequency.getStyleClass().add("search-field");
        VBox boxFreq = new VBox(3, new Label("Modalidad / Frecuencia *") {{
            setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, cmbFrequency);

        // Cuotas
        VBox boxCount = createFieldBox("Número Total de Cuotas *", txtInstallmentCount);

        // Fecha Inicio
        dpStartDate.setMaxWidth(Double.MAX_VALUE);
        dpStartDate.getStyleClass().add("search-field");
        VBox boxDate = new VBox(3, new Label("Fecha Inicio Original / Cartulina *") {{
            setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, dpStartDate);

        leftForm.getChildren().addAll(chkMigration, lblCust, cmbCustomer, crossRouteAlertBox, boxPrincipal, boxInterest, boxFreq, boxCount, boxDate);

        // Eventos de recálculo dinámico en tiempo real
        txtPrincipal.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        txtInterestPercent.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        txtInstallmentCount.textProperty().addListener((obs, old, val) -> {
            paidInstallmentNumbers.clear();
            recalculateAndSimulate();
        });
        cmbFrequency.valueProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        dpStartDate.valueProperty().addListener((obs, old, val) -> recalculateAndSimulate());

        // Columna Derecha: Tarjeta de Resumen y Plan / Cartulina Digital
        VBox rightPreview = new VBox(12);
        HBox.setHgrow(rightPreview, Priority.ALWAYS);

        // Summary Card
        VBox summaryCard = new VBox(8);
        summaryCard.getStyleClass().add("table-card");
        summaryCard.setPadding(new Insets(12, 14, 12, 14));
        summaryCard.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 10; -fx-border-color: #e2e8f0; -fx-border-radius: 10; -fx-border-width: 1;");

        Label sumTitle = new Label("Resumen del Contrato");
        sumTitle.setStyle("-fx-text-fill: #475569; -fx-font-size: 12px; -fx-font-weight: bold;");

        HBox sumMetrics = new HBox(12);
        sumMetrics.setAlignment(Pos.CENTER_LEFT);

        VBox mTotal = new VBox(2, new Label("Total Pactado") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 10px;"); }}, lblSummaryTotal);
        lblSummaryTotal.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 15px; -fx-font-weight: bold;");

        lblCuotaDateHint.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 10px; -fx-font-weight: bold;");
        VBox mCuota = new VBox(2, new Label("Valor Cuota") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 10px;"); }}, lblSummaryInstallment, lblCuotaDateHint);
        lblSummaryInstallment.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");

        lblSummaryCartulinaTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10px;");
        VBox mCart = new VBox(2, lblSummaryCartulinaTitle, lblSummaryCartulina);
        lblSummaryCartulina.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 14px; -fx-font-weight: bold;");

        lblSummaryNetTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10px; -fx-font-weight: bold;");
        VBox mNet = new VBox(2, lblSummaryNetTitle, lblSummaryNet);
        lblSummaryNet.setStyle("-fx-text-fill: #059669; -fx-font-size: 16px; -fx-font-weight: bold;");

        sumMetrics.getChildren().addAll(mTotal, mCuota, mCart, mNet);
        summaryCard.getChildren().addAll(sumTitle, sumMetrics);

        // Vista 1: Tabla de Cuotas tradicional
        setupPlanTable();
        VBox.setVgrow(planTable, Priority.ALWAYS);

        // Vista 2: Cartulina Digital Interactiva
        buildCartulinaSection();
        VBox.setVgrow(boxCartulinaSection, Priority.ALWAYS);
        boxCartulinaSection.setVisible(false);
        boxCartulinaSection.setManaged(false);

        rightPreview.getChildren().addAll(summaryCard, planTable, boxCartulinaSection);

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

    private void buildCartulinaSection() {
        boxCartulinaSection.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 12; -fx-border-width: 1.5;");

        // Header de la cartulina
        HBox cartHeader = new HBox(10);
        cartHeader.setAlignment(Pos.CENTER_LEFT);
        Label lblCartTitle = new Label("📋 Cartulina Física Digital (Toca las casillas que ya pagó)");
        lblCartTitle.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 12px; -fx-font-weight: 900;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Button btnPhoto = new Button("📷 Foto Cartulina");
        btnPhoto.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 8; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-cursor: hand;");
        btnPhoto.setOnAction(e -> pickCartulinaPhoto());

        cartHeader.getChildren().addAll(lblCartTitle, sp, btnPhoto);

        // Fila de marcado rápido
        HBox quickRow = new HBox(8);
        quickRow.setAlignment(Pos.CENTER_LEFT);
        Label lblQuick = new Label("Marcar primeras:");
        lblQuick.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        txtQuickPaidCount.setPrefWidth(55);
        txtQuickPaidCount.getStyleClass().add("search-field");
        txtQuickPaidCount.setPromptText("Ej: 14");

        Button btnApplyQuick = new Button("Aplicar");
        btnApplyQuick.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 8; -fx-background-radius: 6; -fx-cursor: hand;");
        btnApplyQuick.setOnAction(e -> applyQuickPaidCount());

        Button btnAll = new Button("Todas");
        btnAll.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 8; -fx-background-radius: 6; -fx-cursor: hand;");
        btnAll.setOnAction(e -> markAllPaid(true));

        Button btnNone = new Button("Ninguna");
        btnNone.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 8; -fx-background-radius: 6; -fx-cursor: hand;");
        btnNone.setOnAction(e -> markAllPaid(false));

        quickRow.getChildren().addAll(lblQuick, txtQuickPaidCount, btnApplyQuick, btnAll, btnNone);

        // FlowPane interactivo con ScrollPane
        gridCartulina.setHgap(6);
        gridCartulina.setVgap(6);
        gridCartulina.setPadding(new Insets(8));

        ScrollPane scrollGrid = new ScrollPane(gridCartulina);
        scrollGrid.setFitToWidth(true);
        scrollGrid.setStyle("-fx-background-color: transparent; -fx-background: #f8fafc; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");
        scrollGrid.setPrefHeight(180);
        VBox.setVgrow(scrollGrid, Priority.ALWAYS);

        // Indicador de foto
        lblAttachedPhoto.setStyle("-fx-text-fill: #059669; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        lblAttachedPhoto.setVisible(false);
        lblAttachedPhoto.setManaged(false);

        // Banner resumen de la cartulina
        HBox cartSummaryBanner = new HBox(12);
        cartSummaryBanner.setAlignment(Pos.CENTER_LEFT);
        cartSummaryBanner.setStyle("-fx-background-color: #f0fdf4; -fx-padding: 8 12; -fx-background-radius: 8; -fx-border-color: #bbf7d0; -fx-border-radius: 8;");

        lblCartulinaSummary.setStyle("-fx-text-fill: #15803d; -fx-font-size: 11.5px; -fx-font-weight: bold;");
        HBox.setHgrow(lblCartulinaSummary, Priority.ALWAYS);

        Label lblSafeCashBadge = new Label("🛡️ Caja de hoy protegida ($0)");
        lblSafeCashBadge.setStyle("-fx-background-color: #dcfce7; -fx-text-fill: #166534; -fx-font-size: 10px; -fx-font-weight: 900; -fx-padding: 3 8; -fx-background-radius: 6;");

        cartSummaryBanner.getChildren().addAll(lblCartulinaSummary, lblSafeCashBadge);

        boxCartulinaSection.getChildren().addAll(cartHeader, quickRow, scrollGrid, lblAttachedPhoto, cartSummaryBanner);
    }

    private void applyMigrationMode(boolean isMig) {
        if (isMig) {
            lblHeaderIcon.setText("CRÉDITO ANTERIOR");
            lblHeaderIcon.setStyle("-fx-background-color: #fef3c7; -fx-text-fill: #b45309; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 12; -fx-background-radius: 8; -fx-border-color: #fde68a; -fx-border-radius: 8;");
            lblHeaderTitle.setText("Ingreso de Crédito Anterior");
            lblHeaderSubtitle.setText("Marca las cuotas ya canceladas en la cartulina física sin alterar la caja de hoy");
            btnDisburse.setText("Guardar Crédito Anterior");
            btnDisburse.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 13px; -fx-padding: 9 16; -fx-background-radius: 8;");

            lblSummaryCartulinaTitle.setText("Impacto Caja Hoy");
            lblSummaryNetTitle.setText("💼 Saldo Cartera a Cobrar");

            planTable.setVisible(false);
            planTable.setManaged(false);
            boxCartulinaSection.setVisible(true);
            boxCartulinaSection.setManaged(true);
        } else {
            lblHeaderIcon.setText("NUEVO CRÉDITO");
            lblHeaderIcon.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 12; -fx-background-radius: 8; -fx-border-color: #bfdbfe; -fx-border-radius: 8;");
            lblHeaderTitle.setText("Nuevo Crédito y Desembolso");
            lblHeaderSubtitle.setText("Simula las cuotas, calcula intereses y aprueba el desembolso");
            btnDisburse.setText("Aprobar y Desembolsar Crédito");
            btnDisburse.setStyle("");

            lblSummaryCartulinaTitle.setText("Cartulina / Papelería");
            lblSummaryNetTitle.setText("💵 Neto a Entregar");

            boxCartulinaSection.setVisible(false);
            boxCartulinaSection.setManaged(false);
            planTable.setVisible(true);
            planTable.setManaged(true);
        }
        recalculateAndSimulate();
    }

    private void pickCartulinaPhoto() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Seleccionar Foto de Cartulina Física Original");
        chooser.getExtensionFilters().addAll(
                new FileChooser.ExtensionFilter("Imágenes (*.jpg, *.png, *.jpeg)", "*.jpg", "*.png", "*.jpeg")
        );
        File file = chooser.showOpenDialog(this);
        if (file != null) {
            cardPhotoPath = file.getAbsolutePath();
            lblAttachedPhoto.setText("📎 Foto adjunta: " + file.getName() + " (" + (file.length() / 1024) + " KB)");
            lblAttachedPhoto.setVisible(true);
            lblAttachedPhoto.setManaged(true);
        }
    }

    private void applyQuickPaidCount() {
        try {
            String text = txtQuickPaidCount.getText().trim();
            if (text.isEmpty()) return;
            int n = Integer.parseInt(text);
            int maxCount = Integer.parseInt(txtInstallmentCount.getText().trim());
            paidInstallmentNumbers.clear();
            for (int i = 1; i <= Math.min(n, maxCount); i++) {
                paidInstallmentNumbers.add(i);
            }
            recalculateAndSimulate();
        } catch (Exception ignored) {}
    }

    private void markAllPaid(boolean all) {
        paidInstallmentNumbers.clear();
        if (all) {
            try {
                int maxCount = Integer.parseInt(txtInstallmentCount.getText().trim());
                for (int i = 1; i <= maxCount; i++) {
                    paidInstallmentNumbers.add(i);
                }
            } catch (Exception ignored) {}
        }
        recalculateAndSimulate();
    }

    private VBox createFieldBox(String label, TextField field) {
        VBox box = new VBox(3);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
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
            checkCrossRouteAlert(list.get(0));
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
                checkCrossRouteAlert(c);
                break;
            }
        }
    }

    private void checkCrossRouteAlert(CustomerEntity customer) {
        if (customer == null || loanRepository == null) {
            crossRouteAlertBox.setVisible(false);
            crossRouteAlertBox.setManaged(false);
            return;
        }

        List<LoanEntity> activeLoans = loanRepository.findByCustomerId(customer.getId()).stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .toList();

        if (activeLoans.isEmpty()) {
            crossRouteAlertBox.setVisible(false);
            crossRouteAlertBox.setManaged(false);
            return;
        }

        String currentRoute = customer.getRouteId() != null ? customer.getRouteId() : "route-norte";
        String selectedGlobalRoute = UserSessionContext.getSelectedRouteId();
        if (selectedGlobalRoute != null && !"ALL".equalsIgnoreCase(selectedGlobalRoute)) {
            currentRoute = selectedGlobalRoute;
        }

        boolean hasLoanInOtherRoute = false;
        BigDecimal totalOtherDebt = BigDecimal.ZERO;
        String otherRouteName = "";

        Map<String, String> routeNames = (routeRepository != null)
                ? routeRepository.findAll().stream().collect(Collectors.toMap(RouteEntity::getId, RouteEntity::getName, (a, b) -> a))
                : Map.of();

        for (LoanEntity loan : activeLoans) {
            String lRoute = loan.getRouteId() != null ? loan.getRouteId() : "route-norte";
            if (!lRoute.equalsIgnoreCase(currentRoute)) {
                hasLoanInOtherRoute = true;
                totalOtherDebt = totalOtherDebt.add(loan.getTotalAgreed());
                otherRouteName = routeNames.getOrDefault(lRoute, lRoute);
            }
        }

        if (hasLoanInOtherRoute) {
            lblCrossRouteAlert.setText("⚠️ ALERTA CREDITICIA MULTI-RUTA:\nEste cliente ya registra crédito ACTIVO en [" + otherRouteName + "] por saldo de " + CURRENCY.format(totalOtherDebt) + ". Verifique antes de autorizar el desembolso.");
            crossRouteAlertBox.setStyle("-fx-background-color: #fef2f2; -fx-padding: 8 10; -fx-background-radius: 6; -fx-border-color: #fecaca; -fx-border-radius: 6;");
            lblCrossRouteAlert.setStyle("-fx-text-fill: #991b1b; -fx-font-size: 11px; -fx-font-weight: bold; -fx-wrap-text: true;");
            crossRouteAlertBox.setVisible(true);
            crossRouteAlertBox.setManaged(true);
        } else {
            lblCrossRouteAlert.setText("ℹ️ El cliente tiene " + activeLoans.size() + " crédito(s) vigente(s) en esta ruta. Verifique cupo.");
            crossRouteAlertBox.setStyle("-fx-background-color: #eff6ff; -fx-padding: 8 10; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6;");
            lblCrossRouteAlert.setStyle("-fx-text-fill: #1e40af; -fx-font-size: 11px; -fx-font-weight: bold; -fx-wrap-text: true;");
            crossRouteAlertBox.setVisible(true);
            crossRouteAlertBox.setManaged(true);
        }
    }

    public void setMigrationMode(boolean enabled) {
        chkMigration.setSelected(enabled);
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
            BigDecimal singleCuota = BigDecimal.ZERO;
            if (!plan.isEmpty()) {
                singleCuota = plan.get(0).amount();
                lblSummaryInstallment.setText(CURRENCY.format(singleCuota));
                lblCuotaDateHint.setText("1ª cuota: " + plan.get(0).dueDate().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")));
            }

            boolean isMig = chkMigration.isSelected();

            if (isMig) {
                // Modo Migración: Mostramos Grilla de Cartulina y saldos
                updateCartulinaGrid(count, singleCuota);
                int paidCount = paidInstallmentNumbers.size();
                BigDecimal totalPaid = singleCuota.multiply(BigDecimal.valueOf(paidCount));
                BigDecimal pendingBalance = totalAgreed.subtract(totalPaid).max(BigDecimal.ZERO);

                lblSummaryCartulina.setText("Protegida ($0 hoy)");
                lblSummaryNet.setText(CURRENCY.format(pendingBalance));
            } else {
                // Modo Normal: Desembolso regular con papelería
                BigDecimal cartulina = computeConfiguredPaperwork(principal);
                if (cartulina.compareTo(BigDecimal.ZERO) > 0) {
                    lblSummaryCartulina.setText("- " + CURRENCY.format(cartulina));
                } else {
                    lblSummaryCartulina.setText("No aplica ($0)");
                }
                BigDecimal netCash = principal.subtract(cartulina);
                lblSummaryNet.setText(CURRENCY.format(netCash));
            }

            btnDisburse.setDisable(false);
            lblFeedback.setVisible(false);
            lblFeedback.setManaged(false);
        } catch (Exception ex) {
            btnDisburse.setDisable(true);
        }
    }

    private void updateCartulinaGrid(int totalCount, BigDecimal installmentAmount) {
        gridCartulina.getChildren().clear();
        for (int i = 1; i <= totalCount; i++) {
            final int instNum = i;
            boolean isPaid = paidInstallmentNumbers.contains(instNum);

            Button tile = new Button(instNum + (isPaid ? " ✓" : ""));
            if (isPaid) {
                tile.setStyle("-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-font-weight: 900; -fx-font-size: 11px; -fx-border-color: #86efac; -fx-border-radius: 6; -fx-background-radius: 6; -fx-min-width: 46px; -fx-min-height: 34px; -fx-cursor: hand;");
            } else {
                tile.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #64748b; -fx-font-weight: bold; -fx-font-size: 11px; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-min-width: 46px; -fx-min-height: 34px; -fx-cursor: hand;");
            }

            tile.setOnAction(e -> {
                if (paidInstallmentNumbers.contains(instNum)) {
                    paidInstallmentNumbers.remove(instNum);
                } else {
                    paidInstallmentNumbers.add(instNum);
                }
                recalculateAndSimulate();
            });

            gridCartulina.getChildren().add(tile);
        }

        int paidCount = paidInstallmentNumbers.size();
        int pendingCount = Math.max(0, totalCount - paidCount);
        BigDecimal paidTotal = installmentAmount.multiply(BigDecimal.valueOf(paidCount));
        BigDecimal pendingTotal = installmentAmount.multiply(BigDecimal.valueOf(pendingCount));

        lblCartulinaSummary.setText("Cobrado en papel: " + CURRENCY.format(paidTotal) + " (" + paidCount + "/" + totalCount + ")  •  Pendiente: " + CURRENCY.format(pendingTotal) + " (" + pendingCount + " cuotas)");
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

            if (principal.compareTo(BigDecimal.ZERO) <= 0) {
                showError("El monto prestado debe ser mayor a cero.");
                return;
            }
            if (count <= 0) {
                showError("El número de cuotas debe ser mayor a cero.");
                return;
            }

            boolean isMigration = chkMigration.isSelected();

            if (!isMigration && settingRepository != null) {
                BigDecimal maxAllowed = settingRepository.findById("max_new_loan_amount")
                        .map(s -> CurrencyInputUtil.parseAmount(s.getSettingValue()))
                        .orElse(BigDecimal.ZERO);
                if (maxAllowed.compareTo(BigDecimal.ZERO) > 0 && principal.compareTo(maxAllowed) > 0) {
                    showError("El capital solicitado supera el tope máximo permitido (" + CURRENCY.format(maxAllowed) + ").");
                    return;
                }
            }

            BigDecimal rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal interestAmount = principal.multiply(rateDecimal);
            BigDecimal totalAgreed = principal.add(interestAmount);
            BigDecimal cartulina = isMigration ? BigDecimal.ZERO : computeConfiguredPaperwork(principal);

            btnDisburse.setDisable(true);
            lblFeedback.setText(isMigration ? "Guardando crédito anterior..." : "Registrando crédito y desembolso...");
            lblFeedback.setStyle("-fx-text-fill: #1d4ed8; -fx-background-color: #eff6ff; -fx-padding: 8 12; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6;");
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
                    authorId,
                    cartulina,
                    isMigration,
                    new HashSet<>(paidInstallmentNumbers),
                    cardPhotoPath,
                    isMigration ? "Migración cartulina física. Cuotas pagadas: " + paidInstallmentNumbers.size() : null
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
        lblFeedback.setStyle("-fx-text-fill: #b91c1c; -fx-background-color: #fef2f2; -fx-padding: 8 12; -fx-background-radius: 6; -fx-border-color: #fecaca; -fx-border-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }

    private static BigDecimal parseAmount(String text) {
        return CurrencyInputUtil.parseAmount(text);
    }
}
