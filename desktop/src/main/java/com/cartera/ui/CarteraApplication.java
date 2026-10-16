package com.cartera.ui;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.ui.views.CashManagementView;
import com.cartera.ui.views.ConfigurationView;
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
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.stage.Screen;
import javafx.stage.Stage;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.util.HashMap;
import java.util.Map;

/** Native JavaFX entry point for Sistema de Cartera. */
public final class CarteraApplication extends Application {
    private ConfigurableApplicationContext context;
    private StackPane appRoot;
    private BorderPane root;
    private BorderPane mainContainer;
    private Label topTitle;
    private final Map<String, Button> navButtons = new HashMap<>();

    private AuthService authService;
    private LoginView loginView;
    private Label lblUserName;
    private Label lblUserRole;

    private DashboardView dashboardView;
    private TodayCollectionsView todayCollectionsView;
    private CustomersView customersView;
    private LoansView loansView;
    private TreasuryManagementView treasuryManagementView;
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
        authService = context.getBean(AuthService.class);

        root = new BorderPane();
        root.setStyle("-fx-background-color: #f8fafc;");

        // Inicializar vistas con servicios inyectados de Spring
        var collectionsService = context.getBean(TodayCollectionsService.class);
        var paymentUseCase = context.getBean(RecordPaymentUseCase.class);
        var customerRepository = context.getBean(CustomerRepository.class);
        var loanRepository = context.getBean(LoanRepository.class);
        var createCustomerUseCase = context.getBean(com.cartera.customers.application.CreateCustomerUseCase.class);
        var createLoanUseCase = context.getBean(com.cartera.loans.application.CreateLoanUseCase.class);
        var cashMovementRepository = context.getBean(com.cartera.infrastructure.persistence.repository.CashMovementRepository.class);
        var auditLogRepository = context.getBean(com.cartera.infrastructure.persistence.repository.AuditLogRepository.class);
        var dailySettlementRepository = context.getBean(com.cartera.infrastructure.persistence.repository.DailySettlementRepository.class);
        var settlementUseCase = context.getBean(com.cartera.settlement.application.SettlementUseCase.class);
        var installmentRepository = context.getBean(com.cartera.infrastructure.persistence.repository.InstallmentRepository.class);
        var renewLoanUseCase = context.getBean(com.cartera.renewals.application.RenewLoanUseCase.class);

        dashboardView = new DashboardView(collectionsService, () -> navigateTo("Cobros y Rutas"));

        todayCollectionsView = new TodayCollectionsView(collectionsService, paymentUseCase, settlementUseCase, dailySettlementRepository, stage, () -> {
            dashboardView.refresh();
            if (loansView != null) loansView.refresh();
            if (customersView != null) customersView.refresh();
        });

        loansView = new LoansView(loanRepository, customerRepository, installmentRepository, createLoanUseCase, renewLoanUseCase, stage, () -> {
            dashboardView.refresh();
            todayCollectionsView.refreshData();
            if (customersView != null) customersView.refresh();
        });

        customersView = new CustomersView(customerRepository, createCustomerUseCase, loanRepository, installmentRepository, createLoanUseCase, renewLoanUseCase, loansView, stage);

        var cashManagementView = new CashManagementView(cashMovementRepository, auditLogRepository, stage);
        var settlementManagementView = new SettlementManagementView(settlementUseCase, dailySettlementRepository);
        treasuryManagementView = new TreasuryManagementView(cashManagementView, settlementManagementView);

        var paymentRepository = context.getBean(com.cartera.infrastructure.persistence.repository.PaymentRepository.class);
        var settingRepository = context.getBean(com.cartera.infrastructure.persistence.repository.SystemSettingRepository.class);
        var userRepository = context.getBean(com.cartera.infrastructure.persistence.repository.AppUserRepository.class);

        reportsView = new ReportsView(loanRepository, installmentRepository, paymentRepository, customerRepository, auditLogRepository);
        configurationView = new ConfigurationView(settingRepository, userRepository, auditLogRepository, stage);

        mainContainer = new BorderPane();
        mainContainer.setStyle("-fx-background-color: #f8fafc;");
        mainContainer.setTop(topBar());

        root.setLeft(sidebar());
        root.setCenter(mainContainer);

        loginView = new LoginView(authService, this::onLoginSuccess);

        appRoot = new StackPane();
        appRoot.setStyle("-fx-background-color: #f1f5f9;");
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
    }

    private VBox navContainer;

    private void onLoginSuccess(UserSession session) {
        if (lblUserName != null) {
            lblUserName.setText(session.fullName());
        }
        if (lblUserRole != null) {
            String roleText = session.isAdmin() ? "Administrador • Acceso Total" : "Cobrador • Ruta Activa";
            lblUserRole.setText(roleText);
        }

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

        var versionLabel = new Label("v1.3.0 Desktop • SQLite Nativo");
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
            // Menú Ultra Limpio para Cobrador (solo lo que necesita)
            navContainer.getChildren().add(createSectionHeader("OPERACIÓN Y RUTA"));
            navContainer.getChildren().add(createNavButton("Ruta y Liquidación", "Cobros y Rutas"));
            navContainer.getChildren().add(createNavButton("Mis Clientes", "Clientes"));
        } else {
            // Menú Completo para Administrador
            navContainer.getChildren().add(createSectionHeader("GENERAL"));
            navContainer.getChildren().add(createNavButton("Panel Principal", "Inicio"));

            navContainer.getChildren().add(createSectionHeader("OPERACIÓN Y RUTA"));
            navContainer.getChildren().add(createNavButton("Ruta y Liquidación", "Cobros y Rutas"));
            navContainer.getChildren().add(createNavButton("Clientes y Créditos", "Clientes"));

            navContainer.getChildren().add(createSectionHeader("ADMINISTRACIÓN Y CONTROL"));
            navContainer.getChildren().add(createNavButton("Caja y Tesorería", "Tesorería y Cierres"));
            navContainer.getChildren().add(createNavButton("Informes y Auditoría", "Reportes"));
            navContainer.getChildren().add(createNavButton("Configuración", "Configuración"));
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
        var bar = new HBox();
        bar.getStyleClass().add("top-bar");
        bar.setAlignment(Pos.CENTER_LEFT);

        topTitle = new Label("Panel Principal");
        topTitle.getStyleClass().add("page-title");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        var status = new Label("OFFLINE \u2014 SQLite Activo");
        status.getStyleClass().add("status-ok");

        bar.getChildren().addAll(topTitle, spacer, status);
        return bar;
    }

    private void navigateTo(String viewName) {
        String effectiveTitle = viewName;
        String activeKey = viewName;

        Node viewNode;
        switch (viewName) {
            case "Cobros y Rutas":
            case "Cobros de hoy":
            case "Rutas":
            case "Liquidación":
                activeKey = "Cobros y Rutas";
                effectiveTitle = "Ruta y Liquidación Diaria";
                todayCollectionsView.refreshData();
                viewNode = todayCollectionsView;
                break;
            case "Clientes":
            case "Gestión de Cartera":
                activeKey = "Clientes";
                effectiveTitle = "Clientes y Créditos";
                customersView.refresh();
                customersView.showSection("customers");
                viewNode = customersView;
                break;
            case "Créditos":
            case "Préstamos":
                activeKey = "Clientes";
                effectiveTitle = "Clientes y Créditos";
                customersView.refresh();
                customersView.showSection("loans");
                viewNode = customersView;
                break;
            case "Tesorería y Cierres":
            case "Caja":
            case "Tesorería":
                activeKey = "Tesorería y Cierres";
                effectiveTitle = "Caja y Tesorería";
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
}
