package com.cartera.ui.views;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.ui.util.CurrencyInputUtil;
import com.cartera.ui.util.UiLabels;
import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

/**
 * Vista de Configuración Operativa del Sistema:
 * - Parámetros de la oficina y sede
 * - Políticas de crédito y cobro (cobro de papelería / cartulina y topes)
 * - Permisos y controles de ruta
 * - Gestión de múltiples rutas y asignación de cobradores
 * - Gestión de cobradores y credenciales de acceso
 * - Copias de seguridad automáticas y manuales de la base de datos
 */
public class ConfigurationView extends VBox {
    private com.cartera.infrastructure.backup.OfficeRecoveryService recovery;
    public void setRecoveryService(com.cartera.infrastructure.backup.OfficeRecoveryService service){recovery=service;}
    private com.cartera.infrastructure.licensing.OfficeLicensingService licensingService;
    public void setOfficeLicensingService(com.cartera.infrastructure.licensing.OfficeLicensingService service){licensingService=service;}
    private AuthService authService;
    public void setAuthService(AuthService authService) { this.authService = authService; }
    private com.cartera.infrastructure.version.DesktopUpdateChecker updateChecker;
    public void setUpdateChecker(com.cartera.infrastructure.version.DesktopUpdateChecker updateChecker) { this.updateChecker = updateChecker; }
    private com.cartera.infrastructure.version.DesktopOtaService otaService;
    private Runnable onOtaRestartRequested;
    public void setOtaService(com.cartera.infrastructure.version.DesktopOtaService otaService, Runnable onOtaRestartRequested) {
        this.otaService = otaService;
        this.onOtaRestartRequested = onOtaRestartRequested;
    }

    private final SystemSettingRepository settingRepository;
    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final RouteRepository routeRepository;
    private final DatabaseBackupService databaseBackupService;
    private final Stage ownerStage;
    private Runnable onRoutesChanged;

    // 1. Datos de la Empresa / Sede
    private final TextField txtCompanyName = new TextField();
    private final TextField txtPhone = new TextField();
    private final TextField txtCity = new TextField();

    // 2. Políticas de Crédito & Cobro
    private final CheckBox chkPaperworkEnabled = new CheckBox("Cobrar gastos de papelería / cartulina en créditos");
    private final TextField txtPaperworkFee = new TextField("5000");
    private final TextField txtDefaultInterest = new TextField("20");
    private final TextField txtMaxNewLoanAmount = new TextField("2000000");
    private final CheckBox chkExcludeSundays = new CheckBox("Excluir domingos del calendario de cobro");

    // 3. Permisos de Ruta
    private final CheckBox chkRouteAllowNewLoans = new CheckBox("Permitir a cobradores crear nuevos préstamos en la calle");
    private final CheckBox chkRouteAllowExpenses = new CheckBox("Permitir a cobradores registrar gastos operativos de ruta");
    private final CheckBox chkRouteAllowReorder = new CheckBox("Permitir a cobradores reordenar clientes en ruta");
    private final CheckBox chkRouteAllowPartialPayments = new CheckBox("Permitir abonos parciales (menores a la cuota)");

    private final Label lblParamsFeedback = new Label();

    // 4. Rutas y Cobradores
    private final ObservableList<RouteEntity> routeList = FXCollections.observableArrayList();
    private final TableView<RouteEntity> routeTable = new TableView<>();

    // 5. Usuarios y Credenciales
    private final ObservableList<AppUserEntity> userList = FXCollections.observableArrayList();
    private final TableView<AppUserEntity> userTable = new TableView<>();

    // 6. Backup
    private final Label lblBackupCounter = new Label();
    private final Label lblBackupFeedback = new Label();

    public ConfigurationView(SystemSettingRepository settingRepository,
                             AppUserRepository userRepository,
                             AuditLogRepository auditLogRepository,
                             Stage ownerStage) {
        this(settingRepository, userRepository, auditLogRepository, null, null, ownerStage);
    }

    public ConfigurationView(SystemSettingRepository settingRepository,
                             AppUserRepository userRepository,
                             AuditLogRepository auditLogRepository,
                             RouteRepository routeRepository,
                             DatabaseBackupService databaseBackupService,
                             Stage ownerStage) {
        this.settingRepository = settingRepository;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.routeRepository = routeRepository;
        this.databaseBackupService = databaseBackupService;
        this.ownerStage = ownerStage;

        setSpacing(16);
        setPadding(new Insets(20));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildContent();
    }

    public void setOnRoutesChanged(Runnable onRoutesChanged) {
        this.onRoutesChanged = onRoutesChanged;
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Panel Operativo de Configuración");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Parámetros del negocio, políticas de crédito, multi-ruta, credenciales y respaldos automáticos");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        top.getChildren().add(titleBox);
        getChildren().add(top);
    }

    private void buildContent() {
        ScrollPane scrollPane = new ScrollPane();
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background: transparent; -fx-background-color: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);

        HBox columns = new HBox(20);

        // Columna Izquierda: Parámetros del Negocio, Políticas y Backups
        VBox leftCol = new VBox(16);
        leftCol.setPrefWidth(430);
        leftCol.getChildren().addAll(buildOfficeParamsCard(), buildLoanPoliciesCard(), buildRoutePermissionsCard(), buildBackupCard());

        // Columna Derecha: Gestión Multi-Ruta y Cobradores
        VBox rightCol = new VBox(16);
        HBox.setHgrow(rightCol, Priority.ALWAYS);
        rightCol.getChildren().addAll(buildCapitalTriadCard(), buildRoutesCard(), buildUsersCard());

        columns.getChildren().addAll(leftCol, rightCol);
        scrollPane.setContent(columns);

        getChildren().add(scrollPane);
    }

    private VBox buildOfficeParamsCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));

        Label title = new Label("1. Sede y Datos de la Empresa");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        txtCompanyName.setPromptText("Ej. Inversiones & Cobranzas del Norte");
        txtCompanyName.getStyleClass().add("search-field");

        txtPhone.setPromptText("Ej. 300 123 4567");
        txtPhone.getStyleClass().add("search-field");

        txtCity.setPromptText("Ej. Barranquilla");
        txtCity.getStyleClass().add("search-field");

        card.getChildren().addAll(
                title,
                createFieldBox("Nombre Comercial / Razón Social", txtCompanyName),
                createFieldBox("Teléfono Oficial de Contacto", txtPhone),
                createFieldBox("Ciudad Sede Principal", txtCity)
        );
        return card;
    }

    private VBox buildLoanPoliciesCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));

        Label title = new Label("2. Políticas de Crédito (Papelería & Tasas)");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        chkPaperworkEnabled.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 12px;");
        chkPaperworkEnabled.setSelected(true);

        txtPaperworkFee.setPromptText("5000");
        txtPaperworkFee.getStyleClass().add("search-field");

        txtDefaultInterest.setPromptText("20");
        txtDefaultInterest.getStyleClass().add("search-field");

        txtMaxNewLoanAmount.setPromptText("2000000");
        txtMaxNewLoanAmount.getStyleClass().add("search-field");

        chkExcludeSundays.setStyle("-fx-text-fill: #475569; -fx-font-size: 12px;");
        chkExcludeSundays.setSelected(true);

        card.getChildren().addAll(
                title,
                chkPaperworkEnabled,
                createFieldBox("Tarifa de Papelería ($ por cada $100.000)", txtPaperworkFee),
                createFieldBox("Tasa de Interés Sugerida (%)", txtDefaultInterest),
                createFieldBox("Monto Máximo por Nuevo Préstamo ($)", txtMaxNewLoanAmount),
                chkExcludeSundays
        );
        return card;
    }

    private VBox buildRoutePermissionsCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));

        Label title = new Label("3. Permisos Operativos de Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        chkRouteAllowNewLoans.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px;");
        chkRouteAllowNewLoans.setSelected(true);

        chkRouteAllowExpenses.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px;");
        chkRouteAllowExpenses.setSelected(true);

        chkRouteAllowReorder.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px;");
        chkRouteAllowReorder.setSelected(false);

        chkRouteAllowPartialPayments.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px;");
        chkRouteAllowPartialPayments.setSelected(true);

        lblParamsFeedback.setVisible(false);
        lblParamsFeedback.setManaged(false);

        Button btnSaveAllParams = new Button("Guardar Toda la Configuración");
        btnSaveAllParams.getStyleClass().add("btn-primary");
        btnSaveAllParams.setOnAction(e -> saveSettings());

        card.getChildren().addAll(
                title,
                chkRouteAllowNewLoans,
                chkRouteAllowExpenses,
                chkRouteAllowReorder,
                chkRouteAllowPartialPayments,
                lblParamsFeedback,
                btnSaveAllParams
        );
        return card;
    }

    private VBox buildBackupCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));

        Label title = new Label("Copia de Seguridad Automática");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Label desc = new Label("El sistema genera copias de respaldo automáticas al cerrar cada liquidación diaria.");
        desc.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        desc.setWrapText(true);

        lblBackupCounter.setStyle("-fx-text-fill: #0369a1; -fx-font-size: 12px; -fx-font-weight: bold;");
        updateBackupCounterLabel();

        lblBackupFeedback.setWrapText(true);
        lblBackupFeedback.setVisible(false);
        lblBackupFeedback.setManaged(false);

        FlowPane btns = new FlowPane(8, 8);
        Button btnInstant = new Button("Respaldo Instantáneo");
        btnInstant.getStyleClass().add("btn-primary");
        btnInstant.setOnAction(e -> createInstantBackup(btnInstant));

        Button btnExport = new Button("Exportar Copia...");
        btnExport.getStyleClass().add("btn-success");
        btnExport.setOnAction(e -> exportBackup());

        Button btnOpenFolder = new Button("Abrir Carpeta");
        btnOpenFolder.getStyleClass().add("btn-secondary");
        btnOpenFolder.setOnAction(e -> openDbFolder());

        Button btnRecovery = new Button("Recuperar Oficina / Adjuntos");
        btnRecovery.getStyleClass().add("btn-secondary");
        btnRecovery.setOnAction(e -> {
            if (recovery != null) {
                new RecoveryDialog(ownerStage, recovery).showAndWait();
            }
        });

        Button btnVendor = new Button("Panel Comercial (Oficinas y Licencias)");
        btnVendor.getStyleClass().add("btn-secondary");
        btnVendor.setOnAction(e -> {
            if (licensingService != null) {
                new VendorLicensingDialog(ownerStage, licensingService).show();
            }
        });

        Button btnCheckUpdates = new Button("Buscar actualizaciones (" + com.cartera.infrastructure.version.AppVersion.shortTag() + ")");
        btnCheckUpdates.getStyleClass().add("btn-secondary");
        btnCheckUpdates.setOnAction(e -> checkForUpdatesManually(btnCheckUpdates));

        btns.getChildren().addAll(btnInstant, btnExport, btnOpenFolder, btnRecovery, btnVendor, btnCheckUpdates);

        card.getChildren().addAll(title, desc, lblBackupCounter, btns, lblBackupFeedback);
        return card;
    }

    private void checkForUpdatesManually(Button triggerBtn) {
        if (updateChecker == null) {
            lblBackupFeedback.setText("Versión instalada: Kredia Desktop " + com.cartera.infrastructure.version.AppVersion.shortTag());
            lblBackupFeedback.setStyle("-fx-text-fill: #0369a1; -fx-background-color: #f0f9ff; -fx-padding: 6 10; -fx-background-radius: 6;");
            lblBackupFeedback.setVisible(true);
            lblBackupFeedback.setManaged(true);
            return;
        }
        triggerBtn.setDisable(true);
        lblBackupFeedback.setText("Consultando servidor de actualizaciones...");
        lblBackupFeedback.setStyle("-fx-text-fill: #2563eb; -fx-background-color: #eff6ff; -fx-padding: 6 10; -fx-background-radius: 6;");
        lblBackupFeedback.setVisible(true);
        lblBackupFeedback.setManaged(true);

        Thread t = new Thread(() -> {
            var opt = updateChecker.checkForUpdate();
            if (opt.isPresent() && opt.get().updateAvailable()
                    && otaService != null
                    && com.cartera.infrastructure.version.AppVersion.isOtaLauncherPresent()
                    && opt.get().supportsOtaForShell(com.cartera.infrastructure.version.AppVersion.installedShellVersion())) {
                var info = opt.get();
                Platform.runLater(() -> lblBackupFeedback.setText("Descargando parche rápido OTA v" + info.latestVersion() + "..."));
                var stageRes = otaService.stageOtaUpdate(info);
                Platform.runLater(() -> {
                    triggerBtn.setDisable(false);
                    if (stageRes.success()) {
                        lblBackupFeedback.setText("Parche OTA v" + info.latestVersion() + " verificado (SHA-256). Listo para reiniciar.");
                        lblBackupFeedback.setStyle("-fx-text-fill: #047857; -fx-background-color: #ecfdf5; -fx-padding: 6 10; -fx-background-radius: 6; -fx-font-weight: bold;");
                        Alert alert = new Alert(Alert.AlertType.INFORMATION);
                        alert.initOwner(ownerStage);
                        alert.setTitle("Actualización Lista — v" + info.latestVersion());
                        alert.setHeaderText("Parche rápido OTA v" + info.latestVersion() + " descargado y verificado");
                        alert.setContentText((info.releaseNotes().isBlank() ? "Actualización lista para aplicar sin reinstalar." : info.releaseNotes())
                                + "\n\nVersión actual: v" + info.currentVersion());
                        ButtonType btnRestart = new ButtonType("Reiniciar y actualizar ahora", ButtonBar.ButtonData.OK_DONE);
                        ButtonType btnLater = new ButtonType("Aplicar al próximo inicio", ButtonBar.ButtonData.CANCEL_CLOSE);
                        alert.getButtonTypes().setAll(btnRestart, btnLater);
                        alert.showAndWait().ifPresent(chosen -> {
                            if (chosen == btnRestart && onOtaRestartRequested != null) {
                                onOtaRestartRequested.run();
                            }
                        });
                    } else {
                        lblBackupFeedback.setText("Error preparando OTA: " + stageRes.message());
                        lblBackupFeedback.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-padding: 6 10; -fx-background-radius: 6;");
                    }
                });
                return;
            }
            Platform.runLater(() -> {
                triggerBtn.setDisable(false);
                if (opt.isEmpty()) {
                    lblBackupFeedback.setText("Versión " + com.cartera.infrastructure.version.AppVersion.shortTag()
                            + " instalada. No se pudo verificar nuevas versiones en este momento.");
                    lblBackupFeedback.setStyle("-fx-text-fill: #475569; -fx-background-color: #f1f5f9; -fx-padding: 6 10; -fx-background-radius: 6;");
                } else if (!opt.get().updateAvailable()) {
                    lblBackupFeedback.setText("¡Estás al día! Kredia Desktop " + com.cartera.infrastructure.version.AppVersion.shortTag()
                            + " es la versión más reciente.");
                    lblBackupFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-padding: 6 10; -fx-background-radius: 6;");
                } else {
                    var info = opt.get();
                    lblBackupFeedback.setText("Nueva versión v" + info.latestVersion() + " disponible. " + info.releaseNotes());
                    lblBackupFeedback.setStyle("-fx-text-fill: #047857; -fx-background-color: #ecfdf5; -fx-padding: 6 10; -fx-background-radius: 6; -fx-font-weight: bold;");
                    Alert alert = new Alert(Alert.AlertType.INFORMATION);
                    alert.initOwner(ownerStage);
                    alert.setTitle("Actualización Disponible — v" + info.latestVersion());
                    alert.setHeaderText("Hay una nueva versión de Kredia Desktop disponible (v" + info.latestVersion() + ")");
                    alert.setContentText((info.releaseNotes().isBlank() ? "Incluye mejoras de sincronización y estabilidad." : info.releaseNotes())
                            + "\n\nTu versión actual: v" + info.currentVersion());
                    ButtonType btnDownload = new ButtonType("Descargar instalador", ButtonBar.ButtonData.OK_DONE);
                    ButtonType btnLater = new ButtonType("Más tarde", ButtonBar.ButtonData.CANCEL_CLOSE);
                    alert.getButtonTypes().setAll(btnDownload, btnLater);
                    alert.showAndWait().ifPresent(chosen -> {
                        if (chosen == btnDownload && info.downloadUrl() != null && !info.downloadUrl().isBlank()) {
                            try {
                                if (Desktop.isDesktopSupported()) {
                                    Desktop.getDesktop().browse(new java.net.URI(info.downloadUrl()));
                                }
                            } catch (Exception ignored) {}
                        }
                    });
                }
            });
        }, "cartera-manual-update-check");
        t.setDaemon(true);
        t.start();
    }

    private void updateBackupCounterLabel() {
        if (databaseBackupService != null) {
            try {
                int count = databaseBackupService.getBackupCount();
                lblBackupCounter.setText("Copias automáticas almacenadas: " + count);
            } catch (Exception ex) {
                lblBackupCounter.setText("Carpeta de respaldos activa");
            }
        } else {
            lblBackupCounter.setText("Carpeta de respaldos activa en ~/.sistema-cartera/backups");
        }
    }

    private void createInstantBackup(Button triggerBtn) {
        if (databaseBackupService == null) {
            exportBackup();
            return;
        }
        triggerBtn.setDisable(true);
        lblBackupFeedback.setText("Generando y verificando copia de seguridad...");
        lblBackupFeedback.setStyle("-fx-text-fill: #2563eb; -fx-background-color: #eff6ff; -fx-padding: 6 10; -fx-background-radius: 6;");
        lblBackupFeedback.setVisible(true);
        lblBackupFeedback.setManaged(true);

        Thread t = new Thread(() -> {
            try {
                Path path = databaseBackupService.createBackup("manual");
                Platform.runLater(() -> {
                    triggerBtn.setDisable(false);
                    updateBackupCounterLabel();
                    lblBackupFeedback.setText("Respaldo verificado creado en: " + (path != null ? path.getFileName() : "ok"));
                    lblBackupFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-padding: 6 10; -fx-background-radius: 6;");
                });
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    triggerBtn.setDisable(false);
                    lblBackupFeedback.setText("No se pudo crear el respaldo: " + ex.getMessage());
                    lblBackupFeedback.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-padding: 6 10; -fx-background-radius: 6;");
                });
            }
        }, "cartera-instant-backup");
        t.setDaemon(true);
        t.start();
    }

    private VBox buildCapitalTriadCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));

        Label title = new Label("Capital Operativo: Administrativo, Cartera en Calle y Base");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Label formulaBadge = new Label("REGLA MAESTRA FINANCIERA:  Administrativo = Cartera en Calle + Base en Mano");
        formulaBadge.setStyle("-fx-background-color: #0f172a; -fx-text-fill: #38bdf8; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 8 12; -fx-background-radius: 8;");

        Label desc = new Label(
                "• Administrativo: Techo o cupo total de capital de trabajo asignado a cada ruta.\n" +
                "• Cartera en Calle: Saldo total prestado actualmente a clientes en créditos activos.\n" +
                "• Base en Mano: Efectivo físico disponible en caja/calle para nuevos préstamos y vueltas."
        );
        desc.setStyle("-fx-text-fill: #475569; -fx-font-size: 12px; -fx-line-spacing: 4;");

        card.getChildren().addAll(title, formulaBadge, desc);
        return card;
    }

    @SuppressWarnings("unchecked")
    private VBox buildRoutesCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));
        card.setPrefHeight(260);

        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("4. Gestión Multi-Ruta y Asignación de Cobradores");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnNewRoute = new Button("+ Crear Nueva Ruta");
        btnNewRoute.getStyleClass().add("btn-primary");
        btnNewRoute.setOnAction(e -> openNewRouteDialog());

        header.getChildren().addAll(title, spacer, btnNewRoute);

        routeTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        routeTable.setPlaceholder(UiLabels.emptyState("Sin rutas registradas", "Crea una ruta operativa y asígnale un cobrador."));
        VBox.setVgrow(routeTable, Priority.ALWAYS);

        TableColumn<RouteEntity, String> colId = new TableColumn<>("ID RUTA");
        colId.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getId()));
        colId.setPrefWidth(100);

        TableColumn<RouteEntity, String> colName = new TableColumn<>("NOMBRE DE RUTA");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getName()));
        colName.setPrefWidth(140);

        TableColumn<RouteEntity, String> colCollector = new TableColumn<>("COBRADOR ASIGNADO");
        colCollector.setCellValueFactory(d -> {
            String colIdVal = d.getValue().getCollectorId();
            if (colIdVal == null || colIdVal.isBlank()) return new SimpleStringProperty("Sin asignar");
            String name = userList.stream()
                    .filter(u -> colIdVal.equals(u.getId()))
                    .map(AppUserEntity::getFullName)
                    .findFirst()
                    .orElse(colIdVal);
            return new SimpleStringProperty(name);
        });
        colCollector.setPrefWidth(130);

        TableColumn<RouteEntity, String> colState = new TableColumn<>("ESTADO");
        colState.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getActive() == null || d.getValue().getActive() == 1 ? "ACTIVA" : "INACTIVA"));
        colState.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label badge = new Label(s);
                    badge.setStyle("-fx-padding: 2 7; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 10px; " +
                            ("ACTIVA".equals(s)
                                    ? "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 10;"
                                    : "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 10;"));
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colState.setPrefWidth(80);

        TableColumn<RouteEntity, Void> colRouteActions = new TableColumn<>("ACCIONES");
        colRouteActions.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(Void v, boolean empty) {
                super.updateItem(v, empty);
                if (empty || getIndex() < 0 || getIndex() >= getTableView().getItems().size()) {
                    setGraphic(null);
                } else {
                    RouteEntity r = getTableView().getItems().get(getIndex());
                    boolean isActive = r.getActive() == null || r.getActive() == 1;
                    Button btnEdit = new Button("Editar");
                    btnEdit.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #0284c7; -fx-border-color: #bae6fd; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                    btnEdit.setOnAction(e -> openEditRouteDialog(r));

                    Button btnToggle = new Button(isActive ? "Desactivar" : "Activar");
                    btnToggle.setStyle(isActive
                            ? "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;"
                            : "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                    btnToggle.setOnAction(e -> toggleRouteActive(r));

                    HBox box = new HBox(6, btnEdit, btnToggle);
                    box.setAlignment(Pos.CENTER_LEFT);
                    setGraphic(box);
                }
            }
        });
        colRouteActions.setPrefWidth(145);

        routeTable.getColumns().addAll(colId, colName, colCollector, colState, colRouteActions);
        routeTable.setItems(routeList);

        card.getChildren().addAll(header, routeTable);
        return card;
    }

    private List<AppUserEntity> getAssignableCollectors() {
        return userList.stream()
                .filter(u -> u.getActive() != null && u.getActive() == 1)
                .filter(u -> u.getUsername() == null || !u.getUsername().contains("_old_"))
                .toList();
    }

    private String requireManagerUserId() {
        UserSession session = UserSessionContext.getSession()
                .orElseThrow(() -> new SecurityException("Inicie sesión como Administrador o Supervisor."));
        if (!session.canReverseOrCancel()) {
            throw new SecurityException("Esta operación administrativa requiere rol Administrador o Supervisor.");
        }
        return session.userId();
    }

    private void openNewRouteDialog() {
        if (routeRepository == null) return;
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Crear Nueva Ruta de Cobro");
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(420);

        Label title = new Label("Nueva Ruta Operativa");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtCode = new TextField();
        txtCode.setPromptText("Ej. route-sur");
        txtCode.getStyleClass().add("search-field");

        TextField txtName = new TextField();
        txtName.setPromptText("Ej. Ruta Sur / Soledad");
        txtName.getStyleClass().add("search-field");

        ComboBox<AppUserEntity> cmbCollector = new ComboBox<>();
        cmbCollector.setMaxWidth(Double.MAX_VALUE);
        List<AppUserEntity> assignable = getAssignableCollectors();
        cmbCollector.getItems().setAll(assignable);
        cmbCollector.setConverter(new javafx.util.StringConverter<>() {
            @Override
            public String toString(AppUserEntity u) {
                return u == null ? "" : u.getFullName() + " (" + u.getUsername() + ")";
            }
            @Override
            public AppUserEntity fromString(String s) {
                return null;
            }
        });
        if (!assignable.isEmpty()) {
            cmbCollector.setValue(assignable.get(0));
        }

        Label lblErr = new Label();
        lblErr.setWrapText(true);
        lblErr.setVisible(false);
        lblErr.setManaged(false);

        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Guardar Ruta");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                String author = requireManagerUserId();
                String id = txtCode.getText().trim().toLowerCase().replaceAll("\\s+", "-");
                String name = txtName.getText().trim();
                if (id.isEmpty() || name.isEmpty()) {
                    throw new IllegalArgumentException("El código y nombre de la ruta son obligatorios.");
                }
                if (!id.matches("[a-z0-9_-]{2,40}")) {
                    throw new IllegalArgumentException("El código de ruta solo admite letras minúsculas, números, '-' y '_' (2 a 40 caracteres).");
                }
                if (routeRepository.existsById(id)) {
                    throw new IllegalArgumentException("Ya existe una ruta con el código '" + id + "'. Use 'Editar' si desea modificarla.");
                }
                if (cmbCollector.getValue() == null) {
                    throw new IllegalArgumentException("Debe seleccionar un cobrador activo para la ruta.");
                }
                String collectorId = cmbCollector.getValue().getId();
                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                routeRepository.save(new RouteEntity(id, name, collectorId, 1, now));
                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(), author, "ROUTE", id, "CREAR_RUTA",
                        null, "nombre=" + name + ";cobrador=" + collectorId,
                        "Creación de ruta operativa en Configuración", now));
                refreshUsers();
                if (onRoutesChanged != null) {
                    onRoutesChanged.run();
                }
                dialog.close();
            } catch (Exception ex) {
                lblErr.setText(ex.getMessage());
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
            }
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        VBox collectorBox = new VBox(4);
        Label lblCol = new Label("Cobrador Responsable *");
        lblCol.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        collectorBox.getChildren().addAll(lblCol, cmbCollector);

        root.getChildren().addAll(
                title,
                createFieldBox("Código Identificador de Ruta *", txtCode),
                createFieldBox("Nombre Descriptivo de la Ruta *", txtName),
                collectorBox,
                lblErr,
                actions
        );

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void openEditRouteDialog(RouteEntity routeEntity) {
        if (routeRepository == null) return;
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Editar Ruta — " + routeEntity.getName());
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(420);

        Label title = new Label("Editar Ruta (" + routeEntity.getId() + ")");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtName = new TextField(routeEntity.getName());
        txtName.getStyleClass().add("search-field");

        ComboBox<AppUserEntity> cmbCollector = new ComboBox<>();
        cmbCollector.setMaxWidth(Double.MAX_VALUE);
        List<AppUserEntity> assignable = new java.util.ArrayList<>(getAssignableCollectors());
        AppUserEntity currentAssigned = userList.stream()
                .filter(u -> routeEntity.getCollectorId() != null && routeEntity.getCollectorId().equals(u.getId()))
                .findFirst().orElse(null);
        if (currentAssigned != null && assignable.stream().noneMatch(u -> u.getId().equals(currentAssigned.getId()))) {
            assignable.add(0, currentAssigned);
        }
        cmbCollector.getItems().setAll(assignable);
        cmbCollector.setConverter(new javafx.util.StringConverter<>() {
            @Override
            public String toString(AppUserEntity u) {
                return u == null ? "" : u.getFullName() + " (" + u.getUsername() + ")";
            }
            @Override
            public AppUserEntity fromString(String s) { return null; }
        });
        if (currentAssigned != null) {
            cmbCollector.setValue(currentAssigned);
        } else if (!assignable.isEmpty()) {
            cmbCollector.setValue(assignable.get(0));
        }

        Label lblErr = new Label();
        lblErr.setWrapText(true);
        lblErr.setVisible(false);
        lblErr.setManaged(false);

        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);
        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Guardar Cambios");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                String author = requireManagerUserId();
                String newName = txtName.getText().trim();
                if (newName.isEmpty()) {
                    throw new IllegalArgumentException("El nombre de la ruta es obligatorio.");
                }
                if (cmbCollector.getValue() == null) {
                    throw new IllegalArgumentException("Seleccione un cobrador responsable.");
                }
                String prev = "nombre=" + routeEntity.getName() + ";cobrador=" + routeEntity.getCollectorId();
                routeEntity.setName(newName);
                routeEntity.setCollectorId(cmbCollector.getValue().getId());
                routeRepository.save(routeEntity);
                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(), author, "ROUTE", routeEntity.getId(), "EDITAR_RUTA",
                        prev, "nombre=" + newName + ";cobrador=" + routeEntity.getCollectorId(),
                        "Actualización de ruta en Configuración", now));
                refreshUsers();
                if (onRoutesChanged != null) onRoutesChanged.run();
                dialog.close();
            } catch (Exception ex) {
                lblErr.setText(ex.getMessage());
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
            }
        });
        actions.getChildren().addAll(btnCancel, btnSave);

        VBox collectorBox = new VBox(4);
        Label lblCol = new Label("Cobrador Responsable *");
        lblCol.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        collectorBox.getChildren().addAll(lblCol, cmbCollector);

        root.getChildren().addAll(title, createFieldBox("Nombre Descriptivo de la Ruta *", txtName), collectorBox, lblErr, actions);
        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void toggleRouteActive(RouteEntity routeEntity) {
        try {
            String author = requireManagerUserId();
            boolean currentlyActive = routeEntity.getActive() == null || routeEntity.getActive() == 1;
            int nextActive = currentlyActive ? 0 : 1;
            Alert confirm = new Alert(Alert.AlertType.CONFIRMATION,
                    currentlyActive
                            ? "¿Desea desactivar la ruta \"" + routeEntity.getName() + "\"? Los clientes y créditos históricos se conservan."
                            : "¿Desea reactivar la ruta \"" + routeEntity.getName() + "\"?");
            confirm.initOwner(ownerStage);
            confirm.setHeaderText(currentlyActive ? "Desactivar Ruta" : "Reactivar Ruta");
            if (confirm.showAndWait().orElse(ButtonType.CANCEL) != ButtonType.OK) return;

            routeEntity.setActive(nextActive);
            routeRepository.save(routeEntity);
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(), author, "ROUTE", routeEntity.getId(),
                    currentlyActive ? "DESACTIVAR_RUTA" : "ACTIVAR_RUTA",
                    currentlyActive ? "ACTIVA" : "INACTIVA",
                    nextActive == 1 ? "ACTIVA" : "INACTIVA",
                    "Cambio de estado de ruta en Configuración", now));
            refreshUsers();
            if (onRoutesChanged != null) onRoutesChanged.run();
        } catch (Exception ex) {
            Alert err = new Alert(Alert.AlertType.ERROR, ex.getMessage());
            err.initOwner(ownerStage);
            err.showAndWait();
        }
    }

    @SuppressWarnings("unchecked")
    private VBox buildUsersCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(20));
        VBox.setVgrow(card, Priority.ALWAYS);

        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("5. Gestión de Cobradores y Credenciales de Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnNewUser = new Button("+ Registrar Nuevo Cobrador");
        btnNewUser.getStyleClass().add("btn-primary");
        btnNewUser.setOnAction(e -> openNewUserDialog());

        header.getChildren().addAll(title, spacer, btnNewUser);

        userTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        userTable.setPlaceholder(UiLabels.emptyState("Sin usuarios registrados", "Registre el administrador y cobradores de su oficina."));
        VBox.setVgrow(userTable, Priority.ALWAYS);

        TableColumn<AppUserEntity, String> colName = new TableColumn<>("NOMBRE COMPLETO");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFullName()));
        colName.setPrefWidth(150);

        TableColumn<AppUserEntity, String> colUser = new TableColumn<>("USUARIO");
        colUser.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getUsername()));
        colUser.setPrefWidth(105);

        TableColumn<AppUserEntity, String> colRole = new TableColumn<>("ROL");
        colRole.setCellValueFactory(d -> new SimpleStringProperty(resolveRoleDisplay(d.getValue())));
        colRole.setPrefWidth(95);

        TableColumn<AppUserEntity, String> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().getActive() != null && d.getValue().getActive() == 1 ? "ACTIVO" : "INACTIVO"));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(s);
                    badge.setStyle("-fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 10px; " +
                            ("ACTIVO".equals(s) ? "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 10;" : "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 10;"));
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(80);

        TableColumn<AppUserEntity, Void> colAction = new TableColumn<>("ACCIONES");
        colAction.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(Void item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || getIndex() < 0 || getIndex() >= getTableView().getItems().size()) {
                    setGraphic(null);
                } else {
                    AppUserEntity u = getTableView().getItems().get(getIndex());
                    boolean active = u.getActive() != null && u.getActive() == 1;
                    Button btnEdit = new Button("Editar");
                    btnEdit.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #0284c7; -fx-border-color: #bae6fd; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                    btnEdit.setOnAction(e -> openEditUserCredentialsDialog(u));

                    Button btnToggle = new Button(active ? "Desactivar" : "Activar");
                    btnToggle.setStyle(active
                            ? "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;"
                            : "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                    btnToggle.setOnAction(e -> toggleUserActive(u));

                    HBox box = new HBox(6, btnEdit, btnToggle);
                    box.setAlignment(Pos.CENTER_LEFT);
                    setGraphic(box);
                }
            }
        });
        colAction.setPrefWidth(145);

        userTable.getColumns().addAll(colName, colUser, colRole, colStatus, colAction);
        userTable.setItems(userList);

        Label notice = new Label("Nota: Aquí puedes administrar roles, activar/desactivar usuarios y cambiar credenciales de acceso.");
        notice.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-style: italic;");

        card.getChildren().addAll(header, userTable, notice);
        return card;
    }

    private String resolveRoleDisplay(AppUserEntity user) {
        if (user == null) return "COBRADOR";
        if (authService != null) {
            return authService.resolveRole(user);
        }
        String u = user.getUsername() != null ? user.getUsername().toLowerCase() : "";
        if ("admin".equals(u) || u.startsWith("admin_")) return "ADMIN";
        if ("supervisor".equals(u) || u.startsWith("sup_")) return "SUPERVISOR";
        return "COBRADOR";
    }

    private void toggleUserActive(AppUserEntity userEntity) {
        try {
            String author = requireManagerUserId();
            boolean currentlyActive = userEntity.getActive() != null && userEntity.getActive() == 1;
            if (currentlyActive && author.equals(userEntity.getId())) {
                Alert warn = new Alert(Alert.AlertType.WARNING, "No puede desactivar su propia cuenta mientras está en sesión.");
                warn.initOwner(ownerStage);
                warn.showAndWait();
                return;
            }
            if (currentlyActive && "ADMIN".equalsIgnoreCase(resolveRoleDisplay(userEntity))) {
                long otherActiveAdmins = userList.stream()
                        .filter(u -> !u.getId().equals(userEntity.getId()))
                        .filter(u -> u.getActive() != null && u.getActive() == 1)
                        .filter(u -> "ADMIN".equalsIgnoreCase(resolveRoleDisplay(u)))
                        .count();
                if (otherActiveAdmins == 0) {
                    Alert warn = new Alert(Alert.AlertType.WARNING, "Debe permanecer al menos un Administrador activo en la oficina.");
                    warn.initOwner(ownerStage);
                    warn.showAndWait();
                    return;
                }
            }

            Alert confirm = new Alert(Alert.AlertType.CONFIRMATION,
                    currentlyActive
                            ? "¿Desea desactivar el acceso de \"" + userEntity.getFullName() + "\" (" + userEntity.getUsername() + ")?"
                            : "¿Desea reactivar el acceso de \"" + userEntity.getFullName() + "\"?");
            confirm.initOwner(ownerStage);
            confirm.setHeaderText(currentlyActive ? "Desactivar Usuario" : "Reactivar Usuario");
            if (confirm.showAndWait().orElse(ButtonType.CANCEL) != ButtonType.OK) return;

            userEntity.setActive(currentlyActive ? 0 : 1);
            userRepository.save(userEntity);
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(), author, "APP_USER", userEntity.getId(),
                    currentlyActive ? "DESACTIVAR_USUARIO" : "ACTIVAR_USUARIO",
                    currentlyActive ? "ACTIVO" : "INACTIVO",
                    currentlyActive ? "INACTIVO" : "ACTIVO",
                    "Cambio de estado de usuario en Configuración", now));
            refreshUsers();
        } catch (Exception ex) {
            Alert err = new Alert(Alert.AlertType.ERROR, ex.getMessage());
            err.initOwner(ownerStage);
            err.showAndWait();
        }
    }

    private void openEditUserCredentialsDialog(AppUserEntity userEntity) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Editar Credenciales de Acceso");
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(420);

        Label title = new Label("Modificar Credenciales: " + userEntity.getFullName());
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");

        TextField txtFullName = new TextField(userEntity.getFullName());
        txtFullName.getStyleClass().add("search-field");

        TextField txtUsername = new TextField(userEntity.getUsername());
        txtUsername.getStyleClass().add("search-field");

        ComboBox<String> cmbRole = new ComboBox<>();
        cmbRole.getItems().addAll("COBRADOR", "SUPERVISOR", "ADMIN");
        cmbRole.setValue(resolveRoleDisplay(userEntity));
        cmbRole.setMaxWidth(Double.MAX_VALUE);
        cmbRole.getStyleClass().add("search-field");

        PasswordField txtNewPass = new PasswordField();
        txtNewPass.setPromptText("Nueva contraseña (dejar vacío para conservar)");
        txtNewPass.getStyleClass().add("search-field");

        Label lblErr = new Label();
        lblErr.setWrapText(true);
        lblErr.setVisible(false);
        lblErr.setManaged(false);

        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Guardar Credenciales");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                String author = requireManagerUserId();
                String newName = txtFullName.getText().trim();
                String newUser = txtUsername.getText().trim().toLowerCase();
                String newPass = txtNewPass.getText().trim();
                String selectedRole = cmbRole.getValue() != null ? cmbRole.getValue() : "COBRADOR";

                if (newName.isEmpty() || newUser.isEmpty()) {
                    throw new IllegalArgumentException("El nombre y el usuario son obligatorios.");
                }
                if (!newPass.isEmpty() && newPass.length() < 6) {
                    throw new IllegalArgumentException("La nueva contraseña debe tener al menos 6 caracteres.");
                }

                var existing = userRepository.findByUsername(newUser);
                if (existing.isPresent() && !existing.get().getId().equals(userEntity.getId())) {
                    throw new IllegalArgumentException("Ese nombre de usuario ya está en uso por otra persona.");
                }

                userEntity.setFullName(newName);
                userEntity.setUsername(newUser);
                if (!newPass.isEmpty()) {
                    userEntity.setPasswordHash(PasswordHasher.hash(newPass));
                }
                userRepository.saveAndFlush(userEntity);
                if (authService != null) {
                    authService.assignRole(userEntity.getId(), selectedRole);
                }

                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        author,
                        "APP_USER",
                        userEntity.getId(),
                        "ACTUALIZAR_CREDENCIALES",
                        null,
                        "Credenciales actualizadas para: " + newName + " (" + newUser + ") · rol=" + selectedRole,
                        "Actualización de credenciales en Configuración",
                        now
                ));

                refreshUsers();
                dialog.close();
            } catch (Exception ex) {
                lblErr.setText(ex.getMessage());
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
            }
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        VBox roleBox = new VBox(4);
        Label lblRole = new Label("Rol de Acceso *");
        lblRole.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        roleBox.getChildren().addAll(lblRole, cmbRole);

        root.getChildren().addAll(
                title,
                createFieldBox("Nombre Completo *", txtFullName),
                createFieldBox("Usuario de Acceso *", txtUsername),
                roleBox,
                createFieldBox("Nueva Contraseña (opcional, mín. 6 caracteres)", txtNewPass),
                lblErr,
                actions
        );

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private VBox createFieldBox(String label, TextField field) {
        VBox box = new VBox(4);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        box.getChildren().addAll(lbl, field);
        return box;
    }

    public void loadSettings() {
        settingRepository.findById("company_name").ifPresent(s -> txtCompanyName.setText(s.getSettingValue()));
        settingRepository.findById("company_phone").ifPresent(s -> txtPhone.setText(s.getSettingValue()));
        settingRepository.findById("company_city").ifPresent(s -> txtCity.setText(s.getSettingValue()));

        settingRepository.findById("paperwork_enabled").ifPresent(s -> chkPaperworkEnabled.setSelected(!"false".equalsIgnoreCase(s.getSettingValue())));
        settingRepository.findById("paperwork_fee").ifPresent(s -> txtPaperworkFee.setText(s.getSettingValue()));
        settingRepository.findById("default_interest_percent").ifPresent(s -> txtDefaultInterest.setText(s.getSettingValue()));
        settingRepository.findById("max_new_loan_amount").ifPresent(s -> txtMaxNewLoanAmount.setText(s.getSettingValue()));
        settingRepository.findById("exclude_sundays").ifPresent(s -> chkExcludeSundays.setSelected(!"false".equalsIgnoreCase(s.getSettingValue())));

        settingRepository.findById("route_allow_new_loans").ifPresent(s -> chkRouteAllowNewLoans.setSelected(!"false".equalsIgnoreCase(s.getSettingValue())));
        settingRepository.findById("route_allow_expenses").ifPresent(s -> chkRouteAllowExpenses.setSelected(!"false".equalsIgnoreCase(s.getSettingValue())));
        settingRepository.findById("route_allow_reorder").ifPresent(s -> chkRouteAllowReorder.setSelected("true".equalsIgnoreCase(s.getSettingValue())));
        settingRepository.findById("route_allow_partial_payments").ifPresent(s -> chkRouteAllowPartialPayments.setSelected(!"false".equalsIgnoreCase(s.getSettingValue())));
    }

    private void saveSettings() {
        try {
            String author = requireManagerUserId();
            BigDecimal paperworkFee = CurrencyInputUtil.parseAmount(txtPaperworkFee.getText());
            BigDecimal defaultInterest = CurrencyInputUtil.parseAmount(txtDefaultInterest.getText());
            BigDecimal maxNewLoan = CurrencyInputUtil.parseAmount(txtMaxNewLoanAmount.getText());

            if (paperworkFee.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("La tarifa de papelería no puede ser negativa.");
            }
            if (defaultInterest.compareTo(BigDecimal.ZERO) < 0 || defaultInterest.compareTo(new BigDecimal("500")) > 0) {
                throw new IllegalArgumentException("Ingrese una tasa de interés sugerida válida (0% a 500%).");
            }
            if (maxNewLoan.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("El monto máximo por nuevo préstamo no puede ser negativo.");
            }

            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            settingRepository.save(new SystemSettingEntity("company_name", txtCompanyName.getText().trim(), now));
            settingRepository.save(new SystemSettingEntity("company_phone", txtPhone.getText().trim(), now));
            settingRepository.save(new SystemSettingEntity("company_city", txtCity.getText().trim(), now));

            settingRepository.save(new SystemSettingEntity("paperwork_enabled", String.valueOf(chkPaperworkEnabled.isSelected()), now));
            settingRepository.save(new SystemSettingEntity("paperwork_fee", paperworkFee.stripTrailingZeros().toPlainString(), now));
            settingRepository.save(new SystemSettingEntity("default_interest_percent", defaultInterest.stripTrailingZeros().toPlainString(), now));
            settingRepository.save(new SystemSettingEntity("max_new_loan_amount", maxNewLoan.stripTrailingZeros().toPlainString(), now));
            settingRepository.save(new SystemSettingEntity("exclude_sundays", String.valueOf(chkExcludeSundays.isSelected()), now));

            settingRepository.save(new SystemSettingEntity("route_allow_new_loans", String.valueOf(chkRouteAllowNewLoans.isSelected()), now));
            settingRepository.save(new SystemSettingEntity("route_allow_expenses", String.valueOf(chkRouteAllowExpenses.isSelected()), now));
            settingRepository.save(new SystemSettingEntity("route_allow_reorder", String.valueOf(chkRouteAllowReorder.isSelected()), now));
            settingRepository.save(new SystemSettingEntity("route_allow_partial_payments", String.valueOf(chkRouteAllowPartialPayments.isSelected()), now));
            settingRepository.save(new SystemSettingEntity(
                    com.cartera.sync.application.DesktopCloudSyncService.KEY_SETTINGS_LOCAL_DIRTY,
                    "true",
                    java.time.Instant.now().toString()
            ));

            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    author,
                    "SYSTEM_SETTING",
                    "OFFICE_CONFIG",
                    "ACTUALIZAR_CONFIGURACION",
                    null,
                    "empresa=" + txtCompanyName.getText().trim()
                            + ";papeleria=" + chkPaperworkEnabled.isSelected() + "/" + paperworkFee.toPlainString()
                            + ";interes=" + defaultInterest.toPlainString()
                            + ";tope=" + maxNewLoan.toPlainString(),
                    "Guardado de parámetros y políticas de oficina",
                    now
            ));

            lblParamsFeedback.setText("Parámetros y políticas operativas actualizados y auditados con éxito.");
            lblParamsFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
            lblParamsFeedback.setVisible(true);
            lblParamsFeedback.setManaged(true);
        } catch (Exception ex) {
            lblParamsFeedback.setText("Error: " + ex.getMessage());
            lblParamsFeedback.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
            lblParamsFeedback.setVisible(true);
            lblParamsFeedback.setManaged(true);
        }
    }

    public void refreshUsers() {
        loadSettings();
        List<AppUserEntity> list = userRepository.findAll();
        userList.setAll(list);
        userTable.refresh();
        if (routeRepository != null) {
            routeList.setAll(routeRepository.findAll());
            routeTable.refresh();
        }
        updateBackupCounterLabel();
    }

    private void openNewUserDialog() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Registrar Nuevo Usuario / Cobrador");
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(420);

        Label title = new Label("Nuevo Usuario / Credencial de Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtName = new TextField();
        txtName.setPromptText("Ej. Cobrador Ruta Norte");
        txtName.getStyleClass().add("search-field");

        TextField txtUser = new TextField();
        txtUser.setPromptText("Ej. cobrador1");
        txtUser.getStyleClass().add("search-field");

        ComboBox<String> cmbRole = new ComboBox<>();
        cmbRole.getItems().addAll("COBRADOR", "SUPERVISOR", "ADMIN");
        cmbRole.setValue("COBRADOR");
        cmbRole.setMaxWidth(Double.MAX_VALUE);
        cmbRole.getStyleClass().add("search-field");

        PasswordField txtPass = new PasswordField();
        txtPass.setPromptText("Mínimo 6 caracteres");
        txtPass.getStyleClass().add("search-field");

        Label lblErr = new Label();
        lblErr.setWrapText(true);
        lblErr.setVisible(false);
        lblErr.setManaged(false);

        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button("Crear y Asignar Credencial");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                String author = requireManagerUserId();
                String name = txtName.getText().trim();
                String user = txtUser.getText().trim().toLowerCase();
                String pass = txtPass.getText().trim();
                String selectedRole = cmbRole.getValue() != null ? cmbRole.getValue() : "COBRADOR";

                if (name.isEmpty() || user.isEmpty() || pass.isEmpty()) {
                    throw new IllegalArgumentException("Todos los campos son obligatorios.");
                }
                if (pass.length() < 6) {
                    throw new IllegalArgumentException("La contraseña debe tener al menos 6 caracteres.");
                }
                if (userRepository.findByUsername(user).isPresent()) {
                    throw new IllegalArgumentException("Ya existe un usuario con ese nombre de acceso.");
                }

                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                String id = UUID.randomUUID().toString();
                userRepository.saveAndFlush(new AppUserEntity(
                        id, user, PasswordHasher.hash(pass), name, 1, now
                ));
                if (authService != null) {
                    authService.assignRole(id, selectedRole);
                }

                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        author,
                        "APP_USER",
                        id,
                        "CREAR_USUARIO",
                        null,
                        "Usuario creado: " + name + " (" + user + ") · rol=" + selectedRole,
                        "Registro de usuario en configuración",
                        now
                ));

                refreshUsers();
                dialog.close();
            } catch (Exception ex) {
                lblErr.setText(ex.getMessage());
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
            }
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        VBox roleBox = new VBox(4);
        Label lblRole = new Label("Rol de Acceso *");
        lblRole.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        roleBox.getChildren().addAll(lblRole, cmbRole);

        root.getChildren().addAll(
                title,
                createFieldBox("Nombre Completo *", txtName),
                createFieldBox("Usuario de Acceso *", txtUser),
                roleBox,
                createFieldBox("Contraseña Inicial (mín. 6 caracteres) *", txtPass),
                lblErr,
                actions
        );

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void exportBackup() {
        FileChooser fileChooser = new FileChooser();
        fileChooser.setTitle("Guardar Copia de Seguridad Verificada");
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
        fileChooser.setInitialFileName("cartera_backup_" + timestamp + ".db");
        fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivo de Respaldo (*.db)", "*.db"));

        File dest = fileChooser.showSaveDialog(ownerStage);
        if (dest == null) return;

        lblBackupFeedback.setText("Generando respaldo íntegro (WAL consolidado)...");
        lblBackupFeedback.setStyle("-fx-text-fill: #2563eb; -fx-background-color: #eff6ff; -fx-padding: 6 10; -fx-background-radius: 6;");
        lblBackupFeedback.setVisible(true);
        lblBackupFeedback.setManaged(true);

        Thread t = new Thread(() -> {
            try {
                Path snapshotPath;
                if (databaseBackupService != null) {
                    snapshotPath = databaseBackupService.createBackup("exportacion-manual");
                } else {
                    snapshotPath = Paths.get(System.getProperty("user.home"), ".sistema-cartera", "cartera.db");
                    if (!Files.exists(snapshotPath)) {
                        throw new IllegalStateException("No se encontró el archivo de base de datos.");
                    }
                }
                Files.copy(snapshotPath, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
                Platform.runLater(() -> {
                    updateBackupCounterLabel();
                    lblBackupFeedback.setText("Copia verificada exportada con éxito:\n" + dest.getName());
                    lblBackupFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-padding: 6 10; -fx-background-radius: 6;");
                });
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    lblBackupFeedback.setText("Error al respaldar: " + ex.getMessage());
                    lblBackupFeedback.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-padding: 6 10; -fx-background-radius: 6;");
                });
            }
        }, "cartera-export-backup");
        t.setDaemon(true);
        t.start();
    }

    private void openDbFolder() {
        try {
            Path folderPath = (databaseBackupService != null)
                    ? databaseBackupService.getDatabasePath().getParent()
                    : Paths.get(System.getProperty("user.home"), ".sistema-cartera");
            File folder = folderPath.toFile();
            if (folder.exists() && Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(folder);
            } else {
                lblBackupFeedback.setText("No se pudo abrir la carpeta: " + folder.getAbsolutePath());
                lblBackupFeedback.setStyle("-fx-text-fill: #dc2626;");
                lblBackupFeedback.setVisible(true);
                lblBackupFeedback.setManaged(true);
            }
        } catch (Exception ex) {
            lblBackupFeedback.setText("No se pudo abrir la carpeta: " + ex.getMessage());
            lblBackupFeedback.setStyle("-fx-text-fill: #dc2626;");
            lblBackupFeedback.setVisible(true);
            lblBackupFeedback.setManaged(true);
        }
    }
}
