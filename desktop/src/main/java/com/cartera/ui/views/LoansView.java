package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.text.NumberFormat;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

public class LoansView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final LoanRepository loanRepository;
    private final CustomerRepository customerRepository;
    private final ObservableList<LoanEntity> loansList = FXCollections.observableArrayList();
    private Map<String, String> customerNames = Map.of();

    public LoansView(LoanRepository loanRepository, CustomerRepository customerRepository) {
        this.loanRepository = loanRepository;
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
        Label title = new Label("Créditos Otorgados");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Listado de contratos y acuerdos de pago");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        Button btnRefresh = new Button("↻ Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, btnRefresh);
        getChildren().add(top);
    }

    private void buildTable() {
        TableView<LoanEntity> table = new TableView<>();
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<LoanEntity, String> colCustomer = new TableColumn<>("Cliente");
        colCustomer.setCellValueFactory(d -> new SimpleStringProperty(
                customerNames.getOrDefault(d.getValue().getCustomerId(), "ID: " + d.getValue().getCustomerId())
        ));
        colCustomer.setPrefWidth(220);

        TableColumn<LoanEntity, String> colPrincipal = new TableColumn<>("Capital Inicial");
        colPrincipal.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getPrincipal())));
        colPrincipal.setPrefWidth(140);

        TableColumn<LoanEntity, String> colTotal = new TableColumn<>("Total Pactado");
        colTotal.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().getTotalAgreed())));
        colTotal.setPrefWidth(140);

        TableColumn<LoanEntity, String> colTerms = new TableColumn<>("Plazo y Cuotas");
        colTerms.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getInstallmentCount() + " cuotas (" + d.getValue().getFrequency() + ")"
        ));
        colTerms.setPrefWidth(160);

        TableColumn<LoanEntity, String> colDate = new TableColumn<>("Fecha Inicio");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStartDate()));
        colDate.setPrefWidth(120);

        TableColumn<LoanEntity, String> colStatus = new TableColumn<>("Estado");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getStatus()));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String text, boolean empty) {
                super.updateItem(text, empty);
                if (empty || text == null) {
                    setGraphic(null);
                } else {
                    Label badge = new Label(text);
                    if ("FINALIZADO".equalsIgnoreCase(text)) {
                        badge.getStyleClass().add("badge-paid");
                    } else {
                        badge.getStyleClass().add("badge-today");
                    }
                    setGraphic(badge);
                }
            }
        });
        colStatus.setPrefWidth(120);

        table.getColumns().addAll(colCustomer, colPrincipal, colTotal, colTerms, colDate, colStatus);
        table.setItems(loansList);

        getChildren().add(table);
    }

    public void refresh() {
        customerNames = customerRepository.findAll().stream()
                .collect(Collectors.toMap(CustomerEntity::getId, CustomerEntity::getFullName, (a, b) -> a));
        loansList.setAll(loanRepository.findAll());
    }
}
