package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
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
 * Vista de Configuración del Sistema: Parámetros del negocio, gestión de cobradores y copias de seguridad.
 */
public class ConfigurationView extends VBox {

    private final SystemSettingRepository settingRepository;
    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final Stage ownerStage;

    // Parámetros
    private final TextField txtCompanyName = new TextField();
    private final TextField txtPhone = new TextField();
    private final TextField txtCity = new TextField();
    private final Label lblParamsFeedback = new Label();

    // Usuarios
    private final ObservableList<AppUserEntity> userList = FXCollections.observableArrayList();
    private final TableView<AppUserEntity> userTable = new TableView<>();

    // Backup
    private final Label lblBackupFeedback = new Label();

    public ConfigurationView(SystemSettingRepository settingRepository,
                             AppUserRepository userRepository,
                             AuditLogRepository auditLogRepository,
                             Stage ownerStage) {
        this.settingRepository = settingRepository;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildContent();
        loadSettings();
        refreshUsers();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Configuración del Sistema");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Parámetros generales de la cartera, seguridad de accesos y respaldo de base de datos");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        top.getChildren().add(titleBox);
        getChildren().add(top);
    }

    private void buildContent() {
        HBox columns = new HBox(20);
        VBox.setVgrow(columns, Priority.ALWAYS);

        // Columna Izquierda: Parámetros y Backup
        VBox leftCol = new VBox(16);
        leftCol.setPrefWidth(380);

        leftCol.getChildren().addAll(buildParamsCard(), buildBackupCard());

        // Columna Derecha: Gestión de Cobradores
        VBox rightCol = new VBox(16);
        HBox.setHgrow(rightCol, Priority.ALWAYS);
        rightCol.getChildren().add(buildUsersCard());

        columns.getChildren().addAll(leftCol, rightCol);
        getChildren().add(columns);
    }

    private VBox buildParamsCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(20));

        Label title = new Label("Datos de la Empresa / Cartera");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        txtCompanyName.setPromptText("Ej. Inversiones & Cobranzas del Norte");
        txtCompanyName.getStyleClass().add("search-field");

        txtPhone.setPromptText("Ej. 300 123 4567");
        txtPhone.getStyleClass().add("search-field");

        txtCity.setPromptText("Ej. Barranquilla");
        txtCity.getStyleClass().add("search-field");

        lblParamsFeedback.setVisible(false);
        lblParamsFeedback.setManaged(false);

        Button btnSaveParams = new Button("Guardar Cambios");
        btnSaveParams.getStyleClass().add("btn-primary");
        btnSaveParams.setOnAction(e -> saveSettings());

        card.getChildren().addAll(
                title,
                createFieldBox("Nombre Comercial / Razón Social", txtCompanyName),
                createFieldBox("Teléfono de Contacto (Recibos)", txtPhone),
                createFieldBox("Ciudad Principal", txtCity),
                lblParamsFeedback,
                btnSaveParams
        );
        return card;
    }

    private VBox buildBackupCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(20));

        Label title = new Label("Copia de Seguridad (SQLite)");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Label desc = new Label("Respalda todos los clientes, créditos y pagos en un archivo externo para evitar pérdida de datos.");
        desc.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");
        desc.setWrapText(true);

        lblBackupFeedback.setVisible(false);
        lblBackupFeedback.setManaged(false);

        HBox btns = new HBox(10);
        Button btnExport = new Button("Crear Copia");
        btnExport.getStyleClass().add("btn-success");
        btnExport.setOnAction(e -> exportBackup());

        Button btnOpenFolder = new Button("Abrir Carpeta");
        btnOpenFolder.getStyleClass().add("btn-secondary");
        btnOpenFolder.setOnAction(e -> openDbFolder());

        btns.getChildren().addAll(btnExport, btnOpenFolder);

        card.getChildren().addAll(title, desc, btns, lblBackupFeedback);
        return card;
    }

    @SuppressWarnings("unchecked")
    private VBox buildUsersCard() {
        VBox card = new VBox(12);
        card.getStyleClass().add("table-card");
        card.setPadding(new Insets(20));
        VBox.setVgrow(card, Priority.ALWAYS);

        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("Cobradores y Usuarios");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnNewUser = new Button("+ Nuevo Cobrador");
        btnNewUser.getStyleClass().add("btn-primary");
        btnNewUser.setOnAction(e -> openNewUserDialog());

        header.getChildren().addAll(title, spacer, btnNewUser);

        userTable.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(userTable, Priority.ALWAYS);

        TableColumn<AppUserEntity, String> colName = new TableColumn<>("NOMBRE COMPLETO");
        colName.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getFullName()));
        colName.setPrefWidth(160);

        TableColumn<AppUserEntity, String> colUser = new TableColumn<>("USUARIO");
        colUser.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getUsername()));
        colUser.setPrefWidth(100);

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

        userTable.getColumns().addAll(colName, colUser, colStatus);
        userTable.setItems(userList);

        card.getChildren().addAll(header, userTable);
        return card;
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
    }

    private void saveSettings() {
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        settingRepository.save(new SystemSettingEntity("company_name", txtCompanyName.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("company_phone", txtPhone.getText().trim(), now));
        settingRepository.save(new SystemSettingEntity("company_city", txtCity.getText().trim(), now));

        lblParamsFeedback.setText("Parámetros actualizados con éxito.");
        lblParamsFeedback.setStyle("-fx-text-fill: #059669; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 6; -fx-padding: 6 10; -fx-background-radius: 6;");
        lblParamsFeedback.setVisible(true);
        lblParamsFeedback.setManaged(true);
    }

    public void refreshUsers() {
        List<AppUserEntity> list = userRepository.findAll();
        userList.setAll(list);
    }

    private void openNewUserDialog() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle("Registrar Nuevo Cobrador");
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(380);

        Label title = new Label("Nuevo Cobrador / Usuario");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        TextField txtName = new TextField();
        txtName.setPromptText("Ej. Andrés Pérez");
        txtName.getStyleClass().add("search-field");

        TextField txtUser = new TextField();
        txtUser.setPromptText("Ej. andres");
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

        Button btnSave = new Button("Crear Usuario");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            String name = txtName.getText().trim();
            String user = txtUser.getText().trim();
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
                    .orElse("usr-admin-1");

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
                createFieldBox("Nombre Completo *", txtName),
                createFieldBox("Nombre de Usuario (Acceso) *", txtUser),
                createFieldBox("Contraseña Inicial *", txtPass),
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
            fileChooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Base de Datos SQLite (*.db)", "*.db"));

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
