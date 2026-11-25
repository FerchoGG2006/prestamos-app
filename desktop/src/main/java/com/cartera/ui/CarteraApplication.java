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
import com.cartera.infrastructure.version.AppVersion;
import com.cartera.infrastructure.version.DesktopOtaService;
import com.cartera.infrastructure.version.DesktopUpdateChecker;
import com.cartera.ui.util.MotionUtil;
import com.cartera.ui.views.CashManagementView;
import com.cartera.ui.views.ConfigurationView;
import com.cartera.ui.views.CreditHistoryView;
import com.cartera.ui.views.Customer360Dialog;
import com.cartera.ui.views.CustomersView;
import com.cartera.ui.views.DashboardView;
import com.cartera.ui.views.LoansView;
import com.cartera.ui.views.LoginView;
import com.cartera.ui.views.NotificationsDialog;
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
    private TodayCollectionsService collectionsService;
    private DesktopUpdateChecker desktopUpdateChecker;
    private DesktopOtaService desktopOtaService;
    private Customer360Dialog.Services customer360Services;
    private Stage primaryStage;
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
    private SettlementManagementView treasurySettlementView;
    private TreasuryManagementView treasuryManagementView;
    private CashManagementView cashManagementView;
    private ReportsView reportsView;
    private ConfigurationView configurationView;
    private LanSyncServerService lanSyncServerService;
    private boolean updatingGlobalRoute = false;

    @Override
    public void init() throws Exception {
        CarteraMain.configureRegionalDefaults();
        String office=getParameters().getNamed().get("office-dir");
        if(office!=null&&!office.isBlank()){
            var folder=java.nio.file.Path.of(office).toAbsolutePath().normalize();java.nio.file.Files.createDirectories(folder);
            System.setProperty("spring.datasource.url","jdbc:sqlite:"+folder.resolve("cartera.db"));
            System.setProperty("cartera.demo-data.enabled","false");
        }
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
        // Registrar tipografía oficial Manrope con todos sus pesos en JavaFX
        String[] fontResources = {
            "/ui/fonts/Manrope-Regular.ttf",
            "/ui/fonts/Manrope-Medium.ttf",
            "/ui/fonts/Manrope-SemiBold.ttf",
            "/ui/fonts/Manrope-Bold.ttf",
            "/ui/fonts/Manrope-ExtraBold.ttf"
        };
        for (String resourcePath : fontResources) {
            var fontStream = getClass().getResourceAsStream(resourcePath);
            if (fontStream != null) {
                Font.loadFont(fontStream, 14);
            }
        }
        authService = context.getBean(AuthService.class);
        routeRepository = context.getBean(RouteRepository.class);
        this.primaryStage = stage;

        root = new BorderPane();
        root.setStyle("-fx-background-color: #F6F4EE;");

        // Inicializar vistas con servicios inyectados de Spring
        this.collectionsService = context.getBean(TodayCollectionsService.class);
        var collectionsService = this.collectionsService;
        this.desktopUpdateChecker = context.getBean(DesktopUpdateChecker.class);
        this.desktopOtaService = context.getBean(DesktopOtaService.class);
        this.desktopOtaService.markCurrentBootHealthy();
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
        this.lanSyncServerService = context.getBean(LanSyncServerService.class);
        var excelReportExporter = context.getBean(ExcelReportExporter.class);
        var databaseBackupService = context.getBean(DatabaseBackupService.class);

        this.lanSyncServerService.setOnSyncReceivedCallback(() -> Platform.runLater(() -> {
            reloadGlobalRoutes();
            refreshActiveViews();
        }));

        dashboardView = new DashboardView(collectionsService, routeRepository, userRepository, this::navigateTo, this::selectGlobalRoute);
        dashboardView.setSettingRepository(settingRepository);

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
        todayCollectionsView.setSupplementalRepositories(paymentRepository, paymentAllocationRepository, routeRepository, userRepository);
        todayCollectionsView.setOnOpenCustomer360(this::openCustomer360);

        var attachmentService = context.getBean(com.cartera.customers.application.AttachmentService.class);
        var followUpService = context.getBean(com.cartera.customers.application.FollowUpService.class);
        var lifecycleService = context.getBean(com.cartera.customers.application.CustomerLifecycleService.class);
        var createCustomerWithLoanUseCase = context.getBean(com.cartera.customers.application.CreateCustomerWithLoanUseCase.class);

        this.customer360Services = new Customer360Dialog.Services(
                customerRepository,
                loanRepository,
                installmentRepository,
                paymentRepository,
                routeRepository,
                settingRepository,
                paymentUseCase,
                reversePaymentUseCase,
                createLoanUseCase,
                renewLoanUseCase,
                followUpService,
                attachmentService,
                lifecycleService,
                createCustomerWithLoanUseCase
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
                    refreshNotificationsBadge();
                }
        );
        loansView.setAttachmentService(attachmentService);
        loansView.setCreateCustomerWithLoanUseCase(createCustomerWithLoanUseCase);
        loansView.setOnOpenCustomer360(this::openCustomer360);

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

        customersView.setLifecycleService(lifecycleService);
        customersView.setOperationalServices(followUpService, attachmentService);
        customersView.setCreateCustomerWithLoanUseCase(createCustomerWithLoanUseCase);
        customersView.setOnOpenCustomer360(this::openCustomer360);
        customersView.setOnDataChanged(() -> {
            if (dashboardView != null) dashboardView.refresh();
            if (todayCollectionsView != null) todayCollectionsView.refreshData();
            refreshNotificationsBadge();
        });
        var creditHistoryService = context.getBean(com.cartera.history.application.CreditHistoryService.class);
        creditHistoryView = new CreditHistoryView(creditHistoryService, stage);
        customersView.setOnOpenCreditHistory(doc -> {
            navigateTo("Historial");
            creditHistoryView.queryByDocument(doc);
        });

        var cashMovementUseCase = context.getBean(com.cartera.settlement.application.CashMovementUseCase.class);
        cashManagementView = new CashManagementView(cashMovementRepository, cashMovementUseCase, routeRepository, stage);

        settlementManagementView = new SettlementManagementView(settlementUseCase, dailySettlementRepository, userRepository, routeRepository, stage);
        treasurySettlementView = new SettlementManagementView(settlementUseCase, dailySettlementRepository, userRepository, routeRepository, stage);
        treasuryManagementView = new TreasuryManagementView(cashManagementView, treasurySettlementView);

        reportsView = new ReportsView(loanRepository, installmentRepository, paymentRepository, customerRepository, auditLogRepository, excelReportExporter, stage);
        reportsView.setAppUserRepository(userRepository);
        configurationView = new ConfigurationView(settingRepository, userRepository, auditLogRepository, routeRepository, databaseBackupService, stage);
        configurationView.setAuthService(authService);
        configurationView.setUpdateChecker(desktopUpdateChecker);
        configurationView.setOtaService(desktopOtaService, this::performOtaRestart);
        configurationView.setRecoveryService(context.getBean(com.cartera.infrastructure.backup.OfficeRecoveryService.class));
        var licensingService = context.getBean(com.cartera.infrastructure.licensing.OfficeLicensingService.class);
        configurationView.setOfficeLicensingService(licensingService);
        configurationView.setOnRoutesChanged(this::reloadGlobalRoutes);

        mainContainer = new BorderPane();
        mainContainer.setStyle("-fx-background-color: #F6F4EE;");
        mainContainer.setTop(topBar());

        root.setLeft(sidebar());
        root.setCenter(mainContainer);

        loginView = new LoginView(authService, this::onLoginSuccess);
        loginView.setOfficeLicensingService(licensingService);
        desktopCloudSyncService = context.getBean(com.cartera.sync.application.DesktopCloudSyncService.class);
        loginView.setCloudSyncService(desktopCloudSyncService);

        appRoot = new StackPane();
        appRoot.setStyle("-fx-background-color: #F6F4EE;");
        appRoot.getChildren().add(loginView);

        Rectangle2D visualBounds = Screen.getPrimary().getVisualBounds();
        double initialWidth = Math.min(1280, visualBounds.getWidth());
        double initialHeight = Math.min(800, visualBounds.getHeight());

        var scene = new Scene(appRoot, initialWidth, initialHeight);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());

        stage.setTitle("Sistema de Cartera y Cobros " + AppVersion.shortTag());
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
    private com.cartera.sync.application.DesktopCloudSyncService desktopCloudSyncService;
    private java.util.concurrent.ScheduledExecutorService silentSyncExecutor;
    private Label lblCloudSyncStatus;
    private Button btnSyncNow;
    private Button btnNotifications;
    private Button btnUpdateAvailable;
    private DesktopUpdateChecker.UpdateInfo pendingUpdateInfo;
    private boolean otaStagedReady = false;

    private void updateCloudSyncBadge() {
        if (lblCloudSyncStatus == null || desktopCloudSyncService == null) return;
        var st = desktopCloudSyncService.getLastSyncStatus();
        String timeStr = st.lastSyncAt() != null
                ? st.lastSyncAt().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
                : "";
        if (st.synced()) {
            lblCloudSyncStatus.setText(timeStr.isBlank() ? "● Nube sincronizada" : ("● Nube " + timeStr));
            lblCloudSyncStatus.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold;");
        } else if (st.hasError()) {
            lblCloudSyncStatus.setText("⚠ Nube sin sincronizar");
            lblCloudSyncStatus.setStyle("-fx-background-color: #fffbeb; -fx-text-fill: #b45309; -fx-border-color: #fcd34d; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold;");
        } else {
            lblCloudSyncStatus.setText("● Conectando nube...");
            lblCloudSyncStatus.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold;");
        }
        lblCloudSyncStatus.setTooltip(new javafx.scene.control.Tooltip(st.message() != null ? st.message() : "Estado de sincronización con Supabase"));
    }

    private void triggerManualCloudSync() {
        if (desktopCloudSyncService == null) return;
        if (btnSyncNow != null) {
            btnSyncNow.setDisable(true);
            btnSyncNow.setText("Sincronizando...");
        }
        if (lblCloudSyncStatus != null) {
            lblCloudSyncStatus.setText("↻ Sincronizando...");
        }
        Thread t = new Thread(() -> {
            boolean updated = false;
            try {
                updated = desktopCloudSyncService.syncSilentlyInBackground();
            } catch (Exception ignored) {}
            final boolean hadChanges = updated;
            Platform.runLater(() -> {
                updateCloudSyncBadge();
                if (btnSyncNow != null) {
                    btnSyncNow.setDisable(false);
                    btnSyncNow.setText("↻ Sincronizar");
                }
                reloadGlobalRoutes();
                refreshActiveViews();
                var st = desktopCloudSyncService.getLastSyncStatus();
                if (st.synced()) {
                    MotionUtil.showToast(appRoot,
                            hadChanges ? "Nube sincronizada — se cargaron novedades." : "Nube al día (sin cambios nuevos).",
                            MotionUtil.ToastType.SUCCESS);
                } else {
                    MotionUtil.showToast(appRoot,
                            st.message() != null ? st.message() : "No se pudo sincronizar con la nube.",
                            MotionUtil.ToastType.ERROR);
                }
            });
        }, "kredia-manual-sync");
        t.setDaemon(true);
        t.start();
    }

    private void startSilentBackgroundSync() {
        stopSilentBackgroundSync();
        if (desktopCloudSyncService == null) return;
        silentSyncExecutor = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "kredia-silent-sync");
            t.setDaemon(true);
            return t;
        });
        silentSyncExecutor.scheduleWithFixedDelay(() -> {
            try {
                boolean updated = desktopCloudSyncService.syncSilentlyInBackground();
                Platform.runLater(() -> {
                    updateCloudSyncBadge();
                    if (updated) {
                        reloadGlobalRoutes();
                        refreshActiveViews();
                    }
                });
            } catch (Exception ignored) {}
        }, 30, 30, java.util.concurrent.TimeUnit.SECONDS);
    }

    private void stopSilentBackgroundSync() {
        if (silentSyncExecutor != null) {
            silentSyncExecutor.shutdownNow();
            silentSyncExecutor = null;
        }
    }

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
        MotionUtil.transitionView(root);
        MotionUtil.showToast(appRoot, "Bienvenido, " + session.fullName(), MotionUtil.ToastType.SUCCESS);
        updateCloudSyncBadge();
        refreshNotificationsBadge();
        startSilentBackgroundSync();
        checkForDesktopUpdateAsync();
    }

    private void openCustomer360(String customerId) {
        if (customerId == null || customerId.isBlank() || customer360Services == null) return;
        new Customer360Dialog(primaryStage, customerId, customer360Services, () -> {
            refreshActiveViews();
            refreshNotificationsBadge();
        }).showAndWait();
    }

    private void openNotificationsDialog() {
        if (collectionsService == null) return;
        new NotificationsDialog(
                primaryStage,
                collectionsService,
                routeRepository,
                this::openCustomer360,
                () -> navigateTo("Cobros y Rutas")
        ).showAndWait();
        refreshNotificationsBadge();
    }

    private void refreshNotificationsBadge() {
        if (btnNotifications == null || collectionsService == null) return;
        try {
            String routeId = UserSessionContext.getSelectedRouteId();
            var alerts = collectionsService.getActionableNotifications(java.time.LocalDate.now(), routeId);
            int count = alerts.size();
            btnNotifications.setText("Alertas (" + count + ")");
            if (count > 0) {
                btnNotifications.setStyle("-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold; -fx-cursor: hand;");
            } else {
                btnNotifications.setStyle("-fx-background-color: #f8fafc; -fx-text-fill: #475569; -fx-border-color: #cbd5e1; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold; -fx-cursor: hand;");
            }
        } catch (Exception ignored) {}
    }

    private void checkForDesktopUpdateAsync() {
        if (desktopUpdateChecker == null) return;
        Thread t = new Thread(() -> {
            var opt = desktopUpdateChecker.checkForUpdate();
            if (opt.isPresent() && opt.get().updateAvailable()) {
                var info = opt.get();
                boolean stagedOta = false;
                if (desktopOtaService != null
                        && AppVersion.isOtaLauncherPresent()
                        && info.supportsOtaForShell(AppVersion.installedShellVersion())) {
                    var res = desktopOtaService.stageOtaUpdate(info);
                    stagedOta = res.success();
                }
                final boolean finalStagedOta = stagedOta;
                Platform.runLater(() -> {
                    pendingUpdateInfo = info;
                    otaStagedReady = finalStagedOta;
                    if (btnUpdateAvailable != null) {
                        btnUpdateAvailable.setText(finalStagedOta
                                ? ("⬇ v" + info.latestVersion() + " lista — Reiniciar")
                                : ("⬆ Actualizar v" + info.latestVersion()));
                        btnUpdateAvailable.setVisible(true);
                        btnUpdateAvailable.setManaged(true);
                    }
                });
            }
        }, "kredia-update-check");
        t.setDaemon(true);
        t.start();
    }

    private void showAvailableUpdateDialog() {
        if (pendingUpdateInfo == null) return;
        var info = pendingUpdateInfo;
        var alert = new javafx.scene.control.Alert(javafx.scene.control.Alert.AlertType.INFORMATION);
        if (primaryStage != null) alert.initOwner(primaryStage);
        alert.setTitle("Nueva Versión Disponible — v" + info.latestVersion());

        if (otaStagedReady && desktopOtaService != null) {
            alert.setHeaderText("Kredia Desktop v" + info.latestVersion() + " ya fue descargada y verificada");
            alert.setContentText((info.releaseNotes().isBlank() ? "Nueva actualización rápida lista para aplicar." : info.releaseNotes())
                    + "\n\nVersión actual: v" + info.currentVersion()
                    + "\nSolo toma ~2 segundos reiniciar y aplicar (sin reinstalar).");
            var btnRestart = new javafx.scene.control.ButtonType("Reiniciar y actualizar ahora", javafx.scene.control.ButtonBar.ButtonData.OK_DONE);
            var btnLater = new javafx.scene.control.ButtonType("Aplicar al próximo inicio", javafx.scene.control.ButtonBar.ButtonData.CANCEL_CLOSE);
            alert.getButtonTypes().setAll(btnRestart, btnLater);
            alert.showAndWait().ifPresent(chosen -> {
                if (chosen == btnRestart) {
                    performOtaRestart();
                }
            });
            return;
        }

        alert.setHeaderText("Kredia Desktop v" + info.latestVersion() + " ya está disponible");
        alert.setContentText((info.releaseNotes().isBlank() ? "Nueva actualización lista para instalar." : info.releaseNotes())
                + "\n\nVersión instalada: v" + info.currentVersion());
        var btnDownload = new javafx.scene.control.ButtonType("Descargar instalador", javafx.scene.control.ButtonBar.ButtonData.OK_DONE);
        var btnLater = new javafx.scene.control.ButtonType("Después", javafx.scene.control.ButtonBar.ButtonData.CANCEL_CLOSE);
        alert.getButtonTypes().setAll(btnDownload, btnLater);
        alert.showAndWait().ifPresent(chosen -> {
            if (chosen == btnDownload && info.downloadUrl() != null && !info.downloadUrl().isBlank()) {
                try {
                    if (java.awt.Desktop.isDesktopSupported()) {
                        java.awt.Desktop.getDesktop().browse(new java.net.URI(info.downloadUrl()));
                    }
                } catch (Exception ignored) {}
            }
        });
    }

    private void performOtaRestart() {
        if (desktopOtaService == null) return;
        boolean launched = desktopOtaService.relaunchToApplyUpdate(() -> {
            stopSilentBackgroundSync();
            try {
                if (context != null) context.close();
            } catch (Exception ignored) {}
        });
        if (launched) {
            Platform.exit();
            System.exit(0);
        }
    }

    private void onLogout() {
        stopSilentBackgroundSync();
        if (lanSyncServerService != null) {
            try { lanSyncServerService.revokePairings(); } catch (Exception ignored) {}
        }
        if (todayCollectionsView != null) safeRun(todayCollectionsView::clearFilters);
        if (customersView != null) safeRun(customersView::clearFilters);
        if (loansView != null) safeRun(loansView::clearFilters);
        if (creditHistoryView != null) safeRun(creditHistoryView::clearSearch);
        authService.logout();
        UserSessionContext.setSelectedRouteId("ALL");
        loginView.reset();
        appRoot.getChildren().setAll(loginView);
        MotionUtil.transitionView(loginView);
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
        MotionUtil.installTactileButton(btnLogout);
        box.getChildren().add(btnLogout);

        var versionLabel = new Label(AppVersion.displayLabel());
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
        MotionUtil.installTactileButton(button);
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
        Label lblRoute = new Label("Ruta Activa:");
        lblRoute.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px; -fx-font-weight: bold;");

        cmbGlobalRoute.setPrefWidth(220);
        cmbGlobalRoute.getStyleClass().add("search-field");
        cmbGlobalRoute.setOnAction(e -> {
            if (updatingGlobalRoute) return;
            GlobalRouteOption opt = cmbGlobalRoute.getValue();
            if (opt != null) {
                UserSessionContext.setSelectedRouteId(opt.id());
                refreshActiveViews();
            }
        });
        routeSelectorBox.getChildren().addAll(lblRoute, cmbGlobalRoute);

        btnNotifications = new Button("Alertas (0)");
        btnNotifications.setStyle("-fx-background-color: #f8fafc; -fx-text-fill: #475569; -fx-border-color: #cbd5e1; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold; -fx-cursor: hand;");
        btnNotifications.setTooltip(new javafx.scene.control.Tooltip("Ver mora, promesas de hoy y clientes listos para renovar"));
        btnNotifications.setOnAction(e -> openNotificationsDialog());
        MotionUtil.installTactileButton(btnNotifications);

        btnUpdateAvailable = new Button("⬆ Actualizar");
        btnUpdateAvailable.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #6ee7b7; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold; -fx-cursor: hand;");
        btnUpdateAvailable.setVisible(false);
        btnUpdateAvailable.setManaged(false);
        btnUpdateAvailable.setOnAction(e -> showAvailableUpdateDialog());
        MotionUtil.installTactileButton(btnUpdateAvailable);

        lblCloudSyncStatus = new Label("● Conectando nube...");
        lblCloudSyncStatus.getStyleClass().add("status-ok");
        lblCloudSyncStatus.setStyle(lblCloudSyncStatus.getStyle() + " -fx-cursor: hand;");
        lblCloudSyncStatus.setOnMouseClicked(e -> {
            if (desktopCloudSyncService == null) return;
            var st = desktopCloudSyncService.getLastSyncStatus();
            if (st.hasError() && st.message() != null
                    && (st.message().toLowerCase().contains("vencida") || st.message().toLowerCase().contains("token"))) {
                var confirm = new javafx.scene.control.Alert(
                        javafx.scene.control.Alert.AlertType.CONFIRMATION,
                        "Tu sesión en la nube expiró. ¿Deseas volver a iniciar sesión para reconectar la sincronización ahora?",
                        javafx.scene.control.ButtonType.YES, javafx.scene.control.ButtonType.NO);
                if (primaryStage != null) confirm.initOwner(primaryStage);
                confirm.setTitle("Reconectar Sesión en la Nube");
                confirm.setHeaderText("Sesión de sincronización vencida");
                confirm.showAndWait().ifPresent(bt -> {
                    if (bt == javafx.scene.control.ButtonType.YES) onLogout();
                });
            } else {
                triggerManualCloudSync();
            }
        });

        btnSyncNow = new Button("↻ Sincronizar");
        btnSyncNow.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe; -fx-border-radius: 16; -fx-background-radius: 16; -fx-padding: 5 12; -fx-font-size: 11px; -fx-font-weight: bold; -fx-cursor: hand;");
        btnSyncNow.setOnAction(e -> triggerManualCloudSync());
        MotionUtil.installTactileButton(btnSyncNow);

        bar.getChildren().addAll(topTitle, spacer, routeSelectorBox, btnUpdateAvailable, btnNotifications, lblCloudSyncStatus, btnSyncNow);
        return bar;
    }

    private void reloadGlobalRoutes() {
        updatingGlobalRoute = true;
        try {
            UserSession session = UserSessionContext.getSession().orElse(null);
            String prevSelected = UserSessionContext.getSelectedRouteId();
            cmbGlobalRoute.getItems().clear();

            if (session != null && session.isCollector()) {
                List<GlobalRouteOption> assigned = new java.util.ArrayList<>();
                if (routeRepository != null) {
                    List<RouteEntity> routes = routeRepository.findAll();
                    for (RouteEntity r : routes) {
                        if (r.getActive() != null && r.getActive() == 0) continue;
                        if (r.getCollectorId() != null && session.userId().equalsIgnoreCase(r.getCollectorId())) {
                            assigned.add(new GlobalRouteOption(r.getId(), "Mi Ruta: " + r.getName()));
                        }
                    }
                }
                if (assigned.isEmpty()) {
                    GlobalRouteOption noneOpt = new GlobalRouteOption("NONE", "Sin ruta asignada");
                    cmbGlobalRoute.getItems().add(noneOpt);
                    cmbGlobalRoute.setValue(noneOpt);
                    cmbGlobalRoute.setDisable(true);
                    UserSessionContext.setSelectedRouteId("NONE");
                } else {
                    cmbGlobalRoute.getItems().addAll(assigned);
                    GlobalRouteOption chosen = assigned.stream()
                            .filter(o -> prevSelected != null && prevSelected.equalsIgnoreCase(o.id()))
                            .findFirst()
                            .orElse(assigned.get(0));
                    cmbGlobalRoute.setValue(chosen);
                    cmbGlobalRoute.setDisable(assigned.size() <= 1);
                    UserSessionContext.setSelectedRouteId(chosen.id());
                }
                return;
            }

            cmbGlobalRoute.setDisable(false);
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
            UserSessionContext.setSelectedRouteId(targetSelection.id());
        } finally {
            updatingGlobalRoute = false;
        }
    }

    public void selectGlobalRoute(String routeId) {
        if (routeId == null) return;
        updatingGlobalRoute = true;
        boolean matched = false;
        try {
            for (GlobalRouteOption opt : cmbGlobalRoute.getItems()) {
                if (routeId.equalsIgnoreCase(opt.id())) {
                    cmbGlobalRoute.setValue(opt);
                    UserSessionContext.setSelectedRouteId(opt.id());
                    matched = true;
                    break;
                }
            }
        } finally {
            updatingGlobalRoute = false;
        }
        if (matched) {
            refreshActiveViews();
        }
    }

    private void refreshActiveViews() {
        Node current = mainContainer != null ? mainContainer.getCenter() : null;
        if (current == dashboardView && dashboardView != null) safeRun(dashboardView::refresh);
        else if (current == todayCollectionsView && todayCollectionsView != null) safeRun(todayCollectionsView::refreshData);
        else if (current == customersView && customersView != null) safeRun(customersView::refresh);
        else if (current == loansView && loansView != null) safeRun(loansView::refresh);
        else if (current == settlementManagementView && settlementManagementView != null) safeRun(settlementManagementView::refresh);
        else if (current == treasuryManagementView && treasuryManagementView != null) safeRun(treasuryManagementView::refresh);
        else if (current == reportsView && reportsView != null) safeRun(reportsView::refresh);
        else if (current == configurationView && configurationView != null) safeRun(configurationView::refreshUsers);
        else if (current == creditHistoryView && creditHistoryView != null) safeRun(creditHistoryView::refresh);
        refreshNotificationsBadge();
    }

    private static void safeRun(Runnable action) {
        try {
            action.run();
        } catch (Exception ignored) {}
    }

    private void navigateTo(String viewName) {
        UserSession session = UserSessionContext.getSession().orElse(null);
        if (session != null && session.isCollector()) {
            boolean isAllowed = "Cobros y Rutas".equalsIgnoreCase(viewName)
                    || "Cobros de hoy".equalsIgnoreCase(viewName)
                    || "Rutas".equalsIgnoreCase(viewName)
                    || "Mi Ruta de Hoy".equalsIgnoreCase(viewName)
                    || "Clientes".equalsIgnoreCase(viewName)
                    || "Mis Clientes".equalsIgnoreCase(viewName)
                    || "Gestión de Cartera".equalsIgnoreCase(viewName)
                    || "Historial".equalsIgnoreCase(viewName)
                    || "Historial Crediticio".equalsIgnoreCase(viewName)
                    || "Historial de Clientes".equalsIgnoreCase(viewName);
            if (!isAllowed) {
                viewName = "Cobros y Rutas";
            }
        }

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
            case "Mi Ruta de Hoy":
                activeKey = "Cobros y Rutas";
                effectiveTitle = (session != null && session.isCollector())
                        ? "Mi Ruta de Cobro de Hoy"
                        : "Supervisión de Cobros y Rutas";
                todayCollectionsView.refreshData();
                viewNode = todayCollectionsView;
                break;
            case "Clientes":
            case "Mis Clientes":
            case "Gestión de Cartera":
                activeKey = "Clientes";
                effectiveTitle = (session != null && session.isCollector())
                        ? "Mis Clientes Asignados"
                        : "Clientes de la Red";
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
        MotionUtil.transitionView(viewNode);
    }

    @Override
    public void stop() {
        stopSilentBackgroundSync();
        if (lanSyncServerService != null) {
            try { lanSyncServerService.stopServer(); } catch (Exception ignored) {}
        }
        if (desktopCloudSyncService != null) {
            Thread finalSync = new Thread(() -> {
                try { desktopCloudSyncService.syncSilentlyInBackground(); } catch (Exception ignored) {}
            }, "kredia-shutdown-sync");
            finalSync.setDaemon(true);
            finalSync.start();
            try { finalSync.join(1500); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
        }
        if (context != null) {
            context.close();
        }
        Platform.exit();
    }

    public static void main(String[] args) {
        CarteraMain.configureRegionalDefaults();
        Application.launch(CarteraApplication.class, args);
    }
}
