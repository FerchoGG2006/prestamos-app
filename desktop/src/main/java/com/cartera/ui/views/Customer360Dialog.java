package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.customers.application.AttachmentService;
import com.cartera.customers.application.CreateCustomerWithLoanUseCase;
import com.cartera.customers.application.CustomerLifecycleService;
import com.cartera.customers.application.FollowUpService;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.ReversePaymentUseCase;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.ui.util.CurrencyInputUtil;
import com.cartera.ui.util.UiLabels;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Ficha 360° Unificada del Cliente (Paridad Nativa con Móvil):
 * Concentra en una sola ventana: perfil, KPIs, acciones rápidas en 1 clic
 * (Cobrar, Renovar, Nuevo Crédito/Cartulina, Promesa, No Pago, WhatsApp, Mapa, Editar),
 * plan de cuotas, historial de pagos con recibo y anulación, seguimiento y archivos adjuntos.
 */
public class Customer360Dialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public record Services(
            CustomerRepository customerRepository,
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            PaymentRepository paymentRepository,
            RouteRepository routeRepository,
            SystemSettingRepository settingRepository,
            RecordPaymentUseCase recordPaymentUseCase,
            ReversePaymentUseCase reversePaymentUseCase,
            CreateLoanUseCase createLoanUseCase,
            RenewLoanUseCase renewLoanUseCase,
            FollowUpService followUpService,
            AttachmentService attachmentService,
            CustomerLifecycleService customerLifecycleService,
            CreateCustomerWithLoanUseCase createCustomerWithLoanUseCase
    ) {}

    private final String customerId;
    private final Services services;
    private final Runnable onDataChanged;

    private CustomerEntity customer;
    private LoanEntity selectedLoan;
    private List<LoanEntity> customerLoans = List.of();
    private List<InstallmentEntity> currentInstallments = List.of();

    // Header widgets
    private final Label lblAvatar = new Label("CL");
    private final Label lblName = new Label("Cliente");
    private final Label lblMeta = new Label("");
    private final Label lblStatusBadge = new Label("ACTIVO");

    // KPI widgets
    private final Label lblKpiBalance = new Label("$ 0");
    private final Label lblKpiPaid = new Label("$ 0");
    private final Label lblKpiProgress = new Label("0%");
    private final Label lblKpiProgressSub = new Label("0 / 0 cuotas");
    private final Label lblKpiHealth = new Label("Al día");
    private final Label lblKpiHealthSub = new Label("Sin cuotas vencidas");

    // Quick action buttons
    private final Button btnCollect = new Button("Cobrar");
    private final Button btnRenew = new Button("Renovar");
    private final Button btnNewLoan = new Button("+ Crédito / Cartulina");
    private final Button btnPromise = new Button("Promesa");
    private final Button btnNoPay = new Button("No Pago");
    private final Button btnWhatsApp = new Button("WhatsApp Estado");
    private final Button btnMap = new Button("Mapa");
    private final Button btnEdit = new Button("Editar Datos");

    private final ComboBox<LoanEntity> cmbLoans = new ComboBox<>();
    private final TabPane tabPane = new TabPane();
    private final Label lblFeedback = new Label();

    // Tab 1: Cuotas
    private final TableView<InstallmentEntity> installmentsTable = new TableView<>();
    private final ObservableList<InstallmentEntity> installmentRows = FXCollections.observableArrayList();

    // Tab 2: Pagos
    private final TableView<PaymentEntity> paymentsTable = new TableView<>();
    private final ObservableList<PaymentEntity> paymentRows = FXCollections.observableArrayList();

    // Tab 3: Promesas y Visitas
    private final TableView<PaymentPromiseEntity> promisesTable = new TableView<>();
    private final ObservableList<PaymentPromiseEntity> promiseRows = FXCollections.observableArrayList();
    private final TableView<AuditLogEntity> visitsTable = new TableView<>();
    private final ObservableList<AuditLogEntity> visitRows = FXCollections.observableArrayList();
    private final TextField txtPromiseAmount = new TextField();
    private final DatePicker dpPromiseDate = new DatePicker(LocalDate.now().plusDays(1));
    private final TextField txtPromiseNotes = new TextField();
    private final TextField txtVisitReason = new TextField();

    // Tab 4: Archivos
    private final TableView<CustomerAttachmentEntity> filesTable = new TableView<>();
    private final ObservableList<CustomerAttachmentEntity> fileRows = FXCollections.observableArrayList();

    public Customer360Dialog(Stage ownerStage, String customerId, Services services, Runnable onDataChanged) {
        this.customerId = customerId;
        this.services = services;
        this.onDataChanged = onDataChanged;

        initModality(Modality.WINDOW_MODAL);
        if (ownerStage != null) {
            initOwner(ownerStage);
        }
        setTitle("Ficha 360° del Cliente");
        setResizable(true);
        setMinWidth(920);
        setMinHeight(640);

        buildUI();
        reloadAll();
    }

    private void buildUI() {
        VBox root = new VBox(14);
        root.setPadding(new Insets(18, 22, 18, 22));
        root.setStyle("-fx-background-color: #f8fafc;");
        root.setPrefSize(1020, 720);

        // 1. Header card
        HBox headerCard = new HBox(14);
        headerCard.setAlignment(Pos.CENTER_LEFT);
        headerCard.setPadding(new Insets(14, 18, 14, 18));
        headerCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 12;");

        lblAvatar.setAlignment(Pos.CENTER);
        lblAvatar.setPrefSize(48, 48);
        lblAvatar.setMinSize(48, 48);
        lblAvatar.setStyle("-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 17px; -fx-background-radius: 24;");

        VBox titleCol = new VBox(3);
        HBox.setHgrow(titleCol, Priority.ALWAYS);
        HBox nameRow = new HBox(10);
        nameRow.setAlignment(Pos.CENTER_LEFT);
        lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");
        lblStatusBadge.setStyle("-fx-padding: 2 10; -fx-background-radius: 10; -fx-font-size: 11px; -fx-font-weight: bold; -fx-background-color: #ecfdf5; -fx-text-fill: #047857;");
        nameRow.getChildren().addAll(lblName, lblStatusBadge);

        lblMeta.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        lblMeta.setWrapText(true);
        titleCol.getChildren().addAll(nameRow, lblMeta);

        // Loan selector on right of header
        VBox loanSelBox = new VBox(3);
        loanSelBox.setAlignment(Pos.CENTER_RIGHT);
        Label lblLoanSel = new Label("Crédito visualizado:");
        lblLoanSel.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        cmbLoans.setPrefWidth(250);
        cmbLoans.getStyleClass().add("search-field");
        cmbLoans.setCellFactory(lv -> new ListCell<>() {
            @Override protected void updateItem(LoanEntity item, boolean empty) {
                super.updateItem(item, empty);
                setText(empty || item == null ? null : formatLoanOption(item));
            }
        });
        cmbLoans.setButtonCell(new ListCell<>() {
            @Override protected void updateItem(LoanEntity item, boolean empty) {
                super.updateItem(item, empty);
                setText(empty || item == null ? "Sin créditos registrados" : formatLoanOption(item));
            }
        });
        cmbLoans.setOnAction(e -> {
            LoanEntity picked = cmbLoans.getValue();
            if (picked != null && (selectedLoan == null || !picked.getId().equals(selectedLoan.getId()))) {
                selectedLoan = picked;
                refreshSelectedLoanViews();
            }
        });
        loanSelBox.getChildren().addAll(lblLoanSel, cmbLoans);

        headerCard.getChildren().addAll(lblAvatar, titleCol, loanSelBox);

        // 2. Quick Action Strip (1-Click Operations)
        FlowPane actionStrip = new FlowPane(8, 8);
        actionStrip.setAlignment(Pos.CENTER_LEFT);

        btnCollect.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 7 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnCollect.setOnAction(e -> openCollectDialog());

        btnRenew.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 7 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnRenew.setOnAction(e -> openRenewDialog());

        btnNewLoan.setStyle("-fx-background-color: #0f172a; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 7 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnNewLoan.setOnAction(e -> openNewLoanDialog());

        btnPromise.setStyle("-fx-background-color: #fffbeb; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 6 12; -fx-cursor: hand;");
        btnPromise.setOnAction(e -> {
            tabPane.getSelectionModel().select(2);
            txtPromiseAmount.requestFocus();
        });

        btnNoPay.setStyle("-fx-background-color: #fef2f2; -fx-text-fill: #b91c1c; -fx-border-color: #fecaca; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 6 12; -fx-cursor: hand;");
        btnNoPay.setOnAction(e -> {
            tabPane.getSelectionModel().select(2);
            txtVisitReason.requestFocus();
        });

        btnWhatsApp.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 6 12; -fx-cursor: hand;");
        btnWhatsApp.setOnAction(e -> sendWhatsAppStatement());

        btnMap.getStyleClass().add("btn-secondary");
        btnMap.setOnAction(e -> openGoogleMaps());

        btnEdit.getStyleClass().add("btn-secondary");
        btnEdit.setOnAction(e -> openEditCustomerDialog());

        actionStrip.getChildren().addAll(btnCollect, btnRenew, btnNewLoan, btnPromise, btnNoPay, btnWhatsApp, btnMap, btnEdit);

        // 3. KPI Bento Strip
        HBox kpiRow = new HBox(12);
        kpiRow.getChildren().addAll(
                buildKpiCard("SALDO PENDIENTE", lblKpiBalance, "Crédito seleccionado", "#2563eb"),
                buildKpiCard("TOTAL ABONADO", lblKpiPaid, "Acumulado del contrato", "#059669"),
                buildKpiCard("PROGRESO DE PAGO", lblKpiProgress, lblKpiProgressSub, "#0f172a"),
                buildKpiCard("ESTADO DE MORA", lblKpiHealth, lblKpiHealthSub, "#dc2626")
        );

        // Feedback banner
        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);
        lblFeedback.setMaxWidth(Double.MAX_VALUE);

        // 4. Tabs
        tabPane.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);
        VBox.setVgrow(tabPane, Priority.ALWAYS);

        Tab tabInstallments = new Tab("Plan de Cuotas", buildInstallmentsTab());
        Tab tabPayments = new Tab("Historial de Pagos", buildPaymentsTab());
        Tab tabFollowUp = new Tab("Promesas y Visitas", buildFollowUpTab());
        Tab tabFiles = new Tab("Archivos y Cartulina", buildFilesTab());
        tabPane.getTabs().addAll(tabInstallments, tabPayments, tabFollowUp, tabFiles);

        // Footer
        HBox footer = new HBox(10);
        footer.setAlignment(Pos.CENTER_RIGHT);
        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> reloadAll());
        Button btnClose = new Button("Cerrar Ficha");
        btnClose.getStyleClass().add("btn-primary");
        btnClose.setOnAction(e -> close());
        footer.getChildren().addAll(btnRefresh, btnClose);

        root.getChildren().addAll(headerCard, actionStrip, kpiRow, lblFeedback, tabPane, footer);

        Scene scene = new Scene(root);
        try {
            scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        } catch (Exception ignored) {}
        setScene(scene);
    }

    private VBox buildKpiCard(String title, Label valueLabel, String subText, String colorHex) {
        Label sub = new Label(subText);
        return buildKpiCard(title, valueLabel, sub, colorHex);
    }

    private VBox buildKpiCard(String title, Label valueLabel, Label subLabel, String colorHex) {
        VBox card = new VBox(4);
        card.setPadding(new Insets(12, 14, 12, 14));
        card.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 10; -fx-border-color: #e2e8f0; -fx-border-radius: 10;");
        HBox.setHgrow(card, Priority.ALWAYS);

        Label lblTitle = new Label(title);
        lblTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 10.5px; -fx-font-weight: bold;");
        valueLabel.setStyle("-fx-text-fill: " + colorHex + "; -fx-font-size: 18px; -fx-font-weight: bold;");
        subLabel.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");

        card.getChildren().addAll(lblTitle, valueLabel, subLabel);
        return card;
    }

    @SuppressWarnings("unchecked")
    private VBox buildInstallmentsTab() {
        VBox box = new VBox(8);
        box.setPadding(new Insets(12));
        box.setStyle("-fx-background-color: #ffffff;");

        installmentsTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        installmentsTable.setPlaceholder(UiLabels.emptyState("Sin cuotas para este crédito", "Seleccione un crédito activo o histórico."));
        VBox.setVgrow(installmentsTable, Priority.ALWAYS);

        TableColumn<InstallmentEntity, String> colNum = new TableColumn<>("#");
        colNum.setCellValueFactory(d -> new SimpleStringProperty("#" + d.getValue().getInstallmentNumber()));
        colNum.setMaxWidth(60);

        TableColumn<InstallmentEntity, String> colDue = new TableColumn<>("VENCIMIENTO");
        colDue.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDate(d.getValue().getDueDate())));

        TableColumn<InstallmentEntity, String> colAmt = new TableColumn<>("VALOR CUOTA");
        colAmt.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getAmount())));

        TableColumn<InstallmentEntity, String> colPaid = new TableColumn<>("ABONADO");
        colPaid.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getPaidAmount())));

        TableColumn<InstallmentEntity, String> colPend = new TableColumn<>("PENDIENTE");
        colPend.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getPendingAmount())));

        TableColumn<InstallmentEntity, InstallmentEntity> colSt = new TableColumn<>("ESTADO");
        colSt.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colSt.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(InstallmentEntity item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    String st = item.getStatus() != null ? item.getStatus().toUpperCase() : "PENDIENTE";
                    boolean overdue = item.getPendingAmount().signum() > 0 && item.getDueDate() != null
                            && item.getDueDate().compareTo(LocalDate.now().toString()) < 0
                            && !"ANULADA".equals(st);
                    String label = overdue ? "VENCIDA" : st;
                    Label badge = new Label(label);
                    String style = switch (label) {
                        case "PAGADA" -> "-fx-background-color: #ecfdf5; -fx-text-fill: #047857;";
                        case "VENCIDA", "MORA" -> "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626;";
                        case "PARCIAL" -> "-fx-background-color: #fffbeb; -fx-text-fill: #d97706;";
                        case "ANULADA" -> "-fx-background-color: #f1f5f9; -fx-text-fill: #64748b;";
                        default -> "-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8;";
                    };
                    badge.setStyle(style + " -fx-padding: 2 8; -fx-background-radius: 8; -fx-font-size: 10.5px; -fx-font-weight: bold;");
                    setGraphic(badge);
                }
            }
        });

        installmentsTable.getColumns().addAll(colNum, colDue, colAmt, colPaid, colPend, colSt);
        installmentsTable.setItems(installmentRows);
        box.getChildren().add(installmentsTable);
        return box;
    }

    @SuppressWarnings("unchecked")
    private VBox buildPaymentsTab() {
        VBox box = new VBox(8);
        box.setPadding(new Insets(12));
        box.setStyle("-fx-background-color: #ffffff;");

        paymentsTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        paymentsTable.setPlaceholder(UiLabels.emptyState("Sin pagos registrados", "Los abonos aplicados a este cliente aparecerán aquí."));
        VBox.setVgrow(paymentsTable, Priority.ALWAYS);

        TableColumn<PaymentEntity, String> colDate = new TableColumn<>("FECHA / HORA");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDateTime(d.getValue().getCreatedAt())));

        TableColumn<PaymentEntity, String> colAmt = new TableColumn<>("MONTO");
        colAmt.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getAmount())));

        TableColumn<PaymentEntity, String> colMethod = new TableColumn<>("MÉTODO");
        colMethod.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getMethod() != null ? d.getValue().getMethod() : "EFECTIVO"));

        TableColumn<PaymentEntity, String> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus() != null ? d.getValue().getStatus() : "APLICADO"));

        TableColumn<PaymentEntity, PaymentEntity> colAct = new TableColumn<>("ACCIONES");
        colAct.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAct.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(PaymentEntity pay, boolean empty) {
                super.updateItem(pay, empty);
                if (empty || pay == null) {
                    setGraphic(null);
                } else {
                    HBox h = new HBox(6);
                    h.setAlignment(Pos.CENTER_LEFT);

                    Button btnRec = new Button("Recibo");
                    btnRec.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10.5px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                    btnRec.setOnAction(e -> openPaymentReceipt(pay));
                    h.getChildren().add(btnRec);

                    boolean canReverse = UserSessionContext.getSession().map(UserSession::canReverseOrCancel).orElse(false);
                    boolean activePay = !"ANULADO".equalsIgnoreCase(pay.getStatus()) && !"REVERTIDO".equalsIgnoreCase(pay.getStatus());
                    if (canReverse && activePay && services.reversePaymentUseCase() != null) {
                        Button btnRev = new Button("Anular");
                        btnRev.setStyle("-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10.5px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                        btnRev.setOnAction(e -> confirmReversePayment(pay));
                        h.getChildren().add(btnRev);
                    }
                    setGraphic(h);
                }
            }
        });

        paymentsTable.getColumns().addAll(colDate, colAmt, colMethod, colStatus, colAct);
        paymentsTable.setItems(paymentRows);
        box.getChildren().add(paymentsTable);
        return box;
    }

    @SuppressWarnings("unchecked")
    private VBox buildFollowUpTab() {
        VBox box = new VBox(12);
        box.setPadding(new Insets(12));
        box.setStyle("-fx-background-color: #ffffff;");

        // Quick form row for Promise + Non-payment visit
        HBox forms = new HBox(14);

        VBox promiseCard = new VBox(8);
        promiseCard.setPadding(new Insets(10));
        promiseCard.setStyle("-fx-background-color: #fffbeb; -fx-background-radius: 8; -fx-border-color: #fde68a; -fx-border-radius: 8;");
        HBox.setHgrow(promiseCard, Priority.ALWAYS);
        Label pTitle = new Label("Registrar Promesa de Pago");
        pTitle.setStyle("-fx-font-weight: bold; -fx-text-fill: #92400e; -fx-font-size: 12px;");
        txtPromiseAmount.setPromptText("Monto comprometido ($)");
        txtPromiseAmount.getStyleClass().add("search-field");
        dpPromiseDate.getStyleClass().add("search-field");
        txtPromiseNotes.setPromptText("Nota / compromiso");
        txtPromiseNotes.getStyleClass().add("search-field");
        Button btnSavePromise = new Button("+ Guardar Promesa");
        btnSavePromise.getStyleClass().add("btn-primary");
        btnSavePromise.setOnAction(e -> savePromise());
        HBox pRow1 = new HBox(8, txtPromiseAmount, dpPromiseDate);
        HBox.setHgrow(txtPromiseAmount, Priority.ALWAYS);
        HBox pRow2 = new HBox(8, txtPromiseNotes, btnSavePromise);
        HBox.setHgrow(txtPromiseNotes, Priority.ALWAYS);
        promiseCard.getChildren().addAll(pTitle, pRow1, pRow2);

        VBox visitCard = new VBox(8);
        visitCard.setPadding(new Insets(10));
        visitCard.setStyle("-fx-background-color: #fef2f2; -fx-background-radius: 8; -fx-border-color: #fecaca; -fx-border-radius: 8;");
        HBox.setHgrow(visitCard, Priority.ALWAYS);
        Label vTitle = new Label("Registrar Visita Sin Pago");
        vTitle.setStyle("-fx-font-weight: bold; -fx-text-fill: #991b1b; -fx-font-size: 12px;");
        txtVisitReason.setPromptText("Ej. Local cerrado, cliente viajó, pide pasar mañana...");
        txtVisitReason.getStyleClass().add("search-field");
        Button btnSaveVisit = new Button("+ Registrar No Pago");
        btnSaveVisit.setStyle("-fx-background-color: #dc2626; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 7 12; -fx-background-radius: 8; -fx-cursor: hand;");
        btnSaveVisit.setOnAction(e -> saveNonPaymentVisit());
        HBox vRow = new HBox(8, txtVisitReason, btnSaveVisit);
        HBox.setHgrow(txtVisitReason, Priority.ALWAYS);
        visitCard.getChildren().addAll(vTitle, vRow);

        forms.getChildren().addAll(promiseCard, visitCard);

        // Tables side by side
        HBox tables = new HBox(12);
        VBox.setVgrow(tables, Priority.ALWAYS);

        promisesTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        promisesTable.setPlaceholder(UiLabels.emptyState("Sin promesas", "Aún no hay promesas de pago registradas."));
        HBox.setHgrow(promisesTable, Priority.ALWAYS);
        TableColumn<PaymentPromiseEntity, String> pColDate = new TableColumn<>("FECHA");
        pColDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDate(d.getValue().getPromisedDate())));
        TableColumn<PaymentPromiseEntity, String> pColAmt = new TableColumn<>("MONTO");
        pColAmt.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getAmount())));
        TableColumn<PaymentPromiseEntity, String> pColSt = new TableColumn<>("ESTADO");
        pColSt.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus()));
        TableColumn<PaymentPromiseEntity, PaymentPromiseEntity> pColAct = new TableColumn<>("RESOLVER");
        pColAct.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        pColAct.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(PaymentPromiseEntity pr, boolean empty) {
                super.updateItem(pr, empty);
                if (empty || pr == null || !"PENDIENTE".equalsIgnoreCase(pr.getStatus())) {
                    setGraphic(null);
                } else {
                    Button bOk = new Button("Cumplida");
                    bOk.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 6; -fx-background-radius: 5; -fx-cursor: hand;");
                    bOk.setOnAction(e -> resolvePromise(pr, "CUMPLIDA"));
                    Button bCancel = new Button("Cancelar");
                    bCancel.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 6; -fx-background-radius: 5; -fx-cursor: hand;");
                    bCancel.setOnAction(e -> resolvePromise(pr, "CANCELADA"));
                    setGraphic(new HBox(4, bOk, bCancel));
                }
            }
        });
        promisesTable.getColumns().addAll(pColDate, pColAmt, pColSt, pColAct);
        promisesTable.setItems(promiseRows);

        visitsTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        visitsTable.setPlaceholder(UiLabels.emptyState("Sin visitas sin pago", "Las novedades de visita aparecerán aquí."));
        HBox.setHgrow(visitsTable, Priority.ALWAYS);
        TableColumn<AuditLogEntity, String> vColDate = new TableColumn<>("FECHA");
        vColDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDateTime(d.getValue().getCreatedAt())));
        TableColumn<AuditLogEntity, String> vColReason = new TableColumn<>("MOTIVO / NOVEDAD");
        vColReason.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getReason()));
        visitsTable.getColumns().addAll(vColDate, vColReason);
        visitsTable.setItems(visitRows);

        tables.getChildren().addAll(promisesTable, visitsTable);
        box.getChildren().addAll(forms, tables);
        return box;
    }

    @SuppressWarnings("unchecked")
    private VBox buildFilesTab() {
        VBox box = new VBox(10);
        box.setPadding(new Insets(12));
        box.setStyle("-fx-background-color: #ffffff;");

        HBox bar = new HBox(10);
        bar.setAlignment(Pos.CENTER_LEFT);
        Label info = new Label("Fotos de cédula, cartulina física, pagarés y comprobantes asociados a este cliente.");
        info.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        Button btnAttach = new Button("+ Adjuntar Archivo / Foto");
        btnAttach.getStyleClass().add("btn-primary");
        btnAttach.setOnAction(e -> attachFile());
        bar.getChildren().addAll(info, sp, btnAttach);

        filesTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        filesTable.setPlaceholder(UiLabels.emptyState("Sin archivos adjuntos", "Adjunta fotos de cartulina, documento o negocio."));
        VBox.setVgrow(filesTable, Priority.ALWAYS);

        TableColumn<CustomerAttachmentEntity, String> colName = new TableColumn<>("ARCHIVO");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getOriginalName()));
        TableColumn<CustomerAttachmentEntity, String> colDate = new TableColumn<>("FECHA");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDateTime(d.getValue().getCreatedAt())));
        TableColumn<CustomerAttachmentEntity, CustomerAttachmentEntity> colAct = new TableColumn<>("ACCIÓN");
        colAct.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAct.setCellFactory(col -> new TableCell<>() {
            @Override protected void updateItem(CustomerAttachmentEntity item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                } else {
                    Button btnOpen = new Button("Abrir");
                    btnOpen.getStyleClass().add("btn-secondary");
                    btnOpen.setOnAction(e -> openAttachment(item));
                    setGraphic(btnOpen);
                }
            }
        });
        filesTable.getColumns().addAll(colName, colDate, colAct);
        filesTable.setItems(fileRows);

        box.getChildren().addAll(bar, filesTable);
        return box;
    }

    private void reloadAll() {
        hideFeedback();
        if (services.customerRepository() == null) return;
        customer = services.customerRepository().findById(customerId).orElse(null);
        if (customer == null) {
            showFeedback("Cliente no encontrado en la base local.", true);
            return;
        }

        // Header
        String fullName = customer.getFullName() != null ? customer.getFullName() : "Cliente";
        lblName.setText(fullName);
        lblAvatar.setText(extractInitials(fullName));
        setTitle("Ficha 360° — " + fullName);

        String routeName = customer.getRouteId() != null && services.routeRepository() != null
                ? services.routeRepository().findById(customer.getRouteId()).map(RouteEntity::getName).orElse(customer.getRouteId())
                : "Sin ruta";
        String orderBadge = (customer.getOrderIndex() != null && customer.getOrderIndex() > 0)
                ? " • Parada #" + customer.getOrderIndex()
                : "";
        lblMeta.setText("C.C. " + safe(customer.getDocumentNumber())
                + " • Tel: " + safe(customer.getPhone())
                + (customer.getNeighborhood() != null && !customer.getNeighborhood().isBlank() ? " • " + customer.getNeighborhood() : "")
                + (customer.getAddress() != null && !customer.getAddress().isBlank() ? " (" + customer.getAddress() + ")" : "")
                + " • Ruta: " + routeName + orderBadge);

        String custSt = customer.getStatus() != null ? customer.getStatus().toUpperCase() : "ACTIVO";
        lblStatusBadge.setText(custSt);
        lblStatusBadge.setStyle("INACTIVO".equals(custSt)
                ? "-fx-padding: 2 10; -fx-background-radius: 10; -fx-font-size: 11px; -fx-font-weight: bold; -fx-background-color: #fef2f2; -fx-text-fill: #dc2626;"
                : "-fx-padding: 2 10; -fx-background-radius: 10; -fx-font-size: 11px; -fx-font-weight: bold; -fx-background-color: #ecfdf5; -fx-text-fill: #047857;");

        // Loans
        customerLoans = services.loanRepository() != null
                ? services.loanRepository().findByCustomerId(customerId).stream()
                        .sorted(Comparator.comparing((LoanEntity l) -> "ACTIVO".equalsIgnoreCase(l.getStatus()) ? 0 : 1)
                                .thenComparing(LoanEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                        .toList()
                : List.of();
        String prevLoanId = selectedLoan != null ? selectedLoan.getId() : null;
        cmbLoans.getItems().setAll(customerLoans);
        selectedLoan = customerLoans.stream()
                .filter(l -> prevLoanId != null && prevLoanId.equals(l.getId()))
                .findFirst()
                .orElse(customerLoans.isEmpty() ? null : customerLoans.get(0));
        cmbLoans.setValue(selectedLoan);

        refreshSelectedLoanViews();
        refreshFollowUpAndFiles();
    }

    private void refreshSelectedLoanViews() {
        boolean hasActive = selectedLoan != null && "ACTIVO".equalsIgnoreCase(selectedLoan.getStatus());
        btnCollect.setDisable(!hasActive || services.recordPaymentUseCase() == null);
        btnRenew.setDisable(!hasActive || services.renewLoanUseCase() == null);
        btnPromise.setDisable(!hasActive || services.followUpService() == null);
        btnNoPay.setDisable(!hasActive || services.followUpService() == null);
        btnNewLoan.setDisable(services.createLoanUseCase() == null);
        btnEdit.setDisable(services.customerLifecycleService() == null);

        if (selectedLoan == null) {
            currentInstallments = List.of();
            installmentRows.clear();
            paymentRows.clear();
            lblKpiBalance.setText("$ 0");
            lblKpiPaid.setText("$ 0");
            lblKpiProgress.setText("0%");
            lblKpiProgressSub.setText("Sin créditos registrados");
            lblKpiHealth.setText("Sin crédito");
            lblKpiHealth.setStyle("-fx-text-fill: #64748b; -fx-font-size: 18px; -fx-font-weight: bold;");
            lblKpiHealthSub.setText("Otorga un nuevo crédito desde arriba");
            return;
        }

        currentInstallments = services.installmentRepository() != null
                ? services.installmentRepository().findByLoanIdOrderByInstallmentNumberAsc(selectedLoan.getId())
                : List.of();
        installmentRows.setAll(currentInstallments);

        BigDecimal pending = BigDecimal.ZERO;
        BigDecimal paid = BigDecimal.ZERO;
        BigDecimal overdueAmt = BigDecimal.ZERO;
        int paidInstCount = 0;
        int overdueCount = 0;
        String todayStr = LocalDate.now().toString();

        for (InstallmentEntity i : currentInstallments) {
            BigDecimal pend = i.getPendingAmount();
            pending = pending.add(pend);
            paid = paid.add(i.getPaidAmount() != null ? i.getPaidAmount() : BigDecimal.ZERO);
            if ("PAGADA".equalsIgnoreCase(i.getStatus()) || pend.signum() == 0) {
                paidInstCount++;
            }
            if (pend.signum() > 0 && i.getDueDate() != null && i.getDueDate().compareTo(todayStr) < 0
                    && !"ANULADA".equalsIgnoreCase(i.getStatus())) {
                overdueCount++;
                overdueAmt = overdueAmt.add(pend);
            }
        }

        BigDecimal totalAgreed = selectedLoan.getTotalAgreed() != null ? selectedLoan.getTotalAgreed() : BigDecimal.ZERO;
        int pct = totalAgreed.signum() > 0
                ? paid.multiply(new BigDecimal("100")).divide(totalAgreed, 0, RoundingMode.HALF_UP).min(new BigDecimal("100")).intValue()
                : 0;

        lblKpiBalance.setText(CURRENCY.format(pending));
        lblKpiPaid.setText(CURRENCY.format(paid));
        lblKpiProgress.setText(pct + "%");
        lblKpiProgressSub.setText(paidInstCount + " / " + currentInstallments.size() + " cuotas pagadas");

        if (overdueCount > 0) {
            lblKpiHealth.setText(CURRENCY.format(overdueAmt));
            lblKpiHealth.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 18px; -fx-font-weight: bold;");
            lblKpiHealthSub.setText(overdueCount + " cuota(s) vencida(s)");
        } else {
            lblKpiHealth.setText("Al día");
            lblKpiHealth.setStyle("-fx-text-fill: #059669; -fx-font-size: 18px; -fx-font-weight: bold;");
            lblKpiHealthSub.setText("Sin cuotas vencidas");
        }

        // Payments
        if (services.paymentRepository() != null) {
            List<PaymentEntity> pays = services.paymentRepository().findAll().stream()
                    .filter(p -> selectedLoan.getId().equals(p.getLoanId()))
                    .sorted(Comparator.comparing(PaymentEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                    .toList();
            paymentRows.setAll(pays);
        }
    }

    private void refreshFollowUpAndFiles() {
        if (services.followUpService() != null) {
            try {
                promiseRows.setAll(services.followUpService().promises(customerId));
                visitRows.setAll(services.followUpService().visits(customerId));
            } catch (Exception ignored) {}
        }
        if (services.attachmentService() != null) {
            try {
                fileRows.setAll(services.attachmentService().list(customerId));
            } catch (Exception ignored) {}
        }
    }

    private void openCollectDialog() {
        if (customer == null || selectedLoan == null || services.recordPaymentUseCase() == null) return;
        BigDecimal balance = currentInstallments.stream()
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        InstallmentEntity target = currentInstallments.stream()
                .filter(i -> i.getPendingAmount().signum() > 0)
                .findFirst()
                .orElse(currentInstallments.isEmpty() ? null : currentInstallments.get(currentInstallments.size() - 1));
        if (target == null) return;

        BigDecimal overdue = currentInstallments.stream()
                .filter(i -> i.getPendingAmount().signum() > 0 && i.getDueDate() != null
                        && i.getDueDate().compareTo(LocalDate.now().toString()) < 0)
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        CollectionItem item = new CollectionItem(
                customer.getId(),
                safe(customer.getFullName()),
                safe(customer.getDocumentNumber()),
                safe(customer.getPhone()),
                safe(customer.getAddress()),
                safe(customer.getNeighborhood()),
                safe(customer.getBusinessName()),
                selectedLoan.getId(),
                selectedLoan.getTotalAgreed(),
                balance,
                target.getId(),
                target.getInstallmentNumber(),
                target.getAmount(),
                target.getPendingAmount(),
                overdue.signum() > 0 ? "EN MORA" : "PENDIENTE",
                false,
                overdue,
                selectedLoan.getFrequency() != null ? selectedLoan.getFrequency() : "DIARIO",
                selectedLoan.getRouteId() != null ? selectedLoan.getRouteId() : "",
                customer.getOrderIndex() != null ? customer.getOrderIndex() : 0
        );
        PaymentDialog.show(this, item, services.recordPaymentUseCase(), services.settingRepository(), services.loanRepository(), ok -> {
            if (Boolean.TRUE.equals(ok)) {
                reloadAll();
                notifyParent();
                showFeedback("Cobro aplicado y saldo actualizado.", false);
            }
        });
    }

    private void openRenewDialog() {
        if (customer == null || selectedLoan == null || services.renewLoanUseCase() == null) return;
        RenewLoanDialog dialog = new RenewLoanDialog(
                selectedLoan,
                customer.getFullName(),
                services.renewLoanUseCase(),
                services.installmentRepository(),
                services.settingRepository(),
                this,
                res -> {
                    reloadAll();
                    notifyParent();
                    showFeedback("Renovación completada con éxito.", false);
                }
        );
        dialog.showAndWait();
    }

    private void openNewLoanDialog() {
        if (customer == null || services.createLoanUseCase() == null) return;
        CreateLoanDialog dialog = new CreateLoanDialog(
                services.createLoanUseCase(),
                services.customerRepository(),
                services.settingRepository(),
                services.loanRepository(),
                services.routeRepository(),
                this,
                loan -> {
                    selectedLoan = loan;
                    reloadAll();
                    notifyParent();
                    showFeedback("Nuevo crédito registrado para " + customer.getFullName() + ".", false);
                }
        );
        dialog.setAttachmentService(services.attachmentService());
        dialog.setInstallmentRepository(services.installmentRepository());
        dialog.setCreateCustomerWithLoanUseCase(services.createCustomerWithLoanUseCase());
        dialog.preselectCustomer(customer.getId());
        dialog.showAndWait();
    }

    private void sendWhatsAppStatement() {
        if (customer == null || selectedLoan == null) {
            showFeedback("El cliente no tiene un crédito seleccionado para enviar estado de cuenta.", true);
            return;
        }
        String compName = services.settingRepository() != null
                ? services.settingRepository().findById("company_name").map(SystemSettingEntity::getSettingValue).orElse("Sistema de Cartera")
                : "Sistema de Cartera";
        BigDecimal paid = currentInstallments.stream()
                .map(i -> i.getPaidAmount() != null ? i.getPaidAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal pending = currentInstallments.stream()
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        int paidCount = (int) currentInstallments.stream().filter(i -> i.getPendingAmount().signum() == 0).count();
        String todayStr = LocalDate.now().toString();
        int overdueCount = (int) currentInstallments.stream()
                .filter(i -> i.getPendingAmount().signum() > 0 && i.getDueDate() != null && i.getDueDate().compareTo(todayStr) < 0)
                .count();
        String nextDue = currentInstallments.stream()
                .filter(i -> i.getPendingAmount().signum() > 0)
                .map(InstallmentEntity::getDueDate)
                .findFirst().orElse("-");

        String msg = WhatsAppReceiptUtil.formatAccountStatement(
                compName,
                customer.getFullName(),
                customer.getDocumentNumber(),
                selectedLoan.getLoanNumber() != null && !selectedLoan.getLoanNumber().isBlank() ? selectedLoan.getLoanNumber() : selectedLoan.getId(),
                selectedLoan.getPrincipal(),
                selectedLoan.getTotalAgreed(),
                paid,
                pending,
                paidCount,
                currentInstallments.size(),
                overdueCount,
                nextDue
        );
        String phone = (customer.getAltPhone() != null && !customer.getAltPhone().isBlank()) ? customer.getAltPhone() : customer.getPhone();
        boolean opened = WhatsAppReceiptUtil.sendViaWhatsApp(phone, msg);
        showFeedback(opened ? "Estado de cuenta copiado y abierto en WhatsApp." : "Estado de cuenta copiado al portapapeles.", false);
    }

    private void openGoogleMaps() {
        if (customer == null) return;
        String q = (safe(customer.getAddress()) + " " + safe(customer.getNeighborhood()) + " " + safe(customer.getCity())).trim();
        if (q.isEmpty()) {
            showFeedback("Este cliente no tiene dirección registrada.", true);
            return;
        }
        try {
            String url = "https://www.google.com/maps/search/?api=1&query=" + URLEncoder.encode(q, StandardCharsets.UTF_8);
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(new URI(url));
            }
        } catch (Exception ex) {
            showFeedback("No se pudo abrir Google Maps: " + ex.getMessage(), true);
        }
    }

    private void openEditCustomerDialog() {
        if (customer == null || services.customerLifecycleService() == null) return;
        Stage dlg = new Stage();
        dlg.initModality(Modality.WINDOW_MODAL);
        dlg.initOwner(this);
        dlg.setTitle("Editar Datos del Cliente");
        dlg.setResizable(false);

        VBox root = new VBox(10);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(460);

        TextField txtName = new TextField(safe(customer.getFullName()));
        TextField txtPhone = new TextField(safe(customer.getPhone()));
        TextField txtAlt = new TextField(safe(customer.getAltPhone()));
        TextField txtAddr = new TextField(safe(customer.getAddress()));
        TextField txtNeigh = new TextField(safe(customer.getNeighborhood()));
        TextField txtCity = new TextField(safe(customer.getCity()));
        TextField txtBiz = new TextField(safe(customer.getBusinessName()));
        TextField txtOcc = new TextField(safe(customer.getOccupation()));
        TextField txtOrder = new TextField(String.valueOf(customer.getOrderIndex() != null ? customer.getOrderIndex() : 0));
        TextField txtNotes = new TextField(safe(customer.getNotes()));
        for (TextField tf : List.of(txtName, txtPhone, txtAlt, txtAddr, txtNeigh, txtCity, txtBiz, txtOcc, txtOrder, txtNotes)) {
            tf.getStyleClass().add("search-field");
        }

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(8);
        grid.add(field("Nombre Completo *", txtName), 0, 0, 2, 1);
        grid.add(field("Teléfono *", txtPhone), 0, 1);
        grid.add(field("WhatsApp / Alterno", txtAlt), 1, 1);
        grid.add(field("Dirección", txtAddr), 0, 2);
        grid.add(field("Barrio", txtNeigh), 1, 2);
        grid.add(field("Ciudad", txtCity), 0, 3);
        grid.add(field("Posición / Orden en Ruta (#)", txtOrder), 1, 3);
        grid.add(field("Negocio", txtBiz), 0, 4);
        grid.add(field("Ocupación", txtOcc), 1, 4);
        grid.add(field("Notas", txtNotes), 0, 5, 2, 1);

        Label err = new Label();
        err.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11.5px;");
        err.setWrapText(true);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dlg.close());

        Button btnSave = new Button("Guardar Cambios");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                services.customerLifecycleService().update(new CustomerLifecycleService.Profile(
                        customer.getId(),
                        txtName.getText().trim(),
                        txtPhone.getText().trim(),
                        txtAlt.getText().trim(),
                        txtAddr.getText().trim(),
                        txtNeigh.getText().trim(),
                        txtCity.getText().trim(),
                        txtBiz.getText().trim(),
                        txtOcc.getText().trim(),
                        txtNotes.getText().trim(),
                        customer.getRouteId()
                ));
                int newOrder = 0;
                try {
                    newOrder = Math.max(0, Integer.parseInt(txtOrder.getText().trim()));
                } catch (Exception ignored) {}
                CustomerEntity refreshed = services.customerRepository().findById(customer.getId()).orElse(null);
                if (refreshed != null && !Integer.valueOf(newOrder).equals(refreshed.getOrderIndex())) {
                    refreshed.setOrderIndex(newOrder);
                    services.customerRepository().save(refreshed);
                    if (services.settingRepository() != null) {
                        services.settingRepository().save(new SystemSettingEntity(
                                com.cartera.sync.application.DesktopCloudSyncService.KEY_CUSTOMER_ORDER_DIRTY,
                                "true",
                                Instant.now().toString()
                        ));
                    }
                }
                dlg.close();
                reloadAll();
                notifyParent();
                showFeedback("Datos del cliente actualizados.", false);
            } catch (Exception ex) {
                err.setText(ex.getMessage());
            }
        });

        HBox actions = new HBox(10, btnCancel, btnSave);
        actions.setAlignment(Pos.CENTER_RIGHT);
        root.getChildren().addAll(grid, err, actions);

        Scene sc = new Scene(root);
        try { sc.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm()); } catch (Exception ignored) {}
        dlg.setScene(sc);
        dlg.showAndWait();
    }

    private void openPaymentReceipt(PaymentEntity pay) {
        if (customer == null || pay == null) return;
        String compName = services.settingRepository() != null
                ? services.settingRepository().findById("company_name").map(SystemSettingEntity::getSettingValue).orElse("Sistema de Cartera")
                : "Sistema de Cartera";
        BigDecimal balance = currentInstallments.stream()
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String collectorName = UserSessionContext.getSession().map(UserSession::fullName).orElse("Oficina");
        ReceiptDialog.ReceiptData data = new ReceiptDialog.ReceiptData(
                pay.getId(),
                customer.getFullName(),
                customer.getDocumentNumber(),
                pay.getLoanId(),
                pay.getAmount(),
                balance,
                1,
                collectorName,
                pay.getMethod() != null ? pay.getMethod() : "EFECTIVO",
                compName,
                customer.getPhone()
        );
        new ReceiptDialog(data, UiLabels.formatDateTime(pay.getCreatedAt()), this).showAndWait();
    }

    private void confirmReversePayment(PaymentEntity pay) {
        TextInputDialog prompt = new TextInputDialog();
        prompt.initOwner(this);
        prompt.setTitle("Anular Pago");
        prompt.setHeaderText("Anular abono de " + CURRENCY.format(pay.getAmount()));
        prompt.setContentText("Motivo obligatorio de auditoría:");
        prompt.showAndWait().ifPresent(reason -> {
            try {
                services.reversePaymentUseCase().execute(pay.getId(), reason);
                reloadAll();
                notifyParent();
                showFeedback("Pago anulado y cuotas restauradas con auditoría.", false);
            } catch (Exception ex) {
                showFeedback("No se pudo anular el pago: " + ex.getMessage(), true);
            }
        });
    }

    private void savePromise() {
        if (selectedLoan == null || services.followUpService() == null) return;
        try {
            BigDecimal amount = CurrencyInputUtil.parseAmount(txtPromiseAmount.getText());
            LocalDate date = dpPromiseDate.getValue();
            services.followUpService().promise(UUID.randomUUID().toString(), selectedLoan.getId(), amount, date, txtPromiseNotes.getText());
            txtPromiseAmount.clear();
            txtPromiseNotes.clear();
            refreshFollowUpAndFiles();
            notifyParent();
            showFeedback("Promesa de pago registrada.", false);
        } catch (Exception ex) {
            showFeedback(ex.getMessage(), true);
        }
    }

    private void resolvePromise(PaymentPromiseEntity pr, String newStatus) {
        if (services.followUpService() == null) return;
        try {
            services.followUpService().resolve(pr.getId(), newStatus, "Actualizado desde Ficha 360°");
            refreshFollowUpAndFiles();
            notifyParent();
            showFeedback("Promesa marcada como " + newStatus + ".", false);
        } catch (Exception ex) {
            showFeedback(ex.getMessage(), true);
        }
    }

    private void saveNonPaymentVisit() {
        if (selectedLoan == null || services.followUpService() == null) return;
        try {
            services.followUpService().visit(UUID.randomUUID().toString(), selectedLoan.getId(), txtVisitReason.getText());
            txtVisitReason.clear();
            refreshFollowUpAndFiles();
            notifyParent();
            showFeedback("Visita sin pago registrada en seguimiento.", false);
        } catch (Exception ex) {
            showFeedback(ex.getMessage(), true);
        }
    }

    private void attachFile() {
        if (services.attachmentService() == null) return;
        FileChooser fc = new FileChooser();
        fc.setTitle("Adjuntar Foto o Documento del Cliente");
        fc.getExtensionFilters().add(new FileChooser.ExtensionFilter("Imágenes / PDF / Video", "*.jpg", "*.jpeg", "*.png", "*.pdf", "*.mp4", "*.mov"));
        File f = fc.showOpenDialog(this);
        if (f == null) return;
        try {
            services.attachmentService().attach(UUID.randomUUID().toString(), customerId, f.toPath());
            refreshFollowUpAndFiles();
            showFeedback("Archivo adjuntado: " + f.getName(), false);
        } catch (Exception ex) {
            showFeedback(ex.getMessage(), true);
        }
    }

    private void openAttachment(CustomerAttachmentEntity item) {
        if (services.attachmentService() == null) return;
        try {
            Path p = services.attachmentService().openPath(item.getId());
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(p.toFile());
            }
        } catch (Exception ex) {
            showFeedback("No se pudo abrir el archivo: " + ex.getMessage(), true);
        }
    }

    private void notifyParent() {
        if (onDataChanged != null) {
            try { onDataChanged.run(); } catch (Exception ignored) {}
        }
    }

    private void showFeedback(String msg, boolean error) {
        lblFeedback.setText(msg);
        lblFeedback.setStyle(error
                ? "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 7 12; -fx-font-size: 12px; -fx-font-weight: bold;"
                : "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 7 12; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }

    private void hideFeedback() {
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);
    }

    private static VBox field(String label, Control c) {
        VBox b = new VBox(3);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;");
        b.getChildren().addAll(l, c);
        return b;
    }

    private static String formatLoanOption(LoanEntity l) {
        String num = (l.getLoanNumber() != null && !l.getLoanNumber().isBlank())
                ? l.getLoanNumber()
                : "#" + l.getId().substring(0, Math.min(6, l.getId().length()));
        return num + " • " + CURRENCY.format(l.getPrincipal()) + " (" + safe(l.getStatus()) + ")";
    }

    private static String extractInitials(String name) {
        if (name == null || name.isBlank()) return "CL";
        String[] parts = name.trim().split("\\s+");
        if (parts.length == 1) return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }
}
