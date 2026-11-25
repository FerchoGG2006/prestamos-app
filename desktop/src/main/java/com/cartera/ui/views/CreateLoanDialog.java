package com.cartera.ui.views;

import com.cartera.customers.application.AttachmentService;
import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.customers.application.CreateCustomerWithLoanUseCase;
import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSession;
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
import java.nio.file.Path;
import java.text.NumberFormat;
import java.time.DayOfWeek;
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
    private AttachmentService attachmentService;
    private InstallmentRepository installmentRepository;
    private CreateCustomerWithLoanUseCase createCustomerWithLoanUseCase;

    public void setAttachmentService(AttachmentService attachmentService) {
        this.attachmentService = attachmentService;
    }

    public void setInstallmentRepository(InstallmentRepository installmentRepository) {
        this.installmentRepository = installmentRepository;
    }

    public void setCreateCustomerWithLoanUseCase(CreateCustomerWithLoanUseCase createCustomerWithLoanUseCase) {
        this.createCustomerWithLoanUseCase = createCustomerWithLoanUseCase;
        if (boxCustomerModeToggle != null) {
            boolean enabled = createCustomerWithLoanUseCase != null;
            boxCustomerModeToggle.setVisible(enabled);
            boxCustomerModeToggle.setManaged(enabled);
        }
    }

    public void preselectCustomer(String customerId) {
        if (customerId == null || customerId.isBlank()) return;
        for (CustomerEntity c : cmbCustomer.getItems()) {
            if (customerId.equals(c.getId())) {
                cmbCustomer.setValue(c);
                rbExistingCustomer.setSelected(true);
                break;
            }
        }
    }

    // Modo Cliente Existente vs Nuevo Cliente (en un solo flujo)
    private final HBox boxCustomerModeToggle = new HBox(6);
    private final ToggleButton rbExistingCustomer = new ToggleButton("Cliente Existente");
    private final ToggleButton rbNewCustomer = new ToggleButton("+ Nuevo Cliente");
    private final VBox boxExistingCustomer = new VBox(4);
    private final VBox boxNewCustomer = new VBox(6);
    private final TextField txtNewFullName = new TextField();
    private final TextField txtNewDoc = new TextField();
    private final TextField txtNewPhone = new TextField();
    private final TextField txtNewAddress = new TextField();
    private final TextField txtNewNeighborhood = new TextField();
    private final TextField txtNewBusiness = new TextField();
    private final ComboBox<RouteEntity> cmbNewCustomerRoute = new ComboBox<>();
    private final Button btnSaveAndNext = new Button("Guardar y siguiente cartulina");

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
    private final Label lblStartDate = new Label("Fecha Inicio Original / Cartulina *");
    private final VBox boxDate = new VBox(3);

    // Switch de Crédito Anterior
    private final CheckBox chkMigration = new CheckBox("Crédito Anterior (Cartulina ya iniciada)");
    private final Set<Integer> paidInstallmentNumbers = new HashSet<>();
    private String cardPhotoPath = null;
    private final DatePicker dpMigrationPayday = new DatePicker(LocalDate.now());
    private final VBox boxMigrationPayday = new VBox(6);
    private final HBox rowPaydayButtons = new HBox(5);
    private final Label lblPaydayPreview = new Label();

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
    private final Label lblSummaryNetTitle = new Label("Neto a Entregar");
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

        // Interruptor destacado de Migración (Solo ADMIN / SUPERVISOR — Spec 009)
        boolean isCollector = UserSessionContext.getSession().map(UserSession::isCollector).orElse(false);
        chkMigration.setStyle("-fx-text-fill: #92400e; -fx-font-weight: 800; -fx-font-size: 11.5px; -fx-cursor: hand; -fx-background-color: #fef3c7; -fx-padding: 8 10; -fx-background-radius: 8; -fx-border-color: #fde68a; -fx-border-radius: 8;");
        chkMigration.setMaxWidth(Double.MAX_VALUE);
        chkMigration.setVisible(!isCollector);
        chkMigration.setManaged(!isCollector);
        chkMigration.selectedProperty().addListener((obs, old, isMig) -> applyMigrationMode(isMig));

        // Selector de Modo: Cliente Existente vs + Nuevo Cliente
        ToggleGroup custModeGroup = new ToggleGroup();
        rbExistingCustomer.setToggleGroup(custModeGroup);
        rbNewCustomer.setToggleGroup(custModeGroup);
        rbExistingCustomer.setSelected(true);
        rbExistingCustomer.setMaxWidth(Double.MAX_VALUE);
        rbNewCustomer.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(rbExistingCustomer, Priority.ALWAYS);
        HBox.setHgrow(rbNewCustomer, Priority.ALWAYS);
        boxCustomerModeToggle.getChildren().setAll(rbExistingCustomer, rbNewCustomer);
        boxCustomerModeToggle.setVisible(createCustomerWithLoanUseCase != null);
        boxCustomerModeToggle.setManaged(createCustomerWithLoanUseCase != null);

        // Bloque Cliente Existente
        Label lblCust = new Label("Seleccionar Cliente *");
        lblCust.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        cmbCustomer.setMaxWidth(Double.MAX_VALUE);
        cmbCustomer.getStyleClass().add("search-field");

        crossRouteAlertBox.getChildren().setAll(lblCrossRouteAlert);
        crossRouteAlertBox.setVisible(false);
        crossRouteAlertBox.setManaged(false);

        cmbCustomer.valueProperty().addListener((obs, old, customer) -> checkCrossRouteAlert(customer));
        loadCustomers();
        boxExistingCustomer.getChildren().setAll(lblCust, cmbCustomer, crossRouteAlertBox);

        // Bloque Nuevo Cliente compacto (cliente + crédito/cartulina en un solo paso)
        boxNewCustomer.setStyle("-fx-background-color: #f8fafc; -fx-padding: 8 10; -fx-background-radius: 8; -fx-border-color: #cbd5e1; -fx-border-radius: 8;");
        txtNewFullName.setPromptText("Nombre completo *");
        txtNewDoc.setPromptText("Cédula / Documento *");
        txtNewPhone.setPromptText("Teléfono / WhatsApp *");
        txtNewAddress.setPromptText("Dirección");
        txtNewNeighborhood.setPromptText("Barrio");
        txtNewBusiness.setPromptText("Negocio (opcional)");
        for (TextField tf : List.of(txtNewFullName, txtNewDoc, txtNewPhone, txtNewAddress, txtNewNeighborhood, txtNewBusiness)) {
            tf.getStyleClass().add("search-field");
            tf.setMaxWidth(Double.MAX_VALUE);
        }
        cmbNewCustomerRoute.setMaxWidth(Double.MAX_VALUE);
        cmbNewCustomerRoute.getStyleClass().add("search-field");
        cmbNewCustomerRoute.setConverter(new StringConverter<>() {
            @Override public String toString(RouteEntity r) { return r == null ? "" : r.getName() + " (" + r.getId() + ")"; }
            @Override public RouteEntity fromString(String s) { return null; }
        });
        loadNewCustomerRoutes();

        HBox rowDocPhone = new HBox(6, txtNewDoc, txtNewPhone);
        HBox.setHgrow(txtNewDoc, Priority.ALWAYS);
        HBox.setHgrow(txtNewPhone, Priority.ALWAYS);
        HBox rowAddrNeigh = new HBox(6, txtNewAddress, txtNewNeighborhood);
        HBox.setHgrow(txtNewAddress, Priority.ALWAYS);
        HBox.setHgrow(txtNewNeighborhood, Priority.ALWAYS);
        Label lblNewTitle = new Label("Datos del Nuevo Cliente *");
        lblNewTitle.setStyle("-fx-text-fill: #0f766e; -fx-font-size: 11px; -fx-font-weight: bold;");
        boxNewCustomer.getChildren().setAll(lblNewTitle, txtNewFullName, rowDocPhone, rowAddrNeigh, txtNewBusiness, cmbNewCustomerRoute);
        boxNewCustomer.setVisible(false);
        boxNewCustomer.setManaged(false);

        Runnable syncCustomerModeStyle = () -> {
            boolean isNew = rbNewCustomer.isSelected();
            rbExistingCustomer.setStyle(!isNew
                    ? "-fx-background-color: #0f172a; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 5 8; -fx-background-radius: 6; -fx-cursor: hand;"
                    : "-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 5 8; -fx-background-radius: 6; -fx-cursor: hand;");
            rbNewCustomer.setStyle(isNew
                    ? "-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 5 8; -fx-background-radius: 6; -fx-cursor: hand;"
                    : "-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 5 8; -fx-background-radius: 6; -fx-cursor: hand;");
            boxExistingCustomer.setVisible(!isNew);
            boxExistingCustomer.setManaged(!isNew);
            boxNewCustomer.setVisible(isNew);
            boxNewCustomer.setManaged(isNew);
        };
        rbExistingCustomer.selectedProperty().addListener((o, ov, nv) -> { if (!nv && !rbNewCustomer.isSelected()) rbExistingCustomer.setSelected(true); syncCustomerModeStyle.run(); });
        rbNewCustomer.selectedProperty().addListener((o, ov, nv) -> { if (!nv && !rbExistingCustomer.isSelected()) rbNewCustomer.setSelected(true); syncCustomerModeStyle.run(); });
        syncCustomerModeStyle.run();

        // Capital
        VBox boxPrincipal = createFieldBox("Capital Prestado / Original ($) *", txtPrincipal);
        // Interés %
        VBox boxInterest = createFieldBox("Tasa de Interés (%) *", txtInterestPercent);
        // Frecuencia
        cmbFrequency.getItems().addAll("FECHA FIJA", "DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFrequency.setValue("DIARIO");
        cmbFrequency.setMaxWidth(Double.MAX_VALUE);
        cmbFrequency.getStyleClass().add("search-field");
        VBox boxFreq = new VBox(3, new Label("Modalidad / Frecuencia *") {{
            setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        }}, cmbFrequency);

        // Cuotas
        VBox boxCount = createFieldBox("Número Total de Cuotas *", txtInstallmentCount);

        // Listener para Fecha Fija y cambio de modalidad
        cmbFrequency.valueProperty().addListener((obs, old, val) -> {
            boolean isFixed = CreateLoanUseCase.isFixedDateFrequency(val);
            if (isFixed) {
                txtInstallmentCount.setText("1");
                txtInstallmentCount.setDisable(true);
            } else {
                txtInstallmentCount.setDisable(false);
                if ("1".equals(txtInstallmentCount.getText().trim())) {
                    String def = switch (val != null ? val.toUpperCase() : "DIARIO") {
                        case "SEMANAL" -> "4";
                        case "QUINCENAL" -> "2";
                        case "MENSUAL" -> "1";
                        default -> "30";
                    };
                    txtInstallmentCount.setText(def);
                }
            }
            paidInstallmentNumbers.clear();
            updateDateBoxesVisibility();
            rebuildPaydayButtons();
            recalculateAndSimulate();
        });

        // Fecha Inicio (o Fecha Fija)
        dpStartDate.setMaxWidth(Double.MAX_VALUE);
        dpStartDate.getStyleClass().add("search-field");
        lblStartDate.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        boxDate.getChildren().setAll(lblStartDate, dpStartDate);

        leftForm.getChildren().addAll(chkMigration, boxCustomerModeToggle, boxExistingCustomer, boxNewCustomer, boxPrincipal, boxInterest, boxFreq, boxCount, boxDate);

        // Eventos de recálculo dinámico en tiempo real
        txtPrincipal.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        txtInterestPercent.textProperty().addListener((obs, old, val) -> recalculateAndSimulate());
        txtInstallmentCount.textProperty().addListener((obs, old, val) -> {
            paidInstallmentNumbers.clear();
            recalculateAndSimulate();
        });
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

        btnSaveAndNext.setStyle("-fx-background-color: #0f766e; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12.5px; -fx-padding: 9 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnSaveAndNext.setVisible(false);
        btnSaveAndNext.setManaged(false);
        btnSaveAndNext.setOnAction(e -> disburseLoan(true));

        btnDisburse.getStyleClass().add("btn-primary");
        btnDisburse.setOnAction(e -> disburseLoan(false));

        actions.getChildren().addAll(spacer, btnCancel, btnSaveAndNext, btnDisburse);

        root.getChildren().addAll(header, body, lblFeedback, actions);

        ScrollPane outerScroll = new ScrollPane(root);
        outerScroll.setFitToWidth(true);
        outerScroll.setStyle("-fx-background-color: #ffffff; -fx-background: #ffffff; -fx-border-color: transparent;");

        var scene = new Scene(outerScroll, 880, 660);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private void buildCartulinaSection() {
        boxCartulinaSection.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 12; -fx-border-width: 1.5;");

        // Header de la cartulina
        HBox cartHeader = new HBox(10);
        cartHeader.setAlignment(Pos.CENTER_LEFT);
        Label lblCartTitle = new Label("Cartulina Física Digital (Toca las casillas que ya pagó)");
        lblCartTitle.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 12px; -fx-font-weight: 900;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        Button btnPhoto = new Button("Foto Cartulina");
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

        // Bloque "Día de pago" para anclar cuotas de cartulina migrada (Semanal: Lun-Sáb + Fecha; otras: Hoy/Mañana + Fecha)
        boxMigrationPayday.setStyle("-fx-background-color: #f8fafc; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 8 10;");
        HBox paydayHeader = new HBox(10);
        paydayHeader.setAlignment(Pos.CENTER_LEFT);
        Label lblPaydayTitle = new Label("Día de pago");
        lblPaydayTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 11.5px; -fx-font-weight: 900;");
        Region spPayday = new Region();
        HBox.setHgrow(spPayday, Priority.ALWAYS);
        dpMigrationPayday.setPrefWidth(135);
        dpMigrationPayday.getStyleClass().add("search-field");
        dpMigrationPayday.valueProperty().addListener((obs, old, val) -> {
            rebuildPaydayButtons();
            recalculateAndSimulate();
        });
        paydayHeader.getChildren().addAll(lblPaydayTitle, spPayday, dpMigrationPayday);

        rowPaydayButtons.setAlignment(Pos.CENTER_LEFT);
        lblPaydayPreview.setWrapText(true);
        lblPaydayPreview.setStyle("-fx-text-fill: #0f766e; -fx-font-size: 10.5px; -fx-font-weight: bold;");

        boxMigrationPayday.getChildren().addAll(paydayHeader, rowPaydayButtons, lblPaydayPreview);
        rebuildPaydayButtons();

        // FlowPane interactivo con ScrollPane
        gridCartulina.setHgap(6);
        gridCartulina.setVgap(6);
        gridCartulina.setPadding(new Insets(8));

        ScrollPane scrollGrid = new ScrollPane(gridCartulina);
        scrollGrid.setFitToWidth(true);
        scrollGrid.setStyle("-fx-background-color: transparent; -fx-background: #f8fafc; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");
        scrollGrid.setPrefHeight(165);
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

        Label lblSafeCashBadge = new Label("Caja de hoy protegida ($0)");
        lblSafeCashBadge.setStyle("-fx-background-color: #dcfce7; -fx-text-fill: #166534; -fx-font-size: 10px; -fx-font-weight: 900; -fx-padding: 3 8; -fx-background-radius: 6;");

        cartSummaryBanner.getChildren().addAll(lblCartulinaSummary, lblSafeCashBadge);

        boxCartulinaSection.getChildren().addAll(cartHeader, quickRow, boxMigrationPayday, scrollGrid, lblAttachedPhoto, cartSummaryBanner);
    }

    private void updateDateBoxesVisibility() {
        boolean isMig = chkMigration.isSelected();
        boolean isFixed = CreateLoanUseCase.isFixedDateFrequency(cmbFrequency.getValue());
        boolean showPaydayBlock = isMig && !isFixed;
        boxMigrationPayday.setVisible(showPaydayBlock);
        boxMigrationPayday.setManaged(showPaydayBlock);
        boxDate.setVisible(!showPaydayBlock);
        boxDate.setManaged(!showPaydayBlock);
        lblStartDate.setText(isFixed ? "Fecha Fija de Pago Único *" : "Fecha Inicio Original / Cartulina *");
    }

    private void rebuildPaydayButtons() {
        rowPaydayButtons.getChildren().clear();
        String freq = cmbFrequency.getValue() != null ? cmbFrequency.getValue().trim().toUpperCase() : "DIARIO";
        LocalDate selected = dpMigrationPayday.getValue() != null ? dpMigrationPayday.getValue() : LocalDate.now();
        LocalDate today = LocalDate.now();

        if ("SEMANAL".equals(freq)) {
            DayOfWeek[] dows = {DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY, DayOfWeek.THURSDAY, DayOfWeek.FRIDAY, DayOfWeek.SATURDAY};
            String[] labels = {"Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"};
            for (int idx = 0; idx < dows.length; idx++) {
                DayOfWeek dow = dows[idx];
                boolean active = selected.getDayOfWeek() == dow;
                Button btn = new Button(labels[idx]);
                btn.setStyle(active
                        ? "-fx-background-color: #0f766e; -fx-text-fill: white; -fx-font-weight: 900; -fx-font-size: 11px; -fx-padding: 4 9; -fx-background-radius: 6; -fx-cursor: hand;"
                        : "-fx-background-color: #ffffff; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 9; -fx-background-radius: 6; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-cursor: hand;");
                btn.setOnAction(e -> dpMigrationPayday.setValue(CreateLoanUseCase.upcomingWeekday(LocalDate.now(), dow)));
                rowPaydayButtons.getChildren().add(btn);
            }
        } else {
            LocalDate tomorrow = today.plusDays(1);
            if ("DIARIO".equals(freq) && tomorrow.getDayOfWeek() == DayOfWeek.SUNDAY) {
                tomorrow = tomorrow.plusDays(1);
            }
            final LocalDate tmrFinal = tomorrow;
            Button btnHoy = new Button("Hoy");
            boolean hoyActive = selected.equals(today);
            btnHoy.setStyle(hoyActive
                    ? "-fx-background-color: #0f766e; -fx-text-fill: white; -fx-font-weight: 900; -fx-font-size: 11px; -fx-padding: 4 12; -fx-background-radius: 6; -fx-cursor: hand;"
                    : "-fx-background-color: #ffffff; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 12; -fx-background-radius: 6; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-cursor: hand;");
            btnHoy.setOnAction(e -> dpMigrationPayday.setValue(today));

            Button btnManana = new Button("Mañana");
            boolean tmrActive = selected.equals(tmrFinal);
            btnManana.setStyle(tmrActive
                    ? "-fx-background-color: #0f766e; -fx-text-fill: white; -fx-font-weight: 900; -fx-font-size: 11px; -fx-padding: 4 12; -fx-background-radius: 6; -fx-cursor: hand;"
                    : "-fx-background-color: #ffffff; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 4 12; -fx-background-radius: 6; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-cursor: hand;");
            btnManana.setOnAction(e -> dpMigrationPayday.setValue(tmrFinal));

            Label hint = new Label("O elige fecha exacta arriba (incl. atrasadas)");
            hint.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10px;");
            rowPaydayButtons.getChildren().addAll(btnHoy, btnManana, hint);
        }
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
            lblSummaryNetTitle.setText("Saldo Cartera a Cobrar");

            planTable.setVisible(false);
            planTable.setManaged(false);
            boxCartulinaSection.setVisible(true);
            boxCartulinaSection.setManaged(true);
            btnSaveAndNext.setVisible(true);
            btnSaveAndNext.setManaged(true);
        } else {
            lblHeaderIcon.setText("NUEVO CRÉDITO");
            lblHeaderIcon.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 12; -fx-background-radius: 8; -fx-border-color: #bfdbfe; -fx-border-radius: 8;");
            lblHeaderTitle.setText("Nuevo Crédito y Desembolso");
            lblHeaderSubtitle.setText("Simula las cuotas, calcula intereses y aprueba el desembolso");
            btnDisburse.setText("Aprobar y Desembolsar Crédito");
            btnDisburse.setStyle("");

            lblSummaryCartulinaTitle.setText("Cartulina / Papelería");
            lblSummaryNetTitle.setText("Neto a Entregar");

            boxCartulinaSection.setVisible(false);
            boxCartulinaSection.setManaged(false);
            planTable.setVisible(true);
            planTable.setManaged(true);
            btnSaveAndNext.setVisible(false);
            btnSaveAndNext.setManaged(false);
        }
        updateDateBoxesVisibility();
        rebuildPaydayButtons();
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
            lblAttachedPhoto.setText("Foto adjunta: " + file.getName() + " (" + (file.length() / 1024) + " KB)");
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
        var sessionOpt = UserSessionContext.getSession();
        boolean isCollector = sessionOpt.map(UserSession::isCollector).orElse(false);
        String collectorId = sessionOpt.map(UserSession::userId).orElse(null);
        String selectedRoute = UserSessionContext.getSelectedRouteId();

        List<CustomerEntity> list = customerRepository.findAll().stream()
                .filter(c -> !"INACTIVO".equalsIgnoreCase(c.getStatus()))
                .filter(c -> {
                    if (!isCollector) return true;
                    boolean sameCollector = collectorId != null && collectorId.equalsIgnoreCase(c.getCollectorId());
                    boolean sameRoute = selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute)
                            && !"NONE".equalsIgnoreCase(selectedRoute)
                            && selectedRoute.equalsIgnoreCase(c.getRouteId());
                    return sameCollector || sameRoute;
                })
                .sorted(Comparator.comparing((CustomerEntity c) ->
                        selectedRoute != null && selectedRoute.equalsIgnoreCase(c.getRouteId()) ? 0 : 1)
                        .thenComparing(c -> c.getFullName() != null ? c.getFullName().toLowerCase(Locale.ROOT) : ""))
                .toList();

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

    public void setFrequency(String frequency) {
        if (frequency == null || cmbFrequency == null) return;
        for (var item : cmbFrequency.getItems()) {
            if (item.equalsIgnoreCase(frequency.trim())) {
                cmbFrequency.setValue(item);
                break;
            }
        }
    }

    public void setStartDate(LocalDate date) {
        if (date != null && dpStartDate != null) {
            dpStartDate.setValue(date);
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

        String currentRoute = customer.getRouteId() != null ? customer.getRouteId() : "";
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
            String lRoute = loan.getRouteId() != null ? loan.getRouteId() : "";
            if (!lRoute.isEmpty() && !currentRoute.isEmpty() && !lRoute.equalsIgnoreCase(currentRoute)) {
                hasLoanInOtherRoute = true;
                BigDecimal loanBalance = installmentRepository != null
                        ? installmentRepository.findByLoanId(loan.getId()).stream()
                                .map(i -> i.getPendingAmount() != null ? i.getPendingAmount() : BigDecimal.ZERO)
                                .reduce(BigDecimal.ZERO, BigDecimal::add)
                        : loan.getTotalAgreed();
                totalOtherDebt = totalOtherDebt.add(loanBalance);
                otherRouteName = routeNames.getOrDefault(lRoute, lRoute);
            }
        }

        if (hasLoanInOtherRoute) {
            lblCrossRouteAlert.setText("ALERTA CREDITICIA MULTI-RUTA:\nEste cliente ya registra crédito ACTIVO en [" + otherRouteName + "] por saldo de " + CURRENCY.format(totalOtherDebt) + ". Verifique antes de autorizar el desembolso.");
            crossRouteAlertBox.setStyle("-fx-background-color: #fef2f2; -fx-padding: 8 10; -fx-background-radius: 6; -fx-border-color: #fecaca; -fx-border-radius: 6;");
            lblCrossRouteAlert.setStyle("-fx-text-fill: #991b1b; -fx-font-size: 11px; -fx-font-weight: bold; -fx-wrap-text: true;");
            crossRouteAlertBox.setVisible(true);
            crossRouteAlertBox.setManaged(true);
        } else {
            lblCrossRouteAlert.setText("El cliente tiene " + activeLoans.size() + " crédito(s) vigente(s) en esta ruta. Verifique cupo.");
            crossRouteAlertBox.setStyle("-fx-background-color: #eff6ff; -fx-padding: 8 10; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6;");
            lblCrossRouteAlert.setStyle("-fx-text-fill: #1e40af; -fx-font-size: 11px; -fx-font-weight: bold; -fx-wrap-text: true;");
            crossRouteAlertBox.setVisible(true);
            crossRouteAlertBox.setManaged(true);
        }
    }

    public void setMigrationMode(boolean enabled) {
        boolean isCollector = UserSessionContext.getSession().map(UserSession::isCollector).orElse(false);
        chkMigration.setSelected(!isCollector && enabled);
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
                btnDisburse.setDisable(true);
                return;
            }

            BigDecimal rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal totalAgreed = new Money(principal.add(principal.multiply(rateDecimal))).amount();
            BigDecimal interestAmount = totalAgreed.subtract(principal);

            boolean isMig = chkMigration.isSelected();
            boolean isFixed = CreateLoanUseCase.isFixedDateFrequency(frequency);
            LocalDate payday = dpMigrationPayday.getValue() != null ? dpMigrationPayday.getValue() : LocalDate.now();

            List<InstallmentPlanItem> plan = (isMig && !isFixed)
                    ? createLoanUseCase.simulateAnchoredMigrationPlan(totalAgreed, count, frequency, payday, paidInstallmentNumbers)
                    : createLoanUseCase.simulatePlan(totalAgreed, count, frequency, start);
            planTable.setItems(FXCollections.observableArrayList(plan));

            lblSummaryTotal.setText(CURRENCY.format(totalAgreed));
            lblSummaryInterest.setText(CURRENCY.format(interestAmount));
            BigDecimal singleCuota = BigDecimal.ZERO;
            if (!plan.isEmpty()) {
                singleCuota = plan.get(0).amount();
                lblSummaryInstallment.setText(CURRENCY.format(singleCuota));
                if (isMig && !isFixed) {
                    InstallmentPlanItem nextPending = plan.stream()
                            .filter(i -> !paidInstallmentNumbers.contains(i.installmentNumber()))
                            .findFirst()
                            .orElse(plan.get(plan.size() - 1));
                    lblCuotaDateHint.setText("Próx. (#" + nextPending.installmentNumber() + "): "
                            + nextPending.dueDate().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")));
                } else {
                    lblCuotaDateHint.setText("1ª cuota: " + plan.get(0).dueDate().format(DateTimeFormatter.ofPattern("dd/MM/yyyy")));
                }
            }

            if (isMig) {
                // Modo Migración: Mostramos Grilla de Cartulina y saldos exactos del plan
                updateCartulinaGrid(plan);
                updatePaydayPreview(plan);
                BigDecimal totalPaid = plan.stream()
                        .filter(item -> paidInstallmentNumbers.contains(item.installmentNumber()))
                        .map(InstallmentPlanItem::amount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal pendingBalance = totalAgreed.subtract(totalPaid).max(BigDecimal.ZERO);

                lblSummaryCartulina.setText("Protegida ($0 hoy)");
                lblSummaryNet.setText(CURRENCY.format(pendingBalance));
            } else {
                // Modo Normal: Desembolso regular con papelería
                boolean isPaperworkEnabled = settingRepository == null || settingRepository.findById("paperwork_enabled")
                        .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                        .orElse(true);
                BigDecimal cartulina = computeConfiguredPaperwork(principal);
                if (!isPaperworkEnabled) {
                    lblSummaryCartulina.setText("$ 0 (Desactivada por admin)");
                    lblSummaryCartulina.setStyle("-fx-text-fill: #64748b; -fx-font-size: 14px; -fx-font-weight: bold;");
                } else if (cartulina.compareTo(BigDecimal.ZERO) > 0) {
                    lblSummaryCartulina.setText("- " + CURRENCY.format(cartulina));
                    lblSummaryCartulina.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 14px; -fx-font-weight: bold;");
                } else {
                    lblSummaryCartulina.setText("No aplica ($0)");
                    lblSummaryCartulina.setStyle("-fx-text-fill: #64748b; -fx-font-size: 14px; -fx-font-weight: bold;");
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

    private void updatePaydayPreview(List<InstallmentPlanItem> plan) {
        if (plan == null || plan.isEmpty()) {
            lblPaydayPreview.setText("");
            return;
        }
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        LocalDate today = LocalDate.now();
        List<InstallmentPlanItem> paidList = plan.stream()
                .filter(i -> paidInstallmentNumbers.contains(i.installmentNumber()))
                .toList();
        InstallmentPlanItem nextPending = plan.stream()
                .filter(i -> !paidInstallmentNumbers.contains(i.installmentNumber()))
                .findFirst()
                .orElse(null);
        InstallmentPlanItem lastItem = plan.get(plan.size() - 1);

        StringBuilder sb = new StringBuilder();
        if (!paidList.isEmpty()) {
            String range = paidList.size() == 1
                    ? paidList.get(0).dueDate().format(fmt)
                    : paidList.get(0).dueDate().format(fmt) + " al " + paidList.get(paidList.size() - 1).dueDate().format(fmt);
            sb.append("Pagadas (").append(paidList.size()).append("): ").append(range).append(" (paz y salvo)");
        }
        if (nextPending != null) {
            if (!sb.isEmpty()) sb.append("  •  ");
            String status = nextPending.dueDate().isBefore(today)
                    ? "En mora"
                    : nextPending.dueDate().isEqual(today)
                    ? "Cobra hoy"
                    : "Al día";
            sb.append("Próxima (#").append(nextPending.installmentNumber()).append("): ")
                    .append(nextPending.dueDate().format(fmt)).append(" — ").append(status);
            String color = nextPending.dueDate().isBefore(today)
                    ? "#dc2626"
                    : nextPending.dueDate().isEqual(today)
                    ? "#1d4ed8"
                    : "#0f766e";
            lblPaydayPreview.setStyle("-fx-text-fill: " + color + "; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        } else {
            lblPaydayPreview.setStyle("-fx-text-fill: #059669; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        }
        sb.append("  •  Última (#").append(lastItem.installmentNumber()).append("): ").append(lastItem.dueDate().format(fmt));
        lblPaydayPreview.setText(sb.toString());
    }

    private void updateCartulinaGrid(List<InstallmentPlanItem> plan) {
        gridCartulina.getChildren().clear();
        int totalCount = plan.size();
        DateTimeFormatter tinyFmt = DateTimeFormatter.ofPattern("dd/MM");
        DateTimeFormatter fullFmt = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        for (InstallmentPlanItem item : plan) {
            final int instNum = item.installmentNumber();
            boolean isPaid = paidInstallmentNumbers.contains(instNum);

            Button tile = new Button(instNum + "\n" + item.dueDate().format(tinyFmt));
            tile.setStyle(isPaid
                    ? "-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-font-weight: 900; -fx-font-size: 10px; -fx-text-alignment: center; -fx-border-color: #86efac; -fx-border-radius: 6; -fx-background-radius: 6; -fx-min-width: 48px; -fx-min-height: 38px; -fx-cursor: hand;"
                    : "-fx-background-color: #ffffff; -fx-text-fill: #475569; -fx-font-weight: bold; -fx-font-size: 10px; -fx-text-alignment: center; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-min-width: 48px; -fx-min-height: 38px; -fx-cursor: hand;");
            tile.setTooltip(new Tooltip("Cuota #" + instNum + " • " + item.dueDate().format(fullFmt) + " • " + CURRENCY.format(item.amount())));

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

        int paidCount = (int) plan.stream().filter(i -> paidInstallmentNumbers.contains(i.installmentNumber())).count();
        int pendingCount = Math.max(0, totalCount - paidCount);
        BigDecimal paidTotal = plan.stream()
                .filter(i -> paidInstallmentNumbers.contains(i.installmentNumber()))
                .map(InstallmentPlanItem::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal pendingTotal = plan.stream()
                .filter(i -> !paidInstallmentNumbers.contains(i.installmentNumber()))
                .map(InstallmentPlanItem::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblCartulinaSummary.setText("Cobrado en papel: " + CURRENCY.format(paidTotal) + " (" + paidCount + "/" + totalCount + ")  •  Pendiente: " + CURRENCY.format(pendingTotal) + " (" + pendingCount + " cuotas)");
    }

    private void loadNewCustomerRoutes() {
        if (routeRepository == null) return;
        List<RouteEntity> activeRoutes = routeRepository.findAll().stream()
                .filter(r -> r.getActive() == null || r.getActive() == 1)
                .toList();
        cmbNewCustomerRoute.setItems(FXCollections.observableArrayList(activeRoutes));
        String sel = UserSessionContext.getSelectedRouteId();
        RouteEntity matched = activeRoutes.stream()
                .filter(r -> sel != null && sel.equalsIgnoreCase(r.getId()))
                .findFirst()
                .orElse(activeRoutes.isEmpty() ? null : activeRoutes.get(0));
        cmbNewCustomerRoute.setValue(matched);
    }

    private void disburseLoan(boolean keepOpenForNextCard) {
        boolean creatingNewCustomer = rbNewCustomer.isSelected() && createCustomerWithLoanUseCase != null;
        CustomerEntity customer = creatingNewCustomer ? null : cmbCustomer.getValue();
        if (!creatingNewCustomer) {
            if (customer == null) {
                showError("Debes seleccionar un cliente de la lista.");
                return;
            }
            if ("INACTIVO".equalsIgnoreCase(customer.getStatus())) {
                showError("No se puede desembolsar a un cliente inactivo. Reactívelo primero.");
                return;
            }
        } else {
            if (txtNewFullName.getText().trim().isEmpty() || txtNewDoc.getText().trim().isEmpty() || txtNewPhone.getText().trim().isEmpty()) {
                showError("Para cliente nuevo, ingresa Nombre completo, Cédula y Teléfono.");
                return;
            }
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

            boolean isCollector = UserSessionContext.getSession().map(UserSession::isCollector).orElse(false);
            boolean isMigration = !isCollector && chkMigration.isSelected();

            if (!isMigration && settingRepository != null) {
                try {
                    BigDecimal maxAllowed = settingRepository.findById("max_new_loan_amount")
                            .map(s -> CurrencyInputUtil.parseAmount(s.getSettingValue()))
                            .orElse(BigDecimal.ZERO);
                    if (maxAllowed.compareTo(BigDecimal.ZERO) > 0 && principal.compareTo(maxAllowed) > 0) {
                        showError("El capital solicitado supera el tope máximo permitido (" + CURRENCY.format(maxAllowed) + ").");
                        return;
                    }
                } catch (Exception ignored) {}
            }

            BigDecimal rateDecimal = interestPercent.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal totalAgreed = new Money(principal.add(principal.multiply(rateDecimal))).amount();
            BigDecimal cartulina = isMigration ? BigDecimal.ZERO : computeConfiguredPaperwork(principal);

            btnDisburse.setDisable(true);
            btnSaveAndNext.setDisable(true);
            lblFeedback.setText(isMigration ? "Guardando crédito anterior..." : "Registrando crédito y desembolso...");
            lblFeedback.setStyle("-fx-text-fill: #1d4ed8; -fx-background-color: #eff6ff; -fx-padding: 8 12; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6;");
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);

            String authorId = UserSessionContext.getSession()
                    .map(UserSession::userId)
                    .orElseThrow(() -> new IllegalStateException("Inicie sesión para registrar el crédito."));

            String routeId;
            if (creatingNewCustomer) {
                RouteEntity pickedRoute = cmbNewCustomerRoute.getValue();
                routeId = pickedRoute != null ? pickedRoute.getId() : null;
            } else {
                routeId = customer.getRouteId();
            }
            if (routeId == null || routeId.isBlank()) {
                String activeRoute = UserSessionContext.getSelectedRouteId();
                if (activeRoute != null && !"ALL".equalsIgnoreCase(activeRoute) && !"NONE".equalsIgnoreCase(activeRoute)) {
                    routeId = activeRoute;
                } else if (routeRepository != null) {
                    routeId = routeRepository.findAll().stream()
                            .filter(r -> r.getActive() == null || r.getActive() == 1)
                            .map(RouteEntity::getId)
                            .findFirst()
                            .orElse(null);
                }
            }
            if (routeId == null || routeId.isBlank()) {
                btnDisburse.setDisable(false);
                btnSaveAndNext.setDisable(false);
                showError("El cliente no tiene una ruta activa asignada. Configure una ruta antes de desembolsar.");
                return;
            }

            // Resolver el cobrador real de la ruta/cliente (nunca sobreescribir con el ID del Admin)
            String resolvedCollectorId = null;
            if (routeRepository != null) {
                resolvedCollectorId = routeRepository.findById(routeId)
                        .map(RouteEntity::getCollectorId)
                        .filter(id -> id != null && !id.isBlank())
                        .orElse(null);
            }
            if (!creatingNewCustomer && (resolvedCollectorId == null || resolvedCollectorId.isBlank())
                    && customer.getCollectorId() != null && !customer.getCollectorId().isBlank()) {
                resolvedCollectorId = customer.getCollectorId();
            }
            if (resolvedCollectorId == null || resolvedCollectorId.isBlank()) {
                resolvedCollectorId = authorId;
            }

            LocalDate migrationNextDueDate = (isMigration && !CreateLoanUseCase.isFixedDateFrequency(frequency))
                    ? (dpMigrationPayday.getValue() != null ? dpMigrationPayday.getValue() : LocalDate.now())
                    : null;
            String migrationNotes = isMigration ? "Migración cartulina física. Cuotas pagadas: " + paidInstallmentNumbers.size() : null;

            LoanEntity loan;
            String targetCustomerId;
            String savedCustomerLabel;
            if (creatingNewCustomer) {
                var custCmd = new CreateCustomerUseCase.CreateCustomerCommand(
                        txtNewFullName.getText().trim(),
                        txtNewDoc.getText().trim(),
                        txtNewPhone.getText().trim(),
                        txtNewPhone.getText().trim(),
                        txtNewAddress.getText().trim(),
                        txtNewNeighborhood.getText().trim(),
                        "",
                        "",
                        txtNewBusiness.getText().trim(),
                        "",
                        routeId,
                        resolvedCollectorId,
                        authorId
                );
                var result = createCustomerWithLoanUseCase.execute(
                        custCmd,
                        principal,
                        rateDecimal,
                        totalAgreed,
                        count,
                        frequency,
                        start,
                        cartulina,
                        isMigration,
                        new HashSet<>(paidInstallmentNumbers),
                        cardPhotoPath,
                        migrationNotes,
                        migrationNextDueDate
                );
                loan = result.loan();
                targetCustomerId = result.customer().getId();
                savedCustomerLabel = result.customer().getFullName();
            } else {
                var cmd = new CreateLoanCommand(
                        customer.getId(),
                        routeId,
                        resolvedCollectorId,
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
                        migrationNotes,
                        migrationNextDueDate
                );
                loan = createLoanUseCase.execute(cmd);
                targetCustomerId = customer.getId();
                savedCustomerLabel = customer.getFullName();
            }

            if (isMigration && cardPhotoPath != null && !cardPhotoPath.isBlank() && attachmentService != null) {
                try {
                    attachmentService.attach(UUID.randomUUID().toString(), targetCustomerId, Path.of(cardPhotoPath));
                } catch (Exception attachEx) {
                    Alert warn = new Alert(Alert.AlertType.WARNING,
                            "El crédito anterior se guardó correctamente, pero no se pudo archivar la foto de cartulina: " + attachEx.getMessage());
                    warn.initOwner(this);
                    warn.showAndWait();
                }
            }

            if (onSuccess != null) {
                onSuccess.accept(loan);
            }

            if (keepOpenForNextCard) {
                // Reiniciar campos para ingresar la siguiente cartulina sin cerrar el diálogo
                loadCustomers();
                txtNewFullName.clear();
                txtNewDoc.clear();
                txtNewPhone.clear();
                txtNewAddress.clear();
                txtNewNeighborhood.clear();
                txtNewBusiness.clear();
                paidInstallmentNumbers.clear();
                txtQuickPaidCount.clear();
                cardPhotoPath = null;
                lblAttachedPhoto.setText("Sin foto adjunta");
                lblAttachedPhoto.setVisible(false);
                lblAttachedPhoto.setManaged(false);
                btnDisburse.setDisable(false);
                btnSaveAndNext.setDisable(false);
                recalculateAndSimulate();
                lblFeedback.setText("✓ Cartulina de " + savedCustomerLabel + " guardada. Listo para la siguiente.");
                lblFeedback.setStyle("-fx-text-fill: #047857; -fx-background-color: #ecfdf5; -fx-padding: 8 12; -fx-background-radius: 6; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-font-weight: bold;");
                lblFeedback.setVisible(true);
                lblFeedback.setManaged(true);
                if (creatingNewCustomer) {
                    txtNewFullName.requestFocus();
                } else {
                    cmbCustomer.requestFocus();
                }
            } else {
                close();
            }
        } catch (Exception ex) {
            btnDisburse.setDisable(false);
            btnSaveAndNext.setDisable(false);
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
