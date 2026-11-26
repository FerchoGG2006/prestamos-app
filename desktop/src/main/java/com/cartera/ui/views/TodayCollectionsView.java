package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.infrastructure.LanSyncServerService;
import com.cartera.ui.util.UiLabels;
import com.cartera.receipts.application.OfficialReceiptService;
import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;
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
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

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

    private PaymentRepository paymentRepository;
    private PaymentAllocationRepository paymentAllocationRepository;
    private RouteRepository routeRepository;
    private AppUserRepository appUserRepository;
    private com.cartera.customers.application.FollowUpService followUpService;
    private Map<String, String> routeNameCache = new HashMap<>();
    private Map<String, String> todayNonPaymentReasonByLoanId = new HashMap<>();
    private java.util.function.Consumer<String> onOpenCustomer360;

    public void setFollowUpService(com.cartera.customers.application.FollowUpService followUpService) {
        this.followUpService = followUpService;
    }

    public void setOnOpenCustomer360(java.util.function.Consumer<String> onOpenCustomer360) {
        this.onOpenCustomer360 = onOpenCustomer360;
    }

    public void setSupplementalRepositories(
            PaymentRepository paymentRepository,
            PaymentAllocationRepository paymentAllocationRepository,
            RouteRepository routeRepository,
            AppUserRepository appUserRepository
    ) {
        this.paymentRepository = paymentRepository;
        this.paymentAllocationRepository = paymentAllocationRepository;
        this.routeRepository = routeRepository;
        this.appUserRepository = appUserRepository;
    }

    private final ObservableList<CollectionItem> masterData = FXCollections.observableArrayList();
    private FilteredList<CollectionItem> filteredData;
    private final TableView<CollectionItem> table = new TableView<>();

    private Button btnReportExpense;
    private Button btnSyncMobile;
    private Button btnAutoSort;
    private Button btnMoveUp;
    private Button btnMoveDown;
    private TextField searchField;
    private ComboBox<String> cmbFreqFilter;

    public void clearFilters() {
        currentFilter = FilterPillType.TODOS;
        updatePillStyles();
        if (searchField != null) searchField.clear();
        if (cmbFreqFilter != null) cmbFreqFilter.setValue("TODAS");
        if (applyFiltersTrigger != null) applyFiltersTrigger.run();
    }

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
        btnReportExpense = new Button("Gasto de Ruta");
        btnReportExpense.getStyleClass().add("btn-secondary");
        btnReportExpense.setStyle("-fx-font-size: 12px; -fx-padding: 7 12;");
        btnReportExpense.setOnAction(e -> openReportExpenseDialog());

        // Botón Sincronizar Móvil (Solo ADMIN / SUPERVISOR)
        btnSyncMobile = new Button("Sincronizar Móvil");
        btnSyncMobile.getStyleClass().add("btn-primary");
        btnSyncMobile.setStyle("-fx-font-size: 12px; -fx-padding: 7 14;");
        btnSyncMobile.setOnAction(e -> openSyncMobileDialog());

        // Botón Actualizar
        Button btnRefresh = new Button("Actualizar");
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
                createMiniKpiCard("COBRADO HOY", lblKpiCollected),
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

        searchField = new TextField();
        searchField.setPromptText("Buscar cliente por nombre, cédula, dirección o barrio...");
        searchField.getStyleClass().add("search-field");
        searchField.setPrefWidth(340);

        Label lblFreq = new Label("Modalidad:");
        lblFreq.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");

        cmbFreqFilter = new ComboBox<>();
        cmbFreqFilter.getItems().addAll("TODAS", "DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "FECHA FIJA");
        cmbFreqFilter.setValue("TODAS");
        cmbFreqFilter.getStyleClass().add("search-field");
        cmbFreqFilter.setPrefWidth(130);

        filteredData = new FilteredList<>(masterData, p -> true);
        SortedList<CollectionItem> sortedData = new SortedList<>(filteredData);
        sortedData.comparatorProperty().bind(table.comparatorProperty());
        table.setItems(sortedData);
        table.setPlaceholder(UiLabels.emptyState("Sin cobros en vista", "No hay clientes que coincidan con la ruta o los filtros seleccionados."));

        applyFiltersTrigger = () -> {
            String q = searchField.getText() != null ? searchField.getText().toLowerCase().trim() : "";
            String selectedFreq = cmbFreqFilter.getValue();

            filteredData.setPredicate(item -> {
                // 1. Filtro de modalidad
                boolean matchesFreq = selectedFreq == null || "TODAS".equalsIgnoreCase(selectedFreq)
                        || selectedFreq.equalsIgnoreCase(item.frequency());
                if (!matchesFreq) return false;

                // 2. Filtro de píldora de estado (idéntico a móvil)
                boolean hasOverdue = isOverdueItem(item);
                String st = item.statusText() != null ? item.statusText().toUpperCase() : "";

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

                // 3. Filtro de texto (null-safe)
                if (q.isBlank()) return true;
                return safeLower(item.fullName()).contains(q)
                        || safeLower(item.documentNumber()).contains(q)
                        || safeLower(item.address()).contains(q)
                        || safeLower(item.neighborhood()).contains(q)
                        || safeLower(item.businessName()).contains(q);
            });

            updateStats(filteredData);
        };

        searchField.textProperty().addListener((obs, oldVal, newVal) -> applyFiltersTrigger.run());
        cmbFreqFilter.valueProperty().addListener((obs, oldVal, newVal) -> applyFiltersTrigger.run());

        // Botón Auto-Ordenar
        btnAutoSort = new Button("Auto-Ordenar Ruta");
        btnAutoSort.getStyleClass().add("btn-secondary");
        btnAutoSort.setStyle("-fx-font-size: 11px; -fx-padding: 6 12; -fx-font-weight: bold;");
        btnAutoSort.setTooltip(new Tooltip("Organizar clientes automáticamente: Mora → Cobro Hoy → Promesas → Pagados"));
        btnAutoSort.setOnAction(e -> autoSortByPriority());

        // Controles de mover manual
        btnMoveUp = new Button("Subir");
        btnMoveUp.getStyleClass().add("btn-secondary");
        btnMoveUp.setStyle("-fx-font-size: 11px; -fx-padding: 6 10;");
        btnMoveUp.setTooltip(new Tooltip("Subir cliente en el orden de visita"));
        btnMoveUp.setOnAction(e -> moveSelectedRow(-1));

        btnMoveDown = new Button("Bajar");
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

    private static String safeLower(String s) {
        return s != null ? s.toLowerCase(Locale.ROOT) : "";
    }

    private static boolean isOverdueItem(CollectionItem item) {
        String st = item.statusText() != null ? item.statusText().toUpperCase() : "";
        return (item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0)
                || st.contains("MORA")
                || st.contains("VENCID");
    }

    private void moveSelectedRow(int delta) {
        CollectionItem selected = table.getSelectionModel().getSelectedItem();
        if (selected == null) return;
        table.getSortOrder().clear();
        // Intercambiar con el elemento adyacente VISIBLE en la lista filtrada actual
        List<CollectionItem> visible = new ArrayList<>(filteredData);
        int visibleIdx = visible.indexOf(selected);
        int targetVisibleIdx = visibleIdx + delta;
        if (visibleIdx < 0 || targetVisibleIdx < 0 || targetVisibleIdx >= visible.size()) return;

        CollectionItem neighbor = visible.get(targetVisibleIdx);
        int masterIdx = masterData.indexOf(selected);
        int neighborMasterIdx = masterData.indexOf(neighbor);
        if (masterIdx >= 0 && neighborMasterIdx >= 0 && masterIdx != neighborMasterIdx) {
            masterData.set(masterIdx, neighbor);
            masterData.set(neighborMasterIdx, selected);
            table.getSelectionModel().select(selected);
            persistCurrentRouteOrder();
        }
    }

    private void persistCurrentRouteOrder() {
        if (collectionsService == null || masterData.isEmpty()) return;
        try {
            List<String> orderedCustomerIds = masterData.stream()
                    .map(CollectionItem::customerId)
                    .distinct()
                    .toList();
            collectionsService.saveCustomerRouteOrder(orderedCustomerIds);
        } catch (Exception ignored) {}
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
        persistCurrentRouteOrder();
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
                    HBox nameLine = new HBox(6);
                    nameLine.setAlignment(Pos.CENTER_LEFT);
                    if (item.orderIndex() > 0) {
                        Label ordBadge = new Label("#" + item.orderIndex());
                        ordBadge.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 1 5; -fx-background-radius: 5;");
                        nameLine.getChildren().add(ordBadge);
                    }
                    Label name = new Label(item.fullName());
                    name.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 13px;");
                    nameLine.getChildren().add(name);

                    String sub = (item.businessName().isBlank() ? "" : item.businessName() + " • ") + item.phone();
                    Label subtitle = new Label(sub);
                    subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

                    textGroup.getChildren().addAll(nameLine, subtitle);
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

                    Button btnMap = new Button("Mapa");
                    btnMap.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-padding: 1 6; -fx-font-size: 10px; -fx-font-weight: bold;");
                    btnMap.setTooltip(new Tooltip("Abrir dirección en Google Maps"));
                    btnMap.setOnAction(e -> openMap(item.address(), item.neighborhood()));
                    addrRow.getChildren().addAll(address, btnMap);

                    Label neighborhood = new Label(item.neighborhood() + " • " + resolveRouteName(item.routeId()));
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
                    String nonPayReason = todayNonPaymentReasonByLoanId.get(item.loanId());

                    if (item.isPaidToday() && !st.contains("EN MORA")) {
                        badge.setText("PAGADO HOY");
                        badge.getStyleClass().setAll("badge-al-dia");
                    } else if (nonPayReason != null && !item.isPaidToday()) {
                        badge.setText((st.contains("EN MORA") || st.contains("VENCIDA")) ? "MORA • NO PAGÓ" : "NO PAGÓ HOY");
                        badge.setStyle("-fx-background-color: #fff7ed; -fx-text-fill: #c2410c; -fx-border-color: #fdba74; -fx-border-radius: 10; -fx-background-radius: 10; -fx-padding: 3 8; -fx-font-size: 10.5px; -fx-font-weight: bold;");
                        badge.setTooltip(new Tooltip("Visita sin pago hoy: " + nonPayReason));
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
                if (empty || getIndex() < 0 || getIndex() >= getTableView().getItems().size()) {
                    setGraphic(null);
                } else {
                    CollectionItem item = getTableView().getItems().get(getIndex());
                    HBox actBox = new HBox(6);
                    actBox.setAlignment(Pos.CENTER_LEFT);

                    Button btnFicha = new Button("360°");
                    btnFicha.setTooltip(new Tooltip("Abrir Ficha 360° completa del cliente"));
                    btnFicha.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #0f172a; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-cursor: hand;");
                    btnFicha.setOnAction(e -> {
                        if (onOpenCustomer360 != null) onOpenCustomer360.accept(item.customerId());
                    });

                    Button btnWhatsApp = new Button("WhatsApp");
                    btnWhatsApp.setStyle("-fx-background-color: #dcfce7; -fx-text-fill: #15803d; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #86efac; -fx-border-radius: 6; -fx-cursor: hand;");
                    btnWhatsApp.setOnAction(e -> sendQuickWhatsAppFor(item));

                    if (item.isPaidToday()) {
                        Button btnExtra = new Button("Abonar +");
                        btnExtra.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-cursor: hand;");
                        btnExtra.setOnAction(e -> {
                            PaymentDialog.show(primaryStage, item, paymentUseCase, systemSettingRepository, loanRepository, success -> {
                                if (success) {
                                    refreshData();
                                    if (onDataUpdated != null) onDataUpdated.run();
                                }
                            });
                        });

                        Button btnReceipt = new Button("Recibo");
                        btnReceipt.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-cursor: hand;");
                        btnReceipt.setOnAction(e -> showReceiptFor(item));

                        actBox.getChildren().addAll(btnExtra, btnReceipt, btnFicha, btnWhatsApp);
                    } else {
                        Button btnPay = new Button("Cobrar");
                        btnPay.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 5 12; -fx-background-radius: 6; -fx-cursor: hand;");
                        btnPay.setOnAction(e -> {
                            PaymentDialog.show(primaryStage, item, paymentUseCase, systemSettingRepository, loanRepository, success -> {
                                if (success) {
                                    refreshData();
                                    if (onDataUpdated != null) onDataUpdated.run();
                                }
                            });
                        });

                        if (followUpService != null) {
                            Button btnNoPago = new Button("No pagó");
                            btnNoPago.setTooltip(new Tooltip("Registrar novedad de visita sin pago (sincroniza con Móvil)"));
                            btnNoPago.setStyle("-fx-background-color: #fff7ed; -fx-text-fill: #c2410c; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 8; -fx-background-radius: 6; -fx-border-color: #fdba74; -fx-border-radius: 6; -fx-cursor: hand;");
                            btnNoPago.setOnAction(e -> showQuickNonPaymentDialog(item));
                            actBox.getChildren().addAll(btnPay, btnNoPago, btnFicha, btnWhatsApp);
                        } else {
                            actBox.getChildren().addAll(btnPay, btnFicha, btnWhatsApp);
                        }
                    }
                    setGraphic(actBox);
                }
            }
        });
        colAction.setPrefWidth(295);

        table.setRowFactory(tv -> {
            TableRow<CollectionItem> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty() && onOpenCustomer360 != null) {
                    onOpenCustomer360.accept(row.getItem().customerId());
                }
            });
            return row;
        });

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

    private boolean isPolicyEnabled(String key) {
        if (systemSettingRepository == null) return true;
        return systemSettingRepository.findById(key)
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
    }

    private String resolveRouteName(String routeId) {
        if (routeId == null || routeId.isBlank()) return "Sin Ruta";
        return routeNameCache.getOrDefault(routeId, routeId);
    }

    private void showAlert(Alert.AlertType type, String title, String message) {
        Alert alert = new Alert(type, message);
        alert.initOwner(primaryStage);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.showAndWait();
    }

    private void openReportExpenseDialog() {
        boolean isCollector = UserSessionContext.getSession().map(UserSession::isCollector).orElse(false);
        if (isCollector && !isPolicyEnabled("route_allow_expenses")) {
            showAlert(Alert.AlertType.WARNING, "Política de Oficina",
                    "La oficina deshabilitó el registro de gastos desde la vista de cobrador.");
            return;
        }
        String routeId = UserSessionContext.getSelectedRouteId();
        if (routeId == null || "ALL".equalsIgnoreCase(routeId) || "NONE".equalsIgnoreCase(routeId)) {
            showAlert(Alert.AlertType.WARNING, "Selección de Ruta Requerida",
                    "Seleccione una ruta específica en la barra superior antes de registrar un gasto operativo.");
            return;
        }
        String collectorId = null;
        if (routeRepository != null) {
            collectorId = routeRepository.findById(routeId)
                    .map(RouteEntity::getCollectorId)
                    .filter(id -> id != null && !id.isBlank())
                    .orElse(null);
        }
        if (collectorId == null || collectorId.isBlank()) {
            collectorId = UserSessionContext.getSession()
                    .map(UserSession::userId)
                    .orElse(null);
        }
        if (collectorId == null || collectorId.isBlank()) {
            showAlert(Alert.AlertType.WARNING, "Sesión Requerida",
                    "No se pudo determinar el cobrador titular de la ruta seleccionada.");
            return;
        }
        RouteExpenseDialog.show(primaryStage, collectorId, routeId, LocalDate.now(), settlementUseCase, saved -> {
            if (saved) {
                refreshData();
                if (onDataUpdated != null) onDataUpdated.run();
            }
        });
    }

    private void openSyncMobileDialog() {
        if (!UserSessionContext.canCurrentUserReverseOrCancel()) {
            showAlert(Alert.AlertType.WARNING, "Acceso Restringido",
                    "La sincronización de oficina con dispositivos móviles está reservada para Administradores y Supervisores.");
            return;
        }
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
        boolean isCollector = UserSessionContext.getSession().map(UserSession::isCollector).orElse(false);
        if (btnSyncMobile != null) {
            btnSyncMobile.setVisible(!isCollector);
            btnSyncMobile.setManaged(!isCollector);
        }
        if (btnReportExpense != null) {
            boolean allowExp = !isCollector || isPolicyEnabled("route_allow_expenses");
            btnReportExpense.setVisible(allowExp);
            btnReportExpense.setManaged(allowExp);
        }
        boolean allowReorder = !isCollector || isPolicyEnabled("route_allow_reorder");
        if (btnAutoSort != null) btnAutoSort.setDisable(!allowReorder);
        if (btnMoveUp != null) btnMoveUp.setDisable(!allowReorder);
        if (btnMoveDown != null) btnMoveDown.setDisable(!allowReorder);

        Map<String, String> freshRoutes = new HashMap<>();
        if (routeRepository != null) {
            for (RouteEntity r : routeRepository.findAll()) {
                freshRoutes.put(r.getId(), r.getName() != null ? r.getName() : r.getId());
            }
        }
        routeNameCache = freshRoutes;

        String todayIso = LocalDate.now().toString();
        Map<String, String> freshNonPay = new HashMap<>();
        if (auditLogRepository != null) {
            for (var log : auditLogRepository.findAll()) {
                if (!"NON_PAYMENT_VISIT".equals(log.getEntityType()) || log.getEntityId() == null) continue;
                String newVal = log.getNewValue() != null ? log.getNewValue() : "";
                String createdAt = log.getCreatedAt() != null ? log.getCreatedAt() : "";
                boolean isToday = newVal.contains("Fecha=" + todayIso) || createdAt.startsWith(todayIso);
                if (isToday) {
                    freshNonPay.put(log.getEntityId(), log.getReason() != null ? log.getReason() : "No pagó");
                }
            }
        }
        todayNonPaymentReasonByLoanId = freshNonPay;

        var items = collectionsService.getTodayCollectionItems(LocalDate.now());
        masterData.setAll(items);

        // Actualizar contadores de píldoras (100% alineados con el predicado de filtrado)
        long totalCount = items.size();
        long cobrarHoyCount = items.stream().filter(i -> !i.isPaidToday() && (i.statusText() == null || !i.statusText().toUpperCase().contains("PRÓXIMA CUOTA"))).count();
        long moraCount = items.stream().filter(TodayCollectionsView::isOverdueItem).count();
        long alDiaCount = items.stream().filter(i -> !isOverdueItem(i)).count();
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

    private void showQuickNonPaymentDialog(CollectionItem item) {
        if (followUpService == null || item == null || item.loanId() == null) return;
        Dialog<ButtonType> dlg = new Dialog<>();
        if (primaryStage != null) dlg.initOwner(primaryStage);
        dlg.setTitle("Novedad de No Pago — " + item.fullName());
        dlg.setHeaderText("Registrar visita sin pago (" + item.fullName() + ")");

        ComboBox<String> cmbReason = new ComboBox<>();
        cmbReason.getItems().addAll(
                "No estaba en el domicilio",
                "Negocio / local cerrado",
                "Pidió pasar más tarde",
                "Sin dinero hoy",
                "Otro motivo"
        );
        cmbReason.setValue("No estaba en el domicilio");
        cmbReason.setMaxWidth(Double.MAX_VALUE);

        TextArea txtNotes = new TextArea();
        txtNotes.setPromptText("Nota adicional (opcional, ej. regresa a las 5pm)...");
        txtNotes.setPrefRowCount(3);
        txtNotes.setWrapText(true);

        VBox content = new VBox(8,
                new Label("Motivo de la visita no efectiva:"),
                cmbReason,
                new Label("Observación adicional (opcional):"),
                txtNotes
        );
        content.setPadding(new Insets(10, 4, 4, 4));
        content.setPrefWidth(390);
        dlg.getDialogPane().setContent(content);

        ButtonType btnSave = new ButtonType("Guardar Novedad", ButtonBar.ButtonData.OK_DONE);
        dlg.getDialogPane().getButtonTypes().setAll(ButtonType.CANCEL, btnSave);

        dlg.showAndWait().ifPresent(choice -> {
            if (choice == btnSave) {
                try {
                    String label = cmbReason.getValue() != null ? cmbReason.getValue().trim() : "No pagó";
                    String extra = txtNotes.getText() != null ? txtNotes.getText().trim() : "";
                    String formatted = extra.isBlank() ? label : (label + " — " + extra);
                    String id = "npv-" + System.currentTimeMillis() + "-" + (int) (Math.random() * 1000);
                    followUpService.visit(id, item.loanId(), formatted);
                    refreshData();
                    if (onDataUpdated != null) onDataUpdated.run();
                } catch (Exception ex) {
                    showAlert(Alert.AlertType.ERROR, "Error", "No se pudo registrar la novedad: " + ex.getMessage());
                }
            }
        });
    }

    private void openMap(String address, String neighborhood) {
        try {
            String city = systemSettingRepository != null
                    ? systemSettingRepository.findById("company_city").map(SystemSettingEntity::getSettingValue).orElse("")
                    : "";
            String combined = ((address != null ? address : "") + ", " + (neighborhood != null ? neighborhood : "")
                    + (city.isBlank() ? "" : ", " + city) + ", Colombia").replaceAll("^[,\\s]+", "");
            if (combined.equalsIgnoreCase("Colombia")) {
                showAlert(Alert.AlertType.WARNING, "Dirección Incompleta", "El cliente no tiene dirección registrada.");
                return;
            }
            String query = java.net.URLEncoder.encode(combined, java.nio.charset.StandardCharsets.UTF_8);
            if (java.awt.Desktop.isDesktopSupported() && java.awt.Desktop.getDesktop().isSupported(java.awt.Desktop.Action.BROWSE)) {
                java.awt.Desktop.getDesktop().browse(new java.net.URI("https://www.google.com/maps/search/?api=1&query=" + query));
            } else {
                showAlert(Alert.AlertType.WARNING, "Navegador no disponible", "No se pudo abrir Google Maps automáticamente en este equipo.");
            }
        } catch (Exception ex) {
            showAlert(Alert.AlertType.ERROR, "Error al abrir mapa", "No se pudo abrir Google Maps: " + ex.getMessage());
        }
    }

    private Optional<PaymentEntity> findLatestValidPayment(String loanId) {
        if (paymentRepository == null || loanId == null) return Optional.empty();
        String todayPrefix = LocalDate.now().toString();
        List<PaymentEntity> valid = paymentRepository.findByLoanId(loanId).stream()
                .filter(p -> !"ANULADO".equalsIgnoreCase(p.getStatus())
                        && !"REVERTIDO".equalsIgnoreCase(p.getStatus())
                        && !"REVERSED".equalsIgnoreCase(p.getStatus()))
                .sorted(Comparator.comparing((PaymentEntity p) -> p.getCreatedAt() != null ? p.getCreatedAt() : "").reversed())
                .toList();
        return valid.stream()
                .filter(p -> p.getCreatedAt() != null && p.getCreatedAt().startsWith(todayPrefix))
                .findFirst()
                .or(() -> valid.stream().findFirst());
    }

    private String resolveTargetWhatsAppPhone(CollectionItem item) {
        if (customerRepository != null && item.customerId() != null) {
            Optional<CustomerEntity> cust = customerRepository.findById(item.customerId());
            if (cust.isPresent() && cust.get().getAltPhone() != null && !cust.get().getAltPhone().isBlank()) {
                return cust.get().getAltPhone();
            }
        }
        return item.phone();
    }

    private String resolveCollectorDisplayName(String collectorId) {
        if (collectorId != null && !collectorId.isBlank() && appUserRepository != null) {
            Optional<String> name = appUserRepository.findById(collectorId).map(AppUserEntity::getFullName);
            if (name.isPresent() && !name.get().isBlank()) {
                return name.get();
            }
        }
        return UserSessionContext.getSession().map(UserSession::fullName).orElse("Cobrador de Ruta");
    }

    private String formatPaymentTimestamp(String createdAt) {
        if (createdAt == null || createdAt.isBlank()) {
            return LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        }
        try {
            LocalDateTime dt = LocalDateTime.parse(createdAt.length() >= 19 ? createdAt.substring(0, 19) : createdAt);
            return dt.format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        } catch (Exception ex) {
            return createdAt.replace("T", " ");
        }
    }

    private void sendQuickWhatsAppFor(CollectionItem item) {
        String companyName = systemSettingRepository != null
                ? systemSettingRepository.findById("company_name").map(SystemSettingEntity::getSettingValue).orElse("SISTEMA DE CARTERA")
                : "SISTEMA DE CARTERA";
        String targetPhone = resolveTargetWhatsAppPhone(item);

        String msg;
        if (item.isPaidToday()) {
            Optional<PaymentEntity> realPayment = findLatestValidPayment(item.loanId());
            String receiptId = realPayment.map(PaymentEntity::getId).orElse("REC-" + item.loanId());
            BigDecimal paidAmt = realPayment.map(PaymentEntity::getAmount).orElse(item.installmentAmount());
            String method = realPayment.map(PaymentEntity::getMethod).orElse("EFECTIVO");
            String collectorName = resolveCollectorDisplayName(realPayment.map(PaymentEntity::getCollectorId).orElse(null));
            int instCount = realPayment
                    .map(p -> paymentAllocationRepository != null ? Math.max(1, paymentAllocationRepository.findByPaymentId(p.getId()).size()) : 1)
                    .orElse(1);
            String ts = realPayment.map(p -> OfficialReceiptService.formatIsoToDisplay(p.getCreatedAt()))
                    .orElse(OfficialReceiptService.nowDisplay());
            String instLabel = instCount > 1 ? instCount + " cuotas" : "Cuota #" + item.installmentNumber();
            String loanShort = item.loanId() != null && item.loanId().length() > 8
                    ? "#" + item.loanId().substring(0, 8).toUpperCase()
                    : (item.loanId() != null ? item.loanId() : "");

            OfficialReceiptModel draft = new OfficialReceiptModel(
                    OfficialReceiptService.localCode(receiptId),
                    "PAYMENT",
                    receiptId,
                    companyName,
                    "",
                    item.fullName(),
                    item.documentNumber(),
                    targetPhone,
                    loanShort,
                    paidAmt,
                    "APPROVED",
                    ts,
                    "Pago de cuota · " + instLabel,
                    instLabel,
                    item.installmentAmount(),
                    item.loanBalance().max(BigDecimal.ZERO),
                    method,
                    null,
                    null,
                    0,
                    "",
                    null,
                    null,
                    null,
                    "",
                    "",
                    collectorName,
                    "",
                    false
            );
            OfficialReceiptModel published = OfficialReceiptService.publishOrFallback(draft);
            msg = WhatsAppReceiptUtil.formatOfficialReceiptWhatsAppMessage(published);
        } else {
            BigDecimal paid = item.loanTotal().subtract(item.loanBalance()).max(BigDecimal.ZERO);
            String todayStr = LocalDate.now().toString();
            int overdueCount = (item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0) ? 1 : 0;
            String nextDue = todayStr;
            if (installmentRepository != null) {
                List<InstallmentEntity> insts = installmentRepository.findByLoanId(item.loanId());
                overdueCount = (int) insts.stream().filter(i ->
                        i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0
                        && i.getDueDate() != null && i.getDueDate().compareTo(todayStr) < 0
                ).count();
                nextDue = insts.stream()
                        .filter(i -> i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0 && i.getDueDate() != null)
                        .map(InstallmentEntity::getDueDate)
                        .sorted()
                        .findFirst()
                        .orElse(todayStr);
            }
            msg = WhatsAppReceiptUtil.generateAccountStatementMessage(
                    companyName,
                    item.fullName(),
                    item.loanId(),
                    item.loanTotal(),
                    paid,
                    item.loanBalance(),
                    overdueCount,
                    item.installmentPending(),
                    nextDue
            );
        }
        if (!WhatsAppReceiptUtil.sendViaWhatsApp(targetPhone, msg)) {
            showAlert(Alert.AlertType.WARNING, "WhatsApp",
                    "El mensaje se copió al portapapeles, pero no se pudo abrir WhatsApp automáticamente. Verifique el número (" + targetPhone + ").");
        }
    }

    private void showReceiptFor(CollectionItem item) {
        String companyName = systemSettingRepository != null
                ? systemSettingRepository.findById("company_name").map(SystemSettingEntity::getSettingValue).orElse("SISTEMA DE CARTERA")
                : "SISTEMA DE CARTERA";
        String targetPhone = resolveTargetWhatsAppPhone(item);
        Optional<PaymentEntity> realPayment = findLatestValidPayment(item.loanId());

        String receiptId = realPayment.map(PaymentEntity::getId)
                .orElse("REC-" + (item.loanId().length() > 8 ? item.loanId().substring(0, 8) : item.loanId()));
        BigDecimal paidAmt = realPayment.map(PaymentEntity::getAmount).orElse(item.installmentAmount());
        String method = realPayment.map(PaymentEntity::getMethod).orElse("EFECTIVO");
        String collectorName = resolveCollectorDisplayName(realPayment.map(PaymentEntity::getCollectorId).orElse(null));
        int instCount = realPayment
                .map(p -> paymentAllocationRepository != null ? Math.max(1, paymentAllocationRepository.findByPaymentId(p.getId()).size()) : 1)
                .orElse(1);
        String ts = realPayment.map(p -> formatPaymentTimestamp(p.getCreatedAt())).orElse(null);

        ReceiptDialog.ReceiptData rData = new ReceiptDialog.ReceiptData(
                receiptId,
                item.fullName(),
                item.documentNumber(),
                item.loanId(),
                paidAmt,
                item.loanBalance(),
                instCount,
                collectorName,
                method,
                companyName,
                targetPhone
        );
        new ReceiptDialog(rData, ts, primaryStage).show();
    }
}
