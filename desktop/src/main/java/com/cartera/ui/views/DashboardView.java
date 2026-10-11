package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.*;

import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.Locale;

public class DashboardView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final TodayCollectionsService collectionsService;
    private final Runnable onGoToCollections;

    private final Label lblCollected = new Label("$ 0");
    private final Label lblPending = new Label("0");
    private final Label lblOverdue = new Label("$ 0");
    private final Label lblCash = new Label("$ 0");

    public DashboardView(TodayCollectionsService collectionsService, Runnable onGoToCollections) {
        this.collectionsService = collectionsService;
        this.onGoToCollections = onGoToCollections;

        setSpacing(24);
        setPadding(new Insets(28));
        setStyle("-fx-background-color: #0f172a;");

        buildView();
        refresh();
    }

    private void buildView() {
        Label title = new Label("Operación y Métricas de Hoy");
        title.getStyleClass().add("section-title");

        HBox metrics = new HBox(16);
        metrics.getChildren().addAll(
                createMetricCard("Cobrado hoy", lblCollected, "metric-value-green"),
                createMetricCard("Clientes por cobrar", lblPending, "metric-value"),
                createMetricCard("Cuotas vencidas", lblOverdue, "metric-value-red"),
                createMetricCard("Caja actual", lblCash, "metric-value")
        );

        // Action banner
        HBox banner = new HBox(20);
        banner.setAlignment(Pos.CENTER_LEFT);
        banner.setStyle("-fx-background-color: #1e293b; -fx-padding: 24; -fx-background-radius: 12; -fx-border-color: #334155; -fx-border-radius: 12;");

        VBox bannerText = new VBox(6);
        Label bannerTitle = new Label("Ruta de Cobro Activa");
        bannerTitle.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 16px; -fx-font-weight: bold;");
        Label bannerDesc = new Label("Los datos financieros están sincronizados con la base de datos local SQLite. Puedes iniciar la jornada de cobros.");
        bannerDesc.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 13px;");
        bannerText.getChildren().addAll(bannerTitle, bannerDesc);
        HBox.setHgrow(bannerText, Priority.ALWAYS);

        Button btnAction = new Button("Ir a Cobros de Hoy →");
        btnAction.getStyleClass().add("btn-primary");
        btnAction.setStyle("-fx-font-size: 14px; -fx-padding: 10 20;");
        btnAction.setOnAction(e -> {
            if (onGoToCollections != null) onGoToCollections.run();
        });

        banner.getChildren().addAll(bannerText, btnAction);

        getChildren().addAll(title, metrics, banner);
    }

    private VBox createMetricCard(String label, Label valueLabel, String valueStyleClass) {
        VBox card = new VBox(8);
        card.getStyleClass().add("metric-card");
        card.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(card, Priority.ALWAYS);
        Label lbl = new Label(label);
        valueLabel.getStyleClass().add(valueStyleClass);
        card.getChildren().addAll(lbl, valueLabel);
        return card;
    }

    public void refresh() {
        var m = collectionsService.getDailyMetrics(LocalDate.now());
        lblCollected.setText(CURRENCY.format(m.collectedToday()));
        lblPending.setText(m.pendingCustomersCount() + " / " + m.totalCustomersToday());
        lblOverdue.setText(CURRENCY.format(m.overdueAmount()));
        lblCash.setText(CURRENCY.format(m.cashBalance()));
    }
}
