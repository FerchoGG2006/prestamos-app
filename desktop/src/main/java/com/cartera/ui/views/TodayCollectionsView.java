package com.cartera.ui.views;
 
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import javafx.beans.property.SimpleObjectProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.Locale;

public class TodayCollectionsView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final TodayCollectionsService collectionsService;
    private final RecordPaymentUseCase paymentUseCase;
    private final SettlementUseCase settlementUseCase;
    private final CashMovementRepository cashMovementRepository;
    private final Stage primaryStage;
    private final Runnable onDataUpdated;

    private VBox routeContainer;

    private final ObservableList<CollectionItem> masterData = FXCollections.observableArrayList();
    private final TableView<CollectionItem> table = new TableView<>();
    private final Label lblCounter = new Label();

    private final Label lblFooterClients = new Label();
    private final Label lblFooterPending = new Label();
    private final Label lblFooterTotalCuotas = new Label();
    private final Label lblFooterTotalBalance = new Label();

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this(collectionsService, paymentUseCase, null, null, primaryStage, onDataUpdated);
    }

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                SettlementUseCase settlementUseCase,
                                CashMovementRepository cashMovementRepository,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this.collectionsService = collectionsService;
        this.paymentUseCase = paymentUseCase;
        this.settlementUseCase = settlementUseCase;
        this.cashMovementRepository = cashMovementRepository;
        this.primaryStage = primaryStage;
        this.onDataUpdated = onDataUpdated;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildContentArea();
        refreshData();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Ruta y Cobros de Hoy");
        title.getStyleClass().add("section-title");
        lblCounter.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, lblCounter);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        Button btnReportExpense = new Button("+ Reportar Gasto de Ruta");
        btnReportExpense.setStyle("-fx-background-color: #ea580c; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 7 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnReportExpense.setOnAction(e -> openReportExpenseDialog());

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refreshData());

        top.getChildren().addAll(titleBox, btnReportExpense, btnRefresh);
        getChildren().add(top);
    }

    private void openReportExpenseDialog() {
        String collectorId = com.cartera.infrastructure.security.UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::userId)
                .orElse("usr-col-1");
        RouteExpenseDialog.show(primaryStage, collectorId, "route-1", settlementUseCase, saved -> {
            if (saved) {
                refreshData();
                if (onDataUpdated != null) onDataUpdated.run();
            }
        });
    }

    private void buildContentArea() {
        // Contenedor de Ruta puro para el cobrador
        routeContainer = new VBox(14);
        VBox.setVgrow(routeContainer, Priority.ALWAYS);

        HBox searchRow = new HBox(12);
        searchRow.setAlignment(Pos.CENTER_LEFT);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar cliente por nombre, cédula, dirección o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(380);

        Label lblFreq = new Label("Modalidad:");
        lblFreq.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-font-weight: bold;");

        ComboBox<String> cmbFreqFilter = new ComboBox<>();
        cmbFreqFilter.getItems().addAll("TODAS", "DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFreqFilter.setValue("TODAS");
        cmbFreqFilter.getStyleClass().add("search-field");
        cmbFreqFilter.setPrefWidth(140);

        FilteredList<CollectionItem> filtered = new FilteredList<>(masterData, p -> true);
        Runnable applyFilter = () -> {
            String q = searchField.getText() != null ? searchField.getText().toLowerCase().trim() : "";
            String selectedFreq = cmbFreqFilter.getValue();
            filtered.setPredicate(item -> {
                boolean matchesFreq = selectedFreq == null || "TODAS".equalsIgnoreCase(selectedFreq)
                        || selectedFreq.equalsIgnoreCase(item.frequency());
                if (!matchesFreq) return false;
                if (q.isBlank()) return true;
                return item.fullName().toLowerCase().contains(q)
                        || item.documentNumber().toLowerCase().contains(q)
                        || item.address().toLowerCase().contains(q)
                        || item.neighborhood().toLowerCase().contains(q)
                        || item.businessName().toLowerCase().contains(q);
            });
            updateStats(filtered.size());
        };

        searchField.textProperty().addListener((obs, oldVal, newVal) -> applyFilter.run());
        cmbFreqFilter.valueProperty().addListener((obs, oldVal, newVal) -> applyFilter.run());
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnSyncMobile = new Button("📥 Importar Móvil (JSON)");
        btnSyncMobile.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 7 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnSyncMobile.setOnAction(e -> {
            new ImportMobileSyncDialog(primaryStage, paymentUseCase, cashMovementRepository, () -> {
                refreshData();
                if (onDataUpdated != null) onDataUpdated.run();
            }).show();
        });

        routeContainer.getChildren().addAll(searchRow, buildTableCard());
        getChildren().add(routeContainer);
    }

    @SuppressWarnings("unchecked")
    private VBox buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Columna Cliente con Avatar
        TableColumn<CollectionItem, CollectionItem> colCustomer = new TableColumn<>("CLIENTE");
        colCustomer.setCellValueFactory(data -> new SimpleObjectProperty<>(data.getValue()));
        colCustomer.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CollectionItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    HBox box = new HBox(12);
                    box.setAlignment(Pos.CENTER_LEFT);

                    Label lblInitials = new Label(getInitials(item.fullName()));
                    lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11px;");
                    StackPane avatar = new StackPane(lblInitials);
                    avatar.setPrefSize(34, 34);
                    avatar.setMinSize(34, 34);
                    avatar.setMaxSize(34, 34);
                    avatar.setStyle("-fx-background-color: linear-gradient(to bottom right, #3b82f6, #1d4ed8); -fx-background-radius: 17;");

                    VBox textGroup = new VBox(2);
                    Label name = new Label(item.fullName());
                    name.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px;");

                    String sub = (item.businessName().isBlank() ? "" : item.businessName() + " • ") + item.phone();
                    Label subtitle = new Label(sub);
                    subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    textGroup.getChildren().addAll(name, subtitle);
                    box.getChildren().addAll(avatar, textGroup);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colCustomer.setPrefWidth(240);

        // 2. Columna Dirección con Pin
        TableColumn<CollectionItem, CollectionItem> colAddress = new TableColumn<>("DIRECCIÓN / BARRIO");
        colAddress.setCellValueFactory(data -> new SimpleObjectProperty<>(data.getValue()));
        colAddress.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CollectionItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);

                    HBox addrRow = new HBox(6);
                    addrRow.setAlignment(Pos.CENTER_LEFT);
                    Label address = new Label(item.address());
                    address.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 13px; -fx-font-weight: 500;");

                    Button btnMap = new Button("📍");
                    btnMap.setStyle("-fx-background-color: transparent; -fx-cursor: hand; -fx-padding: 0 4; -fx-font-size: 11px;");
                    btnMap.setTooltip(new Tooltip("Ver en Google Maps"));
                    btnMap.setOnAction(e -> openMap(item.address(), item.neighborhood()));
                    addrRow.getChildren().addAll(address, btnMap);

                    Label neighborhood = new Label("Barrio " + item.neighborhood());
                    neighborhood.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(addrRow, neighborhood);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colAddress.setPrefWidth(210);

        // 3. Columna Cuota del Día
        TableColumn<CollectionItem, CollectionItem> colCuota = new TableColumn<>("CUOTA DEL DÍA");
        colCuota.setCellValueFactory(data -> new SimpleObjectProperty<>(data.getValue()));
        colCuota.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CollectionItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);

                    boolean isPending = item.installmentPending().compareTo(BigDecimal.ZERO) > 0;
                    Label amount = new Label(CURRENCY.format(item.installmentPending()));
                    amount.setStyle(isPending
                            ? "-fx-text-fill: #059669; -fx-font-weight: bold; -fx-font-size: 13px;"
                            : "-fx-text-fill: #94a3b8; -fx-font-weight: bold; -fx-font-size: 13px;");

                    HBox tagBox = new HBox(6);
                    tagBox.setAlignment(Pos.CENTER_LEFT);

                    Label tag = new Label("Cuota #" + item.installmentNumber());
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    Label freqTag = new Label(item.frequency());
                    freqTag.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-font-size: 9px; -fx-font-weight: bold; -fx-padding: 1 5 1 5; -fx-background-radius: 4; -fx-border-color: #bfdbfe; -fx-border-radius: 4;");

                    tagBox.getChildren().addAll(tag, freqTag);
                    box.getChildren().addAll(amount, tagBox);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colCuota.setPrefWidth(160);

        // 4. Columna Saldo Total
        TableColumn<CollectionItem, CollectionItem> colBalance = new TableColumn<>("SALDO TOTAL");
        colBalance.setCellValueFactory(data -> new SimpleObjectProperty<>(data.getValue()));
        colBalance.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CollectionItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label amount = new Label(CURRENCY.format(item.loanBalance()));
                    amount.setStyle("-fx-text-fill: #2563eb; -fx-font-weight: bold; -fx-font-size: 13px;");

                    Label tag = new Label("Saldo crédito");
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(amount, tag);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colBalance.setPrefWidth(140);

        // 5. Columna Estado (Pill Badge)
        TableColumn<CollectionItem, CollectionItem> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(data -> new SimpleObjectProperty<>(data.getValue()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CollectionItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label();
                    badge.setAlignment(Pos.CENTER);
                    String baseStyle = "-fx-padding: 4 12; -fx-background-radius: 20; -fx-font-weight: bold; -fx-font-size: 11px;";

                    if (item.isPaidToday()) {
                        badge.setText("AL DÍA / PAGADO");
                        badge.setStyle(baseStyle + "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 20;");
                    } else if (item.statusText().contains("VENCIDA")) {
                        badge.setText("VENCIDA");
                        badge.setStyle(baseStyle + "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 20;");
                    } else {
                        badge.setText("COBRO HOY");
                        badge.setStyle(baseStyle + "-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 20;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(150);

        // 6. Columna Acción
        TableColumn<CollectionItem, Void> colAction = new TableColumn<>("ACCIÓN");
        colAction.setCellFactory(col -> new TableCell<>() {
            private final Button btnPay = new Button("Cobrar");
            {
                btnPay.setOnAction(e -> {
                    CollectionItem item = getTableView().getItems().get(getIndex());
                    PaymentDialog.show(primaryStage, item, paymentUseCase, success -> {
                        if (success) {
                            refreshData();
                            if (onDataUpdated != null) onDataUpdated.run();
                        }
                    });
                });
            }

            @Override
            protected void updateItem(Void val, boolean empty) {
                super.updateItem(val, empty);
                if (empty) {
                    setGraphic(null);
                } else {
                    CollectionItem item = getTableView().getItems().get(getIndex());
                    if (item.isPaidToday()) {
                        HBox actBox = new HBox(6);
                        actBox.setAlignment(Pos.CENTER);

                        Button btnExtra = new Button("Abonar +");
                        btnExtra.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 10; -fx-background-radius: 6; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-cursor: hand;");
                        btnExtra.setOnAction(e -> {
                            PaymentDialog.show(primaryStage, item, paymentUseCase, success -> {
                                if (success) {
                                    refreshData();
                                    if (onDataUpdated != null) onDataUpdated.run();
                                }
                            });
                        });

                        Button btnReceipt = new Button("Recibo");
                        btnReceipt.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 10; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-cursor: hand;");
                        btnReceipt.setOnAction(e -> showReceiptFor(item));

                        actBox.getChildren().addAll(btnExtra, btnReceipt);
                        setGraphic(actBox);
                    } else {
                        btnPay.setText("Cobrar");
                        btnPay.setDisable(false);
                        btnPay.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 6 16; -fx-background-radius: 6; -fx-cursor: hand; -fx-effect: dropshadow(gaussian, rgba(5,150,105,0.2), 4, 0, 0, 1);");
                        setGraphic(btnPay);
                    }
                }
            }
        });
        colAction.setPrefWidth(160);

        table.getColumns().addAll(colCustomer, colAddress, colCuota, colBalance, colStatus, colAction);

        // Footer Summary Bar
        HBox footer = new HBox(28);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);

        lblFooterClients.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        lblFooterPending.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        lblFooterTotalCuotas.setStyle("-fx-text-fill: #059669; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblFooterTotalBalance.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 12px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        footer.getChildren().addAll(lblFooterClients, lblFooterPending, spacer, lblFooterTotalCuotas, lblFooterTotalBalance);

        tableCard.getChildren().addAll(table, footer);
        return tableCard;
    }

    public void refreshData() {
        var items = collectionsService.getTodayCollectionItems(LocalDate.now());
        masterData.setAll(items);
        updateStats(items.size());
    }

    private void updateStats(int total) {
        long pending = masterData.stream().filter(i -> !i.isPaidToday()).count();
        BigDecimal totalCuotas = masterData.stream()
                .filter(i -> !i.isPaidToday())
                .map(CollectionItem::installmentPending)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalBalance = masterData.stream()
                .map(CollectionItem::loanBalance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblCounter.setText(total + " clientes en ruta • " + pending + " pendientes de cobro");
        lblFooterClients.setText("Total en ruta: " + total);
        lblFooterPending.setText("Pendientes hoy: " + pending);
        lblFooterTotalCuotas.setText("Cuotas hoy: " + CURRENCY.format(totalCuotas));
        lblFooterTotalBalance.setText("Cartera total: " + CURRENCY.format(totalBalance));
    }

    private static String getInitials(String fullName) {
        if (fullName == null || fullName.isBlank()) return "CL";
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length >= 2) {
            return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
        }
        return fullName.substring(0, Math.min(2, fullName.length())).toUpperCase();
    }

    private void openMap(String address, String neighborhood) {
        try {
            String query = java.net.URLEncoder.encode(address + ", " + neighborhood + ", Colombia", java.nio.charset.StandardCharsets.UTF_8);
            if (java.awt.Desktop.isDesktopSupported() && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                java.awt.Desktop.getDesktop().browse(new java.net.URI("https://www.google.com/maps/search/?api=1&query=" + query));
            }
        } catch (Exception ignored) {}
    }

    private void showReceiptFor(CollectionItem item) {
        ReceiptDialog.ReceiptData rData = new ReceiptDialog.ReceiptData(
                "REC-" + (item.loanId().length() > 8 ? item.loanId().substring(0, 8) : item.loanId()),
                item.fullName(),
                item.documentNumber(),
                item.loanId(),
                item.installmentAmount(),
                item.loanBalance(),
                1,
                "Cobrador de Ruta",
                "EFECTIVO",
                "SISTEMA DE CARTERA",
                item.phone()
        );
        new ReceiptDialog(rData, primaryStage).show();
    }
}
