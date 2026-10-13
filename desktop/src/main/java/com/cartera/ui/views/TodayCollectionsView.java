package com.cartera.ui.views;
 
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.infrastructure.persistence.repository.DailySettlementRepository;
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
    private final DailySettlementRepository settlementRepository;
    private final Stage primaryStage;
    private final Runnable onDataUpdated;

    private SettlementManagementView settlementView;
    private StackPane contentArea;
    private VBox routeContainer;
    private Button btnTabRoute;
    private Button btnTabSettlement;

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
                                DailySettlementRepository settlementRepository,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this.collectionsService = collectionsService;
        this.paymentUseCase = paymentUseCase;
        this.settlementUseCase = settlementUseCase;
        this.settlementRepository = settlementRepository;
        this.primaryStage = primaryStage;
        this.onDataUpdated = onDataUpdated;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildContentArea();
        refreshData();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Ruta y Liquidación Diaria");
        title.getStyleClass().add("section-title");
        lblCounter.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, lblCounter);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        // Control Segmentado Integrado
        HBox segmentBar = new HBox(4);
        segmentBar.getStyleClass().add("segment-bar");
        segmentBar.setAlignment(Pos.CENTER);

        btnTabRoute = new Button("Ruta y Cobros de Hoy");
        btnTabRoute.getStyleClass().addAll("segment-btn", "segment-btn-active");
        btnTabRoute.setOnAction(e -> showSection("route"));

        btnTabSettlement = new Button("Cuadre y Liquidación Diaria");
        btnTabSettlement.getStyleClass().add("segment-btn");
        btnTabSettlement.setOnAction(e -> showSection("settlement"));

        segmentBar.getChildren().addAll(btnTabRoute, btnTabSettlement);

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refreshData());

        top.getChildren().addAll(titleBox, segmentBar, btnRefresh);
        getChildren().add(top);
    }

    private void showSection(String section) {
        btnTabRoute.getStyleClass().remove("segment-btn-active");
        btnTabSettlement.getStyleClass().remove("segment-btn-active");

        if ("settlement".equalsIgnoreCase(section)) {
            btnTabSettlement.getStyleClass().add("segment-btn-active");
            if (settlementView != null) {
                settlementView.refresh();
                contentArea.getChildren().setAll(settlementView);
            }
        } else {
            btnTabRoute.getStyleClass().add("segment-btn-active");
            contentArea.getChildren().setAll(routeContainer);
        }
    }

    private void buildContentArea() {
        contentArea = new StackPane();
        VBox.setVgrow(contentArea, Priority.ALWAYS);

        // Contenedor de Ruta
        routeContainer = new VBox(14);
        VBox.setVgrow(routeContainer, Priority.ALWAYS);

        HBox searchRow = new HBox(12);
        searchRow.setAlignment(Pos.CENTER_LEFT);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar cliente por nombre, cédula, dirección o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(380);

        FilteredList<CollectionItem> filtered = new FilteredList<>(masterData, p -> true);
        searchField.textProperty().addListener((obs, oldVal, newVal) -> {
            filtered.setPredicate(item -> {
                if (newVal == null || newVal.isBlank()) return true;
                String q = newVal.toLowerCase().trim();
                return item.fullName().toLowerCase().contains(q)
                        || item.documentNumber().toLowerCase().contains(q)
                        || item.address().toLowerCase().contains(q)
                        || item.neighborhood().toLowerCase().contains(q)
                        || item.businessName().toLowerCase().contains(q);
            });
            updateStats(filtered.size());
        });
        table.setItems(filtered);

        searchRow.getChildren().add(searchField);
        routeContainer.getChildren().addAll(searchRow, buildTableCard());

        // Contenedor de Liquidación
        if (settlementUseCase != null && settlementRepository != null) {
            settlementView = new SettlementManagementView(settlementUseCase, settlementRepository);
            settlementView.setPadding(new Insets(0));
        }

        contentArea.getChildren().setAll(routeContainer);
        getChildren().add(contentArea);
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
                    name.setStyle("-fx-text-fill: #f8fafc; -fx-font-weight: bold; -fx-font-size: 13px;");

                    String sub = (item.businessName().isBlank() ? "" : item.businessName() + " • ") + item.phone();
                    Label subtitle = new Label(sub);
                    subtitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");

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
                    Label address = new Label(item.address());
                    address.setStyle("-fx-text-fill: #e2e8f0; -fx-font-size: 13px; -fx-font-weight: 500;");

                    Label neighborhood = new Label("Barrio " + item.neighborhood());
                    neighborhood.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(address, neighborhood);
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
                            ? "-fx-text-fill: #10b981; -fx-font-weight: bold; -fx-font-size: 13px;"
                            : "-fx-text-fill: #94a3b8; -fx-font-weight: bold; -fx-font-size: 13px;");

                    Label tag = new Label("Cuota #" + item.installmentNumber());
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(amount, tag);
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
                    amount.setStyle("-fx-text-fill: #38bdf8; -fx-font-weight: bold; -fx-font-size: 13px;");

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
                        badge.setStyle(baseStyle + "-fx-background-color: rgba(16, 185, 129, 0.15); -fx-text-fill: #34d399; -fx-border-color: rgba(16, 185, 129, 0.3); -fx-border-radius: 20;");
                    } else if (item.statusText().contains("VENCIDA")) {
                        badge.setText("VENCIDA");
                        badge.setStyle(baseStyle + "-fx-background-color: rgba(239, 68, 68, 0.15); -fx-text-fill: #f87171; -fx-border-color: rgba(239, 68, 68, 0.3); -fx-border-radius: 20;");
                    } else {
                        badge.setText("COBRO HOY");
                        badge.setStyle(baseStyle + "-fx-background-color: rgba(56, 189, 248, 0.15); -fx-text-fill: #38bdf8; -fx-border-color: rgba(56, 189, 248, 0.3); -fx-border-radius: 20;");
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
                        btnPay.setText("Al día");
                        btnPay.setDisable(true);
                        btnPay.setStyle("-fx-background-color: rgba(51, 65, 85, 0.5); -fx-text-fill: #94a3b8; -fx-font-size: 12px; -fx-font-weight: 500; -fx-padding: 6 14; -fx-background-radius: 6; -fx-border-color: #334155; -fx-border-radius: 6;");
                    } else {
                        btnPay.setText("Cobrar");
                        btnPay.setDisable(false);
                        btnPay.setStyle("-fx-background-color: linear-gradient(to right, #10b981, #059669); -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 6 16; -fx-background-radius: 6; -fx-cursor: hand;");
                    }
                    setGraphic(btnPay);
                }
            }
        });
        colAction.setPrefWidth(120);

        table.getColumns().addAll(colCustomer, colAddress, colCuota, colBalance, colStatus, colAction);

        // Footer Summary Bar
        HBox footer = new HBox(28);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);

        lblFooterClients.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        lblFooterPending.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        lblFooterTotalCuotas.setStyle("-fx-text-fill: #10b981; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblFooterTotalBalance.setStyle("-fx-text-fill: #38bdf8; -fx-font-size: 12px; -fx-font-weight: bold;");

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
        if (settlementView != null) {
            settlementView.refresh();
        }
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
}
