package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

public class CustomersView extends VBox {
    private final CustomerRepository customerRepository;
    private final ObservableList<CustomerEntity> customerList = FXCollections.observableArrayList();

    public CustomersView(CustomerRepository customerRepository) {
        this.customerRepository = customerRepository;

        setSpacing(16);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildTable();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Directorio de Clientes");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Clientes registrados en la cartera");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar por nombre, documento...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(280);

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
        });

        Button btnRefresh = new Button("↻ Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, searchField, btnRefresh);
        getChildren().add(top);
    }

    private void buildTable() {
        TableView<CustomerEntity> table = new TableView<>();
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<CustomerEntity, String> colName = new TableColumn<>("Nombre y Documento");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFullName() + "\nCC: " + d.getValue().getDocumentNumber()));
        colName.setPrefWidth(220);

        TableColumn<CustomerEntity, String> colContact = new TableColumn<>("Contacto / Negocio");
        colContact.setCellValueFactory(d -> new SimpleStringProperty(
                (d.getValue().getBusinessName() != null ? d.getValue().getBusinessName() + "\n" : "") + "Tel: " + d.getValue().getPhone()
        ));
        colContact.setPrefWidth(200);

        TableColumn<CustomerEntity, String> colAddress = new TableColumn<>("Dirección y Barrio");
        colAddress.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getAddress() + "\n" + (d.getValue().getNeighborhood() != null ? d.getValue().getNeighborhood() : "")
        ));
        colAddress.setPrefWidth(220);

        TableColumn<CustomerEntity, String> colStatus = new TableColumn<>("Estado");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String text, boolean empty) {
                super.updateItem(text, empty);
                if (empty || text == null) {
                    setGraphic(null);
                } else {
                    Label badge = new Label(text);
                    badge.getStyleClass().add("badge-paid");
                    setGraphic(badge);
                }
            }
        });
        colStatus.setPrefWidth(120);

        table.getColumns().addAll(colName, colContact, colAddress, colStatus);
        table.setItems(customerList);

        getChildren().add(table);
    }

    public void refresh() {
        customerList.setAll(customerRepository.findAll());
    }
}
