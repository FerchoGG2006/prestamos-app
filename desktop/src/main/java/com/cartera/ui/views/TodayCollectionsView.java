package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.infrastructure.LanSyncServerService;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import javafx.beans.property.SimpleObjectProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.collections.transformation.FilteredList;
import javafx.collections.transformation.SortedList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Vista de Ruta y Cobros de Hoy.
 * Implementa el Clean Fintech Design System idéntico a la versión móvil:
 * - Píldoras de filtro rápido segmentadas: [TODOS] [COBRAR HOY] [EN MORA] [AL DÍA] [PAGADOS] [PROMESAS].
 * - Mini Bento Strip con KPIs operativos en tiempo real (Meta, Recaudado, Pendientes, En Mora).
 * - Búsqueda instantánea multi-criterio y ordenamiento prioritario de visita.
 * - Acciones directas de un clic por fila: Cobro Inmediato, Comprobante y WhatsApp.
 */
public class TodayCollectionsView extends VBox {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));

    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public enum FilterPillType {
        TODOS, COBRAR_HOY, MORA, AL_DIA, PAGADOS, PROMESAS
    }

    private final TodayCollectionsService collectionsService;
    private final RecordPaymentUseCase paymentUseCase;
    private final SettlementUseCase settlementUseCase;
    private final CashMovementRepository cashMovementRepository;
    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final CreateLoanUseCase createLoanUseCase;
    private final RenewalRepository renewalRepository;
    private final PaymentPromiseRepository paymentPromiseRepository;
    private final AuditLogRepository auditLogRepository;
    private final SystemSettingRepository systemSettingRepository;
    private final MobileSyncProcessorService syncProcessorService;
    private final LanSyncServerService lanSyncServerService;
    private final Stage primaryStage;
    private final Runnable onDataUpdated;

    private final ObservableList<CollectionItem> masterData = FXCollections.observableArrayList();
    private FilteredList<CollectionItem> filteredData;
    private final TableView<CollectionItem> table = new TableView<>();

    // Contadores y KPIs del Mini Bento Strip
    private final Label lblCounter = new Label();
    private final Label lblKpiTarget = new Label("$ 0");
    private final Label lblKpiCollected = new Label("$ 0");
    private final Label lblKpiPending = new Label("0 clientes");
    private final Label lblKpiOverdue = new Label("$ 0 (0)");

    // Píldoras de filtro
    private FilterPillType currentFilter = FilterPillType.TODOS;
    private final Button btnPillTodos = new Button("Todos (0)");
    private final Button btnPillCobrarHoy = new Button("Cobrar Hoy (0)");
    private final Button btnPillMora = new Button("En Mora (0)");
    private final Button btnPillAlDia = new Button("Al Día (0)");
    private final Button btnPillPagados = new Button("Pagados (0)");
    private final Button btnPillPromesas = new Button("Promesas (0)");

    // Footer
    private final Label lblFooterClients = new Label();
    private final Label lblFooterPending = new Label();
    private final Label lblFooterTotalCuotas = new Label();
    private final Label lblFooterTotalBalance = new Label();

    private Runnable applyFiltersTrigger;

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this(collectionsService, paymentUseCase, null, null, primaryStage, onDataUpdated);
    }

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                SettlementUseCase settlementUseCase,
                                CashMovementRepository cashMovementRepository,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this(collectionsService, paymentUseCase, settlementUseCase, cashMovementRepository,
                null, null, null, null, null, null, null, null, null, null, primaryStage, onDataUpdated);
    }

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                SettlementUseCase settlementUseCase,
                                CashMovementRepository cashMovementRepository,
                                CustomerRepository customerRepository,
                                LoanRepository loanRepository,
                                InstallmentRepository installmentRepository,
                                CreateLoanUseCase createLoanUseCase,
                                RenewalRepository renewalRepository,
                                PaymentPromiseRepository paymentPromiseRepository,
                                AuditLogRepository auditLogRepository,
                                SystemSettingRepository systemSettingRepository,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this(collectionsService, paymentUseCase, settlementUseCase, cashMovementRepository,
                customerRepository, loanRepository, installmentRepository, createLoanUseCase,
                renewalRepository, paymentPromiseRepository, auditLogRepository, systemSettingRepository,
                null, null, primaryStage, onDataUpdated);
    }

    public TodayCollectionsView(TodayCollectionsService collectionsService,
                                RecordPaymentUseCase paymentUseCase,
                                SettlementUseCase settlementUseCase,
                                CashMovementRepository cashMovementRepository,
                                CustomerRepository customerRepository,
                                LoanRepository loanRepository,
                                InstallmentRepository installmentRepository,
                                CreateLoanUseCase createLoanUseCase,
                                RenewalRepository renewalRepository,
                                PaymentPromiseRepository paymentPromiseRepository,
                                AuditLogRepository auditLogRepository,
                                SystemSettingRepository systemSettingRepository,
                                MobileSyncProcessorService syncProcessorService,
                                LanSyncServerService lanSyncServerService,
                                Stage primaryStage,
                                Runnable onDataUpdated) {
        this.collectionsService = collectionsService;
        this.paymentUseCase = paymentUseCase;
        this.settlementUseCase = settlementUseCase;
        this.cashMovementRepository = cashMovementRepository;
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.createLoanUseCase = createLoanUseCase;
        this.renewalRepository = renewalRepository;
        this.paymentPromiseRepository = paymentPromiseRepository;
        this.auditLogRepository = auditLogRepository;
        this.systemSettingRepository = systemSettingRepository;
        this.syncProcessorService = syncProcessorService;
        this.lanSyncServerService = lanSyncServerService;
        this.primaryStage = primaryStage;
        this.onDataUpdated = onDataUpdated;

        setSpacing(14);
        setPadding(new Insets(20, 24, 24, 24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildKpiStrip();
        buildFilterPills();
        buildContentArea();
        refreshData();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(2);
        Label title = new Label("Ruta y Cobros de Hoy");
        title.getStyleClass().add("section-title");
        lblCounter.getStyleClass().add("muted");
        lblCounter.setStyle("-fx-font-size: 12px;");
        titleBox.getChildren().addAll(title, lblCounter);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        // Botón Registrar Gasto
        Button btnReportExpense = new Button("💸 Gasto de Ruta");
        btnReportExpense.getStyleClass().add("btn-secondary");
        btnReportExpense.setStyle("-fx-font-size: 12px; -fx-padding: 7 12;");
        btnReportExpense.setOnAction(e -> openReportExpenseDialog());

        // Botón Sincronizar Móvil
        Button btnSyncMobile = new Button("📡 Sincronizar Móvil");
        btnSyncMobile.getStyleClass().add("btn-primary");
        btnSyncMobile.setStyle("-fx-font-size: 12px; -fx-padding: 7 14;");
        btnSyncMobile.setOnAction(e -> openSyncMobileDialog());

        // Botón Actualizar
        Button btnRefresh = new Button("🔄 Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setStyle("-fx-font-size: 12px; -fx-padding: 7 12;");
        btnRefresh.setOnAction(e -> refreshData());

        top.getChildren().addAll(titleBox, btnReportExpense, btnSyncMobile, btnRefresh);
        getChildren().add(top);
    }

    private void buildKpiStrip() {
        HBox kpiStrip = new HBox(12);

        lblKpiCollected.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #059669;");
        lblKpiTarget.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #0f172a;");
        lblKpiPending.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #2563eb;");
        lblKpiOverdue.setStyle("-fx-font-size: 18px; -fx-font-weight: bold; -fx-text-fill: #dc2626;");

        kpiStrip.getChildren().addAll(
                createMiniKpiCard("RECAUDADO HOY", lblKpiCollected),
                createMiniKpiCard("META DEL DÍA", lblKpiTarget),
                createMiniKpiCard("PENDIENTES HOY", lblKpiPending),
                createMiniKpiCard("EN MORA / VENCIDAS", lblKpiOverdue)
        );

        getChildren().add(kpiStrip);
    }

    private VBox createMiniKpiCard(String label, Label valueLabel) {
        VBox card = new VBox(4);
        card.getStyleClass().add("metric-card");
        card.setStyle("-fx-padding: 10 16; -fx-background-radius: 10; -fx-border-radius: 10;");
        HBox.setHgrow(card, Priority.ALWAYS);

        Label lbl = new Label(label);
        lbl.setStyle("-fx-font-size: 10px; -fx-font-weight: bold; -fx-text-fill: #64748b; -fx-letter-spacing: 0.4px;");

        card.getChildren().addAll(lbl, valueLabel);
        return card;
    }

    private void buildFilterPills() {
        HBox pillsBox = new HBox(8);
        pillsBox.setAlignment(Pos.CENTER_LEFT);
        pillsBox.setPadding(new Insets(2, 0, 2, 0));

        configurePill(btnPillTodos, FilterPillType.TODOS, "filter-pill-active");
        configurePill(btnPillCobrarHoy, FilterPillType.COBRAR_HOY, "filter-pill-active");
        configurePill(btnPillMora, FilterPillType.MORA, "filter-pill-active-mora");
        configurePill(btnPillAlDia, FilterPillType.AL_DIA, "filter-pill-active-paid");
        configurePill(btnPillPagados, FilterPillType.PAGADOS, "filter-pill-active-paid");
        configurePill(btnPillPromesas, FilterPillType.PROMESAS, "filter-pill-active-promise");

        pillsBox.getChildren().addAll(btnPillTodos, btnPillCobrarHoy, btnPillMora, btnPillAlDia, btnPillPagados, btnPillPromesas);
        getChildren().add(pillsBox);
    }

    private void configurePill(Button btn, FilterPillType type, String activeClass) {
        btn.getStyleClass().add("filter-pill");
        if (type == FilterPillType.TODOS) {
            btn.getStyleClass().add("filter-pill-active");
        }
        btn.setOnAction(e -> {
            currentFilter = type;
            updatePillStyles();
            if (applyFiltersTrigger != null) applyFiltersTrigger.run();
        });
    }

    private void updatePillStyles() {
        Button[] buttons = {btnPillTodos, btnPillCobrarHoy, btnPillMora, btnPillAlDia, btnPillPagados, btnPillPromesas};
        FilterPillType[] types = {FilterPillType.TODOS, FilterPillType.COBRAR_HOY, FilterPillType.MORA, FilterPillType.AL_DIA, FilterPillType.PAGADOS, FilterPillType.PROMESAS};

        for (int i = 0; i < buttons.length; i++) {
            Button btn = buttons[i];
            FilterPillType type = types[i];
            btn.getStyleClass().removeAll("filter-pill-active", "filter-pill-active-mora", "filter-pill-active-paid", "filter-pill-active-promise");

            if (type == currentFilter) {
                switch (type) {
                    case MORA -> btn.getStyleClass().add("filter-pill-active-mora");
                    case PAGADOS, AL_DIA -> btn.getStyleClass().add("filter-pill-active-paid");
                    case PROMESAS -> btn.getStyleClass().add("filter-pill-active-promise");
                    default -> btn.getStyleClass().add("filter-pill-active");
                }
            }
        }
    }

    private void buildContentArea() {
        VBox routeContainer = new VBox(10);
        VBox.setVgrow(routeContainer, Priority.ALWAYS);

        HBox searchRow = new HBox(10);
        searchRow.setAlignment(Pos.CENTER_LEFT);

        TextField searchField = new TextField();
        searchField.setPromptText("Buscar cliente por nombre, cédula, dirección o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(340);

        Label lblFreq = new Label("Modalidad:");
        lblFreq.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");

        ComboBox<String> cmbFreqFilter = new ComboBox<>();
        cmbFreqFilter.getItems().addAll("TODAS", "DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFreqFilter.setValue("TODAS");
        cmbFreqFilter.getStyleClass().add("search-field");
        cmbFreqFilter.setPrefWidth(120);

        filteredData = new FilteredList<>(masterData, p -> true);
        SortedList<CollectionItem> sortedData = new SortedList<>(filteredData);
        sortedData.comparatorProperty().bind(table.comparatorProperty());
        table.setItems(sortedData);

        applyFiltersTrigger = () -> {
            String q = searchField.getText() != null ? searchField.getText().toLowerCase().trim() : "";
            String selectedFreq = cmbFreqFilter.getValue();

            filteredData.setPredicate(item -> {
                // 1. Filtro de modalidad
                boolean matchesFreq = selectedFreq == null || "TODAS".equalsIgnoreCase(selectedFreq)
                        || selectedFreq.equalsIgnoreCase(item.frequency());
                if (!matchesFreq) return false;

                // 2. Filtro de píldora de estado (idéntico a móvil)
                String st = item.statusText() != null ? item.statusText().toUpperCase() : "";
                boolean hasOverdue = (item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0)
                        || st.contains("MORA") || st.contains("VENCID");

                switch (currentFilter) {
                    case COBRAR_HOY:
                        if (item.isPaidToday() || st.contains("PRÓXIMA CUOTA")) return false;
                        break;
                    case MORA:
                        if (!hasOverdue) return false;
                        break;
                    case AL_DIA:
                        if (hasOverdue) return false;
                        break;
                    case PAGADOS:
                        if (!item.isPaidToday()) return false;
                        break;
                    case PROMESAS:
                        if (!st.contains("PROMESA")) return false;
                        break;
                    case TODOS:
                    default:
                        break;
                }

                // 3. Filtro de texto
                if (q.isBlank()) return true;
                return item.fullName().toLowerCase().contains(q)
                        || item.documentNumber().toLowerCase().contains(q)
                        || item.address().toLowerCase().contains(q)
                        || item.neighborhood().toLowerCase().contains(q)
                        || item.businessName().toLowerCase().contains(q);
            });

            updateStats(filteredData);
        };

        searchField.textProperty().addListener((obs, oldVal, newVal) -> applyFiltersTrigger.run());
        cmbFreqFilter.valueProperty().addListener((obs, oldVal, newVal) -> applyFiltersTrigger.run());

        // Botón Auto-Ordenar
        Button btnAutoSort = new Button("⚡ Auto-Ordenar Ruta");
        btnAutoSort.getStyleClass().add("btn-secondary");
        btnAutoSort.setStyle("-fx-font-size: 11px; -fx-padding: 6 12; -fx-font-weight: bold;");
        btnAutoSort.setTooltip(new Tooltip("Organizar clientes automáticamente: Mora → Cobro Hoy → Promesas → Pagados"));
        btnAutoSort.setOnAction(e -> autoSortByPriority());

        // Controles de mover manual
        Button btnMoveUp = new Button("⬆");
        btnMoveUp.getStyleClass().add("btn-secondary");
        btnMoveUp.setStyle("-fx-font-size: 11px; -fx-padding: 6 10;");
        btnMoveUp.setTooltip(new Tooltip("Subir cliente en el orden de visita"));
        btnMoveUp.setOnAction(e -> moveSelectedRow(-1));

        Button btnMoveDown = new Button("⬇");
        btnMoveDown.getStyleClass().add("btn-secondary");
        btnMoveDown.setStyle("-fx-font-size: 11px; -fx-padding: 6 10;");
        btnMoveDown.setTooltip(new Tooltip("Bajar cliente en el orden de visita"));
        btnMoveDown.setOnAction(e -> moveSelectedRow(1));

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        searchRow.getChildren().addAll(searchField, lblFreq, cmbFreqFilter, btnAutoSort, btnMoveUp, btnMoveDown, spacer);

        routeContainer.getChildren().addAll(searchRow, buildTableCard());
        getChildren().add(routeContainer);
    }

    private void moveSelectedRow(int delta) {
        CollectionItem selected = table.getSelectionModel().getSelectedItem();
        if (selected == null) return;
        table.getSortOrder().clear();
        int idx = masterData.indexOf(selected);
        int targetIdx = idx + delta;
        if (idx >= 0 && targetIdx >= 0 && targetIdx < masterData.size()) {
            masterData.remove(idx);
            masterData.add(targetIdx, selected);
            table.getSelectionModel().select(selected);
        }
    }

    private void autoSortByPriority() {
        table.getSortOrder().clear();
        List<CollectionItem> sorted = new ArrayList<>(masterData);
        sorted.sort(Comparator
                .comparingInt(this::priorityRank)
                .thenComparing((CollectionItem i) -> i.overdueTotal() != null ? i.overdueTotal() : BigDecimal.ZERO, Comparator.reverseOrder())
                .thenComparing((CollectionItem i) -> i.installmentPending() != null ? i.installmentPending() : BigDecimal.ZERO, Comparator.reverseOrder())
                .thenComparing(CollectionItem::neighborhood, Comparator.nullsLast(String::compareToIgnoreCase))
                .thenComparing(CollectionItem::fullName, Comparator.nullsLast(String::compareToIgnoreCase)));
        masterData.setAll(sorted);
    }

    private int priorityRank(CollectionItem item) {
        String st = item.statusText() != null ? item.statusText().toUpperCase() : "";
        if (st.contains("EN MORA") || st.contains("VENCIDA") || (item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0)) return 1;
        if (!item.isPaidToday() && (st.contains("PENDIENTE") || st.contains("COBRO HOY"))) return 2;
        if (st.contains("PROMESA")) return 3;
        if (st.contains("PRÓXIMA CUOTA")) return 4;
        return 5; // PAGADO HOY
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
                    avatar.setPrefSize(32, 32);
                    avatar.setMinSize(32, 32);
                    avatar.setMaxSize(32, 32);
                    avatar.setStyle("-fx-background-color: #2563eb; -fx-background-radius: 16;");

                    VBox textGroup = new VBox(2);
                    Label name = new Label(item.fullName());
                    name.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px;");

                    String sub = (item.businessName().isBlank() ? "" : item.businessName() + " • ") + item.phone();
                    Label subtitle = new Label(sub);
                    subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    textGroup.getChildren().addAll(name, subtitle);
                    box.getChildren().addAll(avatar, textGroup);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colCustomer.setPrefWidth(220);

        // 2. Columna Dirección con Pin y Botón Google Maps
        TableColumn<CollectionItem, CollectionItem> colAddress = new TableColumn<>("DIRECCIÓN / UBICACIÓN");
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

                    HBox addrRow = new HBox(6);
                    addrRow.setAlignment(Pos.CENTER_LEFT);
                    Label address = new Label(item.address());
                    address.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 13px; -fx-font-weight: 500;");

                    Button btnMap = new Button("📍 Mapa");
                    btnMap.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-padding: 1 6; -fx-font-size: 10px; -fx-font-weight: bold;");
                    btnMap.setTooltip(new Tooltip("Abrir dirección en Google Maps"));
                    btnMap.setOnAction(e -> openMap(item.address(), item.neighborhood()));
                    addrRow.getChildren().addAll(address, btnMap);

                    Label neighborhood = new Label(item.neighborhood() + " • Ruta " + item.routeId());
                    neighborhood.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(addrRow, neighborhood);
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

                    boolean isFuture = item.statusText() != null && item.statusText().contains("PRÓXIMA CUOTA");
                    boolean isPending = !isFuture && item.installmentPending().compareTo(BigDecimal.ZERO) > 0;
                    Label amount = new Label(CURRENCY.format(item.installmentPending()));
                    amount.setStyle(isPending
                            ? "-fx-text-fill: #059669; -fx-font-weight: bold; -fx-font-size: 13px;"
                            : "-fx-text-fill: #94a3b8; -fx-font-weight: bold; -fx-font-size: 13px;");

                    HBox tagBox = new HBox(6);
                    tagBox.setAlignment(Pos.CENTER_LEFT);

                    Label tag = new Label("Cuota #" + item.installmentNumber());
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    Label freqTag = new Label(item.frequency());
                    freqTag.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-font-size: 9px; -fx-font-weight: bold; -fx-padding: 1 5 1 5; -fx-background-radius: 4; -fx-border-color: #bfdbfe; -fx-border-radius: 4;");

                    tagBox.getChildren().addAll(tag, freqTag);
                    box.getChildren().addAll(amount, tagBox);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colCuota.setPrefWidth(140);

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
                    amount.setStyle("-fx-text-fill: #2563eb; -fx-font-weight: bold; -fx-font-size: 13px;");

                    Label tag = new Label("Saldo crédito");
                    tag.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    box.getChildren().addAll(amount, tag);
                    setGraphic(box);
                    setText(null);
                }
            }
        });
        colBalance.setPrefWidth(130);

        // 5. Columna Estado (Pill Badge alineada con mobile)
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
                    String st = item.statusText() != null ? item.statusText().toUpperCase() : "";

                    if (item.isPaidToday() && !st.contains("EN MORA")) {
                        badge.setText("PAGADO HOY");
                        badge.getStyleClass().setAll("badge-al-dia");
                    } else if (st.contains("EN MORA") || st.contains("VENCIDA") || (item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0)) {
                        badge.setText("EN MORA");
                        badge.getStyleClass().setAll("badge-mora");
                    } else if (st.contains("PROMESA")) {
                        badge.setText("PROMESA");
                        badge.getStyleClass().setAll("badge-promesa");
                    } else if (st.contains("PRÓXIMA CUOTA")) {
                        badge.setText("PRÓXIMA CUOTA");
                        badge.getStyleClass().setAll("badge-proxima");
                    } else {
                        badge.setText("COBRO HOY");
                        badge.getStyleClass().setAll("badge-hoy");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(130);

        // 6. Columna Acción (Cobrar + Recibo/Recordatorio WhatsApp)
        TableColumn<CollectionItem, Void> colAction = new TableColumn<>("ACCIÓN");
        colAction.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(Void val, boolean empty) {
                super.updateItem(val, empty);
                if (empty) {
                    setGraphic(null);
                } else {
                    CollectionItem item = getTableView().getItems().get(getIndex());
                    HBox actBox = new HBox(6);
                    actBox.setAlignment(Pos.CENTER_LEFT);

                    Button btnWhatsApp = new Button("📲 WhatsApp");
                    btnWhatsApp.setStyle("-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #86efac; -fx-border-radius: 6; -fx-cursor: hand;");
                    btnWhatsApp.setOnAction(e -> sendQuickWhatsAppFor(item));

                    if (item.isPaidToday()) {
                        Button btnExtra = new Button("Abonar +");
                        btnExtra.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-cursor: hand;");
                        btnExtra.setOnAction(e -> {
                            PaymentDialog.show(primaryStage, item, paymentUseCase, systemSettingRepository, success -> {
                                if (success) {
                                    refreshData();
                                    if (onDataUpdated != null) onDataUpdated.run();
                                }
                            });
                        });

                        Button btnReceipt = new Button("Recibo");
                        btnReceipt.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-cursor: hand;");
                        btnReceipt.setOnAction(e -> showReceiptFor(item));

                        actBox.getChildren().addAll(btnExtra, btnReceipt, btnWhatsApp);
                    } else {
                        Button btnPay = new Button("Cobrar");
                        btnPay.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 5 14; -fx-background-radius: 6; -fx-cursor: hand;");
                        btnPay.setOnAction(e -> {
                            PaymentDialog.show(primaryStage, item, paymentUseCase, systemSettingRepository, success -> {
                                if (success) {
                                    refreshData();
                                    if (onDataUpdated != null) onDataUpdated.run();
                                }
                            });
                        });

                        actBox.getChildren().addAll(btnPay, btnWhatsApp);
                    }
                    setGraphic(actBox);
                }
            }
        });
        colAction.setPrefWidth(210);

        table.getColumns().addAll(colCustomer, colAddress, colCuota, colBalance, colStatus, colAction);

        // Footer Summary Bar
        HBox footer = new HBox(28);
        footer.getStyleClass().add("table-card-footer");
        footer.setAlignment(Pos.CENTER_LEFT);

        lblFooterClients.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        lblFooterPending.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        lblFooterTotalCuotas.setStyle("-fx-text-fill: #059669; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblFooterTotalBalance.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 12px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        footer.getChildren().addAll(lblFooterClients, lblFooterPending, spacer, lblFooterTotalCuotas, lblFooterTotalBalance);

        tableCard.getChildren().addAll(table, footer);
        return tableCard;
    }

    private void openReportExpenseDialog() {
        String collectorId = com.cartera.infrastructure.security.UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::userId)
                .orElse("usr-col-1");
        String routeId = com.cartera.infrastructure.security.UserSessionContext.getSelectedRouteId();
        if ("ALL".equalsIgnoreCase(routeId)) {
            routeId = "route-norte";
        }
        RouteExpenseDialog.show(primaryStage, collectorId, routeId, settlementUseCase, saved -> {
            if (saved) {
                refreshData();
                if (onDataUpdated != null) onDataUpdated.run();
            }
        });
    }

    private void openSyncMobileDialog() {
        new ImportMobileSyncDialog(
                primaryStage,
                paymentUseCase,
                cashMovementRepository,
                customerRepository,
                loanRepository,
                installmentRepository,
                createLoanUseCase,
                renewalRepository,
                paymentPromiseRepository,
                auditLogRepository,
                syncProcessorService,
                lanSyncServerService,
                () -> {
                    refreshData();
                    if (onDataUpdated != null) onDataUpdated.run();
                }
        ).show();
    }

    public void refreshData() {
        var items = collectionsService.getTodayCollectionItems(LocalDate.now());
        masterData.setAll(items);

        // Actualizar contadores de píldoras
        long totalCount = items.size();
        long cobrarHoyCount = items.stream().filter(i -> !i.isPaidToday() && (i.statusText() == null || !i.statusText().toUpperCase().contains("PRÓXIMA CUOTA"))).count();
        long moraCount = items.stream().filter(i -> (i.overdueTotal() != null && i.overdueTotal().compareTo(BigDecimal.ZERO) > 0) || (i.statusText() != null && (i.statusText().toUpperCase().contains("MORA") || i.statusText().toUpperCase().contains("VENCID")))).count();
        long alDiaCount = items.stream().filter(i -> (i.overdueTotal() == null || i.overdueTotal().compareTo(BigDecimal.ZERO) <= 0) && (i.statusText() == null || !i.statusText().toUpperCase().contains("MORA"))).count();
        long pagadosCount = items.stream().filter(CollectionItem::isPaidToday).count();
        long promesasCount = items.stream().filter(i -> i.statusText() != null && i.statusText().toUpperCase().contains("PROMESA")).count();

        btnPillTodos.setText("Todos (" + totalCount + ")");
        btnPillCobrarHoy.setText("Cobrar Hoy (" + cobrarHoyCount + ")");
        btnPillMora.setText("En Mora (" + moraCount + ")");
        btnPillAlDia.setText("Al Día (" + alDiaCount + ")");
        btnPillPagados.setText("Pagados (" + pagadosCount + ")");
        btnPillPromesas.setText("Promesas (" + promesasCount + ")");

        // Actualizar KPIs mini strip
        var m = collectionsService.getDailyMetrics(LocalDate.now());
        BigDecimal target = items.stream()
                .filter(i -> i.statusText() == null || !i.statusText().toUpperCase().contains("PRÓXIMA CUOTA"))
                .map(CollectionItem::installmentAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblKpiCollected.setText(CURRENCY.format(m.collectedToday() != null ? m.collectedToday() : BigDecimal.ZERO));
        lblKpiTarget.setText(CURRENCY.format(target.max(m.collectedToday() != null ? m.collectedToday() : BigDecimal.ZERO)));
        lblKpiPending.setText(cobrarHoyCount + " clientes");
        lblKpiOverdue.setText(CURRENCY.format(m.overdueAmount()) + " (" + moraCount + ")");

        updateStats(filteredData != null ? filteredData : masterData);
    }

    private void updateStats(List<CollectionItem> items) {
        int total = items.size();
        long pending = items.stream()
                .filter(i -> !i.isPaidToday() && (i.statusText() == null || !i.statusText().contains("PRÓXIMA CUOTA")))
                .count();
        BigDecimal totalCuotas = items.stream()
                .filter(i -> !i.isPaidToday() && (i.statusText() == null || !i.statusText().contains("PRÓXIMA CUOTA")))
                .map(CollectionItem::installmentPending)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalBalance = items.stream()
                .map(CollectionItem::loanBalance)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblCounter.setText(total + " clientes en vista • " + pending + " pendientes de cobro");
        lblFooterClients.setText("Total mostrados: " + total);
        lblFooterPending.setText("Pendientes: " + pending);
        lblFooterTotalCuotas.setText("Cuotas pendientes: " + CURRENCY.format(totalCuotas));
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

    private void openMap(String address, String neighborhood) {
        try {
            String query = java.net.URLEncoder.encode(address + ", " + neighborhood + ", Colombia", java.nio.charset.StandardCharsets.UTF_8);
            if (java.awt.Desktop.isDesktopSupported() && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                java.awt.Desktop.getDesktop().browse(new java.net.URI("https://www.google.com/maps/search/?api=1&query=" + query));
            }
        } catch (Exception ignored) {}
    }

    private void sendQuickWhatsAppFor(CollectionItem item) {
        String companyName = systemSettingRepository != null
                ? systemSettingRepository.findById("company_name").map(s -> s.getSettingValue()).orElse("SISTEMA DE CARTERA")
                : "SISTEMA DE CARTERA";
        String collectorName = com.cartera.infrastructure.security.UserSessionContext.getSession()
                .map(com.cartera.infrastructure.security.UserSession::fullName)
                .orElse("Cobrador de Ruta");

        String msg;
        if (item.isPaidToday()) {
            msg = WhatsAppReceiptUtil.generatePaymentReceiptMessage(
                    companyName,
                    "REC-" + item.loanId(),
                    item.fullName(),
                    item.documentNumber(),
                    item.installmentAmount(),
                    item.loanBalance(),
                    1,
                    "EFECTIVO",
                    collectorName,
                    LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
            );
        } else {
            BigDecimal paid = item.loanTotal().subtract(item.loanBalance()).max(BigDecimal.ZERO);
            int overdueCount = (item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0) ? 1 : 0;
            msg = WhatsAppReceiptUtil.generateAccountStatementMessage(
                    companyName,
                    item.fullName(),
                    item.loanId(),
                    item.loanTotal(),
                    paid,
                    item.loanBalance(),
                    overdueCount,
                    item.installmentPending(),
                    LocalDate.now().toString()
            );
        }
        WhatsAppReceiptUtil.sendViaWhatsApp(item.phone(), msg);
    }

    private void showReceiptFor(CollectionItem item) {
        String companyName = systemSettingRepository != null
                ? systemSettingRepository.findById("company_name").map(s -> s.getSettingValue()).orElse("SISTEMA DE CARTERA")
                : "SISTEMA DE CARTERA";
        ReceiptDialog.ReceiptData rData = new ReceiptDialog.ReceiptData(
                "REC-" + (item.loanId().length() > 8 ? item.loanId().substring(0, 8) : item.loanId()),
                item.fullName(),
                item.documentNumber(),
                item.loanId(),
                item.installmentAmount(),
                item.loanBalance(),
                1,
                "Cobrador de Ruta",
                "EFECTIVO",
                companyName,
                item.phone()
        );
        new ReceiptDialog(rData, primaryStage).show();
    }
}
