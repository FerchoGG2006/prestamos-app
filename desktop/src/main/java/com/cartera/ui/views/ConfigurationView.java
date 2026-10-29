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
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.infrastructure.security.UserSessionContext;
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
        loadSettings();
        refreshUsers();
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

        lblBackupFeedback.setVisible(false);
        lblBackupFeedback.setManaged(false);

        HBox btns = new HBox(8);
        Button btnInstant = new Button("⚡ Respaldo Instantáneo");
        btnInstant.getStyleClass().add("btn-primary");
        btnInstant.setOnAction(e -> createInstantBackup());

        Button btnExport = new Button("Exportar Copia...");
        btnExport.getStyleClass().add("btn-success");
        btnExport.setOnAction(e -> exportBackup());

        Button btnOpenFolder = new Button("Abrir Carpeta");
        btnOpenFolder.getStyleClass().add("btn-secondary");
        btnOpenFolder.setOnAction(e -> openDbFolder());

        btns.getChildren().addAll(btnInstant, btnExport, btnOpenFolder);

        card.getChildren().addAll(title, desc, lblBackupCounter, btns, lblBackupFeedback);
        return card;
    }

    private void updateBackupCounterLabel() {
        if (databaseBackupService != null) {
            int count = databaseBackupService.getBackupCount();
            lblBackupCounter.setText("📦 Copias automáticas almacenadas: " + count);
        } else {
            lblBackupCounter.setText("📦 Carpeta de respaldos activa en ~/.sistema-cartera/backups");
        }
    }

    private void createInstantBackup() {
        if (databaseBackupService == null) {
            exportBackup();
            return;
        }
        try {
            Path path = databaseBackupService.createBackup("manual");
            updateBackupCounterLabel();
            lblBackupFeedback.setText("Respaldo creado en: " + (path != null ? path.getFileName() : "ok"));
            lblBackupFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-padding: 6 10; -fx-background-radius: 6;");
            lblBackupFeedback.setVisible(true);
            lblBackupFeedback.setManaged(true);
        } catch (Exception e) {
            lblBackupFeedback.setText("No se pudo crear el respaldo instantáneo.");
            lblBackupFeedback.setStyle("-fx-text-fill: #dc2626;");
            lblBackupFeedback.setVisible(true);
            lblBackupFeedback.setManaged(true);
        }
    }

    private VBox buildCapitalTriadCard() {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(18));

        Label title = new Label("💼 Capital Operativo: Administrativo, Cartera en Calle y Base");
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
        VBox.setVgrow(routeTable, Priority.ALWAYS);

        TableColumn<RouteEntity, String> colId = new TableColumn<>("ID RUTA");
        colId.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getId()));
        colId.setPrefWidth(110);

        TableColumn<RouteEntity, String> colName = new TableColumn<>("NOMBRE DE RUTA");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getName()));
        colName.setPrefWidth(150);

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
        colCollector.setPrefWidth(140);

        routeTable.getColumns().addAll(colId, colName, colCollector);
        routeTable.setItems(routeList);

        card.getChildren().addAll(header, routeTable);
        return card;
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
        root.setPrefWidth(400);

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
        cmbCollector.getItems().setAll(userList);
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
        if (!userList.isEmpty()) {
            cmbCollector.setValue(userList.get(0));
        }

        Label lblErr = new Label();
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
            String id = txtCode.getText().trim().toLowerCase().replaceAll("\\s+", "-");
            String name = txtName.getText().trim();
            if (id.isEmpty() || name.isEmpty()) {
                lblErr.setText("El código y nombre de la ruta son obligatorios.");
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
                return;
            }
            if (cmbCollector.getValue() == null) {
                lblErr.setText("Debe seleccionar un cobrador para la ruta.");
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
                return;
            }
            String collectorId = cmbCollector.getValue().getId();
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            routeRepository.save(new RouteEntity(id, name, collectorId, 1, now));
            refreshUsers();
            if (onRoutesChanged != null) {
                onRoutesChanged.run();
            }
            dialog.close();
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
        VBox.setVgrow(userTable, Priority.ALWAYS);

        TableColumn<AppUserEntity, String> colName = new TableColumn<>("NOMBRE COMPLETO");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFullName()));
        colName.setPrefWidth(160);

        TableColumn<AppUserEntity, String> colUser = new TableColumn<>("USUARIO (ACCESO)");
        colUser.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getUsername()));
        colUser.setPrefWidth(120);

        TableColumn<AppUserEntity, String> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getActive() == 1 ? "ACTIVO" : "INACTIVO"));
        colStatus.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String s, boolean empty) {
                super.updateItem(s, empty);
                if (empty || s == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    Label badge = new Label(s);
                    badge.setStyle("-fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px; " +
                            ("ACTIVO".equals(s) ? "-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-border-color: #a7f3d0; -fx-border-radius: 10;" : "-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-border-color: #fecaca; -fx-border-radius: 10;"));
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(90);

        TableColumn<AppUserEntity, String> colAction = new TableColumn<>("CREDENCIALES");
        colAction.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getId()));
        colAction.setCellFactory(col -> new TableCell<>() {
            private final Button btnEdit = new Button("Editar Clave / Usuario");
            {
                btnEdit.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #0284c7; -fx-border-color: #bae6fd; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-cursor: hand;");
                btnEdit.setOnAction(e -> {
                    AppUserEntity u = getTableView().getItems().get(getIndex());
                    if (u != null) {
                        openEditUserCredentialsDialog(u);
                    }
                });
            }
            @Override
            protected void updateItem(String item, boolean empty) {
                super.updateItem(item, empty);
                setGraphic(empty ? null : btnEdit);
            }
        });
        colAction.setPrefWidth(135);

        userTable.getColumns().addAll(colName, colUser, colStatus, colAction);
        userTable.setItems(userList);

        Label notice = new Label("Nota: Aquí puedes cambiar las credenciales del Administrador o de cualquier cobrador de ruta en cualquier momento.");
        notice.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-style: italic;");

        card.getChildren().addAll(header, userTable, notice);
        return card;
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
        root.setPrefWidth(400);

        Label title = new Label("Modificar Credenciales: " + userEntity.getFullName());
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");

        TextField txtFullName = new TextField(userEntity.getFullName());
        txtFullName.getStyleClass().add("search-field");

        TextField txtUsername = new TextField(userEntity.getUsername());
        txtUsername.getStyleClass().add("search-field");

        TextField txtNewPass = new TextField();
        txtNewPass.setPromptText("Nueva contraseña (dejar vacío para conservar)");
        txtNewPass.getStyleClass().add("search-field");

        Label lblErr = new Label();
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
            String newName = txtFullName.getText().trim();
            String newUser = txtUsername.getText().trim().toLowerCase();
            String newPass = txtNewPass.getText().trim();

            if (newName.isEmpty() || newUser.isEmpty()) {
                lblErr.setText("El nombre y el usuario son obligatorios.");
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
                return;
            }

            var existing = userRepository.findByUsername(newUser);
            if (existing.isPresent() && !existing.get().getId().equals(userEntity.getId())) {
                lblErr.setText("Ese nombre de usuario ya está en uso por otra persona.");
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
                return;
            }

            userEntity.setFullName(newName);
            userEntity.setUsername(newUser);
            if (!newPass.isEmpty()) {
                userEntity.setPasswordHash(PasswordHasher.hash(newPass));
            }
            userRepository.save(userEntity);

            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            String author = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("admin");
            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    author,
                    "APP_USER",
                    userEntity.getId(),
                    "ACTUALIZAR_CREDENCIALES",
                    null,
                    "Credenciales actualizadas para: " + newName + " (" + newUser + ")",
                    "Actualización de credenciales en Configuración",
                    now
            ));

            refreshUsers();
            dialog.close();
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        root.getChildren().addAll(
                title,
                createFieldBox("Nombre Completo *", txtFullName),
                createFieldBox("Usuario de Acceso *", txtUsername),
                createFieldBox("Nueva Contraseña *", txtNewPass),
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

    private void loadSettings() {
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
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        settingRepository.save(new SystemSettingEntity("company_name", txtCompanyName.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("company_phone", txtPhone.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("company_city", txtCity.getText().trim(), now));

        settingRepository.save(new SystemSettingEntity("paperwork_enabled", String.valueOf(chkPaperworkEnabled.isSelected()), now));
        settingRepository.save(new SystemSettingEntity("paperwork_fee", txtPaperworkFee.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("default_interest_percent", txtDefaultInterest.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("max_new_loan_amount", txtMaxNewLoanAmount.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("exclude_sundays", String.valueOf(chkExcludeSundays.isSelected()), now));

        settingRepository.save(new SystemSettingEntity("route_allow_new_loans", String.valueOf(chkRouteAllowNewLoans.isSelected()), now));
        settingRepository.save(new SystemSettingEntity("route_allow_expenses", String.valueOf(chkRouteAllowExpenses.isSelected()), now));
        settingRepository.save(new SystemSettingEntity("route_allow_reorder", String.valueOf(chkRouteAllowReorder.isSelected()), now));
        settingRepository.save(new SystemSettingEntity("route_allow_partial_payments", String.valueOf(chkRouteAllowPartialPayments.isSelected()), now));

        lblParamsFeedback.setText("Parámetros y políticas operativas actualizados con éxito.");
        lblParamsFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
        lblParamsFeedback.setVisible(true);
        lblParamsFeedback.setManaged(true);
    }

    public void refreshUsers() {
        List<AppUserEntity> list = userRepository.findAll();
        userList.setAll(list);
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
        dialog.setTitle("Registrar Nuevo Cobrador / Credenciales de Ruta");
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(400);

        Label title = new Label("Nuevo Cobrador / Credencial de Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtName = new TextField();
        txtName.setPromptText("Ej. Cobrador Ruta Norte");
        txtName.getStyleClass().add("search-field");

        TextField txtUser = new TextField();
        txtUser.setPromptText("Ej. cobrador1");
        txtUser.getStyleClass().add("search-field");

        PasswordField txtPass = new PasswordField();
        txtPass.setPromptText("••••••••");
        txtPass.getStyleClass().add("search-field");

        Label lblErr = new Label();
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
            String name = txtName.getText().trim();
            String user = txtUser.getText().trim().toLowerCase();
            String pass = txtPass.getText();

            if (name.isEmpty() || user.isEmpty() || pass.isEmpty()) {
                lblErr.setText("Todos los campos son obligatorios.");
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
                return;
            }

            if (userRepository.findByUsername(user).isPresent()) {
                lblErr.setText("Ya existe un usuario con ese nombre de acceso.");
                lblErr.setStyle("-fx-text-fill: #ef4444;");
                lblErr.setVisible(true);
                lblErr.setManaged(true);
                return;
            }

            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            String id = UUID.randomUUID().toString();
            userRepository.save(new AppUserEntity(
                    id, user, PasswordHasher.hash(pass), name, 1, now
            ));

            String author = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("admin");

            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    author,
                    "APP_USER",
                    id,
                    "CREAR_USUARIO",
                    null,
                    "Cobrador creado: " + name + " (" + user + ")",
                    "Registro de cobrador en configuración",
                    now
            ));

            refreshUsers();
            dialog.close();
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        root.getChildren().addAll(
                title,
                createFieldBox("Nombre Completo del Cobrador *", txtName),
                createFieldBox("Usuario de Acceso a Ruta *", txtUser),
                createFieldBox("Contraseña Inicial de la Ruta *", txtPass),
                lblErr,
                actions
        );

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private void exportBackup() {
        try {
            Path dbPath = Paths.get(System.getProperty("user.home"), ".sistema-cartera", "cartera.db");
            if (!Files.exists(dbPath)) {
                lblBackupFeedback.setText("No se encontró el archivo de base de datos.");
                lblBackupFeedback.setStyle("-fx-text-fill: #ef4444;");
                lblBackupFeedback.setVisible(true);
                lblBackupFeedback.setManaged(true);
                return;
            }

            FileChooser fileChooser = new FileChooser();
            fileChooser.setTitle("Guardar Copia de Seguridad");
            String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss"));
            fileChooser.setInitialFileName("cartera_backup_" + timestamp + ".db");
            fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivo de Respaldo (*.db)", "*.db"));

            File dest = fileChooser.showSaveDialog(ownerStage);
            if (dest != null) {
                Files.copy(dbPath, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
                lblBackupFeedback.setText("Copia exportada con éxito:\n" + dest.getName());
                lblBackupFeedback.setStyle("-fx-text-fill: #10b981; -fx-background-color: rgba(16, 185, 129, 0.15); -fx-padding: 6 10; -fx-background-radius: 6;");
                lblBackupFeedback.setVisible(true);
                lblBackupFeedback.setManaged(true);
            }
        } catch (Exception ex) {
            lblBackupFeedback.setText("Error al respaldar: " + ex.getMessage());
            lblBackupFeedback.setStyle("-fx-text-fill: #ef4444;");
            lblBackupFeedback.setVisible(true);
            lblBackupFeedback.setManaged(true);
        }
    }

    private void openDbFolder() {
        try {
            File folder = new File(System.getProperty("user.home"), ".sistema-cartera");
            if (folder.exists() && Desktop.isDesktopSupported()) {
                Desktop.getDesktop().open(folder);
            }
        } catch (Exception ignored) {
        }
    }
}
