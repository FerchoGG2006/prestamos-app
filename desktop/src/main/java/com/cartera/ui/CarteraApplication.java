package com.cartera.ui;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.ui.views.AuditView;
import com.cartera.ui.views.CashManagementView;
import com.cartera.ui.views.ConfigurationView;
import com.cartera.ui.views.CustomersView;
import com.cartera.ui.views.DashboardView;
import com.cartera.ui.views.LoansView;
import com.cartera.ui.views.LoginView;
import com.cartera.ui.views.PlaceholderView;
import com.cartera.ui.views.PortfolioManagementView;
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
    private PortfolioManagementView portfolioManagementView;
    private TreasuryManagementView treasuryManagementView;
    private AuditView auditView;
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
        root.setStyle("-fx-background-color: #0f172a;");

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
        todayCollectionsView = new TodayCollectionsView(collectionsService, paymentUseCase, stage, () -> {
            dashboardView.refresh();
            if (loansView != null) loansView.refresh();
            if (portfolioManagementView != null) portfolioManagementView.refresh();
        });
        customersView = new CustomersView(customerRepository, createCustomerUseCase, stage);
        loansView = new LoansView(loanRepository, customerRepository, installmentRepository, createLoanUseCase, renewLoanUseCase, stage, () -> {
            dashboardView.refresh();
            todayCollectionsView.refreshData();
            if (portfolioManagementView != null) portfolioManagementView.refresh();
        });
        portfolioManagementView = new PortfolioManagementView(customersView, loansView);

        var cashManagementView = new CashManagementView(cashMovementRepository, auditLogRepository, stage);
        var settlementManagementView = new SettlementManagementView(settlementUseCase, dailySettlementRepository);
        treasuryManagementView = new TreasuryManagementView(cashManagementView, settlementManagementView);

        var paymentRepository = context.getBean(com.cartera.infrastructure.persistence.repository.PaymentRepository.class);
        var settingRepository = context.getBean(com.cartera.infrastructure.persistence.repository.SystemSettingRepository.class);
        var userRepository = context.getBean(com.cartera.infrastructure.persistence.repository.AppUserRepository.class);

        auditView = new AuditView(auditLogRepository);
        reportsView = new ReportsView(loanRepository, installmentRepository, paymentRepository, customerRepository);
        configurationView = new ConfigurationView(settingRepository, userRepository, auditLogRepository, stage);

        mainContainer = new BorderPane();
        mainContainer.setStyle("-fx-background-color: #0f172a;");
        mainContainer.setTop(topBar());

        root.setLeft(sidebar());
        root.setCenter(mainContainer);

        loginView = new LoginView(authService, this::onLoginSuccess);

        appRoot = new StackPane();
        appRoot.setStyle("-fx-background-color: #0b1120;");
        // Iniciar en LoginView
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

    private void onLoginSuccess(UserSession session) {
        if (lblUserName != null) {
            lblUserName.setText("\uD83D\uDC64  " + session.fullName());
        }
        if (lblUserRole != null) {
            String roleText = session.isAdmin() ? "Administrador \u2022 Acceso Total" : "Cobrador \u2022 Ruta Activa";
            lblUserRole.setText(roleText);
        }

        navigateTo("Inicio");
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

        var logoBadge = new Label("\uD83D\uDCBC");
        logoBadge.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-font-size: 15px; -fx-padding: 8; -fx-background-radius: 8;");

        var brandText = new VBox(2);
        var title = new Label("SISTEMA CARTERA");
        title.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 14px; -fx-font-weight: bold;");
        var subtitle = new Label("Cobros & Administraci\u00f3n");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        brandText.getChildren().addAll(title, subtitle);

        brandBox.getChildren().addAll(logoBadge, brandText);

        // Tarjeta de Identificaci\u00f3n de Rol Dinámica
        var userCard = new VBox(3);
        userCard.getStyleClass().add("sidebar-user-card");
        lblUserName = new Label("\uD83D\uDC64  Carlos Cobrador");
        lblUserName.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 12px; -fx-font-weight: bold;");
        lblUserRole = new Label("Cobrador \u2022 Ruta Activa");
        lblUserRole.setStyle("-fx-text-fill: #10b981; -fx-font-size: 10px;");
        userCard.getChildren().addAll(lblUserName, lblUserRole);

        box.getChildren().addAll(brandBox, userCard);

        // 1. GENERAL
        box.getChildren().add(createSectionHeader("GENERAL"));
        box.getChildren().add(createNavButton("\uD83C\uDFE0  Panel Principal", "Inicio"));

        // 2. OPERACI\u00d3N Y RUTA (Cobrador)
        box.getChildren().add(createSectionHeader("OPERACI\u00d3N Y RUTA"));
        box.getChildren().add(createNavButton("\uD83D\uDCCD  Cobros y Rutas del D\u00eda", "Cobros y Rutas"));
        box.getChildren().add(createNavButton("\uD83D\uDC65  Gesti\u00f3n de Cartera", "Gesti\u00f3n de Cartera"));

        // 3. TESORER\u00cdA Y CIERRES
        box.getChildren().add(createSectionHeader("TESORER\u00cdA Y CIERRES"));
        box.getChildren().add(createNavButton("\uD83D\uDCB5  Tesorer\u00eda y Cierres", "Tesorer\u00eda y Cierres"));

        // 4. ADMINISTRACI\u00d3N Y CONTROL (Admin)
        box.getChildren().add(createSectionHeader("ADMINISTRACI\u00d3N Y CONTROL"));
        box.getChildren().add(createNavButton("\uD83D\uDCCA  Reportes y M\u00e9tricas", "Reportes"));
        box.getChildren().add(createNavButton("\uD83D\uDEE1\uFE0F  Auditor\u00eda del Sistema", "Auditor\u00eda"));
        box.getChildren().add(createNavButton("\u2699\uFE0F  Configuraci\u00f3n", "Configuraci\u00f3n"));

        // Espaciador para fijar la versión y logout abajo
        Region spacer = new Region();
        VBox.setVgrow(spacer, Priority.ALWAYS);
        box.getChildren().add(spacer);

        // Botón Cerrar Sesión
        Button btnLogout = new Button("\uD83D\uDEAA  Cerrar Sesi\u00f3n");
        btnLogout.getStyleClass().add("nav-button");
        btnLogout.setStyle("-fx-text-fill: #f87171; -fx-padding: 8 14; -fx-font-size: 13px;");
        btnLogout.setMaxWidth(Double.MAX_VALUE);
        btnLogout.setOnAction(e -> onLogout());
        box.getChildren().add(btnLogout);

        var versionLabel = new Label("v1.2.0 Desktop \u2022 SQLite Nativo");
        versionLabel.getStyleClass().add("sidebar-version");
        box.getChildren().add(versionLabel);

        ScrollPane scroll = new ScrollPane(box);
        scroll.getStyleClass().add("sidebar-scroll");
        scroll.setFitToWidth(true);
        scroll.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
        scroll.setVbarPolicy(ScrollPane.ScrollBarPolicy.AS_NEEDED);
        return scroll;
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

        var status = new Label("\u25CF OFFLINE \u2014 SQLite Activo");
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
                activeKey = "Cobros y Rutas";
                effectiveTitle = "Cobros y Rutas del D\u00eda";
                todayCollectionsView.refreshData();
                viewNode = todayCollectionsView;
                break;
            case "Gesti\u00f3n de Cartera":
                activeKey = "Gesti\u00f3n de Cartera";
                effectiveTitle = "Gesti\u00f3n de Cartera";
                portfolioManagementView.refresh();
                viewNode = portfolioManagementView;
                break;
            case "Clientes":
                activeKey = "Gesti\u00f3n de Cartera";
                effectiveTitle = "Gesti\u00f3n de Cartera";
                portfolioManagementView.showSection("customers");
                viewNode = portfolioManagementView;
                break;
            case "Cr\u00e9ditos":
                activeKey = "Gesti\u00f3n de Cartera";
                effectiveTitle = "Gesti\u00f3n de Cartera";
                portfolioManagementView.showSection("loans");
                viewNode = portfolioManagementView;
                break;
            case "Tesorer\u00eda y Cierres":
            case "Caja":
            case "Liquidaciones":
                activeKey = "Tesorer\u00eda y Cierres";
                effectiveTitle = "Tesorer\u00eda y Cierres";
                treasuryManagementView.refresh();
                viewNode = treasuryManagementView;
                break;
            case "Reportes":
                effectiveTitle = "Reportes y M\u00e9tricas";
                reportsView.refresh();
                viewNode = reportsView;
                break;
            case "Auditor\u00eda":
                effectiveTitle = "Auditor\u00eda del Sistema";
                auditView.refresh();
                viewNode = auditView;
                break;
            case "Configuraci\u00f3n":
                effectiveTitle = "Configuraci\u00f3n del Sistema";
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
