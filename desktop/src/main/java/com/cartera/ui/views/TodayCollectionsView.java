package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.payments.application.RecordPaymentUseCase;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

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
    private final Stage primaryStage;
    private final Runnable onDataUpdated;

    private final ObservableList<CollectionItem> masterData = FXCollections.observableArrayList();
    private final TableView<CollectionItem> table = new TableView<>();
    private final Label lblCounter = new Label();

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this.collectionsService = collectionsService;
        this.paymentUseCase = paymentUseCase;
        this.primaryStage = primaryStage;
        this.onDataUpdated = onDataUpdated;

        setSpacing(16);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildTable();
        refreshData();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Cobros de Hoy — Ruta Norte");
        title.getStyleClass().add("section-title");
        lblCounter.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, lblCounter);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar cliente, documento o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(300);

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
            updateCounter(filtered.size());
        });
        table.setItems(filtered);

        Button btnRefresh = new Button("↻ Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refreshData());

        top.getChildren().addAll(titleBox, searchField, btnRefresh);
        getChildren().add(top);
    }

    private void buildTable() {
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(table, Priority.ALWAYS);

        // Columna Cliente
        TableColumn<CollectionItem, String> colCustomer = new TableColumn<>("Cliente");
        colCustomer.setCellValueFactory(data -> new SimpleStringProperty(
                data.getValue().fullName() + "\n" + (data.getValue().businessName().isBlank() ? "" : data.getValue().businessName() + " • ") + data.getValue().phone()
        ));
        colCustomer.setPrefWidth(220);

        // Columna Dirección
        TableColumn<CollectionItem, String> colAddress = new TableColumn<>("Dirección / Barrio");
        colAddress.setCellValueFactory(data -> new SimpleStringProperty(
                data.getValue().address() + "\nBarrio " + data.getValue().neighborhood()
        ));
        colAddress.setPrefWidth(200);

        // Columna Cuota Hoy
        TableColumn<CollectionItem, String> colCuota = new TableColumn<>("Cuota del Día");
        colCuota.setCellValueFactory(data -> new SimpleStringProperty(
                CURRENCY.format(data.getValue().installmentPending()) + " (Cuota #" + data.getValue().installmentNumber() + ")"
        ));
        colCuota.setPrefWidth(160);

        // Columna Saldo
        TableColumn<CollectionItem, String> colBalance = new TableColumn<>("Saldo Total");
        colBalance.setCellValueFactory(data -> new SimpleStringProperty(
                CURRENCY.format(data.getValue().loanBalance())
        ));
        colBalance.setPrefWidth(130);

        // Columna Estado (Badge)
        TableColumn<CollectionItem, String> colStatus = new TableColumn<>("Estado");
        colStatus.setCellValueFactory(data -> new SimpleStringProperty(data.getValue().statusText()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String text, boolean empty) {
                super.updateItem(text, empty);
                if (empty || text == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label(text);
                    if (text.contains("PAGADO") || text.contains("AL DÍA")) {
                        badge.getStyleClass().add("badge-paid");
                    } else if (text.contains("MORA")) {
                        badge.getStyleClass().add("badge-overdue");
                    } else {
                        badge.getStyleClass().add("badge-today");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(140);

        // Columna Acción
        TableColumn<CollectionItem, Void> colAction = new TableColumn<>("Acción");
        colAction.setCellFactory(col -> new TableCell<>() {
            private final Button btnPay = new Button("Cobrar");
            {
                btnPay.getStyleClass().add("btn-success");
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
                        btnPay.setText("✓ Al día");
                        btnPay.setDisable(true);
                        btnPay.setStyle("-fx-background-color: #334155; -fx-text-fill: #94a3b8;");
                    } else {
                        btnPay.setText("Cobrar");
                        btnPay.setDisable(false);
                        btnPay.setStyle("-fx-background-color: #10b981; -fx-text-fill: white; -fx-font-weight: bold;");
                    }
                    setGraphic(btnPay);
                }
            }
        });
        colAction.setPrefWidth(110);

        table.getColumns().addAll(colCustomer, colAddress, colCuota, colBalance, colStatus, colAction);
        getChildren().add(table);
    }

    public void refreshData() {
        var items = collectionsService.getTodayCollectionItems(LocalDate.now());
        masterData.setAll(items);
        updateCounter(items.size());
    }

    private void updateCounter(int total) {
        long pending = masterData.stream().filter(i -> !i.isPaidToday()).count();
        lblCounter.setText(total + " clientes en ruta • " + pending + " pendientes de cobro");
    }
}
