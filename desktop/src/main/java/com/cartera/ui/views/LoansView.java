package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CancelLoanUseCase;
import javafx.beans.property.SimpleObjectProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

public class LoansView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final LoanRepository loanRepository;
    private final CustomerRepository customerRepository;
    private final com.cartera.loans.application.CreateLoanUseCase createLoanUseCase;
    private final com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase;
    private final CancelLoanUseCase cancelLoanUseCase;
    private final InstallmentRepository installmentRepository;
    private final SystemSettingRepository settingRepository;
    private final RouteRepository routeRepository;
    private final javafx.stage.Stage ownerStage;
    private final Runnable onLoanCreatedCallback;
    private final ObservableList<LoanEntity> loansList = FXCollections.observableArrayList();
    private Map<String, String> customerNames = Map.of();

    private final Label lblFooterCount = new Label();
    private final Label lblFooterPrincipal = new Label();
    private final Label lblFooterTotalAgreed = new Label();

    public LoansView(LoanRepository loanRepository,
                     CustomerRepository customerRepository,
                     InstallmentRepository installmentRepository,
                     com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                     com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                     javafx.stage.Stage ownerStage,
                     Runnable onLoanCreatedCallback) {
        this(loanRepository, customerRepository, installmentRepository, createLoanUseCase, renewLoanUseCase, null, null, null, ownerStage, onLoanCreatedCallback);
    }

    public LoansView(LoanRepository loanRepository,
                     CustomerRepository customerRepository,
                     InstallmentRepository installmentRepository,
                     com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                     com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                     SystemSettingRepository settingRepository,
                     javafx.stage.Stage ownerStage,
                     Runnable onLoanCreatedCallback) {
        this(loanRepository, customerRepository, installmentRepository, createLoanUseCase, renewLoanUseCase, null, settingRepository, null, ownerStage, onLoanCreatedCallback);
    }

    public LoansView(LoanRepository loanRepository,
                     CustomerRepository customerRepository,
                     InstallmentRepository installmentRepository,
                     com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                     com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                     CancelLoanUseCase cancelLoanUseCase,
                     SystemSettingRepository settingRepository,
                     javafx.stage.Stage ownerStage,
                     Runnable onLoanCreatedCallback) {
        this(loanRepository, customerRepository, installmentRepository, createLoanUseCase, renewLoanUseCase, cancelLoanUseCase, settingRepository, null, ownerStage, onLoanCreatedCallback);
    }

    public LoansView(LoanRepository loanRepository,
                     CustomerRepository customerRepository,
                     InstallmentRepository installmentRepository,
                     com.cartera.loans.application.CreateLoanUseCase createLoanUseCase,
                     com.cartera.renewals.application.RenewLoanUseCase renewLoanUseCase,
                     CancelLoanUseCase cancelLoanUseCase,
                     SystemSettingRepository settingRepository,
                     RouteRepository routeRepository,
                     javafx.stage.Stage ownerStage,
                     Runnable onLoanCreatedCallback) {
        this.loanRepository = loanRepository;
        this.customerRepository = customerRepository;
        this.installmentRepository = installmentRepository;
        this.createLoanUseCase = createLoanUseCase;
        this.renewLoanUseCase = renewLoanUseCase;
        this.cancelLoanUseCase = cancelLoanUseCase;
        this.settingRepository = settingRepository;
        this.routeRepository = routeRepository;
        this.ownerStage = ownerStage;
        this.onLoanCreatedCallback = onLoanCreatedCallback;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildTableCard();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Créditos Otorgados");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Listado de contratos, renovaciones y control de anulación auditada");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        Button btnNewLoan = new Button("+ Otorgar Crédito");
        btnNewLoan.getStyleClass().add("btn-primary");
        btnNewLoan.setOnAction(e -> {
            if (createLoanUseCase != null) {
                new CreateLoanDialog(createLoanUseCase, customerRepository, settingRepository, loanRepository, routeRepository, ownerStage, l -> {
                    refresh();
                    if (onLoanCreatedCallback != null) onLoanCreatedCallback.run();
                }).showAndWait();
            }
        });

        Button btnMigrate = new Button("📋 Cargar Cartulina Anterior");
        btnMigrate.setStyle("-fx-background-color: #fef3c7; -fx-text-fill: #92400e; -fx-font-weight: 800; -fx-font-size: 12px; -fx-border-color: #fde68a; -fx-border-radius: 8; -fx-background-radius: 8; -fx-cursor: hand; -fx-padding: 7 14;");
        btnMigrate.setOnAction(e -> {
            if (createLoanUseCase != null) {
                var dlg = new CreateLoanDialog(createLoanUseCase, customerRepository, settingRepository, loanRepository, routeRepository, ownerStage, l -> {
                    refresh();
                    if (onLoanCreatedCallback != null) onLoanCreatedCallback.run();
                });
                dlg.setMigrationMode(true);
                dlg.showAndWait();
            }
        });

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, btnMigrate, btnNewLoan, btnRefresh);
        getChildren().add(top);
    }

    @SuppressWarnings("unchecked")
    private void buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        TableView<LoanEntity> table = new TableView<>();
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Cliente con Avatar
        TableColumn<LoanEntity, LoanEntity> colCustomer = new TableColumn<>("CLIENTE");
        colCustomer.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colCustomer.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LoanEntity l, boolean empty) {
                super.updateItem(l, empty);
                if (empty || l == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    HBox box = new HBox(12);
                    box.setAlignment(Pos.CENTER_LEFT);

                    String name = customerNames.getOrDefault(l.getCustomerId(), "Cliente #" + l.getCustomerId());
                    Label lblInitials = new Label(getInitials(name));
                    lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11px;");
                    StackPane avatar = new StackPane(lblInitials);
                    avatar.setPrefSize(34, 34);
                    avatar.setMinSize(34, 34);
                    avatar.setMaxSize(34, 34);
                    avatar.setStyle("-fx-background-color: linear-gradient(to bottom right, #0ea5e9, #0284c7); -fx-background-radius: 17;");

                    VBox textGroup = new VBox(2);
                    Label lblName = new Label(name);
                    lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px;");

                    Label lblId = new Label("Contrato ID: " + l.getId() + " • Ruta: " + (l.getRouteId() != null ? l.getRouteId() : "route-norte"));
                    lblId.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    textGroup.getChildren().addAll(lblName, lblId);
                    box.getChildren().addAll(avatar, textGroup);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colCustomer.setPrefWidth(240);

        // 2. Capital Inicial
        TableColumn<LoanEntity, LoanEntity> colPrincipal = new TableColumn<>("CAPITAL INICIAL");
        colPrincipal.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colPrincipal.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LoanEntity l, boolean empty) {
                super.updateItem(l, empty);
                if (empty || l == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label amount = new Label(CURRENCY.format(l.getPrincipal()));
                    amount.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px;");
                    Label tag = new Label("Desembolsado");
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
                    box.getChildren().addAll(amount, tag);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colPrincipal.setPrefWidth(140);

        // 3. Total Pactado
        TableColumn<LoanEntity, LoanEntity> colTotal = new TableColumn<>("TOTAL PACTADO");
        colTotal.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colTotal.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LoanEntity l, boolean empty) {
                super.updateItem(l, empty);
                if (empty || l == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label amount = new Label(CURRENCY.format(l.getTotalAgreed()));
                    amount.setStyle("-fx-text-fill: #2563eb; -fx-font-weight: bold; -fx-font-size: 13px;");
                    Label tag = new Label("Capital + Interés");
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
                    box.getChildren().addAll(amount, tag);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colTotal.setPrefWidth(150);

        // 4. Plazo y Cuotas
        TableColumn<LoanEntity, LoanEntity> colTerms = new TableColumn<>("PLAZO Y CUOTAS");
        colTerms.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colTerms.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LoanEntity l, boolean empty) {
                super.updateItem(l, empty);
                if (empty || l == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label terms = new Label(l.getInstallmentCount() + " cuotas (" + l.getFrequency() + ")");
                    terms.setStyle("-fx-text-fill: #1e293b; -fx-font-weight: 500; -fx-font-size: 13px;");
                    Label tag = new Label("Modalidad de cobro");
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
                    box.getChildren().addAll(terms, tag);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colTerms.setPrefWidth(150);

        // 5. Fecha Inicio
        TableColumn<LoanEntity, LoanEntity> colDate = new TableColumn<>("FECHA INICIO");
        colDate.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colDate.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LoanEntity l, boolean empty) {
                super.updateItem(l, empty);
                if (empty || l == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label date = new Label(l.getStartDate());
                    date.setStyle("-fx-text-fill: #334155; -fx-font-size: 13px;");
                    Label tag = new Label("Desembolso");
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
                    box.getChildren().addAll(date, tag);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colDate.setPrefWidth(120);

        // 6. Estado
        TableColumn<LoanEntity, String> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getStatus()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String text, boolean empty) {
                super.updateItem(text, empty);
                if (empty || text == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label();
                    badge.setAlignment(Pos.CENTER);
                    String base = "-fx-padding: 4 12; -fx-background-radius: 20; -fx-font-weight: bold; -fx-font-size: 11px;";
                    if ("FINALIZADO".equalsIgnoreCase(text) || "PAGADO".equalsIgnoreCase(text)) {
                        badge.setText("FINALIZADO");
                        badge.setStyle(base + "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 20;");
                    } else if ("RENOVADO".equalsIgnoreCase(text)) {
                        badge.setText("RENOVADO");
                        badge.setStyle(base + "-fx-background-color: #f5f3ff; -fx-text-fill: #6d28d9; -fx-border-color: #ddd6fe; -fx-border-radius: 20;");
                    } else if ("ANULADO".equalsIgnoreCase(text)) {
                        badge.setText("ANULADO");
                        badge.setStyle(base + "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 20;");
                    } else {
                        badge.setText(text.toUpperCase());
                        badge.setStyle(base + "-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 20;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(130);

        // 7. Acciones (Renovar y Anular Crédito solo para ADMIN/SUPERVISOR)
        TableColumn<LoanEntity, LoanEntity> colAction = new TableColumn<>("ACCIONES");
        colAction.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAction.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(LoanEntity l, boolean empty) {
                super.updateItem(l, empty);
                if (empty || l == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    if ("ACTIVO".equalsIgnoreCase(l.getStatus())) {
                        HBox box = new HBox(6);
                        box.setAlignment(Pos.CENTER_LEFT);

                        Button btnRenew = new Button("Renovar");
                        btnRenew.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 4 10; -fx-background-radius: 6; -fx-cursor: hand;");
                        btnRenew.setOnAction(e -> {
                            if (renewLoanUseCase != null) {
                                String name = customerNames.getOrDefault(l.getCustomerId(), "Cliente #" + l.getCustomerId());
                                new RenewLoanDialog(l, name, renewLoanUseCase, installmentRepository, settingRepository, ownerStage, res -> {
                                    refresh();
                                    if (onLoanCreatedCallback != null) onLoanCreatedCallback.run();
                                }).showAndWait();
                            }
                        });
                        box.getChildren().add(btnRenew);

                        // Solo ADMIN y SUPERVISOR ven el botón de Anular Crédito
                        if (cancelLoanUseCase != null && UserSessionContext.canCurrentUserReverseOrCancel()) {
                            Button btnCancelLoan = new Button("🚫 Anular");
                            btnCancelLoan.setStyle("-fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-text-fill: #dc2626; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 4 10; -fx-background-radius: 6; -fx-cursor: hand;");
                            btnCancelLoan.setOnAction(e -> promptAndCancelLoan(l));
                            box.getChildren().add(btnCancelLoan);
                        }

                        setGraphic(box);
                    } else {
                        setGraphic(null);
                    }
                    setText(null);
                }
            }
        });
        colAction.setPrefWidth(170);

        table.getColumns().addAll(colCustomer, colPrincipal, colTotal, colTerms, colDate, colStatus, colAction);
        table.setItems(loansList);

        // Footer Summary Bar
        HBox footer = new HBox(28);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);

        lblFooterCount.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        lblFooterPrincipal.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblFooterTotalAgreed.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 12px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        footer.getChildren().addAll(lblFooterCount, spacer, lblFooterPrincipal, lblFooterTotalAgreed);

        tableCard.getChildren().addAll(table, footer);
        getChildren().add(tableCard);
    }

    private void promptAndCancelLoan(LoanEntity loan) {
        if (!UserSessionContext.canCurrentUserReverseOrCancel()) {
            new Alert(Alert.AlertType.ERROR, "Operación restringida exclusivamente a Administradores y Supervisores.").showAndWait();
            return;
        }
        String customerName = customerNames.getOrDefault(loan.getCustomerId(), "Cliente #" + loan.getCustomerId());
        TextInputDialog dialog = new TextInputDialog();
        if (ownerStage != null) dialog.initOwner(ownerStage);
        dialog.setTitle("Anulación Auditada de Crédito");
        dialog.setHeaderText("🚫 Anular Crédito de " + customerName + " (" + CURRENCY.format(loan.getPrincipal()) + ")");
        dialog.setContentText("Ingrese el motivo obligatorio de auditoría:");

        Optional<String> result = dialog.showAndWait();
        if (result.isPresent()) {
            String reason = result.get().trim();
            if (reason.isEmpty()) {
                new Alert(Alert.AlertType.WARNING, "Debe especificar un motivo de auditoría válido.").showAndWait();
                return;
            }
            try {
                cancelLoanUseCase.execute(loan.getId(), reason);
                refresh();
                if (onLoanCreatedCallback != null) onLoanCreatedCallback.run();
                new Alert(Alert.AlertType.INFORMATION, "Crédito anulado y desembolso reintegrado a caja exitosamente.").showAndWait();
            } catch (Exception ex) {
                new Alert(Alert.AlertType.ERROR, ex.getMessage()).showAndWait();
            }
        }
    }

    public void refresh() {
        customerNames = customerRepository.findAll().stream()
                .collect(Collectors.toMap(CustomerEntity::getId, CustomerEntity::getFullName, (a, b) -> a));

        String selectedRoute = UserSessionContext.getSelectedRouteId();
        boolean filterRoute = selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute);

        var loans = loanRepository.findAll().stream()
                .filter(l -> !filterRoute || selectedRoute.equalsIgnoreCase(l.getRouteId() != null ? l.getRouteId() : "route-norte"))
                .toList();
        loansList.setAll(loans);

        BigDecimal sumPrincipal = loans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()))
                .map(LoanEntity::getPrincipal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal sumTotalAgreed = loans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()))
                .map(LoanEntity::getTotalAgreed)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblFooterCount.setText("Total contratos: " + loans.size());
        lblFooterPrincipal.setText("Capital total prestado: " + CURRENCY.format(sumPrincipal));
        lblFooterTotalAgreed.setText("Cartera total pactada: " + CURRENCY.format(sumTotalAgreed));
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
