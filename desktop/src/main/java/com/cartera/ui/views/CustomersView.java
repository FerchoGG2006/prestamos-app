package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import javafx.beans.property.SimpleObjectProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

public class CustomersView extends VBox {
    private final CustomerRepository customerRepository;
    private final com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase;
    private final javafx.stage.Stage ownerStage;
    private final ObservableList<CustomerEntity> customerList = FXCollections.observableArrayList();
    private final Label lblFooterTotal = new Label();
    private final TableView<CustomerEntity> table = new TableView<>();

    public CustomersView(CustomerRepository customerRepository,
                         com.cartera.customers.application.CreateCustomerUseCase createCustomerUseCase,
                         javafx.stage.Stage ownerStage) {
        this.customerRepository = customerRepository;
        this.createCustomerUseCase = createCustomerUseCase;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildTableCard();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Directorio de Clientes");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Clientes registrados y cartera deudora");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar por nombre, documento o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(300);

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

        Button btnNewCustomer = new Button("+ Registrar Cliente");
        btnNewCustomer.getStyleClass().add("btn-primary");
        btnNewCustomer.setOnAction(e -> {
            if (createCustomerUseCase != null) {
                new CustomerDialog(createCustomerUseCase, ownerStage, c -> refresh()).showAndWait();
            }
        });

        Button btnRefresh = new Button("↻");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, searchField, btnNewCustomer, btnRefresh);
        getChildren().add(top);
    }

    @SuppressWarnings("unchecked")
    private void buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        // 1. Nombre con Avatar
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
                    HBox box = new HBox(12);
                    box.setAlignment(Pos.CENTER_LEFT);

                    Label lblInitials = new Label(getInitials(c.getFullName()));
                    lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11px;");
                    StackPane avatar = new StackPane(lblInitials);
                    avatar.setPrefSize(34, 34);
                    avatar.setMinSize(34, 34);
                    avatar.setMaxSize(34, 34);
                    avatar.setStyle("-fx-background-color: linear-gradient(to bottom right, #6366f1, #4338ca); -fx-background-radius: 17;");

                    VBox textGroup = new VBox(2);
                    Label name = new Label(c.getFullName());
                    name.setStyle("-fx-text-fill: #f8fafc; -fx-font-weight: bold; -fx-font-size: 13px;");

                    Label doc = new Label("CC: " + c.getDocumentNumber());
                    doc.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");

                    textGroup.getChildren().addAll(name, doc);
                    box.getChildren().addAll(avatar, textGroup);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colName.setPrefWidth(260);

        // 2. Contacto / Negocio
        TableColumn<CustomerEntity, CustomerEntity> colContact = new TableColumn<>("CONTACTO / NEGOCIO");
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
                    String biz = (c.getBusinessName() != null && !c.getBusinessName().isBlank()) ? c.getBusinessName() : "Particular";
                    Label lblBiz = new Label(biz);
                    lblBiz.setStyle("-fx-text-fill: #e2e8f0; -fx-font-size: 13px; -fx-font-weight: 500;");

                    Label lblPhone = new Label("📞 " + (c.getPhone() != null ? c.getPhone() : "Sin teléfono"));
                    lblPhone.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(lblBiz, lblPhone);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colContact.setPrefWidth(220);

        // 3. Dirección y Barrio
        TableColumn<CustomerEntity, CustomerEntity> colAddress = new TableColumn<>("DIRECCIÓN Y BARRIO");
        colAddress.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAddress.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CustomerEntity c, boolean empty) {
                super.updateItem(c, empty);
                if (empty || c == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label address = new Label(c.getAddress() != null ? c.getAddress() : "-");
                    address.setStyle("-fx-text-fill: #e2e8f0; -fx-font-size: 13px; -fx-font-weight: 500;");

                    String b = (c.getNeighborhood() != null && !c.getNeighborhood().isBlank()) ? "📍 Barrio " + c.getNeighborhood() : "Sin barrio";
                    Label neighborhood = new Label(b);
                    neighborhood.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(address, neighborhood);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colAddress.setPrefWidth(240);

        // 4. Estado
        TableColumn<CustomerEntity, String> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getStatus()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String text, boolean empty) {
                super.updateItem(text, empty);
                if (empty || text == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label("●  " + text.toUpperCase());
                    badge.setAlignment(Pos.CENTER);
                    badge.setStyle("-fx-padding: 4 12; -fx-background-radius: 20; -fx-font-weight: bold; -fx-font-size: 11px;"
                            + "-fx-background-color: rgba(16, 185, 129, 0.15); -fx-text-fill: #34d399; -fx-border-color: rgba(16, 185, 129, 0.3); -fx-border-radius: 20;");
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(140);

        table.getColumns().addAll(colName, colContact, colAddress, colStatus);

        // Footer Summary Bar
        HBox footer = new HBox(28);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);

        lblFooterTotal.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        footer.getChildren().add(lblFooterTotal);

        tableCard.getChildren().addAll(table, footer);
        getChildren().add(tableCard);
    }

    public void refresh() {
        customerList.setAll(customerRepository.findAll());
        updateStats(customerList.size());
    }

    private void updateStats(int count) {
        lblFooterTotal.setText("👥 Total de clientes registrados: " + count);
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
