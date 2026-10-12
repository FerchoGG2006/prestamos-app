package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
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

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.List;
import java.util.Locale;

/**
 * Vista unificada de Clientes y Créditos.
 * Permite gestionar la ficha del cliente, consultar sus préstamos activos,
 * simular y otorgar nuevos créditos o renovaciones sin salir de la vista.
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
    private final com.cartera.loans.application.CreateLoanUseCase createLoanUseCase;
    private final com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase;
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

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         Stage ownerStage) {
        this(customerRepository, createCustomerUseCase, null, null, null, null, null, ownerStage);
    }

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         LoanRepository loanRepository,
                         InstallmentRepository installmentRepository,
                         com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                         com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                         LoansView loansView,
                         Stage ownerStage) {
        this.customerRepository = customerRepository;
        this.createCustomerUseCase = createCustomerUseCase;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.createLoanUseCase = createLoanUseCase;
        this.renewLoanUseCase = renewLoanUseCase;
        this.loansView = loansView;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

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
        Label subtitle = new Label("Ficha de clientes, cartera deudora y renovaciones inmediatas");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        // Segmented Control
        HBox segmentBar = new HBox(4);
        segmentBar.getStyleClass().add("segment-bar");
        segmentBar.setAlignment(Pos.CENTER);

        btnTabCustomers = new Button("👥  Ficha de Clientes y Créditos");
        btnTabCustomers.getStyleClass().addAll("segment-btn", "segment-btn-active");
        btnTabCustomers.setOnAction(e -> showSection("customers"));

        btnTabLoans = new Button("📋  Cartera Global de Préstamos");
        btnTabLoans.getStyleClass().add("segment-btn");
        btnTabLoans.setOnAction(e -> showSection("loans"));

        segmentBar.getChildren().addAll(btnTabCustomers, btnTabLoans);

        Button btnNewCustomer = new Button("+ Registrar Cliente");
        btnNewCustomer.getStyleClass().add("btn-primary");
        btnNewCustomer.setOnAction(e -> {
            if (createCustomerUseCase != null) {
                new CustomerDialog(createCustomerUseCase, ownerStage, c -> refresh()).showAndWait();
            }
        });

        Button btnRefresh = new Button("↻ Actualizar");
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
        lblFooterTotal.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
        footer.getChildren().add(lblFooterTotal);

        leftPane.getChildren().addAll(searchField, table, footer);

        // Panel Derecho: Ficha Detallada
        detailCard = new VBox(16);
        detailCard.getStyleClass().add("table-card");
        detailCard.setPadding(new Insets(20));
        detailCard.setPrefWidth(380);
        detailCard.setMinWidth(320);

        showPlaceholderDetail();

        splitPane.getItems().addAll(leftPane, detailCard);
        splitPane.setDividerPositions(0.60);

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
                    name.setStyle("-fx-text-fill: #f8fafc; -fx-font-weight: bold; -fx-font-size: 12px;");

                    Label doc = new Label("CC: " + c.getDocumentNumber());
                    doc.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");

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
                    Label lblN = new Label("📍 " + b);
                    lblN.setStyle("-fx-text-fill: #e2e8f0; -fx-font-size: 12px;");

                    Label lblP = new Label("📞 " + (c.getPhone() != null ? c.getPhone() : "-"));
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

        Label icon = new Label("👤");
        icon.setStyle("-fx-font-size: 40px; -fx-opacity: 0.5;");

        Label prompt = new Label("Selecciona un cliente");
        prompt.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 14px; -fx-font-weight: bold;");

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
        lblName.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 15px; -fx-font-weight: bold;");
        Label lblDoc = new Label("C.C. " + c.getDocumentNumber());
        lblDoc.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        namesBox.getChildren().addAll(lblName, lblDoc);

        header.getChildren().addAll(avatar, namesBox);

        // Datos de Contacto
        VBox contactBox = new VBox(6);
        contactBox.setStyle("-fx-background-color: #0f172a; -fx-background-radius: 8; -fx-padding: 12;");

        contactBox.getChildren().addAll(
                createDetailRow("📞 Teléfono:", c.getPhone() != null ? c.getPhone() : "No registrado"),
                createDetailRow("📍 Dirección:", c.getAddress() != null ? c.getAddress() : "No registrada"),
                createDetailRow("🏙️ Barrio:", c.getNeighborhood() != null ? c.getNeighborhood() : "Sin barrio"),
                createDetailRow("🏢 Negocio:", c.getBusinessName() != null ? c.getBusinessName() : "Particular")
        );

        // Sección de Crédito
        VBox creditCard = new VBox(10);
        creditCard.setStyle("-fx-background-color: #141e2e; -fx-background-radius: 10; -fx-padding: 14; -fx-border-color: #334155; -fx-border-radius: 10;");

        List<LoanEntity> customerLoans = (loanRepository != null) ? loanRepository.findByCustomerId(c.getId()) : List.of();
        LoanEntity activeLoan = customerLoans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .findFirst()
                .orElse(null);

        if (activeLoan != null) {
            HBox credHeader = new HBox(8);
            credHeader.setAlignment(Pos.CENTER_LEFT);
            Label credTitle = new Label("Crédito Activo");
            credTitle.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 13px; -fx-font-weight: bold;");
            Region sp = new Region();
            HBox.setHgrow(sp, Priority.ALWAYS);
            Label badge = new Label("● AL DÍA");
            badge.setStyle("-fx-background-color: rgba(16, 185, 129, 0.2); -fx-text-fill: #34d399; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 2 8; -fx-background-radius: 10;");
            credHeader.getChildren().addAll(credTitle, sp, badge);

            BigDecimal currentBalance = (installmentRepository != null)
                    ? installmentRepository.findByLoanId(activeLoan.getId()).stream()
                            .map(i -> i.getPendingAmount() != null ? i.getPendingAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add)
                    : activeLoan.getTotalAgreed();

            VBox figures = new VBox(4);
            Label lblBalTitle = new Label("Saldo Pendiente:");
            lblBalTitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
            Label lblBalVal = new Label(CURRENCY.format(currentBalance));
            lblBalVal.setStyle("-fx-text-fill: #10b981; -fx-font-size: 20px; -fx-font-weight: bold;");

            Label lblDetails = new Label("Prestado: " + CURRENCY.format(activeLoan.getPrincipal())
                    + " • Total: " + CURRENCY.format(activeLoan.getTotalAgreed())
                    + " (" + activeLoan.getInstallmentCount() + " cuotas)");
            lblDetails.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
            figures.getChildren().addAll(lblBalTitle, lblBalVal, lblDetails);

            // Acciones Rápidas para el Crédito
            HBox actionButtons = new HBox(8);
            Button btnRenew = new Button("🔄 Renovar Crédito");
            btnRenew.getStyleClass().add("btn-primary");
            btnRenew.setStyle("-fx-font-size: 11px; -fx-padding: 6 12;");
            btnRenew.setOnAction(e -> {
                if (renewLoanUseCase != null && installmentRepository != null) {
                    new RenewLoanDialog(activeLoan, c.getFullName(), renewLoanUseCase, installmentRepository, ownerStage, renewed -> {
                        refresh();
                        if (loansView != null) loansView.refresh();
                    }).showAndWait();
                }
            });

            Button btnPlan = new Button("📑 Ver Cuotas");
            btnPlan.getStyleClass().add("btn-secondary");
            btnPlan.setStyle("-fx-font-size: 11px; -fx-padding: 6 12;");
            btnPlan.setOnAction(e -> showInstallmentsModal(activeLoan));

            actionButtons.getChildren().addAll(btnRenew, btnPlan);
            creditCard.getChildren().addAll(credHeader, figures, actionButtons);
        } else {
            Label noLoan = new Label("Sin créditos activos en este momento.");
            noLoan.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");

            Button btnNewLoan = new Button("➕ Otorgar Nuevo Crédito");
            btnNewLoan.getStyleClass().add("btn-success");
            btnNewLoan.setMaxWidth(Double.MAX_VALUE);
            btnNewLoan.setOnAction(e -> {
                if (createLoanUseCase != null && customerRepository != null) {
                    var dlg = new CreateLoanDialog(createLoanUseCase, customerRepository, ownerStage, created -> {
                        refresh();
                        if (loansView != null) loansView.refresh();
                    });
                    dlg.setSelectedCustomer(c.getId());
                    dlg.showAndWait();
                }
            });

            creditCard.getChildren().addAll(noLoan, btnNewLoan);
        }

        detailCard.getChildren().addAll(header, contactBox, creditCard);
    }

    private void showInstallmentsModal(LoanEntity loan) {
        if (installmentRepository == null) return;
        Stage modal = new Stage();
        modal.initModality(Modality.WINDOW_MODAL);
        modal.initOwner(ownerStage);
        modal.setTitle("Plan de Pagos — Crédito #" + loan.getId());

        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #0f172a;");
        root.setPrefWidth(540);

        Label title = new Label("Plan de Cuotas del Crédito");
        title.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 15px; -fx-font-weight: bold;");

        TableView<InstallmentEntity> tableInst = new TableView<>();
        tableInst.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(tableInst, Priority.ALWAYS);

        TableColumn<InstallmentEntity, String> colNum = new TableColumn<>("#");
        colNum.setCellValueFactory(d -> new SimpleObjectProperty<>("Cuota #" + d.getValue().getInstallmentNumber()));
        colNum.setPrefWidth(70);

        TableColumn<InstallmentEntity, String> colDate = new TableColumn<>("VENCE");
        colDate.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getDueDate()));
        colDate.setPrefWidth(100);

        TableColumn<InstallmentEntity, String> colVal = new TableColumn<>("VALOR");
        colVal.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().getAmount())));
        colVal.setPrefWidth(100);

        TableColumn<InstallmentEntity, String> colBal = new TableColumn<>("PENDIENTE");
        colBal.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().getPendingAmount())));
        colBal.setPrefWidth(100);

        TableColumn<InstallmentEntity, String> colSt = new TableColumn<>("ESTADO");
        colSt.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getStatus()));
        colSt.setPrefWidth(90);

        tableInst.getColumns().addAll(colNum, colDate, colVal, colBal, colSt);

        List<InstallmentEntity> list = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(loan.getId());
        tableInst.setItems(FXCollections.observableArrayList(list));

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> modal.close());

        HBox bot = new HBox(btnClose);
        bot.setAlignment(Pos.CENTER_RIGHT);

        root.getChildren().addAll(title, tableInst, bot);
        Scene scene = new Scene(root, 560, 420);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        modal.setScene(scene);
        modal.showAndWait();
    }

    private HBox createDetailRow(String label, String value) {
        HBox row = new HBox(6);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        Label v = new Label(value);
        v.setStyle("-fx-text-fill: #e2e8f0; -fx-font-size: 11px;");
        row.getChildren().addAll(l, v);
        return row;
    }

    public void refresh() {
        var selected = table.getSelectionModel().getSelectedItem();
        customerList.setAll(customerRepository.findAll());
        updateStats(customerList.size());
        if (selected != null) {
            customerList.stream()
                    .filter(c -> c.getId().equals(selected.getId()))
                    .findFirst()
                    .ifPresent(table.getSelectionModel()::select);
        }
    }

    private void updateStats(int count) {
        lblFooterTotal.setText("👥 Total de clientes: " + count);
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
