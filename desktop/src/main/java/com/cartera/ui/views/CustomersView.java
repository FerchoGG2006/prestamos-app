package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CancelLoanUseCase;
import com.cartera.payments.application.ReversePaymentUseCase;
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
    private final TableView<CustomerEntity> table = new TableView<>();
    private final Label lblFooterTotal = new Label();

    private StackPane contentArea;
    private SplitPane splitPane;
    private VBox detailCard;
    private Button btnTabCustomers;
    private Button btnTabLoans;
    private java.util.function.Consumer<String> onOpenCreditHistory;

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
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Clientes y Créditos");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Ficha de clientes, cartera deudora, estados de cuenta WhatsApp y renovaciones inmediatas");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        // Segmented Control
        HBox segmentBar = new HBox(4);
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
                new CustomerDialog(createCustomerUseCase, createLoanUseCase, settingRepository, routeRepository, ownerStage, c -> {
                    refresh();
                    if (loansView != null) loansView.refresh();
                }).showAndWait();
            }
        });

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, segmentBar, btnNewCustomer, btnRefresh);
        getChildren().add(top);
    }

    public void showSection(String section) {
        btnTabCustomers.getStyleClass().remove("segment-btn-active");
        btnTabLoans.getStyleClass().remove("segment-btn-active");

        if ("loans".equalsIgnoreCase(section)) {
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

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar por nombre, documento o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setMaxWidth(Double.MAX_VALUE);

        FilteredList<CustomerEntity> filtered = new FilteredList<>(customerList, p -> true);
        searchField.textProperty().addListener((obs, old, val) -> {
            filtered.setPredicate(c -> {
                if (val == null || val.isBlank()) return true;
                String q = val.toLowerCase().trim();
                return c.getFullName().toLowerCase().contains(q)
                        || c.getDocumentNumber().toLowerCase().contains(q)
                        || (c.getNeighborhood() != null && c.getNeighborhood().toLowerCase().contains(q))
                        || (c.getBusinessName() != null && c.getBusinessName().toLowerCase().contains(q));
            });
            updateStats(filtered.size());
        });
        table.setItems(filtered);

        buildTableColumns();

        table.getSelectionModel().selectedItemProperty().addListener((obs, old, selected) -> updateDetailCard(selected));

        HBox footer = new HBox(12);
        footer.setAlignment(Pos.CENTER_LEFT);
        lblFooterTotal.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        footer.getChildren().add(lblFooterTotal);

        leftPane.getChildren().addAll(searchField, table, footer);

        // Panel Derecho: Ficha Detallada
        detailCard = new VBox(16);
        detailCard.getStyleClass().add("table-card");
        detailCard.setPadding(new Insets(20));
        detailCard.setPrefWidth(395);
        detailCard.setMinWidth(330);

        showPlaceholderDetail();

        splitPane.getItems().addAll(leftPane, detailCard);
        splitPane.setDividerPositions(0.58);

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
                    avatar.setStyle("-fx-background-color: linear-gradient(to bottom right, #6366f1, #4338ca); -fx-background-radius: 16;");

                    VBox textGroup = new VBox(2);
                    Label name = new Label(c.getFullName());
                    name.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 12px;");

                    String routeTag = c.getRouteId() != null ? " • " + c.getRouteId() : "";
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
        if (c == null) {
            showPlaceholderDetail();
            return;
        }

        detailCard.getChildren().clear();
        detailCard.setAlignment(Pos.TOP_LEFT);

        // Encabezado Ficha
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        Label lblInitials = new Label(getInitials(c.getFullName()));
        lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 16px;");
        StackPane avatar = new StackPane(lblInitials);
        avatar.setPrefSize(48, 48);
        avatar.setMinSize(48, 48);
        avatar.setStyle("-fx-background-color: linear-gradient(to bottom right, #3b82f6, #1d4ed8); -fx-background-radius: 24;");

        VBox namesBox = new VBox(2);
        Label lblName = new Label(c.getFullName());
        lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");
        Label lblDoc = new Label("C.C. " + c.getDocumentNumber() + (c.getRouteId() != null ? " • Ruta: " + c.getRouteId() : ""));
        lblDoc.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        namesBox.getChildren().addAll(lblName, lblDoc);

        header.getChildren().addAll(avatar, namesBox);

        // Datos de Contacto
        VBox contactBox = new VBox(6);
        contactBox.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 8; -fx-padding: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");

        contactBox.getChildren().addAll(
                createDetailRow("Teléfono:", c.getPhone() != null ? c.getPhone() : "No registrado"),
                createDetailRow("Dirección:", c.getAddress() != null ? c.getAddress() : "No registrada"),
                createDetailRow("Barrio:", c.getNeighborhood() != null ? c.getNeighborhood() : "Sin barrio"),
                createDetailRow("Negocio:", c.getBusinessName() != null ? c.getBusinessName() : "Particular"),
                createDetailRow("Estado:", c.getStatus() != null ? c.getStatus() : "ACTIVO")
        );

        // Botones Rápidos de Contacto y Geolocalización
        HBox quickContactBox = new HBox(8);
        Button btnMap = new Button("📍 Ver en Google Maps");
        btnMap.setStyle("-fx-background-color: #e0f2fe; -fx-text-fill: #0369a1; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 10; -fx-background-radius: 6; -fx-cursor: hand;");
        btnMap.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnMap, Priority.ALWAYS);
        btnMap.setOnAction(e -> openGoogleMaps(c));

        Button btnWhatsAppState = new Button("📲 WhatsApp Estado Cuenta");
        btnWhatsAppState.setStyle("-fx-background-color: #16a34a; -fx-text-fill: white; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 10; -fx-background-radius: 6; -fx-cursor: hand;");
        btnWhatsAppState.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnWhatsAppState, Priority.ALWAYS);
        btnWhatsAppState.setOnAction(e -> sendAccountStatementViaWhatsApp(c));

        quickContactBox.getChildren().addAll(btnMap, btnWhatsAppState);

        // Sección de Crédito
        VBox creditCard = new VBox(10);
        creditCard.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 10; -fx-padding: 14; -fx-border-color: #e2e8f0; -fx-border-radius: 10;");

        List<LoanEntity> customerLoans = (loanRepository != null) ? loanRepository.findByCustomerId(c.getId()) : List.of();
        LoanEntity activeLoan = customerLoans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .findFirst()
                .orElse(null);

        if (activeLoan != null) {
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
            badge.setStyle(hasOverdue
                    ? "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 8; -fx-background-radius: 10; -fx-border-color: #fecaca; -fx-border-radius: 10;"
                    : "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 8; -fx-background-radius: 10; -fx-border-color: #a7f3d0; -fx-border-radius: 10;");
            credHeader.getChildren().addAll(credTitle, sp, badge);

            BigDecimal currentBalance = (installmentRepository != null)
                    ? activeInsts.stream()
                            .map(i -> i.getPendingAmount() != null ? i.getPendingAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                    : activeLoan.getTotalAgreed();

            VBox figures = new VBox(4);
            Label lblBalTitle = new Label("Saldo Pendiente:");
            lblBalTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
            Label lblBalVal = new Label(CURRENCY.format(currentBalance));
            lblBalVal.setStyle("-fx-text-fill: #059669; -fx-font-size: 20px; -fx-font-weight: bold;");

            Label lblDetails = new Label("Prestado: " + CURRENCY.format(activeLoan.getPrincipal())
                    + " • Total: " + CURRENCY.format(activeLoan.getTotalAgreed())
                    + " (" + activeLoan.getInstallmentCount() + " cuotas)");
            lblDetails.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
            figures.getChildren().addAll(lblBalTitle, lblBalVal, lblDetails);

            // Acciones Rápidas para el Crédito
            HBox actionButtons = new HBox(8);
            Button btnRenew = new Button("Renovar Crédito");
            btnRenew.getStyleClass().add("btn-primary");
            btnRenew.setStyle("-fx-font-size: 11px; -fx-padding: 6 12;");
            btnRenew.setOnAction(e -> {
                if (renewLoanUseCase != null && installmentRepository != null) {
                    new RenewLoanDialog(activeLoan, c.getFullName(), renewLoanUseCase, installmentRepository, settingRepository, ownerStage, renewed -> {
                        refresh();
                        if (loansView != null) loansView.refresh();
                    }).showAndWait();
                }
            });

            Button btnPlan = new Button("Ver Cuotas");
            btnPlan.getStyleClass().add("btn-secondary");
            btnPlan.setStyle("-fx-font-size: 11px; -fx-padding: 6 12;");
            btnPlan.setOnAction(e -> showInstallmentsModal(activeLoan));

            actionButtons.getChildren().addAll(btnRenew, btnPlan);

            // Botón Anular Crédito SOLO visible para ADMIN / SUPERVISOR
            if (UserSessionContext.canCurrentUserReverseOrCancel() && cancelLoanUseCase != null) {
                Button btnVoidLoan = new Button("🚫 Anular");
                btnVoidLoan.setStyle("-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 10; -fx-cursor: hand;");
                btnVoidLoan.setOnAction(e -> promptCancelActiveLoan(activeLoan, c));
                actionButtons.getChildren().add(btnVoidLoan);
            }

            creditCard.getChildren().addAll(credHeader, figures, actionButtons);
        } else {
            Label noLoan = new Label("Sin créditos activos en este momento.");
            noLoan.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");

            Button btnNewLoan = new Button("Otorgar Nuevo Crédito");
            btnNewLoan.getStyleClass().add("btn-success");
            btnNewLoan.setMaxWidth(Double.MAX_VALUE);
            btnNewLoan.setOnAction(e -> {
                if (createLoanUseCase != null && customerRepository != null) {
                    var dlg = new CreateLoanDialog(createLoanUseCase, customerRepository, settingRepository, ownerStage, created -> {
                        refresh();
                        if (loansView != null) loansView.refresh();
                    });
                    dlg.setSelectedCustomer(c.getId());
                    dlg.showAndWait();
                }
            });

            creditCard.getChildren().addAll(noLoan, btnNewLoan);
        }

        Button btnHistory = new Button("📋 Ver Historial y Calificación de Pago");
        btnHistory.getStyleClass().add("btn-secondary");
        btnHistory.setMaxWidth(Double.MAX_VALUE);
        btnHistory.setStyle("-fx-font-size: 11px; -fx-padding: 7 12; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe;");
        btnHistory.setOnAction(e -> {
            if (onOpenCreditHistory != null && c.getDocumentNumber() != null) {
                onOpenCreditHistory.accept(c.getDocumentNumber());
            }
        });

        HBox customerActionsBox = new HBox(8);
        customerActionsBox.setAlignment(Pos.CENTER_LEFT);

        Button btnEditCustomer = new Button("✏️ Editar Cliente");
        btnEditCustomer.getStyleClass().add("btn-secondary");
        btnEditCustomer.setStyle("-fx-font-size: 11px; -fx-padding: 7 12;");
        btnEditCustomer.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnEditCustomer, Priority.ALWAYS);
        btnEditCustomer.setOnAction(e -> showEditCustomerDialog(c));

        Button btnDeleteCustomer = new Button("🗑️ Desactivar / Eliminar");
        btnDeleteCustomer.setStyle("-fx-font-size: 11px; -fx-padding: 7 12; -fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6;");
        btnDeleteCustomer.setOnAction(e -> handleDeleteCustomer(c));

        customerActionsBox.getChildren().addAll(btnEditCustomer, btnDeleteCustomer);

        detailCard.getChildren().addAll(header, contactBox, quickContactBox, creditCard, btnHistory, customerActionsBox);
    }

    private void openGoogleMaps(CustomerEntity c) {
        try {
            String query = (c.getAddress() != null ? c.getAddress() : "")
                    + " " + (c.getNeighborhood() != null ? c.getNeighborhood() : "")
                    + " " + (c.getCity() != null ? c.getCity() : "Barranquilla")
                    + " Colombia";
            String url = "https://www.google.com/maps/search/?api=1&query=" + URLEncoder.encode(query.trim(), StandardCharsets.UTF_8);
            if (Desktop.isDesktopSupported()) {
                Desktop.getDesktop().browse(URI.create(url));
            }
        } catch (Exception ignored) {
        }
    }

    private void sendAccountStatementViaWhatsApp(CustomerEntity c) {
        String companyName = settingRepository != null
                ? settingRepository.findById("company_name").map(SystemSettingEntity::getSettingValue).orElse("SISTEMA DE CARTERA")
                : "SISTEMA DE CARTERA";

        List<LoanEntity> customerLoans = (loanRepository != null) ? loanRepository.findByCustomerId(c.getId()) : List.of();
        LoanEntity activeLoan = customerLoans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .findFirst()
                .orElse(null);

        if (activeLoan == null) {
            String msg = "📋 *ESTADO DE CUENTA — " + companyName + "*\n"
                    + "👤 *Cliente:* " + c.getFullName() + "\n"
                    + "✅ Actualmente usted se encuentra *A PAZ Y SALVO* sin créditos pendientes.";
            WhatsAppReceiptUtil.sendViaWhatsApp(c.getPhone(), msg);
            return;
        }

        List<InstallmentEntity> insts = installmentRepository != null
                ? installmentRepository.findByLoanId(activeLoan.getId())
                : List.of();
        int totalInst = insts.size();
        int paidInst = (int) insts.stream().filter(i -> "PAGADA".equalsIgnoreCase(i.getStatus())).count();
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
        WhatsAppReceiptUtil.sendViaWhatsApp(c.getPhone(), statement);
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
                new Alert(Alert.AlertType.INFORMATION, "Crédito anulado y reversado en caja exitosamente.").showAndWait();
            } catch (Exception ex) {
                new Alert(Alert.AlertType.ERROR, ex.getMessage()).showAndWait();
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
        root.setPrefWidth(460);

        Label lblTitle = new Label("Editar Datos del Cliente");
        lblTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtName = new TextField(customer.getFullName());
        TextField txtPhone = new TextField(customer.getPhone());
        TextField txtAddress = new TextField(customer.getAddress() != null ? customer.getAddress() : "");
        TextField txtNeighborhood = new TextField(customer.getNeighborhood() != null ? customer.getNeighborhood() : "");
        TextField txtBusiness = new TextField(customer.getBusinessName() != null ? customer.getBusinessName() : "");
        TextField txtOccupation = new TextField(customer.getOccupation() != null ? customer.getOccupation() : "");

        ComboBox<String> cmbRoute = new ComboBox<>();
        cmbRoute.setMaxWidth(Double.MAX_VALUE);
        if (routeRepository != null) {
            for (RouteEntity r : routeRepository.findAll()) {
                cmbRoute.getItems().add(r.getId());
            }
        }
        if (cmbRoute.getItems().isEmpty()) {
            cmbRoute.getItems().add("route-norte");
        }
        String currentRoute = customer.getRouteId() != null ? customer.getRouteId() : "route-norte";
        if (!cmbRoute.getItems().contains(currentRoute)) {
            cmbRoute.getItems().add(currentRoute);
        }
        cmbRoute.setValue(currentRoute);

        GridPane form = new GridPane();
        form.setHgap(10);
        form.setVgap(10);

        form.add(new Label("Nombre:"), 0, 0);
        form.add(txtName, 1, 0);
        form.add(new Label("Ruta:"), 0, 1);
        form.add(cmbRoute, 1, 1);
        form.add(new Label("Teléfono:"), 0, 2);
        form.add(txtPhone, 1, 2);
        form.add(new Label("Dirección:"), 0, 3);
        form.add(txtAddress, 1, 3);
        form.add(new Label("Barrio:"), 0, 4);
        form.add(txtNeighborhood, 1, 4);
        form.add(new Label("Negocio:"), 0, 5);
        form.add(txtBusiness, 1, 5);
        form.add(new Label("Ocupación:"), 0, 6);
        form.add(txtOccupation, 1, 6);

        ColumnConstraints c1 = new ColumnConstraints();
        c1.setPrefWidth(90);
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
            if (txtName.getText().trim().isEmpty()) {
                new Alert(Alert.AlertType.WARNING, "El nombre completo es requerido.").showAndWait();
                return;
            }
            customer.setFullName(txtName.getText().trim());
            customer.setRouteId(cmbRoute.getValue());
            customer.setPhone(txtPhone.getText().trim());
            customer.setAddress(txtAddress.getText().trim());
            customer.setNeighborhood(txtNeighborhood.getText().trim());
            customer.setBusinessName(txtBusiness.getText().trim());
            customer.setOccupation(txtOccupation.getText().trim());
            customerRepository.save(customer);

            dialog.close();
            refresh();
            updateDetailCard(customer);
            new Alert(Alert.AlertType.INFORMATION, "Cliente actualizado exitosamente.").showAndWait();
        });

        btnBox.getChildren().addAll(btnCancel, btnSave);
        root.getChildren().addAll(lblTitle, form, btnBox);

        Scene scene = new Scene(root);
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
        if (customerRepository == null) return;
        List<LoanEntity> loans = (loanRepository != null) ? loanRepository.findByCustomerId(customer.getId()) : List.of();
        boolean hasActive = loans.stream().anyMatch(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()) || "ACTIVE".equalsIgnoreCase(l.getStatus()));

        if (hasActive) {
            Alert blocked = new Alert(Alert.AlertType.WARNING);
            blocked.initOwner(ownerStage);
            blocked.setTitle("Operación Bloqueada por Integridad Financiera");
            blocked.setHeaderText("No se puede eliminar ni desactivar un cliente con crédito activo");
            blocked.setContentText("El cliente '" + customer.getFullName() + "' mantiene un crédito activo con saldo en cartera. Debe liquidar o finalizar el crédito antes de dar de baja al cliente.");
            blocked.showAndWait();
            return;
        }

        String author = UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::userId)
                .orElse("usr-admin-1");
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        if (!loans.isEmpty()) {
            Alert confirmDeactivate = new Alert(Alert.AlertType.CONFIRMATION);
            confirmDeactivate.initOwner(ownerStage);
            confirmDeactivate.setTitle("Inactivar Cliente con Historial");
            confirmDeactivate.setHeaderText("Preservación de Auditoría Financiera");
            confirmDeactivate.setContentText("El cliente '" + customer.getFullName() + "' posee historial de créditos cerrados/renovados. Por integridad contable no se borra físicamente, sino que se marcará como INACTIVO. ¿Desea continuar?");
            var res = confirmDeactivate.showAndWait();
            if (res.isPresent() && res.get() == ButtonType.OK) {
                String prevStatus = customer.getStatus();
                customer.setStatus("INACTIVO");
                customerRepository.save(customer);
                if (auditLogRepository != null) {
                    auditLogRepository.save(new AuditLogEntity(
                            UUID.randomUUID().toString(),
                            author,
                            "CUSTOMER",
                            customer.getId(),
                            "INACTIVAR_CLIENTE",
                            prevStatus,
                            "INACTIVO",
                            "Inactivación de cliente con historial crediticio",
                            now
                    ));
                }
                refresh();
                updateDetailCard(customer);
                new Alert(Alert.AlertType.INFORMATION, "Cliente marcado como INACTIVO exitosamente.").showAndWait();
            }
            return;
        }

        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.initOwner(ownerStage);
        confirm.setTitle("Eliminar Cliente");
        confirm.setHeaderText("Confirmar eliminación de cliente sin créditos");
        confirm.setContentText("¿Está seguro de eliminar al cliente '" + customer.getFullName() + "'? No tiene préstamos asociados.");

        var res = confirm.showAndWait();
        if (res.isPresent() && res.get() == ButtonType.OK) {
            customerRepository.delete(customer);
            if (auditLogRepository != null) {
                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        author,
                        "CUSTOMER",
                        customer.getId(),
                        "ELIMINAR_CLIENTE",
                        customer.getFullName(),
                        "ELIMINADO",
                        "Eliminación de cliente sin historial de préstamos",
                        now
                ));
            }
            refresh();
            showPlaceholderDetail();
            new Alert(Alert.AlertType.INFORMATION, "Cliente eliminado exitosamente.").showAndWait();
        }
    }

    @SuppressWarnings("unchecked")
    private void showInstallmentsModal(LoanEntity loan) {
        if (installmentRepository == null) return;
        Stage modal = new Stage();
        modal.initModality(Modality.WINDOW_MODAL);
        modal.initOwner(ownerStage);
        modal.setTitle("Plan de Pagos — Crédito #" + loan.getId());

        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(780);

        Label title = new Label("Plan de Cuotas y Registro de Pagos");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");

        TableView<InstallmentEntity> tableInst = new TableView<>();
        tableInst.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(tableInst, Priority.ALWAYS);

        // Preload payments and payment dates for this loan
        Map<String, String> installmentPaymentDates = new HashMap<>();
        Map<String, String> installmentPaymentIds = new HashMap<>();
        if (paymentAllocationRepository != null && paymentRepository != null) {
            List<PaymentEntity> loanPayments = paymentRepository.findByLoanId(loan.getId());
            Map<String, String> paymentDateMap = loanPayments.stream()
                    .filter(p -> !"ANULADO".equalsIgnoreCase(p.getPaymentMethod()))
                    .collect(Collectors.toMap(PaymentEntity::getId, p -> {
                        String c = p.getCreatedAt();
                        return (c != null && c.length() >= 10) ? c.substring(0, 10) : (c != null ? c : "");
                    }, (a, b) -> a));

            List<InstallmentEntity> allLoanInst = installmentRepository.findByLoanId(loan.getId());
            for (InstallmentEntity inst : allLoanInst) {
                List<PaymentAllocationEntity> allocs = paymentAllocationRepository.findByInstallmentId(inst.getId());
                if (!allocs.isEmpty()) {
                    for (PaymentAllocationEntity alloc : allocs) {
                        String pDate = paymentDateMap.get(alloc.getPaymentId());
                        if (pDate != null && !pDate.isBlank()) {
                            installmentPaymentDates.put(inst.getId(), pDate);
                            installmentPaymentIds.put(inst.getId(), alloc.getPaymentId());
                            break;
                        }
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
                    boolean isOverdue = !"PAGADA".equalsIgnoreCase(status)
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
        colSt.setPrefWidth(85);

        // FECHA PAGO
        TableColumn<InstallmentEntity, String> colPaidDate = new TableColumn<>("FECHA PAGO");
        colPaidDate.setCellValueFactory(d -> {
            String pDate = installmentPaymentDates.get(d.getValue().getId());
            return new SimpleObjectProperty<>(pDate != null ? pDate : ("PAGADA".equalsIgnoreCase(d.getValue().getStatus()) ? d.getValue().getDueDate() : "-"));
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

                    String pDateStr = installmentPaymentDates.get(inst.getId());
                    if (pDateStr == null && "PAGADA".equalsIgnoreCase(inst.getStatus())) {
                        pDateStr = inst.getDueDate();
                    }

                    if ("PAGADA".equalsIgnoreCase(inst.getStatus()) && pDateStr != null) {
                        try {
                            LocalDate dueDate = LocalDate.parse(inst.getDueDate());
                            LocalDate paidDate = LocalDate.parse(pDateStr.length() >= 10 ? pDateStr.substring(0, 10) : pDateStr);
                            if (paidDate.isAfter(dueDate)) {
                                long days = ChronoUnit.DAYS.between(dueDate, paidDate);
                                badge.setText("⚠️ " + days + " d retraso");
                                badge.setStyle(base + "-fx-background-color: #fef3c7; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 12;");
                            } else if (paidDate.isBefore(dueDate)) {
                                long days = ChronoUnit.DAYS.between(paidDate, dueDate);
                                badge.setText("⚡ Adelantada (" + days + "d)");
                                badge.setStyle(base + "-fx-background-color: #e0e7ff; -fx-text-fill: #4338ca; -fx-border-color: #c7d2fe; -fx-border-radius: 12;");
                            } else {
                                badge.setText("✓ A tiempo");
                                badge.setStyle(base + "-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-border-color: #bbf7d0; -fx-border-radius: 12;");
                            }
                        } catch (Exception ex) {
                            badge.setText("Pagada");
                            badge.setStyle(base + "-fx-background-color: #dcfce7; -fx-text-fill: #15803d;");
                        }
                    } else if (!"PAGADA".equalsIgnoreCase(inst.getStatus()) && inst.getDueDate() != null) {
                        try {
                            LocalDate dueDate = LocalDate.parse(inst.getDueDate());
                            if (dueDate.isBefore(today)) {
                                long days = ChronoUnit.DAYS.between(dueDate, today);
                                badge.setText("⚠️ Mora (" + days + "d)");
                                badge.setStyle(base + "-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 12;");
                            } else if (dueDate.isEqual(today)) {
                                badge.setText("🔔 Vence hoy");
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
                        String payId = installmentPaymentIds.get(inst.getId());
                        if (payId != null) {
                            Button btnRev = new Button("↩ Anular Pago");
                            btnRev.setStyle("-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                            btnRev.setOnAction(e -> {
                                TextInputDialog dlg = new TextInputDialog();
                                dlg.initOwner(modal);
                                dlg.setTitle("Anulación Auditada de Pago");
                                dlg.setHeaderText("Revertir Pago Asociado a Cuota #" + inst.getInstallmentNumber());
                                dlg.setContentText("Motivo obligatorio de anulación:");
                                dlg.showAndWait().ifPresent(reason -> {
                                    try {
                                        reversePaymentUseCase.execute(payId, reason);
                                        modal.close();
                                        refresh();
                                        if (loansView != null) loansView.refresh();
                                        new Alert(Alert.AlertType.INFORMATION, "Pago anulado y saldo restaurado exitosamente.").showAndWait();
                                    } catch (Exception ex) {
                                        new Alert(Alert.AlertType.ERROR, ex.getMessage()).showAndWait();
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
            colRev.setPrefWidth(110);
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
        Scene scene = new Scene(root, 780, 450);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        modal.setScene(scene);
        modal.showAndWait();
    }

    private HBox createDetailRow(String label, String value) {
        HBox row = new HBox(6);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        Label v = new Label(value);
        v.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 11px;");
        row.getChildren().addAll(l, v);
        return row;
    }

    public void refresh() {
        var selected = table.getSelectionModel().getSelectedItem();
        String selectedRoute = UserSessionContext.getSelectedRouteId();
        List<CustomerEntity> allCustomers = customerRepository.findAll().stream()
                .filter(c -> selectedRoute == null || "ALL".equalsIgnoreCase(selectedRoute) || selectedRoute.equalsIgnoreCase(c.getRouteId()))
                .toList();
        customerList.setAll(allCustomers);
        updateStats(customerList.size());
        if (selected != null) {
            customerList.stream()
                    .filter(c -> c.getId().equals(selected.getId()))
                    .findFirst()
                    .ifPresent(table.getSelectionModel()::select);
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
}
