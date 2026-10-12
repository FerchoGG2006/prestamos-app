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
 * Vista unificada de Tesorería y Cierres.
 * Integra el Flujo y Arqueo de Caja con las Liquidaciones de Ruta y Cierre de Cobradores.
 */
public class TreasuryManagementView extends BorderPane {

    private final CashManagementView cashManagementView;
    private final SettlementManagementView settlementManagementView;

    private final Button btnCash;
    private final Button btnSettlements;
    private final Label subTitle;

    public TreasuryManagementView(CashManagementView cashManagementView,
                                  SettlementManagementView settlementManagementView) {
        this.cashManagementView = cashManagementView;
        this.settlementManagementView = settlementManagementView;

        setPadding(new Insets(0));
        setStyle("-fx-background-color: #0f172a;");

        // Barra superior con selector segmentado
        var topBar = new HBox(16);
        topBar.setAlignment(Pos.CENTER_LEFT);
        topBar.setPadding(new Insets(16, 28, 12, 28));
        topBar.setStyle("-fx-background-color: #131d31; -fx-border-color: #334155; -fx-border-width: 0 0 1 0;");

        var titleBox = new VBox(2);
        var mainTitle = new Label("Tesorería y Cierres");
        mainTitle.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 18px; -fx-font-weight: bold;");
        subTitle = new Label("Control de efectivo, ingresos por cobros y arqueos");
        subTitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(mainTitle, subTitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Segmented Control
        var segmentBar = new HBox(4);
        segmentBar.getStyleClass().add("segment-bar");
        segmentBar.setAlignment(Pos.CENTER);

        btnCash = new Button("💵  Arqueo y Caja");
        btnCash.getStyleClass().addAll("segment-btn", "segment-btn-active");
        btnCash.setOnAction(e -> showSection("cash"));

        btnSettlements = new Button("📋  Liquidación de Rutas");
        btnSettlements.getStyleClass().add("segment-btn");
        btnSettlements.setOnAction(e -> showSection("settlements"));

        segmentBar.getChildren().addAll(btnCash, btnSettlements);

        topBar.getChildren().addAll(titleBox, spacer, segmentBar);
        setTop(topBar);

        showSection("cash");
    }

    public void showSection(String section) {
        if ("settlements".equalsIgnoreCase(section)) {
            btnCash.getStyleClass().remove("segment-btn-active");
            if (!btnSettlements.getStyleClass().contains("segment-btn-active")) {
                btnSettlements.getStyleClass().add("segment-btn-active");
            }
            subTitle.setText("Liquidaciones de cobradores, entregas de dinero y balances por ruta");
            settlementManagementView.refresh();
            setCenter(settlementManagementView);
        } else {
            btnSettlements.getStyleClass().remove("segment-btn-active");
            if (!btnCash.getStyleClass().contains("segment-btn-active")) {
                btnCash.getStyleClass().add("segment-btn-active");
            }
            subTitle.setText("Control de efectivo, ingresos por cobros y saldo disponible");
            cashManagementView.refresh();
            setCenter(cashManagementView);
        }
    }

    public void refresh() {
        if (getCenter() == settlementManagementView) {
            settlementManagementView.refresh();
        } else {
            cashManagementView.refresh();
        }
    }
}
