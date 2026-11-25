package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.NotificationItem;
import com.cartera.collections.application.TodayCollectionsService.NotificationType;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Centro de Alertas Accionables (Campana del TopBar):
 * Consolida clientes en mora, promesas para hoy/vencidas y créditos listos para renovar (>= 60%),
 * con salto en 1 clic a la Ficha 360° del cliente o al módulo de Cobros.
 */
public class NotificationsDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final TodayCollectionsService collectionsService;
    private final RouteRepository routeRepository;
    private final Consumer<String> onOpenCustomer360;
    private final Runnable onGoToCollections;

    private final ObservableList<NotificationItem> allAlerts = FXCollections.observableArrayList();
    private final ListView<NotificationItem> listView = new ListView<>();
    private final Label lblSummary = new Label();
    private NotificationType activeFilter = null; // null = Todas

    public NotificationsDialog(
            Stage ownerStage,
            TodayCollectionsService collectionsService,
            RouteRepository routeRepository,
            Consumer<String> onOpenCustomer360,
            Runnable onGoToCollections
    ) {
        this.collectionsService = collectionsService;
        this.routeRepository = routeRepository;
        this.onOpenCustomer360 = onOpenCustomer360;
        this.onGoToCollections = onGoToCollections;

        initModality(Modality.WINDOW_MODAL);
        if (ownerStage != null) {
            initOwner(ownerStage);
        }
        setTitle("Centro de Alertas Operativas");
        setResizable(true);
        setMinWidth(680);
        setMinHeight(500);

        buildUI();
        reload();
    }

    private void buildUI() {
        VBox root = new VBox(14);
        root.setPadding(new Insets(18, 22, 18, 22));
        root.setStyle("-fx-background-color: #f8fafc;");
        root.setPrefSize(760, 560);

        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        VBox titleCol = new VBox(2);
        Label title = new Label("Alertas y Oportunidades del Día");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");
        lblSummary.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        titleCol.getChildren().addAll(title, lblSummary);
        HBox.setHgrow(titleCol, Priority.ALWAYS);

        Button btnGoCollections = new Button("Ir a Cobros →");
        btnGoCollections.getStyleClass().add("btn-secondary");
        btnGoCollections.setOnAction(e -> {
            close();
            if (onGoToCollections != null) onGoToCollections.run();
        });
        header.getChildren().addAll(titleCol, btnGoCollections);

        // Filter pills
        ToggleGroup grp = new ToggleGroup();
        ToggleButton tAll = createFilterPill("Todas", null, grp, true);
        ToggleButton tOverdue = createFilterPill("En Mora", NotificationType.OVERDUE, grp, false);
        ToggleButton tPromise = createFilterPill("Promesas", NotificationType.PROMISE, grp, false);
        ToggleButton tRenew = createFilterPill("Listos para Renovar", NotificationType.RENEWAL_READY, grp, false);
        HBox filterBar = new HBox(8, tAll, tOverdue, tPromise, tRenew);
        filterBar.setAlignment(Pos.CENTER_LEFT);

        // ListView with rich action cards
        VBox.setVgrow(listView, Priority.ALWAYS);
        listView.setStyle("-fx-background-color: transparent; -fx-border-color: #e2e8f0; -fx-border-radius: 10; -fx-background-radius: 10;");
        listView.setPlaceholder(new Label("Sin alertas pendientes en esta categoría."));
        listView.setCellFactory(lv -> new ListCell<>() {
            @Override
            protected void updateItem(NotificationItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    HBox card = new HBox(12);
                    card.setAlignment(Pos.CENTER_LEFT);
                    card.setPadding(new Insets(10, 12, 10, 12));
                    card.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 8; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");

                    Label pill = new Label(badgeLabel(item.type()));
                    pill.setStyle(badgeStyle(item.type()));
                    pill.setMinWidth(82);
                    pill.setAlignment(Pos.CENTER);

                    VBox info = new VBox(2);
                    HBox.setHgrow(info, Priority.ALWAYS);
                    Label cust = new Label(item.customerName() + "  •  " + resolveRouteName(item.routeId()));
                    cust.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px;");
                    Label sub = new Label(item.title() + " — " + item.detail());
                    sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11.5px;");
                    sub.setWrapText(true);
                    info.getChildren().addAll(cust, sub);

                    Label amt = new Label(CURRENCY.format(item.amount()));
                    amt.setStyle("-fx-font-weight: bold; -fx-font-size: 13px; -fx-text-fill: " + amountColor(item.type()) + ";");

                    Button btnOpen = new Button("Ficha 360°");
                    btnOpen.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 10; -fx-cursor: hand;");
                    btnOpen.setOnAction(e -> {
                        close();
                        if (onOpenCustomer360 != null) {
                            onOpenCustomer360.accept(item.customerId());
                        }
                    });

                    card.getChildren().addAll(pill, info, amt, btnOpen);
                    setGraphic(card);
                    setStyle("-fx-background-color: transparent; -fx-padding: 4 6;");
                }
            }
        });

        HBox footer = new HBox(10);
        footer.setAlignment(Pos.CENTER_RIGHT);
        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> reload());
        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-primary");
        btnClose.setOnAction(e -> close());
        footer.getChildren().addAll(btnRefresh, btnClose);

        root.getChildren().addAll(header, filterBar, listView, footer);

        Scene scene = new Scene(root);
        try {
            scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        } catch (Exception ignored) {}
        setScene(scene);
    }

    private ToggleButton createFilterPill(String label, NotificationType type, ToggleGroup grp, boolean selected) {
        ToggleButton tb = new ToggleButton(label);
        tb.setToggleGroup(grp);
        tb.setSelected(selected);
        stylePill(tb, selected);
        tb.selectedProperty().addListener((obs, oldV, isSel) -> {
            stylePill(tb, isSel);
            if (isSel) {
                activeFilter = type;
                applyFilter();
            }
        });
        return tb;
    }

    private static void stylePill(ToggleButton tb, boolean active) {
        tb.setStyle(active
                ? "-fx-background-color: #0f172a; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 11.5px; -fx-padding: 6 12; -fx-background-radius: 16; -fx-cursor: hand;"
                : "-fx-background-color: #ffffff; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 16; -fx-background-radius: 16; -fx-font-weight: bold; -fx-font-size: 11.5px; -fx-padding: 6 12; -fx-cursor: hand;");
    }

    private void reload() {
        if (collectionsService == null) return;
        String routeFilter = UserSessionContext.getSelectedRouteId();
        List<NotificationItem> items = collectionsService.getActionableNotifications(LocalDate.now(), routeFilter);
        allAlerts.setAll(items);
        long moraCount = items.stream().filter(i -> i.type() == NotificationType.OVERDUE).count();
        long promCount = items.stream().filter(i -> i.type() == NotificationType.PROMISE).count();
        long renCount = items.stream().filter(i -> i.type() == NotificationType.RENEWAL_READY).count();
        lblSummary.setText(items.size() + " alerta(s): " + moraCount + " en mora · " + promCount + " promesa(s) · " + renCount + " listo(s) para renovar");
        applyFilter();
    }

    private void applyFilter() {
        if (activeFilter == null) {
            listView.setItems(FXCollections.observableArrayList(allAlerts));
        } else {
            listView.setItems(FXCollections.observableArrayList(
                    allAlerts.stream().filter(i -> i.type() == activeFilter).toList()
            ));
        }
    }

    private String resolveRouteName(String routeId) {
        if (routeId == null || routeId.isBlank()) return "Sin ruta";
        if (routeRepository == null) return routeId;
        return routeRepository.findById(routeId).map(RouteEntity::getName).orElse(routeId);
    }

    private static String badgeLabel(NotificationType type) {
        return switch (type) {
            case OVERDUE -> "EN MORA";
            case PROMISE -> "PROMESA";
            case RENEWAL_READY -> "RENOVAR";
        };
    }

    private static String badgeStyle(NotificationType type) {
        return switch (type) {
            case OVERDUE -> "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 7;";
            case PROMISE -> "-fx-background-color: #fffbeb; -fx-text-fill: #b45309; -fx-border-color: #fde68a; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 7;";
            case RENEWAL_READY -> "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 7;";
        };
    }

    private static String amountColor(NotificationType type) {
        return switch (type) {
            case OVERDUE -> "#dc2626";
            case PROMISE -> "#d97706";
            case RENEWAL_READY -> "#059669";
        };
    }
}
