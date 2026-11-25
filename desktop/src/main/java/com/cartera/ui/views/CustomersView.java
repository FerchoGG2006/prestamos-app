package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CancelLoanUseCase;
import com.cartera.payments.application.ReversePaymentUseCase;
import com.cartera.ui.util.UiLabels;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import javafx.beans.property.SimpleObjectProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Vista unificada de Clientes y Créditos.
 * Permite gestionar la ficha del cliente, consultar sus préstamos activos,
 * enviar estados de cuenta por WhatsApp, abrir geolocalización en Google Maps,
 * simular y otorgar nuevos créditos, renovaciones y anulaciones auditadas (ADMIN/SUPERVISOR).
 */
public class CustomersView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private com.cartera.customers.application.FollowUpService followUp;
    private com.cartera.customers.application.AttachmentService attachments;
    public void setOperationalServices(com.cartera.customers.application.FollowUpService follow,com.cartera.customers.application.AttachmentService files){followUp=follow;attachments=files;}
    private com.cartera.customers.application.CustomerLifecycleService lifecycle;
    public void setLifecycleService(com.cartera.customers.application.CustomerLifecycleService service) { lifecycle=service; }
    private com.cartera.customers.application.CreateCustomerWithLoanUseCase createCustomerWithLoanUseCase;
    public void setCreateCustomerWithLoanUseCase(com.cartera.customers.application.CreateCustomerWithLoanUseCase useCase) { this.createCustomerWithLoanUseCase = useCase; }
    private Runnable onDataChanged;
    public void setOnDataChanged(Runnable onDataChanged) { this.onDataChanged = onDataChanged; }

    private final CustomerRepository customerRepository;
    private final com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository paymentAllocationRepository;
    private final com.cartera.loans.application.CreateLoanUseCase createLoanUseCase;
    private final com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase;
    private final SystemSettingRepository settingRepository;
    private final AuditLogRepository auditLogRepository;
    private final RouteRepository routeRepository;
    private final ReversePaymentUseCase reversePaymentUseCase;
    private final CancelLoanUseCase cancelLoanUseCase;
    private final LoansView loansView;
    private final Stage ownerStage;

    private final ObservableList<CustomerEntity> customerList = FXCollections.observableArrayList();
    private FilteredList<CustomerEntity> filteredCustomers;
    private TextField searchField;
    private final TableView<CustomerEntity> table = new TableView<>();
    private final Label lblFooterTotal = new Label();
    private Map<String, String> routeNameCache = new HashMap<>();

    private StackPane contentArea;
    private SplitPane splitPane;
    private VBox detailCard;
    private HBox segmentBar;
    private Button btnTabCustomers;
    private Button btnTabLoans;
    private java.util.function.Consumer<String> onOpenCreditHistory;
    private java.util.function.Consumer<String> onOpenCustomer360;

    public void setOnOpenCustomer360(java.util.function.Consumer<String> onOpenCustomer360) {
        this.onOpenCustomer360 = onOpenCustomer360;
    }

    private void notifyDataChanged() {
        if (onDataChanged != null) {
            onDataChanged.run();
        }
    }

    private void showAlert(Alert.AlertType type, String message) {
        Alert alert = new Alert(type, message);
        alert.initOwner(ownerStage);
        alert.showAndWait();
    }

    public void clearFilters() {
        if (searchField != null) {
            searchField.clear();
        }
        table.getSelectionModel().clearSelection();
        showPlaceholderDetail();
        showSection("customers");
    }

    public void setOnOpenCreditHistory(java.util.function.Consumer<String> onOpenCreditHistory) {
        this.onOpenCreditHistory = onOpenCreditHistory;
    }

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         Stage ownerStage) {
        this(customerRepository, createCustomerUseCase, null, null, null, null, null, null, null, null, null, null, null, null, ownerStage);
    }

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         LoanRepository loanRepository,
                         InstallmentRepository installmentRepository,
                         com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                         com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                         LoansView loansView,
                         Stage ownerStage) {
        this(customerRepository, createCustomerUseCase, loanRepository, installmentRepository, null, null, createLoanUseCase, renewLoanUseCase, null, null, null, null, null, loansView, ownerStage);
    }

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         LoanRepository loanRepository,
                         InstallmentRepository installmentRepository,
                         PaymentRepository paymentRepository,
                         PaymentAllocationRepository paymentAllocationRepository,
                         com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                         com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                         LoansView loansView,
                         Stage ownerStage) {
        this(customerRepository, createCustomerUseCase, loanRepository, installmentRepository, paymentRepository, paymentAllocationRepository, createLoanUseCase, renewLoanUseCase, null, null, null, null, null, loansView, ownerStage);
    }

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         LoanRepository loanRepository,
                         InstallmentRepository installmentRepository,
                         PaymentRepository paymentRepository,
                         PaymentAllocationRepository paymentAllocationRepository,
                         com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                         com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                         SystemSettingRepository settingRepository,
                         AuditLogRepository auditLogRepository,
                         LoansView loansView,
                         Stage ownerStage) {
        this(customerRepository, createCustomerUseCase, loanRepository, installmentRepository, paymentRepository, paymentAllocationRepository, createLoanUseCase, renewLoanUseCase, settingRepository, auditLogRepository, null, null, null, loansView, ownerStage);
    }

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         LoanRepository loanRepository,
                         InstallmentRepository installmentRepository,
                         PaymentRepository paymentRepository,
                         PaymentAllocationRepository paymentAllocationRepository,
                         com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                         com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                         SystemSettingRepository settingRepository,
                         AuditLogRepository auditLogRepository,
                         RouteRepository routeRepository,
                         ReversePaymentUseCase reversePaymentUseCase,
                         CancelLoanUseCase cancelLoanUseCase,
                         LoansView loansView,
                         Stage ownerStage) {
        this.customerRepository = customerRepository;
        this.createCustomerUseCase = createCustomerUseCase;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
        this.createLoanUseCase = createLoanUseCase;
        this.renewLoanUseCase = renewLoanUseCase;
        this.settingRepository = settingRepository;
        this.auditLogRepository = auditLogRepository;
        this.routeRepository = routeRepository;
        this.reversePaymentUseCase = reversePaymentUseCase;
        this.cancelLoanUseCase = cancelLoanUseCase;
        this.loansView = loansView;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildContentArea();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Clientes y Créditos");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Directorio de clientes, cartera activa y seguimiento de créditos");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        // Segmented Control
        segmentBar = new HBox(4);
        segmentBar.getStyleClass().add("segment-bar");
        segmentBar.setAlignment(Pos.CENTER);

        btnTabCustomers = new Button("Ficha de Clientes y Créditos");
        btnTabCustomers.getStyleClass().addAll("segment-btn", "segment-btn-active");
        btnTabCustomers.setOnAction(e -> showSection("customers"));

        btnTabLoans = new Button("Cartera Global de Préstamos");
        btnTabLoans.getStyleClass().add("segment-btn");
        btnTabLoans.setOnAction(e -> showSection("loans"));

        segmentBar.getChildren().addAll(btnTabCustomers, btnTabLoans);

        Button btnNewCustomer = new Button("+ Registrar Cliente");
        btnNewCustomer.getStyleClass().add("btn-primary");
        btnNewCustomer.setOnAction(e -> {
            if (createCustomerUseCase != null) {
                var dlg = new CustomerDialog(createCustomerUseCase, createLoanUseCase, settingRepository, routeRepository, ownerStage, c -> {
                    refresh();
                    if (loansView != null) loansView.refresh();
                    notifyDataChanged();
                });
                dlg.setCreateCustomerWithLoanUseCase(createCustomerWithLoanUseCase);
                dlg.showAndWait();
            }
        });

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        Button alerts = new Button("Compromisos");
        alerts.getStyleClass().add("btn-secondary");
        alerts.setOnAction(e -> {
            try {
                if (followUp == null) throw new IllegalStateException("Servicio no disponible.");
                CustomerOperationsDialog.showAlerts(ownerStage, followUp, customerRepository);
            } catch (Exception ex) {
                showAlert(Alert.AlertType.ERROR, ex.getMessage());
            }
        });
        top.getChildren().addAll(titleBox, segmentBar, btnNewCustomer, alerts, btnRefresh);
        getChildren().add(top);
    }

    public void showSection(String section) {
        btnTabCustomers.getStyleClass().remove("segment-btn-active");
        btnTabLoans.getStyleClass().remove("segment-btn-active");

        boolean isCollector = UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::isCollector)
                .orElse(false);

        if ("loans".equalsIgnoreCase(section) && !isCollector) {
            btnTabLoans.getStyleClass().add("segment-btn-active");
            if (loansView != null) {
                loansView.refresh();
                contentArea.getChildren().setAll(loansView);
            }
        } else {
            btnTabCustomers.getStyleClass().add("segment-btn-active");
            contentArea.getChildren().setAll(splitPane);
        }
    }

    private void buildContentArea() {
        contentArea = new StackPane();
        VBox.setVgrow(contentArea, Priority.ALWAYS);

        splitPane = new SplitPane();
        splitPane.setStyle("-fx-background-color: transparent; -fx-padding: 0;");
        VBox.setVgrow(splitPane, Priority.ALWAYS);

        // Panel Izquierdo: Lista de Clientes
        VBox leftPane = new VBox(12);
        leftPane.getStyleClass().add("table-card");
        leftPane.setPadding(new Insets(14));

        searchField = new TextField();
        searchField.setPromptText("Buscar por nombre, documento o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setMaxWidth(Double.MAX_VALUE);

        filteredCustomers = new FilteredList<>(customerList, p -> true);
        searchField.textProperty().addListener((obs, old, val) -> {
            filteredCustomers.setPredicate(c -> {
                if (val == null || val.isBlank()) return true;
                String q = val.toLowerCase().trim();
                return (c.getFullName() != null && c.getFullName().toLowerCase().contains(q))
                        || (c.getDocumentNumber() != null && c.getDocumentNumber().toLowerCase().contains(q))
                        || (c.getNeighborhood() != null && c.getNeighborhood().toLowerCase().contains(q))
                        || (c.getBusinessName() != null && c.getBusinessName().toLowerCase().contains(q));
            });
            updateStats(filteredCustomers.size());
        });
        table.setItems(filteredCustomers);
        table.setPlaceholder(UiLabels.emptyState("Sin clientes registrados", "No hay clientes en esta ruta o búsqueda. Registra uno nuevo con el botón superior."));

        buildTableColumns();

        table.getSelectionModel().selectedItemProperty().addListener((obs, old, selected) -> updateDetailCard(selected));

        HBox footer = new HBox(12);
        footer.setAlignment(Pos.CENTER_LEFT);
        lblFooterTotal.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        footer.getChildren().add(lblFooterTotal);

        leftPane.getChildren().addAll(searchField, table, footer);

        // Panel Derecho: Ficha Detallada con scroll
        detailCard = new VBox(16);
        detailCard.setPadding(new Insets(20));

        ScrollPane detailScroll = new ScrollPane(detailCard);
        detailScroll.setFitToWidth(true);
        detailScroll.getStyleClass().add("table-card");
        detailScroll.setStyle("-fx-background-color: #ffffff; -fx-background: #ffffff;");
        detailScroll.setPrefWidth(410);
        detailScroll.setMinWidth(340);

        showPlaceholderDetail();

        splitPane.getItems().addAll(leftPane, detailScroll);
        splitPane.setDividerPositions(0.56);

        contentArea.getChildren().setAll(splitPane);
        getChildren().add(contentArea);
    }

    @SuppressWarnings("unchecked")
    private void buildTableColumns() {
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Cliente
        TableColumn<CustomerEntity, CustomerEntity> colName = new TableColumn<>("CLIENTE / DOCUMENTO");
        colName.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colName.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CustomerEntity c, boolean empty) {
                super.updateItem(c, empty);
                if (empty || c == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    HBox box = new HBox(10);
                    box.setAlignment(Pos.CENTER_LEFT);

                    Label lblInitials = new Label(getInitials(c.getFullName()));
                    lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11px;");
                    StackPane avatar = new StackPane(lblInitials);
                    avatar.setPrefSize(32, 32);
                    avatar.setMinSize(32, 32);
                    avatar.setMaxSize(32, 32);
                    avatar.setStyle("-fx-background-color: #2563eb; -fx-background-radius: 16;");

                    VBox textGroup = new VBox(2);
                    Label name = new Label(c.getFullName());
                    name.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 12px;");

                    String routeTag = " • " + resolveRouteName(c.getRouteId());
                    String statusSuffix = "INACTIVO".equalsIgnoreCase(c.getStatus()) ? " • INACTIVO" : "";
                    Label doc = new Label("CC: " + c.getDocumentNumber() + routeTag + statusSuffix);
                    doc.setStyle("-fx-text-fill: " + ("INACTIVO".equalsIgnoreCase(c.getStatus()) ? "#dc2626" : "#64748b") + "; -fx-font-size: 11px;");

                    textGroup.getChildren().addAll(name, doc);
                    box.getChildren().addAll(avatar, textGroup);
                    setGraphic(box);
                    setText(null);
                }
            }
        });

        // 2. Barrio / Teléfono
        TableColumn<CustomerEntity, CustomerEntity> colContact = new TableColumn<>("BARRIO / TELÉFONO");
        colContact.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colContact.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CustomerEntity c, boolean empty) {
                super.updateItem(c, empty);
                if (empty || c == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);

                    String b = (c.getNeighborhood() != null && !c.getNeighborhood().isBlank()) ? c.getNeighborhood() : "Sin barrio";
                    Label lblN = new Label("Barrio: " + b);
                    lblN.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 12px;");

                    Label lblP = new Label("Tel: " + (c.getPhone() != null ? c.getPhone() : "-"));
                    lblP.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(lblN, lblP);
                    setGraphic(box);
                    setText(null);
                }
            }
        });

        table.setRowFactory(tv -> {
            TableRow<CustomerEntity> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty() && onOpenCustomer360 != null) {
                    onOpenCustomer360.accept(row.getItem().getId());
                }
            });
            return row;
        });

        table.getColumns().addAll(colName, colContact);
    }

    private void showPlaceholderDetail() {
        detailCard.getChildren().clear();
        detailCard.setAlignment(Pos.CENTER);

        Label icon = new Label("");
        icon.setStyle("-fx-font-size: 40px; -fx-opacity: 0.5;");

        Label prompt = new Label("Selecciona un cliente");
        prompt.setStyle("-fx-text-fill: #64748b; -fx-font-size: 14px; -fx-font-weight: bold;");

        Label sub = new Label("Aquí verás su información personal, créditos activos, opciones de renovación y plan de cuotas.");
        sub.setWrapText(true);
        sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-text-alignment: center;");

        detailCard.getChildren().addAll(icon, prompt, sub);
    }

    private void updateDetailCard(CustomerEntity c) {
        updateDetailCard(c, null);
    }

    private void updateDetailCard(CustomerEntity c, String preferredLoanId) {
        if (c == null) {
            showPlaceholderDetail();
            return;
        }

        detailCard.getChildren().clear();
        detailCard.setAlignment(Pos.TOP_LEFT);

        boolean isInactive = "INACTIVO".equalsIgnoreCase(c.getStatus());
        boolean isCollector = UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::isCollector)
                .orElse(false);
        boolean allowNewLoans = !isCollector || settingRepository == null
                || settingRepository.findById("route_allow_new_loans")
                        .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                        .orElse(true);

        // Encabezado Ficha
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        Label lblInitials = new Label(getInitials(c.getFullName()));
        lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 16px;");
        StackPane avatar = new StackPane(lblInitials);
        avatar.setPrefSize(48, 48);
        avatar.setMinSize(48, 48);
        avatar.setStyle("-fx-background-color: " + (isInactive ? "#94a3b8" : "#2563eb") + "; -fx-background-radius: 24;");

        VBox namesBox = new VBox(2);
        Label lblName = new Label(c.getFullName());
        lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");
        Label lblDoc = new Label("C.C. " + c.getDocumentNumber()
                + (c.getRouteId() != null ? " • Ruta: " + resolveRouteName(c.getRouteId()) : ""));
        lblDoc.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        namesBox.getChildren().addAll(lblName, lblDoc);

        header.getChildren().addAll(avatar, namesBox);

        // Datos de Contacto completos
        VBox contactBox = new VBox(6);
        contactBox.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 8; -fx-padding: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");

        contactBox.getChildren().addAll(
                createDetailRow("Teléfono:", c.getPhone() != null && !c.getPhone().isBlank() ? c.getPhone() : "No registrado"),
                createDetailRow("WhatsApp:", c.getAltPhone() != null && !c.getAltPhone().isBlank() ? c.getAltPhone() : "Igual / No registrado"),
                createDetailRow("Dirección:", c.getAddress() != null && !c.getAddress().isBlank() ? c.getAddress() : "No registrada"),
                createDetailRow("Barrio:", c.getNeighborhood() != null && !c.getNeighborhood().isBlank() ? c.getNeighborhood() : "Sin barrio"),
                createDetailRow("Ciudad:", c.getCity() != null && !c.getCity().isBlank() ? c.getCity() : "No registrada"),
                createDetailRow("Negocio:", c.getBusinessName() != null && !c.getBusinessName().isBlank() ? c.getBusinessName() : "Particular"),
                createDetailRow("Ocupación:", c.getOccupation() != null && !c.getOccupation().isBlank() ? c.getOccupation() : "No registrada"),
                createDetailRow("Estado:", c.getStatus() != null ? c.getStatus() : "ACTIVO")
        );
        if (c.getNotes() != null && !c.getNotes().isBlank()) {
            contactBox.getChildren().add(createDetailRow("Notas:", c.getNotes()));
        }

        // Sección de Crédito (soporte multi-crédito activo)
        VBox creditCard = new VBox(10);
        creditCard.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 10; -fx-padding: 14; -fx-border-color: #e2e8f0; -fx-border-radius: 10;");

        List<LoanEntity> customerLoans = (loanRepository != null) ? loanRepository.findByCustomerId(c.getId()) : List.of();
        List<LoanEntity> activeLoans = customerLoans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .toList();
        LoanEntity activeLoan = activeLoans.stream()
                .filter(l -> preferredLoanId != null && preferredLoanId.equals(l.getId()))
                .findFirst()
                .orElse(activeLoans.isEmpty() ? null : activeLoans.get(0));

        if (activeLoan != null) {
            if (activeLoans.size() > 1) {
                ComboBox<LoanEntity> cmbActiveLoans = new ComboBox<>(FXCollections.observableArrayList(activeLoans));
                cmbActiveLoans.setMaxWidth(Double.MAX_VALUE);
                cmbActiveLoans.setValue(activeLoan);
                cmbActiveLoans.setConverter(new javafx.util.StringConverter<>() {
                    @Override
                    public String toString(LoanEntity l) {
                        if (l == null) return "";
                        String shortId = l.getId().length() > 8 ? l.getId().substring(0, 8).toUpperCase() : l.getId();
                        return "Crédito #" + shortId + " (" + CURRENCY.format(l.getTotalAgreed()) + " · " + l.getFrequency() + ")";
                    }
                    @Override
                    public LoanEntity fromString(String s) { return null; }
                });
                cmbActiveLoans.setOnAction(e -> {
                    LoanEntity chosen = cmbActiveLoans.getValue();
                    if (chosen != null && !chosen.getId().equals(activeLoan.getId())) {
                        updateDetailCard(c, chosen.getId());
                    }
                });
                Label lblMulti = new Label("Cliente con " + activeLoans.size() + " créditos activos — Selecciona uno:");
                lblMulti.setStyle("-fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold;");
                creditCard.getChildren().addAll(lblMulti, cmbActiveLoans);
            }

            List<InstallmentEntity> activeInsts = (installmentRepository != null)
                    ? installmentRepository.findByLoanId(activeLoan.getId())
                    : List.of();
            String todayStr = LocalDate.now().toString();
            boolean hasOverdue = activeInsts.stream().anyMatch(i ->
                    i.getPendingAmount() != null
                    && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0
                    && i.getDueDate() != null
                    && i.getDueDate().compareTo(todayStr) < 0
            );

            HBox credHeader = new HBox(8);
            credHeader.setAlignment(Pos.CENTER_LEFT);
            Label credTitle = new Label("Crédito Activo");
            credTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 13px; -fx-font-weight: bold;");
            Region sp = new Region();
            HBox.setHgrow(sp, Priority.ALWAYS);
            Label badge = new Label(hasOverdue ? "EN MORA" : "AL DÍA");
            badge.getStyleClass().setAll(hasOverdue ? "badge-mora" : "badge-al-dia");
            credHeader.getChildren().addAll(credTitle, sp, badge);

            BigDecimal currentBalance = (installmentRepository != null)
                    ? activeInsts.stream()
                            .map(i -> i.getPendingAmount() != null ? i.getPendingAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                    : activeLoan.getTotalAgreed();

            VBox figures = new VBox(5);
            Label lblBalTitle = new Label("Saldo Pendiente:");
            lblBalTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
            Label lblBalVal = new Label(CURRENCY.format(currentBalance));
            lblBalVal.setStyle("-fx-text-fill: #059669; -fx-font-size: 20px; -fx-font-weight: bold;");

            BigDecimal totalPaid = activeLoan.getTotalAgreed().subtract(currentBalance).max(BigDecimal.ZERO);
            BigDecimal progressPct = activeLoan.getTotalAgreed().compareTo(BigDecimal.ZERO) > 0
                    ? totalPaid.divide(activeLoan.getTotalAgreed(), 4, java.math.RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            double loanProgress = Math.min(1.0, Math.max(0.0, progressPct.doubleValue()));
            ProgressBar pbLoan = new ProgressBar(loanProgress);
            pbLoan.setMaxWidth(Double.MAX_VALUE);
            pbLoan.setPrefHeight(6);

            int pctInt = progressPct.multiply(BigDecimal.valueOf(100))
                    .setScale(0, java.math.RoundingMode.HALF_UP).intValue();
            Label lblAmort = new Label(Math.min(100, Math.max(0, pctInt)) + "% amortizado • Pagado: " + CURRENCY.format(totalPaid));
            lblAmort.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");

            Label lblDetails = new Label("Prestado: " + CURRENCY.format(activeLoan.getPrincipal())
                    + " • Total: " + CURRENCY.format(activeLoan.getTotalAgreed())
                    + " (" + activeLoan.getInstallmentCount() + " cuotas)");
            lblDetails.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
            figures.getChildren().addAll(lblBalTitle, lblBalVal, pbLoan, lblAmort, lblDetails);

            creditCard.getChildren().addAll(credHeader, figures);
        } else if (isInactive) {
            Label inactiveMsg = new Label("Cliente inactivo. Reactívelo para otorgar nuevos créditos.");
            inactiveMsg.setWrapText(true);
            inactiveMsg.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 12px; -fx-font-weight: bold;");
            creditCard.getChildren().add(inactiveMsg);
        } else {
            Label noLoan = new Label("Cliente disponible sin crédito activo.");
            noLoan.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
            creditCard.getChildren().add(noLoan);

            if (allowNewLoans) {
                HBox fixedDateBar = new HBox(8);
                fixedDateBar.setAlignment(Pos.CENTER_LEFT);
                fixedDateBar.setStyle("-fx-background-color: #eff6ff; -fx-padding: 6 10; -fx-background-radius: 8; -fx-border-color: #bfdbfe; -fx-border-radius: 8;");

                Label lblFixedLabel = new Label("Fecha Fija:");
                lblFixedLabel.setStyle("-fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold;");

                DatePicker dpFixed = new DatePicker(LocalDate.now().plusDays(20));
                dpFixed.setPrefWidth(125);
                dpFixed.setStyle("-fx-font-size: 11px; -fx-padding: 3 6;");

                Button btnPill7 = new Button("+7d");
                btnPill7.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 6; -fx-background-color: #dbeafe; -fx-text-fill: #1e40af; -fx-background-radius: 4; -fx-cursor: hand;");
                btnPill7.setOnAction(e -> dpFixed.setValue(LocalDate.now().plusDays(7)));

                Button btnPill15 = new Button("+15d");
                btnPill15.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 6; -fx-background-color: #dbeafe; -fx-text-fill: #1e40af; -fx-background-radius: 4; -fx-cursor: hand;");
                btnPill15.setOnAction(e -> dpFixed.setValue(LocalDate.now().plusDays(15)));

                Button btnPill30 = new Button("+30d");
                btnPill30.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 6; -fx-background-color: #dbeafe; -fx-text-fill: #1e40af; -fx-background-radius: 4; -fx-cursor: hand;");
                btnPill30.setOnAction(e -> dpFixed.setValue(LocalDate.now().plusDays(30)));

                Region spFixed = new Region();
                HBox.setHgrow(spFixed, Priority.ALWAYS);

                Button btnApplyFixed = new Button("Crear Préstamo");
                btnApplyFixed.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 4 10; -fx-background-radius: 6; -fx-cursor: hand;");
                btnApplyFixed.setOnAction(e -> openNewLoanDialog(c, "FECHA FIJA", dpFixed.getValue() != null ? dpFixed.getValue() : LocalDate.now().plusDays(15)));

                fixedDateBar.getChildren().addAll(lblFixedLabel, dpFixed, btnPill7, btnPill15, btnPill30, spFixed, btnApplyFixed);
                creditCard.getChildren().add(fixedDateBar);
            }
        }

        // Barra de acciones con FlowPane (accesible y sin perder botones en scroll)
        FlowPane actionBar = new FlowPane(6, 6);
        actionBar.setAlignment(Pos.CENTER_LEFT);
        actionBar.setPadding(new Insets(2, 0, 2, 0));

        if (!isInactive && allowNewLoans) {
            Button btnFixedDate = new Button("Fecha Fija");
            btnFixedDate.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
            btnFixedDate.setOnAction(e -> openNewLoanDialog(c, "FECHA FIJA", LocalDate.now().plusDays(20)));

            Button btnNewCredit = new Button("Nuevo Crédito");
            btnNewCredit.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #f0fdf4; -fx-text-fill: #15803d; -fx-border-color: #bbf7d0; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
            btnNewCredit.setOnAction(e -> openNewLoanDialog(c, null, null));

            actionBar.getChildren().addAll(btnFixedDate, btnNewCredit);
        }

        if (activeLoan != null) {
            final LoanEntity currentSelectedLoan = activeLoan;
            Button btnRenew = new Button("Renovar Crédito");
            btnRenew.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
            btnRenew.setOnAction(e -> {
                if (renewLoanUseCase != null && installmentRepository != null) {
                    new RenewLoanDialog(currentSelectedLoan, c.getFullName(), renewLoanUseCase, installmentRepository, settingRepository, ownerStage, renewed -> {
                        refresh();
                        if (loansView != null) loansView.refresh();
                        notifyDataChanged();
                    }).showAndWait();
                }
            });

            Button btnPlan = new Button("Ver Cuotas");
            btnPlan.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #f8fafc; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
            btnPlan.setOnAction(e -> showInstallmentsModal(currentSelectedLoan));

            actionBar.getChildren().addAll(btnRenew, btnPlan);

            if (UserSessionContext.canCurrentUserReverseOrCancel() && cancelLoanUseCase != null) {
                Button btnVoid = new Button("Anular Crédito");
                btnVoid.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
                btnVoid.setOnAction(e -> promptCancelActiveLoan(currentSelectedLoan, c));
                actionBar.getChildren().add(btnVoid);
            }
        }

        Button btnHistory = new Button("Ver Historial");
        btnHistory.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #f8fafc; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
        btnHistory.setOnAction(e -> {
            if (onOpenCreditHistory != null && c.getDocumentNumber() != null) {
                onOpenCreditHistory.accept(c.getDocumentNumber());
            }
        });

        Button btnEdit = new Button("Editar Datos");
        btnEdit.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #f8fafc; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
        btnEdit.setOnAction(e -> showEditCustomerDialog(c));

        final LoanEntity selectedLoanForWa = activeLoan;
        Button btnWhatsApp = new Button("Enviar WhatsApp");
        btnWhatsApp.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #dcfce7; -fx-text-fill: #166534; -fx-border-color: #86efac; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
        btnWhatsApp.setOnAction(e -> sendAccountStatementViaWhatsApp(c, selectedLoanForWa));

        Button btnMap = new Button("Ver Mapa");
        btnMap.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #e0f2fe; -fx-text-fill: #0369a1; -fx-border-color: #7dd3fc; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
        btnMap.setOnAction(e -> openGoogleMaps(c));

        Button operations = new Button("Seguimiento y archivos");
        operations.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #f8fafc; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
        operations.setOnAction(e -> {
            try {
                if (followUp == null || attachments == null) throw new IllegalStateException("Servicios no disponibles.");
                new CustomerOperationsDialog(ownerStage, c, followUp, attachments, loanRepository).showAndWait();
                refresh();
            } catch (Exception ex) {
                showAlert(Alert.AlertType.ERROR, ex.getMessage());
            }
        });

        Button btnFicha360 = new Button("Ficha 360°");
        btnFicha360.setStyle("-fx-font-size: 11px; -fx-padding: 5 12; -fx-background-color: #0d9488; -fx-text-fill: white; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
        btnFicha360.setOnAction(e -> {
            if (onOpenCustomer360 != null) {
                onOpenCustomer360.accept(c.getId());
            }
        });

        actionBar.getChildren().addAll(btnFicha360, btnHistory, btnEdit, operations, btnWhatsApp, btnMap);

        if (UserSessionContext.canCurrentUserReverseOrCancel()) {
            if (isInactive) {
                Button btnReactivate = new Button("Reactivar Cliente");
                btnReactivate.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-border-color: #86efac; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
                btnReactivate.setOnAction(e -> handleReactivateCustomer(c));
                actionBar.getChildren().add(btnReactivate);
            } else {
                Button btnDelete = new Button("Dar de baja");
                btnDelete.setStyle("-fx-font-size: 11px; -fx-padding: 5 10; -fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
                btnDelete.setOnAction(e -> handleDeleteCustomer(c));
                actionBar.getChildren().add(btnDelete);
            }
        }

        detailCard.getChildren().addAll(header, contactBox, creditCard, actionBar);
    }

    private void openNewLoanDialog(CustomerEntity c, String frequency, LocalDate startDate) {
        if (createLoanUseCase == null || customerRepository == null) return;
        var dlg = new CreateLoanDialog(createLoanUseCase, customerRepository, settingRepository, loanRepository, routeRepository, ownerStage, created -> {
            refresh();
            if (loansView != null) loansView.refresh();
            notifyDataChanged();
        });
        dlg.setAttachmentService(attachments);
        dlg.setInstallmentRepository(installmentRepository);
        dlg.setCreateCustomerWithLoanUseCase(createCustomerWithLoanUseCase);
        dlg.setSelectedCustomer(c.getId());
        if (frequency != null) dlg.setFrequency(frequency);
        if (startDate != null) dlg.setStartDate(startDate);
        dlg.showAndWait();
    }

    private void openGoogleMaps(CustomerEntity c) {
        try {
            String fallbackCity = settingRepository != null
                    ? settingRepository.findById("company_city").map(SystemSettingEntity::getSettingValue).orElse("")
                    : "";
            String city = (c.getCity() != null && !c.getCity().isBlank()) ? c.getCity() : fallbackCity;
            String query = ((c.getAddress() != null ? c.getAddress() : "")
                    + " " + (c.getNeighborhood() != null ? c.getNeighborhood() : "")
                    + " " + city
                    + " Colombia").trim();
            if (query.equalsIgnoreCase("Colombia")) {
                showAlert(Alert.AlertType.WARNING, "Este cliente no tiene dirección ni barrio registrado para abrir el mapa.");
                return;
            }
            String url = "https://www.google.com/maps/search/?api=1&query=" + URLEncoder.encode(query, StandardCharsets.UTF_8);
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(url));
            } else {
                showAlert(Alert.AlertType.WARNING, "El sistema no soporta abrir el navegador automáticamente.");
            }
        } catch (Exception ex) {
            showAlert(Alert.AlertType.ERROR, "No se pudo abrir Google Maps: " + ex.getMessage());
        }
    }

    private void sendAccountStatementViaWhatsApp(CustomerEntity c, LoanEntity selectedLoan) {
        String targetPhone = (c.getAltPhone() != null && !c.getAltPhone().isBlank()) ? c.getAltPhone() : c.getPhone();
        if (targetPhone == null || targetPhone.isBlank()) {
            showAlert(Alert.AlertType.WARNING, "El cliente no tiene número de teléfono o WhatsApp registrado.");
            return;
        }
        String companyName = settingRepository != null
                ? settingRepository.findById("company_name").map(SystemSettingEntity::getSettingValue).orElse("SISTEMA DE CARTERA")
                : "SISTEMA DE CARTERA";

        LoanEntity activeLoan = selectedLoan;
        if (activeLoan == null && loanRepository != null) {
            activeLoan = loanRepository.findByCustomerId(c.getId()).stream()
                    .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                    .findFirst()
                    .orElse(null);
        }

        if (activeLoan == null) {
            String msg = "*ESTADO DE CUENTA — " + companyName + "*\n"
                    + "*Cliente:* " + c.getFullName() + "\n"
                    + "Actualmente usted se encuentra *A PAZ Y SALVO* sin créditos pendientes.";
            if (!WhatsAppReceiptUtil.sendViaWhatsApp(targetPhone, msg)) {
                showAlert(Alert.AlertType.WARNING, "No se pudo abrir WhatsApp. Verifique el número telefónico (" + targetPhone + ").");
            }
            return;
        }

        List<InstallmentEntity> insts = installmentRepository != null
                ? installmentRepository.findByLoanId(activeLoan.getId())
                : List.of();
        int totalInst = insts.size();
        int paidInst = (int) insts.stream()
                .filter(i -> "PAGADA".equalsIgnoreCase(i.getStatus()) || "ADELANTADA".equalsIgnoreCase(i.getStatus()))
                .count();
        String todayStr = LocalDate.now().toString();
        int overdueInst = (int) insts.stream().filter(i ->
                i.getPendingAmount() != null
                && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0
                && i.getDueDate() != null
                && i.getDueDate().compareTo(todayStr) < 0
        ).count();
        BigDecimal pending = insts.stream()
                .map(i -> i.getPendingAmount() != null ? i.getPendingAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paid = activeLoan.getTotalAgreed().subtract(pending).max(BigDecimal.ZERO);
        String nextDue = insts.stream()
                .filter(i -> i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0)
                .map(InstallmentEntity::getDueDate)
                .sorted()
                .findFirst()
                .orElse("-");

        String statement = WhatsAppReceiptUtil.formatAccountStatement(
                companyName,
                c.getFullName(),
                c.getDocumentNumber(),
                activeLoan.getId(),
                activeLoan.getPrincipal(),
                activeLoan.getTotalAgreed(),
                paid,
                pending,
                paidInst,
                totalInst,
                overdueInst,
                nextDue
        );
        if (!WhatsAppReceiptUtil.sendViaWhatsApp(targetPhone, statement)) {
            showAlert(Alert.AlertType.WARNING, "No se pudo abrir WhatsApp. Verifique el número telefónico (" + targetPhone + ").");
        }
    }

    private void promptCancelActiveLoan(LoanEntity activeLoan, CustomerEntity customer) {
        if (!UserSessionContext.canCurrentUserReverseOrCancel() || cancelLoanUseCase == null) {
            return;
        }
        TextInputDialog dialog = new TextInputDialog();
        dialog.initOwner(ownerStage);
        dialog.setTitle("Anulación Auditada de Crédito");
        dialog.setHeaderText("Anular Crédito #" + activeLoan.getId() + " de " + customer.getFullName());
        dialog.setContentText("Motivo obligatorio de anulación:");

        Optional<String> res = dialog.showAndWait();
        res.ifPresent(reason -> {
            try {
                cancelLoanUseCase.execute(activeLoan.getId(), reason);
                refresh();
                updateDetailCard(customer);
                if (loansView != null) loansView.refresh();
                notifyDataChanged();
                showAlert(Alert.AlertType.INFORMATION, "Crédito anulado y reversado en caja exitosamente.");
            } catch (Exception ex) {
                showAlert(Alert.AlertType.ERROR, ex.getMessage());
            }
        });
    }

    private void showEditCustomerDialog(CustomerEntity customer) {
        if (customerRepository == null) return;
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Editar Cliente — " + customer.getFullName());

        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(480);

        Label lblTitle = new Label("Editar Datos del Cliente");
        lblTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtName = new TextField(customer.getFullName());
        TextField txtPhone = new TextField(customer.getPhone() != null ? customer.getPhone() : "");
        TextField txtAltPhone = new TextField(customer.getAltPhone() != null ? customer.getAltPhone() : "");
        TextField txtAddress = new TextField(customer.getAddress() != null ? customer.getAddress() : "");
        TextField txtNeighborhood = new TextField(customer.getNeighborhood() != null ? customer.getNeighborhood() : "");
        TextField txtCity = new TextField(customer.getCity() != null ? customer.getCity() : "");
        TextField txtBusiness = new TextField(customer.getBusinessName() != null ? customer.getBusinessName() : "");
        TextField txtOccupation = new TextField(customer.getOccupation() != null ? customer.getOccupation() : "");
        TextField txtNotes = new TextField(customer.getNotes() != null ? customer.getNotes() : "");

        ComboBox<RouteOption> cmbRoute = new ComboBox<>();
        cmbRoute.setMaxWidth(Double.MAX_VALUE);
        RouteOption selectedOpt = null;
        if (routeRepository != null) {
            for (RouteEntity r : routeRepository.findAll()) {
                boolean isCurrent = customer.getRouteId() != null && customer.getRouteId().equalsIgnoreCase(r.getId());
                boolean isActive = r.getActive() == null || r.getActive() != 0;
                if (!isActive && !isCurrent) continue;
                String label = isActive ? r.getName() : r.getName() + " (Inactiva)";
                RouteOption opt = new RouteOption(r.getId(), label);
                cmbRoute.getItems().add(opt);
                if (isCurrent) {
                    selectedOpt = opt;
                }
            }
        }
        if (selectedOpt == null && customer.getRouteId() != null && !customer.getRouteId().isBlank()) {
            selectedOpt = new RouteOption(customer.getRouteId(), resolveRouteName(customer.getRouteId()));
            cmbRoute.getItems().add(0, selectedOpt);
        }
        cmbRoute.setValue(selectedOpt);
        boolean isCollector = UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::isCollector)
                .orElse(false);
        cmbRoute.setDisable(isCollector);

        GridPane form = new GridPane();
        form.setHgap(10);
        form.setVgap(10);

        form.add(new Label("Nombre:"), 0, 0);
        form.add(txtName, 1, 0);
        form.add(new Label("Ruta:"), 0, 1);
        form.add(cmbRoute, 1, 1);
        form.add(new Label("Teléfono:"), 0, 2);
        form.add(txtPhone, 1, 2);
        form.add(new Label("WhatsApp:"), 0, 3);
        form.add(txtAltPhone, 1, 3);
        form.add(new Label("Dirección:"), 0, 4);
        form.add(txtAddress, 1, 4);
        form.add(new Label("Barrio:"), 0, 5);
        form.add(txtNeighborhood, 1, 5);
        form.add(new Label("Ciudad:"), 0, 6);
        form.add(txtCity, 1, 6);
        form.add(new Label("Negocio:"), 0, 7);
        form.add(txtBusiness, 1, 7);
        form.add(new Label("Ocupación:"), 0, 8);
        form.add(txtOccupation, 1, 8);
        form.add(new Label("Notas:"), 0, 9);
        form.add(txtNotes, 1, 9);

        ColumnConstraints c1 = new ColumnConstraints();
        c1.setPrefWidth(95);
        ColumnConstraints c2 = new ColumnConstraints();
        c2.setHgrow(Priority.ALWAYS);
        form.getColumnConstraints().addAll(c1, c2);

        HBox btnBox = new HBox(10);
        btnBox.setAlignment(Pos.CENTER_RIGHT);
        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Guardar Cambios");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                if (lifecycle == null) throw new IllegalStateException("Servicio de clientes no disponible.");
                var updated = lifecycle.update(new com.cartera.customers.application.CustomerLifecycleService.Profile(
                        customer.getId(),
                        txtName.getText(),
                        txtPhone.getText(),
                        txtAltPhone.getText(),
                        txtAddress.getText(),
                        txtNeighborhood.getText(),
                        txtCity.getText(),
                        txtBusiness.getText(),
                        txtOccupation.getText(),
                        txtNotes.getText(),
                        cmbRoute.getValue() == null ? customer.getRouteId() : cmbRoute.getValue().id()));
                dialog.close();
                refresh();
                updateDetailCard(updated);
                notifyDataChanged();
            } catch (Exception ex) {
                Alert err = new Alert(Alert.AlertType.ERROR, ex.getMessage());
                err.initOwner(dialog);
                err.showAndWait();
            }
        });

        btnBox.getChildren().addAll(btnCancel, btnSave);
        root.getChildren().addAll(lblTitle, form, btnBox);

        ScrollPane sp = new ScrollPane(root);
        sp.setFitToWidth(true);
        sp.setStyle("-fx-background-color: #ffffff; -fx-background: #ffffff; -fx-border-color: transparent;");

        Scene scene = new Scene(sp, 500, 520);
        try {
            var cssUrl = getClass().getResource("/ui/theme.css");
            if (cssUrl != null) {
                scene.getStylesheets().add(cssUrl.toExternalForm());
            }
        } catch (Exception ignored) {}
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void handleDeleteCustomer(CustomerEntity customer) {
        TextInputDialog reason = new TextInputDialog();
        reason.initOwner(ownerStage);
        reason.setTitle("Dar de baja al cliente");
        reason.setHeaderText("Se conservará el historial. Los créditos activos deben admitir anulación.");
        reason.setContentText("Motivo obligatorio:");
        reason.showAndWait().ifPresent(value -> {
            try {
                if (lifecycle == null) throw new IllegalStateException("Servicio de clientes no disponible.");
                lifecycle.deactivate(customer.getId(), value);
                refresh();
                showPlaceholderDetail();
                if (loansView != null) loansView.refresh();
                notifyDataChanged();
                showAlert(Alert.AlertType.INFORMATION, "Cliente inactivado. Historial conservado.");
            } catch (Exception ex) {
                showAlert(Alert.AlertType.ERROR, "No se realizó la baja: " + ex.getMessage());
            }
        });
    }

    private void handleReactivateCustomer(CustomerEntity customer) {
        TextInputDialog reason = new TextInputDialog();
        reason.initOwner(ownerStage);
        reason.setTitle("Reactivar cliente");
        reason.setHeaderText("Reactivar a " + customer.getFullName() + " para habilitar nuevos créditos.");
        reason.setContentText("Motivo obligatorio:");
        reason.showAndWait().ifPresent(value -> {
            try {
                if (lifecycle == null) throw new IllegalStateException("Servicio de clientes no disponible.");
                CustomerEntity reactivated = lifecycle.reactivate(customer.getId(), value);
                refresh();
                updateDetailCard(reactivated);
                notifyDataChanged();
                showAlert(Alert.AlertType.INFORMATION, "Cliente reactivado exitosamente.");
            } catch (Exception ex) {
                showAlert(Alert.AlertType.ERROR, "No se pudo reactivar: " + ex.getMessage());
            }
        });
    }

    @SuppressWarnings("unchecked")
    private void showInstallmentsModal(LoanEntity loan) {
        if (installmentRepository == null) return;
        Stage modal = new Stage();
        modal.initModality(Modality.WINDOW_MODAL);
        modal.initOwner(ownerStage);
        String loanShortId = loan.getId().length() > 8 ? loan.getId().substring(0, 8).toUpperCase() : loan.getId();
        modal.setTitle("Plan de Pagos — Crédito N° " + loanShortId);

        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(780);

        Label title = new Label("Plan de Cuotas y Registro de Pagos");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");

        TableView<InstallmentEntity> tableInst = new TableView<>();
        tableInst.setPlaceholder(UiLabels.emptyState("Sin cuotas registradas", "No se encontraron cuotas para este crédito."));
        tableInst.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(tableInst, Priority.ALWAYS);

        // Preload valid payments and payment dates for this loan (filtrando por STATUS, nunca por método!)
        Map<String, String> installmentPaymentDates = new HashMap<>();
        Map<String, List<PaymentEntity>> installmentValidPayments = new HashMap<>();
        if (paymentAllocationRepository != null && paymentRepository != null) {
            Map<String, PaymentEntity> validPaymentsById = paymentRepository.findByLoanId(loan.getId()).stream()
                    .filter(p -> !"ANULADO".equalsIgnoreCase(p.getStatus())
                            && !"REVERTIDO".equalsIgnoreCase(p.getStatus())
                            && !"REVERSED".equalsIgnoreCase(p.getStatus()))
                    .collect(Collectors.toMap(PaymentEntity::getId, p -> p, (a, b) -> a));

            List<InstallmentEntity> allLoanInst = installmentRepository.findByLoanId(loan.getId());
            for (InstallmentEntity inst : allLoanInst) {
                List<PaymentAllocationEntity> allocs = paymentAllocationRepository.findByInstallmentId(inst.getId());
                if (!allocs.isEmpty()) {
                    List<PaymentEntity> validList = new java.util.ArrayList<>();
                    for (PaymentAllocationEntity alloc : allocs) {
                        PaymentEntity pay = validPaymentsById.get(alloc.getPaymentId());
                        if (pay != null) {
                            if (validList.stream().noneMatch(existing -> existing.getId().equals(pay.getId()))) {
                                validList.add(pay);
                            }
                            String created = pay.getCreatedAt();
                            String pDate = (created != null && created.length() >= 10)
                                    ? created.substring(0, 10)
                                    : (created != null ? created : "");
                            if (!pDate.isBlank()) {
                                String currentLatest = installmentPaymentDates.get(inst.getId());
                                if (currentLatest == null || pDate.compareTo(currentLatest) > 0) {
                                    installmentPaymentDates.put(inst.getId(), pDate);
                                }
                            }
                        }
                    }
                    if (!validList.isEmpty()) {
                        validList.sort((a, b) -> String.valueOf(b.getCreatedAt()).compareTo(String.valueOf(a.getCreatedAt())));
                        installmentValidPayments.put(inst.getId(), validList);
                    }
                }
            }
        }

        LocalDate today = LocalDate.now();
        String todayStr = today.toString();

        TableColumn<InstallmentEntity, String> colNum = new TableColumn<>("#");
        colNum.setCellValueFactory(d -> new SimpleObjectProperty<>("Cuota #" + d.getValue().getInstallmentNumber()));
        colNum.setPrefWidth(75);

        TableColumn<InstallmentEntity, String> colDate = new TableColumn<>("VENCE");
        colDate.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getDueDate()));
        colDate.setPrefWidth(90);

        TableColumn<InstallmentEntity, String> colVal = new TableColumn<>("VALOR");
        colVal.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().getAmount())));
        colVal.setPrefWidth(95);

        TableColumn<InstallmentEntity, InstallmentEntity> colSt = new TableColumn<>("ESTADO");
        colSt.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colSt.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(InstallmentEntity inst, boolean empty) {
                super.updateItem(inst, empty);
                if (empty || inst == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    String status = inst.getStatus() != null ? inst.getStatus().toUpperCase() : "PENDIENTE";
                    boolean isSettled = "PAGADA".equalsIgnoreCase(status)
                            || "ADELANTADA".equalsIgnoreCase(status)
                            || "ANULADA".equalsIgnoreCase(status);
                    boolean isOverdue = !isSettled
                            && inst.getPendingAmount() != null
                            && inst.getPendingAmount().compareTo(BigDecimal.ZERO) > 0
                            && inst.getDueDate() != null
                            && inst.getDueDate().compareTo(todayStr) < 0;
                    String displayStatus = isOverdue ? "VENCIDA" : status;

                    Label badge = new Label(displayStatus);
                    badge.setAlignment(Pos.CENTER);
                    String base = "-fx-padding: 3 8; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 10px;";
                    if ("PAGADA".equalsIgnoreCase(displayStatus)) {
                        badge.setStyle(base + "-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-border-color: #bbf7d0; -fx-border-radius: 12;");
                    } else if ("ADELANTADA".equalsIgnoreCase(displayStatus)) {
                        badge.setStyle(base + "-fx-background-color: #e0e7ff; -fx-text-fill: #4338ca; -fx-border-color: #c7d2fe; -fx-border-radius: 12;");
                    } else if ("ANULADA".equalsIgnoreCase(displayStatus)) {
                        badge.setStyle(base + "-fx-background-color: #f1f5f9; -fx-text-fill: #64748b; -fx-border-color: #cbd5e1; -fx-border-radius: 12;");
                    } else if ("VENCIDA".equalsIgnoreCase(displayStatus) || "MORA".equalsIgnoreCase(displayStatus)) {
                        badge.setStyle(base + "-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 12;");
                    } else if ("PARCIAL".equalsIgnoreCase(displayStatus)) {
                        badge.setStyle(base + "-fx-background-color: #fffbeb; -fx-text-fill: #d97706; -fx-border-color: #fde68a; -fx-border-radius: 12;");
                    } else {
                        badge.setStyle(base + "-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-border-color: #cbd5e1; -fx-border-radius: 12;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colSt.setPrefWidth(95);

        // FECHA PAGO
        TableColumn<InstallmentEntity, String> colPaidDate = new TableColumn<>("FECHA PAGO");
        colPaidDate.setCellValueFactory(d -> {
            String pDate = installmentPaymentDates.get(d.getValue().getId());
            boolean isPaidStatus = "PAGADA".equalsIgnoreCase(d.getValue().getStatus())
                    || "ADELANTADA".equalsIgnoreCase(d.getValue().getStatus());
            return new SimpleObjectProperty<>(pDate != null ? pDate : (isPaidStatus ? d.getValue().getDueDate() : "-"));
        });
        colPaidDate.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    setText(item);
                    if (!"-".equals(item)) {
                        setStyle("-fx-text-fill: #0369a1; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else {
                        setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
                    }
                }
            }
        });
        colPaidDate.setPrefWidth(100);

        // PUNTUALIDAD / RETRASO
        TableColumn<InstallmentEntity, InstallmentEntity> colDelay = new TableColumn<>("PUNTUALIDAD / RETRASO");
        colDelay.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colDelay.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(InstallmentEntity inst, boolean empty) {
                super.updateItem(inst, empty);
                if (empty || inst == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label();
                    badge.setAlignment(Pos.CENTER);
                    String base = "-fx-padding: 3 8; -fx-background-radius: 12; -fx-font-weight: bold; -fx-font-size: 10px;";

                    boolean isPaidStatus = "PAGADA".equalsIgnoreCase(inst.getStatus())
                            || "ADELANTADA".equalsIgnoreCase(inst.getStatus());
                    boolean isCancelled = "ANULADA".equalsIgnoreCase(inst.getStatus());
                    String pDateStr = installmentPaymentDates.get(inst.getId());
                    if (pDateStr == null && isPaidStatus) {
                        pDateStr = inst.getDueDate();
                    }

                    if (isCancelled) {
                        badge.setText("Anulada");
                        badge.setStyle(base + "-fx-background-color: #f1f5f9; -fx-text-fill: #64748b;");
                    } else if (isPaidStatus && pDateStr != null) {
                        try {
                            LocalDate dueDate = LocalDate.parse(inst.getDueDate());
                            LocalDate paidDate = LocalDate.parse(pDateStr.length() >= 10 ? pDateStr.substring(0, 10) : pDateStr);
                            if (paidDate.isAfter(dueDate)) {
                                long days = ChronoUnit.DAYS.between(dueDate, paidDate);
                                badge.setText(days + " d retraso");
                                badge.setStyle(base + "-fx-background-color: #fef3c7; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 12;");
                            } else if (paidDate.isBefore(dueDate) || "ADELANTADA".equalsIgnoreCase(inst.getStatus())) {
                                long days = Math.max(0, ChronoUnit.DAYS.between(paidDate, dueDate));
                                badge.setText(days > 0 ? "Adelantada (" + days + "d)" : "Adelantada");
                                badge.setStyle(base + "-fx-background-color: #e0e7ff; -fx-text-fill: #4338ca; -fx-border-color: #c7d2fe; -fx-border-radius: 12;");
                            } else {
                                badge.setText("A tiempo");
                                badge.setStyle(base + "-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-border-color: #bbf7d0; -fx-border-radius: 12;");
                            }
                        } catch (Exception ex) {
                            badge.setText("Pagada");
                            badge.setStyle(base + "-fx-background-color: #dcfce7; -fx-text-fill: #15803d;");
                        }
                    } else if (inst.getDueDate() != null) {
                        try {
                            LocalDate dueDate = LocalDate.parse(inst.getDueDate());
                            if (dueDate.isBefore(today)) {
                                long days = ChronoUnit.DAYS.between(dueDate, today);
                                badge.setText("Mora (" + days + "d)");
                                badge.setStyle(base + "-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 12;");
                            } else if (dueDate.isEqual(today)) {
                                badge.setText("Vence hoy");
                                badge.setStyle(base + "-fx-background-color: #e0f2fe; -fx-text-fill: #0284c7; -fx-border-color: #bae6fd; -fx-border-radius: 12;");
                            } else {
                                badge.setText("Pendiente");
                                badge.setStyle(base + "-fx-background-color: #f8fafc; -fx-text-fill: #64748b; -fx-border-color: #e2e8f0; -fx-border-radius: 12;");
                            }
                        } catch (Exception ex) {
                            badge.setText("Pendiente");
                            badge.setStyle(base + "-fx-background-color: #f8fafc; -fx-text-fill: #64748b;");
                        }
                    } else {
                        badge.setText("-");
                        badge.setStyle(base + "-fx-background-color: #f8fafc; -fx-text-fill: #94a3b8;");
                    }

                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colDelay.setPrefWidth(150);

        tableInst.getColumns().addAll(colNum, colDate, colVal, colSt, colPaidDate, colDelay);

        // Columna de reverso de pago SOLO para ADMIN o SUPERVISOR
        if (UserSessionContext.canCurrentUserReverseOrCancel() && reversePaymentUseCase != null) {
            TableColumn<InstallmentEntity, InstallmentEntity> colRev = new TableColumn<>("REVERSO");
            colRev.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
            colRev.setCellFactory(col -> new TableCell<>() {
                @Override
                protected void updateItem(InstallmentEntity inst, boolean empty) {
                    super.updateItem(inst, empty);
                    if (empty || inst == null) {
                        setGraphic(null);
                        setText(null);
                    } else {
                        List<PaymentEntity> validPayments = installmentValidPayments.get(inst.getId());
                        if (validPayments != null && !validPayments.isEmpty()) {
                            Button btnRev = new Button(validPayments.size() > 1 ? "Anular (" + validPayments.size() + ")" : "Anular Pago");
                            btnRev.setStyle("-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                            btnRev.setOnAction(e -> {
                                String targetPayId;
                                if (validPayments.size() == 1) {
                                    targetPayId = validPayments.get(0).getId();
                                } else {
                                    record PayChoice(PaymentEntity payment) {
                                        @Override
                                        public String toString() {
                                            String d = payment.getCreatedAt() != null && payment.getCreatedAt().length() >= 10
                                                    ? payment.getCreatedAt().substring(0, 10) : "-";
                                            return d + " · " + CURRENCY.format(payment.getAmount()) + " (" + payment.getMethod() + ")";
                                        }
                                    }
                                    List<PayChoice> choices = validPayments.stream().map(PayChoice::new).toList();
                                    ChoiceDialog<PayChoice> pick = new ChoiceDialog<>(choices.get(0), choices);
                                    pick.initOwner(modal);
                                    pick.setTitle("Seleccionar pago a anular");
                                    pick.setHeaderText("Esta cuota tiene " + validPayments.size() + " pagos aplicados");
                                    pick.setContentText("Seleccione el pago:");
                                    Optional<PayChoice> chosen = pick.showAndWait();
                                    if (chosen.isEmpty()) return;
                                    targetPayId = chosen.get().payment().getId();
                                }

                                TextInputDialog dlg = new TextInputDialog();
                                dlg.initOwner(modal);
                                dlg.setTitle("Anulación Auditada de Pago");
                                dlg.setHeaderText("Revertir Pago Asociado a Cuota #" + inst.getInstallmentNumber());
                                dlg.setContentText("Motivo obligatorio de anulación:");
                                final String finalPayId = targetPayId;
                                dlg.showAndWait().ifPresent(reason -> {
                                    try {
                                        reversePaymentUseCase.execute(finalPayId, reason);
                                        modal.close();
                                        refresh();
                                        if (loansView != null) loansView.refresh();
                                        notifyDataChanged();
                                        showAlert(Alert.AlertType.INFORMATION, "Pago anulado y saldo restaurado exitosamente.");
                                    } catch (Exception ex) {
                                        Alert err = new Alert(Alert.AlertType.ERROR, ex.getMessage());
                                        err.initOwner(modal);
                                        err.showAndWait();
                                    }
                                });
                            });
                            setGraphic(btnRev);
                            setText(null);
                        } else {
                            setGraphic(null);
                            setText("-");
                        }
                    }
                }
            });
            colRev.setPrefWidth(115);
            tableInst.getColumns().add(colRev);
        }

        List<InstallmentEntity> list = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
        tableInst.setItems(FXCollections.observableArrayList(list));

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> modal.close());

        HBox bot = new HBox(btnClose);
        bot.setAlignment(Pos.CENTER_RIGHT);

        root.getChildren().addAll(title, tableInst, bot);
        Scene scene = new Scene(root, 800, 460);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        modal.setScene(scene);
        modal.showAndWait();
    }

    private HBox createDetailRow(String label, String value) {
        HBox row = new HBox(6);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        l.setMinWidth(70);
        Label v = new Label(value);
        v.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 11px;");
        v.setWrapText(true);
        row.getChildren().addAll(l, v);
        return row;
    }

    public void refresh() {
        boolean isCollector = UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::isCollector)
                .orElse(false);
        if (btnTabLoans != null) {
            btnTabLoans.setVisible(!isCollector);
            btnTabLoans.setManaged(!isCollector);
        }
        if (isCollector && contentArea != null && !contentArea.getChildren().contains(splitPane)) {
            showSection("customers");
        }

        // Recargar cache de nombres de rutas (evita N+1 por celda)
        Map<String, String> freshRoutes = new HashMap<>();
        if (routeRepository != null) {
            for (RouteEntity r : routeRepository.findAll()) {
                freshRoutes.put(r.getId(), r.getName() != null ? r.getName() : r.getId());
            }
        }
        routeNameCache = freshRoutes;

        var selected = table.getSelectionModel().getSelectedItem();
        String selectedRoute = UserSessionContext.getSelectedRouteId();
        List<CustomerEntity> allCustomers = customerRepository.findAll().stream()
                .filter(c -> {
                    if ("NONE".equalsIgnoreCase(selectedRoute)) return false;
                    return selectedRoute == null || "ALL".equalsIgnoreCase(selectedRoute) || selectedRoute.equalsIgnoreCase(c.getRouteId());
                })
                .toList();
        customerList.setAll(allCustomers);
        updateStats(filteredCustomers != null ? filteredCustomers.size() : customerList.size());
        if (selected != null) {
            Optional<CustomerEntity> match = customerList.stream()
                    .filter(c -> c.getId().equals(selected.getId()))
                    .findFirst();
            if (match.isPresent()) {
                table.getSelectionModel().select(match.get());
                updateDetailCard(match.get());
            } else {
                showPlaceholderDetail();
            }
        }
    }

    private void updateStats(int count) {
        lblFooterTotal.setText("Total de clientes: " + count);
    }

    private static String getInitials(String fullName) {
        if (fullName == null || fullName.isBlank()) return "CL";
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length >= 2) {
            return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
        }
        return fullName.substring(0, Math.min(2, fullName.length())).toUpperCase();
    }

    private String resolveRouteName(String routeId) {
        if (routeId == null || routeId.isBlank()) return "Sin Ruta";
        String cached = routeNameCache.get(routeId);
        if (cached != null) return cached;
        if (routeRepository != null) {
            return routeRepository.findById(routeId).map(RouteEntity::getName).orElse(routeId);
        }
        return routeId;
    }

    private record RouteOption(String id, String name) {
        @Override
        public String toString() {
            return name;
        }
    }
}
