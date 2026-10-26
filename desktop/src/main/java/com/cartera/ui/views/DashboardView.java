package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/**
 * Vista de Dashboard y Resumen Ejecutivo de Rutas para la Administración Central.
 * Diseño Clean Fintech Minimalista:
 * - Tarjeta Hero con métrica consolidada y barra de progreso de recaudo.
 * - Pilares financieros (Base en Caja, Cartera en Calle, Patrimonio Administrativo, Mora).
 * - Panel Comparativo Multi-Ruta con progreso individual y salto directo de supervisión.
 * - Acciones rápidas operativas de un solo clic.
 */
public class DashboardView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("EEEE, d 'de' MMMM 'de' yyyy", Locale.forLanguageTag("es-CO"));

    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public record RouteRowItem(
            String routeId,
            String routeName,
            String collectorName,
            BigDecimal collectedToday,
            BigDecimal targetToday,
            double progressRatio,
            int paidCount,
            int totalCount,
            BigDecimal activeDebt,
            BigDecimal overdueAmount
    ) {}

    private final TodayCollectionsService collectionsService;
    private final RouteRepository routeRepository;
    private final AppUserRepository userRepository;
    private final Consumer<String> onNavigate;
    private final Consumer<String> onSelectRoute;

    // Métricas Hero
    private final Label lblCollectedHero = new Label("$ 0");
    private final Label lblTargetHero = new Label("Meta: $ 0");
    private final Label lblPendingCountHero = new Label("0 / 0 Cobrados");
    private final Label lblProgressPct = new Label("0% completado");
    private final ProgressBar progressBar = new ProgressBar(0.0);

    // Pilares Financieros
    private final Label lblCash = new Label("$ 0");
    private final Label lblActiveDebt = new Label("$ 0");
    private final Label lblAdministrative = new Label("$ 0");
    private final Label lblOverdue = new Label("$ 0");

    // Tabla Comparativa Multi-Ruta
    private final ObservableList<RouteRowItem> routeRows = FXCollections.observableArrayList();
    private final TableView<RouteRowItem> multiRouteTable = new TableView<>();

    public DashboardView(TodayCollectionsService collectionsService, Runnable onGoToCollections) {
        this(collectionsService, null, null, dest -> {
            if (onGoToCollections != null) onGoToCollections.run();
        }, null);
    }

    public DashboardView(TodayCollectionsService collectionsService, Consumer<String> onNavigate) {
        this(collectionsService, null, null, onNavigate, null);
    }

    public DashboardView(
            TodayCollectionsService collectionsService,
            RouteRepository routeRepository,
            AppUserRepository userRepository,
            Consumer<String> onNavigate,
            Consumer<String> onSelectRoute
    ) {
        this.collectionsService = collectionsService;
        this.routeRepository = routeRepository;
        this.userRepository = userRepository;
        this.onNavigate = onNavigate;
        this.onSelectRoute = onSelectRoute;

        setSpacing(0);
        setStyle("-fx-background-color: #f8fafc;");

        buildView();
        refresh();
    }

    private void buildView() {
        VBox contentBox = new VBox(20);
        contentBox.setPadding(new Insets(24, 28, 28, 28));

        // 1. Header con fecha ejecutiva
        VBox headerBox = new VBox(2);
        Label title = new Label("Centro de Control y Supervisión");
        title.getStyleClass().add("section-title");

        String formattedDate = LocalDate.now().format(DATE_FORMATTER);
        formattedDate = formattedDate.substring(0, 1).toUpperCase() + formattedDate.substring(1);
        Label lblDate = new Label(formattedDate + " • Consolidado Administrativo de Operación");
        lblDate.setStyle("-fx-text-fill: #64748b; -fx-font-size: 13px;");
        headerBox.getChildren().addAll(title, lblDate);

        // 2. Tarjeta Bento Hero (Recaudo del Día & Avance)
        HBox heroCard = new HBox(28);
        heroCard.getStyleClass().add("hero-card");
        heroCard.setAlignment(Pos.CENTER_LEFT);

        VBox heroLeft = new VBox(6);
        HBox.setHgrow(heroLeft, Priority.ALWAYS);

        Label heroTitle = new Label("RECAUDO COBRADO HOY (CONSOLIDADO)");
        heroTitle.getStyleClass().add("hero-title");

        lblCollectedHero.getStyleClass().add("hero-value");

        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setPrefHeight(9);

        HBox progressInfo = new HBox(12);
        progressInfo.setAlignment(Pos.CENTER_LEFT);
        lblProgressPct.setStyle("-fx-text-fill: #34d399; -fx-font-size: 12px; -fx-font-weight: bold;");
        Label sep = new Label("•");
        sep.setStyle("-fx-text-fill: #64748b;");
        Label lblHint = new Label("Avance global de cobranza en la jornada");
        lblHint.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
        progressInfo.getChildren().addAll(lblProgressPct, sep, lblHint);

        heroLeft.getChildren().addAll(heroTitle, lblCollectedHero, progressBar, progressInfo);

        VBox heroRight = new VBox(10);
        heroRight.setAlignment(Pos.CENTER_RIGHT);
        heroRight.setMinWidth(220);

        lblPendingCountHero.getStyleClass().add("hero-pill");
        lblTargetHero.getStyleClass().add("hero-pill");

        heroRight.getChildren().addAll(lblPendingCountHero, lblTargetHero);

        heroCard.getChildren().addAll(heroLeft, heroRight);

        // 3. Pilares Financieros de la Cartera (4 Bento Cards)
        HBox pillars = new HBox(14);
        pillars.getChildren().addAll(
                createMetricCard("💵 BASE EN CAJA", lblCash, "metric-value-green", "Disponible para prestar"),
                createMetricCard("📈 CARTERA EN CALLE", lblActiveDebt, "metric-value", "Saldo capital en deuda"),
                createMetricCard("🏛 PATRIMONIO DE RUTA", lblAdministrative, "metric-value", "Capital total administrado"),
                createMetricCard("⚠️ CARTERA EN MORA", lblOverdue, "metric-value-red", "Cuotas vencidas hoy")
        );

        // 4. Panel Comparativo Multi-Ruta (Supervisión Gerencial de Rutas)
        VBox multiRouteCard = buildMultiRouteSection();

        // 5. Bento Actions: Acciones Operativas Inmediatas
        Label lblActionsTitle = new Label("GESTIÓN Y SUPERVISIÓN RÁPIDA");
        lblActionsTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold; -fx-letter-spacing: 0.5px; -fx-padding: 4 0 0 2;");

        HBox actionCards = new HBox(14);
        actionCards.getChildren().addAll(
                createActionCard("📋", "Supervisión de Cobros", "Monitorear cobros de la ruta y registrar abonos", () -> navigate("Cobros y Rutas")),
                createActionCard("👥", "Clientes de la Red", "Fichas de clientes, historiales y nuevos préstamos", () -> navigate("Clientes")),
                createActionCard("⚖️", "Liquidación y Arqueo", "Cierre contable de jornada y cuadre de efectivo", () -> navigate("Liquidación Diaria")),
                createActionCard("💼", "Patrimonio & Caja", "Movimientos de capital y flujo de efectivo", () -> navigate("Administrativo"))
        );

        contentBox.getChildren().addAll(headerBox, heroCard, pillars, multiRouteCard, lblActionsTitle, actionCards);

        ScrollPane scrollPane = new ScrollPane(contentBox);
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background: transparent; -fx-background-color: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);

        getChildren().add(scrollPane);
    }

    @SuppressWarnings("unchecked")
    private VBox buildMultiRouteSection() {
        VBox card = new VBox(12);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(16, 18, 16, 18));

        HBox top = new HBox(8);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label title = new Label("Supervisión Comparativa Multi-Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");
        Label subtitle = new Label("Monitoreo en tiempo real del avance y recaudo por cada ruta de cobranza");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        titleBox.getChildren().addAll(title, subtitle);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label lblBadge = new Label("● Red Central");
        lblBadge.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-padding: 4 10; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold;");

        top.getChildren().addAll(titleBox, spacer, lblBadge);

        multiRouteTable.setPrefHeight(180);
        multiRouteTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);

        TableColumn<RouteRowItem, RouteRowItem> colRoute = new TableColumn<>("RUTA");
        colRoute.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colRoute.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(RouteRowItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    HBox box = new HBox(6);
                    box.setAlignment(Pos.CENTER_LEFT);
                    Label nameLbl = new Label(item.routeName());
                    nameLbl.setStyle("-fx-font-weight: bold; -fx-text-fill: #0f172a;");
                    Label idBadge = new Label(item.routeId());
                    idBadge.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #64748b; -fx-padding: 1 5; -fx-background-radius: 4; -fx-font-size: 10px;");
                    box.getChildren().addAll(nameLbl, idBadge);
                    setGraphic(box);
                }
            }
        });
        colRoute.setPrefWidth(160);

        TableColumn<RouteRowItem, String> colCollector = new TableColumn<>("COBRADOR ASIGNADO");
        colCollector.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().collectorName()));
        colCollector.setPrefWidth(140);

        TableColumn<RouteRowItem, String> colTarget = new TableColumn<>("META HOY");
        colTarget.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().targetToday())));
        colTarget.setPrefWidth(110);

        TableColumn<RouteRowItem, String> colCollected = new TableColumn<>("COBRADO");
        colCollected.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().collectedToday())));
        colCollected.setStyle("-fx-font-weight: bold; -fx-text-fill: #059669;");
        colCollected.setPrefWidth(110);

        TableColumn<RouteRowItem, RouteRowItem> colProgress = new TableColumn<>("AVANCE");
        colProgress.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colProgress.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(RouteRowItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    VBox box = new VBox(2);
                    box.setAlignment(Pos.CENTER_LEFT);
                    ProgressBar pb = new ProgressBar(item.progressRatio());
                    pb.setMaxWidth(Double.MAX_VALUE);
                    pb.setPrefHeight(6);
                    int pct = (int) Math.round(item.progressRatio() * 100);
                    Label pctLbl = new Label(pct + "% (" + item.paidCount() + "/" + item.totalCount() + ")");
                    pctLbl.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-text-fill: "
                            + (pct >= 80 ? "#059669" : (pct >= 40 ? "#2563eb" : "#d97706")) + ";");
                    box.getChildren().addAll(pb, pctLbl);
                    setGraphic(box);
                }
            }
        });
        colProgress.setPrefWidth(140);

        TableColumn<RouteRowItem, String> colActiveDebt = new TableColumn<>("CARTERA EN CALLE");
        colActiveDebt.setCellValueFactory(d -> new SimpleStringProperty(CURRENCY.format(d.getValue().activeDebt())));
        colActiveDebt.setPrefWidth(120);

        TableColumn<RouteRowItem, RouteRowItem> colAction = new TableColumn<>("SUPERVISIÓN");
        colAction.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAction.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(RouteRowItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Button btn = new Button("📍 Supervisar");
                    btn.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-padding: 3 8; -fx-cursor: hand; -fx-font-weight: bold;");
                    btn.setOnAction(e -> {
                        if (onSelectRoute != null) {
                            onSelectRoute.accept(item.routeId());
                        }
                        navigate("Cobros y Rutas");
                    });
                    setGraphic(btn);
                }
            }
        });
        colAction.setPrefWidth(100);

        multiRouteTable.getColumns().addAll(colRoute, colCollector, colTarget, colCollected, colProgress, colActiveDebt, colAction);
        multiRouteTable.setItems(routeRows);

        card.getChildren().addAll(top, multiRouteTable);
        return card;
    }

    private void navigate(String destination) {
        if (onNavigate != null) {
            onNavigate.accept(destination);
        }
    }

    private VBox createMetricCard(String label, Label valueLabel, String valueStyleClass, String subtext) {
        VBox card = new VBox(6);
        card.getStyleClass().add("metric-card");
        HBox.setHgrow(card, Priority.ALWAYS);

        Label lbl = new Label(label);
        lbl.setStyle("-fx-font-size: 11px; -fx-font-weight: bold; -fx-text-fill: #64748b; -fx-letter-spacing: 0.3px;");

        valueLabel.getStyleClass().add(valueStyleClass);
        valueLabel.setStyle("-fx-font-size: 20px; -fx-font-weight: bold;");

        Label lblSub = new Label(subtext);
        lblSub.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");

        card.getChildren().addAll(lbl, valueLabel, lblSub);
        return card;
    }

    private VBox createActionCard(String icon, String title, String subtitle, Runnable action) {
        VBox card = new VBox(6);
        card.getStyleClass().add("quick-action-card");
        HBox.setHgrow(card, Priority.ALWAYS);

        HBox topRow = new HBox(8);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label iconLbl = new Label(icon);
        iconLbl.setStyle("-fx-font-size: 18px;");

        Label titleLbl = new Label(title);
        titleLbl.getStyleClass().add("quick-action-title");

        topRow.getChildren().addAll(iconLbl, titleLbl);

        Label subLbl = new Label(subtitle);
        subLbl.getStyleClass().add("quick-action-subtitle");
        subLbl.setWrapText(true);

        card.getChildren().addAll(topRow, subLbl);
        card.setOnMouseClicked(e -> {
            if (action != null) action.run();
        });
        return card;
    }

    public void refresh() {
        LocalDate today = LocalDate.now();
        var m = collectionsService.getDailyMetrics(today);
        List<CollectionItem> items = collectionsService.getTodayCollectionItems(today);

        // 1. Cálculos de meta y porcentaje
        BigDecimal collected = m.collectedToday() != null ? m.collectedToday() : BigDecimal.ZERO;
        BigDecimal expectedToday = BigDecimal.ZERO;
        int paidCount = 0;
        int actionableCount = 0;

        for (var item : items) {
            if (item.statusText() != null && item.statusText().contains("PRÓXIMA CUOTA")) {
                continue;
            }
            actionableCount++;
            expectedToday = expectedToday.add(item.installmentAmount() != null ? item.installmentAmount() : BigDecimal.ZERO);
            if (item.isPaidToday()) {
                paidCount++;
            }
        }

        if (actionableCount == 0 && !items.isEmpty()) {
            actionableCount = items.size();
        }

        double progressRatio = 0.0;
        if (expectedToday.compareTo(BigDecimal.ZERO) > 0) {
            progressRatio = collected.divide(expectedToday, 4, RoundingMode.HALF_UP).doubleValue();
            progressRatio = Math.min(1.0, Math.max(0.0, progressRatio));
        } else if (actionableCount > 0) {
            progressRatio = (double) paidCount / actionableCount;
        }

        // 2. Asignar valores
        lblCollectedHero.setText(CURRENCY.format(collected));
        progressBar.setProgress(progressRatio);

        int pctInt = (int) Math.round(progressRatio * 100);
        lblProgressPct.setText(pctInt + "% de la meta alcanzada");

        lblPendingCountHero.setText("Cobrados: " + paidCount + " / " + actionableCount + " clientes");
        lblTargetHero.setText("Meta esperada: " + CURRENCY.format(expectedToday.max(collected)));

        lblAdministrative.setText(CURRENCY.format(m.totalAdministrativeCapital()));
        lblActiveDebt.setText(CURRENCY.format(m.totalActiveDebt()));
        lblCash.setText(CURRENCY.format(m.cashBalance()));
        lblOverdue.setText(CURRENCY.format(m.overdueAmount()));

        // 3. Cargar comparativo Multi-Ruta
        if (routeRepository != null) {
            List<RouteEntity> allRoutes = routeRepository.findAll().stream()
                    .filter(r -> r.getActive() == null || r.getActive() == 1)
                    .toList();
            Map<String, String> userNames = (userRepository != null)
                    ? userRepository.findAll().stream().collect(Collectors.toMap(AppUserEntity::getId, u -> u.getFullName() != null ? u.getFullName() : u.getUsername(), (a, b) -> a))
                    : Map.of();

            List<RouteRowItem> rows = new ArrayList<>();
            for (RouteEntity r : allRoutes) {
                var rMetrics = collectionsService.getDailyMetricsForRoute(today, r.getId());
                var rItems = collectionsService.getTodayCollectionItemsForRoute(today, r.getId());

                BigDecimal rCollected = rMetrics.collectedToday() != null ? rMetrics.collectedToday() : BigDecimal.ZERO;
                BigDecimal rTarget = BigDecimal.ZERO;
                int rPaid = 0;
                int rActionable = 0;
                for (var it : rItems) {
                    if (it.statusText() != null && it.statusText().contains("PRÓXIMA CUOTA")) continue;
                    rActionable++;
                    rTarget = rTarget.add(it.installmentAmount() != null ? it.installmentAmount() : BigDecimal.ZERO);
                    if (it.isPaidToday()) rPaid++;
                }
                if (rActionable == 0 && !rItems.isEmpty()) rActionable = rItems.size();

                double rProgress = 0.0;
                if (rTarget.compareTo(BigDecimal.ZERO) > 0) {
                    rProgress = Math.min(1.0, Math.max(0.0, rCollected.divide(rTarget, 4, RoundingMode.HALF_UP).doubleValue()));
                } else if (rActionable > 0) {
                    rProgress = (double) rPaid / rActionable;
                }

                String colName = r.getCollectorId() != null ? userNames.getOrDefault(r.getCollectorId(), r.getCollectorId()) : "Sin Asignar";

                rows.add(new RouteRowItem(
                        r.getId(),
                        r.getName(),
                        colName,
                        rCollected,
                        rTarget.max(rCollected),
                        rProgress,
                        rPaid,
                        rActionable,
                        rMetrics.totalActiveDebt(),
                        rMetrics.overdueAmount()
                ));
            }
            routeRows.setAll(rows);
        }
    }
}
