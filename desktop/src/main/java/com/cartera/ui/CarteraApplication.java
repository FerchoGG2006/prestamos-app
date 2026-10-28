package com.cartera.ui;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CancelLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.ReversePaymentUseCase;
import com.cartera.reports.application.ExcelReportExporter;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.infrastructure.LanSyncServerService;
import com.cartera.ui.views.CashManagementView;
import com.cartera.ui.views.ConfigurationView;
import com.cartera.ui.views.CreditHistoryView;
import com.cartera.ui.views.CustomersView;
import com.cartera.ui.views.DashboardView;
import com.cartera.ui.views.LoansView;
import com.cartera.ui.views.LoginView;
import com.cartera.ui.views.ReportsView;
import com.cartera.ui.views.SettlementManagementView;
import com.cartera.ui.views.TodayCollectionsView;
import com.cartera.ui.views.TreasuryManagementView;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.geometry.Rectangle2D;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.text.Font;
import javafx.stage.Screen;
import javafx.stage.Stage;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Native JavaFX entry point for Sistema de Cartera. */
public final class CarteraApplication extends Application {

    public record GlobalRouteOption(String id, String displayName) {
        @Override
        public String toString() {
            return displayName;
        }
    }

    private ConfigurableApplicationContext context;
    private StackPane appRoot;
    private BorderPane root;
    private BorderPane mainContainer;
    private Label topTitle;
    private final Map<String, Button> navButtons = new HashMap<>();

    private AuthService authService;
    private RouteRepository routeRepository;
    private LoginView loginView;
    private Label lblUserName;
    private Label lblUserRole;
    private final ComboBox<GlobalRouteOption> cmbGlobalRoute = new ComboBox<>();

    private DashboardView dashboardView;
    private TodayCollectionsView todayCollectionsView;
    private CustomersView customersView;
    private LoansView loansView;
    private CreditHistoryView creditHistoryView;
    private SettlementManagementView settlementManagementView;
    private TreasuryManagementView treasuryManagementView;
    private CashManagementView cashManagementView;
    private ReportsView reportsView;
    private ConfigurationView configurationView;

    @Override
    public void init() throws Exception {
        java.nio.file.Files.createDirectories(
                java.nio.file.Paths.get(System.getProperty("user.home"), ".sistema-cartera")
        );
        context = new SpringApplicationBuilder(CarteraInfrastructureApplication.class)
                .web(WebApplicationType.NONE)
                .headless(false)
                .run();
    }

    @Override
    public void start(Stage stage) {
        var fontStream = getClass().getResourceAsStream("/ui/fonts/Manrope-Variable.ttf");
        if (fontStream != null) {
            Font.loadFont(fontStream, 14);
        }
        authService = context.getBean(AuthService.class);
        routeRepository = context.getBean(RouteRepository.class);

        root = new BorderPane();
        root.setStyle("-fx-background-color: #F6F4EE;");

        // Inicializar vistas con servicios inyectados de Spring
        var collectionsService = context.getBean(TodayCollectionsService.class);
        var paymentUseCase = context.getBean(RecordPaymentUseCase.class);
        var reversePaymentUseCase = context.getBean(ReversePaymentUseCase.class);
        var customerRepository = context.getBean(CustomerRepository.class);
        var loanRepository = context.getBean(LoanRepository.class);
        var createCustomerUseCase = context.getBean(com.cartera.customers.application.CreateCustomerUseCase.class);
        var createLoanUseCase = context.getBean(com.cartera.loans.application.CreateLoanUseCase.class);
        var cancelLoanUseCase = context.getBean(CancelLoanUseCase.class);
        var cashMovementRepository = context.getBean(CashMovementRepository.class);
        var auditLogRepository = context.getBean(AuditLogRepository.class);
        var dailySettlementRepository = context.getBean(DailySettlementRepository.class);
        var settlementUseCase = context.getBean(com.cartera.settlement.application.SettlementUseCase.class);
        var installmentRepository = context.getBean(InstallmentRepository.class);
        var renewLoanUseCase = context.getBean(com.cartera.renewals.application.RenewLoanUseCase.class);
        var renewalRepository = context.getBean(RenewalRepository.class);
        var paymentPromiseRepository = context.getBean(PaymentPromiseRepository.class);
        var settingRepository = context.getBean(SystemSettingRepository.class);
        var userRepository = context.getBean(AppUserRepository.class);
        var paymentRepository = context.getBean(PaymentRepository.class);
        var paymentAllocationRepository = context.getBean(PaymentAllocationRepository.class);
        var syncProcessorService = context.getBean(MobileSyncProcessorService.class);
        var lanSyncServerService = context.getBean(LanSyncServerService.class);
        var excelReportExporter = context.getBean(ExcelReportExporter.class);
        var databaseBackupService = context.getBean(DatabaseBackupService.class);

        dashboardView = new DashboardView(collectionsService, routeRepository, userRepository, this::navigateTo, this::selectGlobalRoute);

        todayCollectionsView = new TodayCollectionsView(
                collectionsService,
                paymentUseCase,
                settlementUseCase,
                cashMovementRepository,
                customerRepository,
                loanRepository,
                installmentRepository,
                createLoanUseCase,
                renewalRepository,
                paymentPromiseRepository,
                auditLogRepository,
                settingRepository,
                syncProcessorService,
                lanSyncServerService,
                stage,
                () -> {
                    dashboardView.refresh();
                    if (loansView != null) loansView.refresh();
                    if (customersView != null) customersView.refresh();
                }
        );

        loansView = new LoansView(
                loanRepository,
                customerRepository,
                installmentRepository,
                createLoanUseCase,
                renewLoanUseCase,
                cancelLoanUseCase,
                settingRepository,
                routeRepository,
                stage,
                () -> {
                    dashboardView.refresh();
                    todayCollectionsView.refreshData();
                    if (customersView != null) customersView.refresh();
                }
        );

        customersView = new CustomersView(
                customerRepository,
                createCustomerUseCase,
                loanRepository,
                installmentRepository,
                paymentRepository,
                paymentAllocationRepository,
                createLoanUseCase,
                renewLoanUseCase,
                settingRepository,
                auditLogRepository,
                routeRepository,
                reversePaymentUseCase,
                cancelLoanUseCase,
                loansView,
                stage
        );

        var creditHistoryService = context.getBean(com.cartera.history.application.CreditHistoryService.class);
        creditHistoryView = new CreditHistoryView(creditHistoryService, stage);
        customersView.setOnOpenCreditHistory(doc -> {
            navigateTo("Historial");
            creditHistoryView.queryByDocument(doc);
        });

        var cashMovementUseCase = context.getBean(com.cartera.settlement.application.CashMovementUseCase.class);
        cashManagementView = new CashManagementView(cashMovementRepository, cashMovementUseCase, routeRepository, stage);

        settlementManagementView = new SettlementManagementView(settlementUseCase, dailySettlementRepository, userRepository, routeRepository, stage);
        treasuryManagementView = new TreasuryManagementView(cashManagementView, settlementManagementView);

        reportsView = new ReportsView(loanRepository, installmentRepository, paymentRepository, customerRepository, auditLogRepository, excelReportExporter, stage);
        configurationView = new ConfigurationView(settingRepository, userRepository, auditLogRepository, routeRepository, databaseBackupService, stage);
        configurationView.setOnRoutesChanged(this::reloadGlobalRoutes);

        mainContainer = new BorderPane();
        mainContainer.setStyle("-fx-background-color: #F6F4EE;");
        mainContainer.setTop(topBar());

        root.setLeft(sidebar());
        root.setCenter(mainContainer);

        loginView = new LoginView(authService, this::onLoginSuccess);

        appRoot = new StackPane();
        appRoot.setStyle("-fx-background-color: #F6F4EE;");
        appRoot.getChildren().add(loginView);

        Rectangle2D visualBounds = Screen.getPrimary().getVisualBounds();
        double initialWidth = Math.min(1280, visualBounds.getWidth());
        double initialHeight = Math.min(800, visualBounds.getHeight());

        var scene = new Scene(appRoot, initialWidth, initialHeight);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());

        stage.setTitle("Sistema de Cartera y Cobros");
        try {
            var iconStream = getClass().getResourceAsStream("/ui/icon.png");
            if (iconStream != null) {
                stage.getIcons().add(new javafx.scene.image.Image(iconStream));
            }
        } catch (Exception ignored) {}
        stage.setMinWidth(960);
        stage.setMinHeight(580);
        stage.setScene(scene);
        stage.setMaximized(true);
        stage.show();
        stage.toFront();
        stage.requestFocus();
    }

    private VBox navContainer;

    private void onLoginSuccess(UserSession session) {
        if (lblUserName != null) {
            lblUserName.setText(session.fullName());
        }
        if (lblUserRole != null) {
            String roleText = session.isAdmin()
                    ? "Administrador • Acceso Total"
                    : (session.isSupervisor() ? "Supervisor • Control Operativo" : "Cobrador • Ruta Activa");
            lblUserRole.setText(roleText);
        }

        reloadGlobalRoutes();
        buildSidebarMenu(session);

        if (session.isCollector()) {
            navigateTo("Cobros y Rutas");
        } else {
            navigateTo("Inicio");
        }
        appRoot.getChildren().setAll(root);
    }

    private void onLogout() {
        authService.logout();
        loginView.reset();
        appRoot.getChildren().setAll(loginView);
    }

    private Node sidebar() {
        var box = new VBox(4);
        box.getStyleClass().add("sidebar");
        box.setFillWidth(true);

        // Encabezado de Marca
        var brandBox = new HBox(10);
        brandBox.setAlignment(Pos.CENTER_LEFT);
        brandBox.setPadding(new Insets(0, 0, 16, 4));

        var logoBadge = new Label("SC");
        logoBadge.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-font-size: 14px; -fx-font-weight: bold; -fx-padding: 8 10; -fx-background-radius: 8;");

        var brandText = new VBox(2);
        var title = new Label("SISTEMA CARTERA");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");
        var subtitle = new Label("Cobros & Administración");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        brandText.getChildren().addAll(title, subtitle);

        brandBox.getChildren().addAll(logoBadge, brandText);

        // Tarjeta de Identificación de Rol Dinámica
        var userCard = new VBox(3);
        userCard.getStyleClass().add("sidebar-user-card");
        lblUserName = new Label("Usuario");
        lblUserName.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblUserRole = new Label("Sesión Activa");
        lblUserRole.setStyle("-fx-text-fill: #059669; -fx-font-size: 10px; -fx-font-weight: bold;");
        userCard.getChildren().addAll(lblUserName, lblUserRole);

        box.getChildren().addAll(brandBox, userCard);

        navContainer = new VBox(4);
        box.getChildren().add(navContainer);

        // Espaciador para fijar la versión y logout abajo
        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);
        box.getChildren().add(spacer);

        // Botón Cerrar Sesión
        Button btnLogout = new Button("Cerrar Sesión");
        btnLogout.getStyleClass().add("nav-button");
        btnLogout.setStyle("-fx-text-fill: #dc2626; -fx-padding: 8 14; -fx-font-size: 13px;");
        btnLogout.setMaxWidth(Double.MAX_VALUE);
        btnLogout.setOnAction(e -> onLogout());
        box.getChildren().add(btnLogout);

        var versionLabel = new Label("Sistema Cartera v1.4 • Operación Segura");
        versionLabel.getStyleClass().add("sidebar-version");
        box.getChildren().add(versionLabel);

        ScrollPane scroll = new ScrollPane(box);
        scroll.getStyleClass().add("sidebar-scroll");
        scroll.setFitToWidth(true);
        scroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        scroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.AS_NEEDED);
        return scroll;
    }

    private void buildSidebarMenu(UserSession session) {
        if (navContainer == null) return;
        navContainer.getChildren().clear();
        navButtons.clear();

        if (session != null && session.isCollector()) {
            // Menú Ultra Limpio para Cobrador (solo lo que necesita para su trabajo en calle)
            navContainer.getChildren().add(createSectionHeader("OPERACIÓN Y RUTA"));
            navContainer.getChildren().add(createNavButton("Mi Ruta de Hoy", "Cobros y Rutas"));
            navContainer.getChildren().add(createNavButton("Mis Clientes", "Clientes"));
            navContainer.getChildren().add(createNavButton("Historial Crediticio", "Historial"));
        } else {
            // Menú 100% Gerencial de Administración de Rutas
            navContainer.getChildren().add(createSectionHeader("CENTRO DE CONTROL"));
            navContainer.getChildren().add(createNavButton("Panel Multi-Ruta", "Inicio"));
            navContainer.getChildren().add(createNavButton("Supervisión de Cobros", "Cobros y Rutas"));
            navContainer.getChildren().add(createNavButton("Liquidación y Arqueo", "Liquidación Diaria"));

            navContainer.getChildren().add(createSectionHeader("PATRIMONIO Y CARTERA"));
            navContainer.getChildren().add(createNavButton("Patrimonio & Caja", "Administrativo"));
            navContainer.getChildren().add(createNavButton("Clientes de la Red", "Clientes"));
            navContainer.getChildren().add(createNavButton("Créditos Otorgados", "Créditos"));
            navContainer.getChildren().add(createNavButton("Consulta Crediticia Global", "Historial"));

            navContainer.getChildren().add(createSectionHeader("ADMINISTRACIÓN"));
            navContainer.getChildren().add(createNavButton("Informes & Auditoría", "Reportes"));
            navContainer.getChildren().add(createNavButton("Configuración del Sistema", "Configuración"));
        }
    }

    private Label createSectionHeader(String title) {
        var lbl = new Label(title);
        lbl.getStyleClass().add("sidebar-section-header");
        return lbl;
    }

    private Button createNavButton(String text, String actionKey) {
        var button = new Button(text);
        button.getStyleClass().add("nav-button");
        button.setMaxWidth(Double.MAX_VALUE);
        button.setOnAction(e -> navigateTo(actionKey));
        navButtons.put(actionKey, button);
        return button;
    }

    private HBox topBar() {
        var bar = new HBox(14);
        bar.getStyleClass().add("top-bar");
        bar.setAlignment(Pos.CENTER_LEFT);

        topTitle = new Label("Panel Principal");
        topTitle.getStyleClass().add("page-title");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        // Selector Global de Ruta Activa
        HBox routeSelectorBox = new HBox(8);
        routeSelectorBox.setAlignment(Pos.CENTER_LEFT);
        Label lblRoute = new Label("📍 Ruta Activa:");
        lblRoute.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px; -fx-font-weight: bold;");

        cmbGlobalRoute.setPrefWidth(220);
        cmbGlobalRoute.getStyleClass().add("search-field");
        reloadGlobalRoutes();
        cmbGlobalRoute.setOnAction(e -> {
            GlobalRouteOption opt = cmbGlobalRoute.getValue();
            if (opt != null) {
                UserSessionContext.setSelectedRouteId(opt.id());
                refreshActiveViews();
            }
        });
        routeSelectorBox.getChildren().addAll(lblRoute, cmbGlobalRoute);

        var status = new Label("● Conectado • Listo para Operar");
        status.getStyleClass().add("status-ok");

        bar.getChildren().addAll(topTitle, spacer, routeSelectorBox, status);
        return bar;
    }

    private void reloadGlobalRoutes() {
        String prevSelected = UserSessionContext.getSelectedRouteId();
        cmbGlobalRoute.getItems().clear();
        GlobalRouteOption allOption = new GlobalRouteOption("ALL", "Todas las Rutas (Consolidado)");
        cmbGlobalRoute.getItems().add(allOption);

        GlobalRouteOption targetSelection = allOption;
        if (routeRepository != null) {
            List<RouteEntity> routes = routeRepository.findAll();
            for (RouteEntity r : routes) {
                if (r.getActive() != null && r.getActive() == 0) continue;
                GlobalRouteOption opt = new GlobalRouteOption(r.getId(), r.getName());
                cmbGlobalRoute.getItems().add(opt);
                if (prevSelected != null && prevSelected.equalsIgnoreCase(r.getId())) {
                    targetSelection = opt;
                }
            }
        }
        cmbGlobalRoute.setValue(targetSelection);
    }

    public void selectGlobalRoute(String routeId) {
        if (routeId == null) return;
        for (GlobalRouteOption opt : cmbGlobalRoute.getItems()) {
            if (routeId.equalsIgnoreCase(opt.id())) {
                cmbGlobalRoute.setValue(opt);
                UserSessionContext.setSelectedRouteId(opt.id());
                refreshActiveViews();
                break;
            }
        }
    }

    private void refreshActiveViews() {
        if (dashboardView != null) dashboardView.refresh();
        if (todayCollectionsView != null) todayCollectionsView.refreshData();
        if (customersView != null) customersView.refresh();
        if (loansView != null) loansView.refresh();
        if (settlementManagementView != null) settlementManagementView.refresh();
        if (cashManagementView != null) cashManagementView.refresh();
        if (reportsView != null) reportsView.refresh();
    }

    private void navigateTo(String viewName) {
        String effectiveTitle = viewName;
        String activeKey = viewName;

        Node viewNode;
        switch (viewName) {
            case "Liquidación Diaria":
            case "Liquidación":
                activeKey = "Liquidación Diaria";
                effectiveTitle = "Liquidación y Arqueo Diario de Rutas";
                if (settlementManagementView != null) settlementManagementView.refresh();
                viewNode = settlementManagementView;
                break;
            case "Cobros y Rutas":
            case "Cobros de hoy":
            case "Rutas":
                activeKey = "Cobros y Rutas";
                effectiveTitle = "Supervisión de Cobros y Rutas";
                todayCollectionsView.refreshData();
                viewNode = todayCollectionsView;
                break;
            case "Clientes":
            case "Gestión de Cartera":
                activeKey = "Clientes";
                effectiveTitle = "Clientes de la Red";
                customersView.refresh();
                customersView.showSection("customers");
                viewNode = customersView;
                break;
            case "Créditos":
            case "Préstamos":
                activeKey = "Créditos";
                effectiveTitle = "Créditos Otorgados de la Red";
                customersView.refresh();
                customersView.showSection("loans");
                viewNode = customersView;
                break;
            case "Historial":
            case "Historial Crediticio":
            case "Historial de Clientes":
                activeKey = "Historial";
                effectiveTitle = "Historial Crediticio por Cédula";
                if (creditHistoryView != null) creditHistoryView.refresh();
                viewNode = creditHistoryView;
                break;
            case "Administrativo":
            case "Administrativo de Ruta":
            case "Tesorería y Cierres":
            case "Caja":
            case "Tesorería":
                activeKey = "Administrativo";
                effectiveTitle = "Administrativo de Ruta (Patrimonio, Base y Cierres)";
                treasuryManagementView.refresh();
                viewNode = treasuryManagementView;
                break;
            case "Reportes":
                activeKey = "Reportes";
                effectiveTitle = "Informes y Auditoría";
                reportsView.refresh();
                reportsView.showSection("reports");
                viewNode = reportsView;
                break;
            case "Auditoría":
                activeKey = "Reportes";
                effectiveTitle = "Informes y Auditoría";
                reportsView.refresh();
                reportsView.showSection("audit");
                viewNode = reportsView;
                break;
            case "Configuración":
                activeKey = "Configuración";
                effectiveTitle = "Configuración del Sistema";
                configurationView.refreshUsers();
                viewNode = configurationView;
                break;
            case "Inicio":
            default:
                activeKey = "Inicio";
                effectiveTitle = "Panel Principal";
                dashboardView.refresh();
                viewNode = dashboardView;
                break;
        }

        topTitle.setText(effectiveTitle);

        // Actualizar estilo visual del botón activo
        final String currentActiveKey = activeKey;
        navButtons.forEach((key, btn) -> {
            btn.getStyleClass().remove("nav-button-active");
            if (key.equals(currentActiveKey)) {
                btn.getStyleClass().add("nav-button-active");
            }
        });

        mainContainer.setCenter(viewNode);
    }

    @Override
    public void stop() {
        if (context != null) {
            context.close();
        }
        Platform.exit();
    }

    public static void main(String[] args) {
        Application.launch(CarteraApplication.class, args);
    }
}
