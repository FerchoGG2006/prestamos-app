package com.cartera.ui.views;

import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * Vista unificada de Gestión de Cartera.
 * Agrupa el directorio de Clientes, la cartera de Créditos/Préstamos
 * y la verificación de Historial Crediticio bajo una navegación segmentada rápida.
 */
public class PortfolioManagementView extends BorderPane {

    private final CustomersView customersView;
    private final LoansView loansView;
    private final CreditHistoryView creditHistoryView;
    private final Button btnCustomers;
    private final Button btnLoans;
    private final Button btnHistory;
    private final Label subTitle;

    public PortfolioManagementView(CustomersView customersView, LoansView loansView, CreditHistoryView creditHistoryView) {
        this.customersView = customersView;
        this.loansView = loansView;
        this.creditHistoryView = creditHistoryView;

        setPadding(new Insets(0));
        setStyle("-fx-background-color: #f8fafc;");

        // Barra de herramientas superior con selector segmentado
        var topBar = new HBox(16);
        topBar.setAlignment(Pos.CENTER_LEFT);
        topBar.setPadding(new Insets(16, 28, 12, 28));
        topBar.setStyle("-fx-background-color: #ffffff; -fx-border-color: #e2e8f0; -fx-border-width: 0 0 1 0;");

        var titleBox = new VBox(2);
        var mainTitle = new Label("Gestión de Cartera");
        mainTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");
        subTitle = new Label("Directorio de Clientes registrados");
        subTitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(mainTitle, subTitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Segmented Control
        var segmentBar = new HBox(4);
        segmentBar.getStyleClass().add("segment-bar");
        segmentBar.setAlignment(Pos.CENTER);

        btnCustomers = new Button("Directorio de Clientes");
        btnCustomers.getStyleClass().addAll("segment-btn", "segment-btn-active");
        btnCustomers.setOnAction(e -> showSection("customers"));

        btnLoans = new Button("Créditos y Préstamos");
        btnLoans.getStyleClass().add("segment-btn");
        btnLoans.setOnAction(e -> showSection("loans"));

        btnHistory = new Button("Historial Crediticio");
        btnHistory.getStyleClass().add("segment-btn");
        btnHistory.setOnAction(e -> showSection("history"));

        segmentBar.getChildren().addAll(btnCustomers, btnLoans, btnHistory);

        topBar.getChildren().addAll(titleBox, spacer, segmentBar);
        setTop(topBar);

        // Vista por defecto: Clientes
        showSection("customers");
    }

    public void showSection(String section) {
        btnCustomers.getStyleClass().remove("segment-btn-active");
        btnLoans.getStyleClass().remove("segment-btn-active");
        btnHistory.getStyleClass().remove("segment-btn-active");

        if ("loans".equalsIgnoreCase(section)) {
            btnLoans.getStyleClass().add("segment-btn-active");
            subTitle.setText("Administración, cronogramas y saldos de créditos");
            loansView.refresh();
            setCenter(loansView);
        } else if ("history".equalsIgnoreCase(section)) {
            btnHistory.getStyleClass().add("segment-btn-active");
            subTitle.setText("Consulta por cédula de solvencia y calificación de pago");
            if (creditHistoryView != null) creditHistoryView.refresh();
            setCenter(creditHistoryView);
        } else {
            btnCustomers.getStyleClass().add("segment-btn-active");
            subTitle.setText("Directorio de Clientes registrados en el sistema");
            customersView.refresh();
            setCenter(customersView);
        }
    }

    public void refresh() {
        if (getCenter() == loansView) {
            loansView.refresh();
        } else if (getCenter() == creditHistoryView && creditHistoryView != null) {
            creditHistoryView.refresh();
        } else {
            customersView.refresh();
        }
    }
}
