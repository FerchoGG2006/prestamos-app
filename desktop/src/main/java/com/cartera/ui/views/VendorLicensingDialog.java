package com.cartera.ui.views;

import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient.RemoteOffice;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.List;

/**
 * Panel Comercial del Vendedor (JavaFX 21):
 * Permite registrar oficinas compradoras, emitir códigos de activación únicos,
 * administrar el estado de licencias (ACTIVE / SUSPENDED / EXPIRED) y respaldar/vincular
 * la oficina actual (ej. Inversiones FBV).
 */
public class VendorLicensingDialog {

    private final OfficeLicensingService licensingService;
    private final Stage owner;

    private final ObservableList<RemoteOffice> offices = FXCollections.observableArrayList();
    private final TableView<RemoteOffice> table = new TableView<>();
    private final Label lblStatus = new Label();

    public VendorLicensingDialog(Stage owner, OfficeLicensingService licensingService) {
        this.owner = owner;
        this.licensingService = licensingService;
    }

    public void show() {
        if (!promptVendorAccess()) {
            return;
        }

        Stage modal = new Stage();
        modal.initOwner(owner);
        modal.initModality(Modality.APPLICATION_MODAL);
        modal.setTitle("Panel Comercial — Registro de Oficinas y Licencias");

        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #f8fafc;");

        Label title = new Label("Panel Comercial de Oficinas y Licencias");
        title.setStyle("-fx-font-size: 18px; -fx-font-weight: 900; -fx-text-fill: #0f172a;");
        Label subtitle = new Label("Crea oficinas con ID único e inmutable, entrega códigos de activación y controla licencias.");
        subtitle.setStyle("-fx-font-size: 12px; -fx-text-fill: #64748b;");

        // 1. Conexión Supabase
        TitledPane cloudPane = buildCloudConnectionPane();

        // 2. Registrar Nueva Oficina
        TitledPane registerPane = buildRegisterOfficePane();

        // 3. Respaldo y Vinculación de FBV / Oficina Local
        HBox legacyBar = buildLocalProtectionBar();

        // 4. Tabla de Oficinas Registradas
        VBox tableCard = buildOfficesTableCard();

        lblStatus.setWrapText(true);
        lblStatus.setStyle("-fx-font-size: 12px; -fx-font-weight: bold; -fx-text-fill: #0f766e;");

        root.getChildren().addAll(title, subtitle, cloudPane, registerPane, legacyBar, tableCard, lblStatus);
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        ScrollPane scroll = new ScrollPane(root);
        scroll.setFitToWidth(true);
        scroll.setStyle("-fx-background-color: #f8fafc;");

        Scene scene = new Scene(scroll, 860, 720);
        modal.setScene(scene);
        refreshOffices();
        modal.showAndWait();
    }

    private boolean promptVendorAccess() {
        if (!licensingService.hasVendorPinConfigured()) {
            TextInputDialog setupPin = new TextInputDialog();
            setupPin.setTitle("Configurar PIN Maestro de Vendedor");
            setupPin.setHeaderText("Primera vez en el Panel Comercial");
            setupPin.setContentText("Crea un PIN maestro de vendedor (mín. 4 caracteres):");
            return setupPin.showAndWait().map(pin -> {
                try {
                    licensingService.configureVendorPin(pin);
                    return true;
                } catch (Exception ex) {
                    showError(ex.getMessage());
                    return false;
                }
            }).orElse(false);
        }

        Dialog<String> dialog = new Dialog<>();
        dialog.setTitle("Acceso Comercial Protegido");
        dialog.setHeaderText("Ingresa el PIN maestro de vendedor");
        ButtonType okBtn = new ButtonType("Desbloquear", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(okBtn, ButtonType.CANCEL);

        PasswordField pf = new PasswordField();
        pf.setPromptText("PIN maestro");
        dialog.getDialogPane().setContent(pf);

        dialog.setResultConverter(btn -> btn == okBtn ? pf.getText() : null);
        return dialog.showAndWait().map(pin -> {
            if (licensingService.verifyVendorPin(pin)) {
                return true;
            }
            showError("PIN de vendedor incorrecto.");
            return false;
        }).orElse(false);
    }

    private TitledPane buildCloudConnectionPane() {
        TextField txtUrl = new TextField(licensingService.getSupabaseUrl());
        txtUrl.setPromptText("https://xxxx.supabase.co");
        PasswordField txtKey = new PasswordField();
        txtKey.setText(licensingService.getSupabaseKey());
        txtKey.setPromptText("Supabase Anon Key");
        PasswordField txtVendorSecret = new PasswordField();
        txtVendorSecret.setText(licensingService.getVendorSecretKey());
        txtVendorSecret.setPromptText("Clave Maestra Distribuidor (KRD-VND-...)");

        Button btnSaveCloud = new Button("Guardar Conexión");
        btnSaveCloud.setStyle("-fx-background-color: #0f172a; -fx-text-fill: white; -fx-font-weight: bold; -fx-background-radius: 8;");
        btnSaveCloud.setOnAction(e -> {
            licensingService.saveCloudConnection(txtUrl.getText(), txtKey.getText(), txtVendorSecret.getText());
            lblStatus.setText("Conexión y clave de distribuidor guardadas.");
            refreshOffices();
        });

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(8);
        grid.add(new Label("URL Nube:"), 0, 0);
        grid.add(txtUrl, 1, 0);
        grid.add(new Label("API Key:"), 0, 1);
        grid.add(txtKey, 1, 1);
        grid.add(new Label("Clave Distribuidor:"), 0, 2);
        grid.add(txtVendorSecret, 1, 2);
        grid.add(btnSaveCloud, 2, 2);
        GridPane.setHgrow(txtUrl, Priority.ALWAYS);
        GridPane.setHgrow(txtKey, Priority.ALWAYS);
        GridPane.setHgrow(txtVendorSecret, Priority.ALWAYS);

        TitledPane pane = new TitledPane("1. Conexión al Registro Maestro (Supabase)", grid);
        pane.setExpanded(licensingService.getSupabaseUrl().isBlank() || licensingService.getVendorSecretKey().isBlank());
        return pane;
    }

    private TitledPane buildRegisterOfficePane() {
        TextField txtCompany = new TextField();
        txtCompany.setPromptText("Nombre comercial (ej. Inversiones del Norte)");
        TextField txtOwner = new TextField();
        txtOwner.setPromptText("Dueño / Comprador");
        TextField txtCity = new TextField();
        txtCity.setPromptText("Ciudad");
        TextField txtPhone = new TextField();
        txtPhone.setPromptText("Teléfono soporte");
        TextField txtAdminName = new TextField();
        txtAdminName.setPromptText("Nombre del Administrador");
        TextField txtAdminUser = new TextField();
        txtAdminUser.setPromptText("Usuario Admin (ej. admin-norte)");
        PasswordField txtAdminPass = new PasswordField();
        txtAdminPass.setPromptText("Contraseña Admin (mín. 6)");
        ComboBox<String> cmbPlan = new ComboBox<>(FXCollections.observableArrayList("LIFETIME", "MONTHLY", "ANNUAL"));
        cmbPlan.setValue("LIFETIME");
        TextField txtExpires = new TextField();
        txtExpires.setPromptText("Vencimiento ISO opcional (ej. 2027-01-31T23:59:59Z)");

        Button btnCreate = new Button("Registrar Oficina y Generar Código");
        btnCreate.setStyle("-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-weight: bold; -fx-background-radius: 8; -fx-padding: 8 16;");
        btnCreate.setOnAction(e -> {
            try {
                RemoteOffice created = licensingService.registerCommercialOffice(
                        txtCompany.getText(),
                        txtOwner.getText(),
                        txtCity.getText(),
                        txtPhone.getText(),
                        txtAdminName.getText(),
                        txtAdminUser.getText(),
                        txtAdminPass.getText(),
                        cmbPlan.getValue(),
                        txtExpires.getText().isBlank() ? null : txtExpires.getText().trim(),
                        ""
                );
                copyToClipboard(created.activationCode());
                lblStatus.setText("Oficina creada: " + created.companyName()
                        + " | ID: " + created.id()
                        + " | Código: " + created.activationCode() + " (copiado al portapapeles)");
                txtCompany.clear();
                txtOwner.clear();
                txtAdminName.clear();
                txtAdminUser.clear();
                txtAdminPass.clear();
                refreshOffices();
            } catch (Exception ex) {
                showError(ex.getMessage());
            }
        });

        GridPane grid = new GridPane();
        grid.setHgap(10);
        grid.setVgap(8);
        grid.addRow(0, new Label("Oficina:"), txtCompany, new Label("Comprador:"), txtOwner);
        grid.addRow(1, new Label("Ciudad:"), txtCity, new Label("Teléfono:"), txtPhone);
        grid.addRow(2, new Label("Admin Nombre:"), txtAdminName, new Label("Admin Usuario:"), txtAdminUser);
        grid.addRow(3, new Label("Admin Clave:"), txtAdminPass, new Label("Plan:"), cmbPlan);
        grid.add(new Label("Expira (opcional):"), 0, 4);
        grid.add(txtExpires, 1, 4, 2, 1);
        grid.add(btnCreate, 3, 4);
        GridPane.setHgrow(txtCompany, Priority.ALWAYS);
        GridPane.setHgrow(txtOwner, Priority.ALWAYS);

        TitledPane pane = new TitledPane("2. Dar de Alta Nueva Oficina Cliente", grid);
        pane.setExpanded(true);
        return pane;
    }

    private HBox buildLocalProtectionBar() {
        Button btnProtectFbv = new Button("Respaldar BD Local y Registrar esta Oficina");
        btnProtectFbv.setStyle("-fx-background-color: #1d4ed8; -fx-text-fill: white; -fx-font-weight: bold; -fx-background-radius: 8;");
        btnProtectFbv.setOnAction(e -> {
            TextInputDialog dlg = new TextInputDialog("Inversiones FBV");
            dlg.setTitle("Proteger y Vincular Oficina Local");
            dlg.setHeaderText("Se creará un respaldo automático antes de registrar la oficina.");
            dlg.setContentText("Nombre oficial de esta oficina:");
            dlg.showAndWait().ifPresent(name -> {
                try {
                    RemoteOffice office = licensingService.backupAndLinkExistingLocalOffice(name, "");
                    copyToClipboard(office.activationCode());
                    lblStatus.setText("Respaldo creado y oficina vinculada: " + office.id()
                            + " | Código: " + office.activationCode() + " (copiado)");
                    refreshOffices();
                } catch (Exception ex) {
                    showError(ex.getMessage());
                }
            });
        });

        Label info = new Label("Oficina local actual: " + licensingService.getLinkedOfficeId().orElse("Sin vincular"));
        info.setStyle("-fx-font-weight: bold; -fx-text-fill: #334155;");

        HBox bar = new HBox(12, btnProtectFbv, info);
        bar.setAlignment(Pos.CENTER_LEFT);
        bar.setPadding(new Insets(10));
        bar.setStyle("-fx-background-color: #eff6ff; -fx-border-color: #bfdbfe; -fx-border-radius: 10; -fx-background-radius: 10;");
        return bar;
    }

    private VBox buildOfficesTableCard() {
        TableColumn<RemoteOffice, String> colId = new TableColumn<>("ID Inmutable");
        colId.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().id()));
        colId.setPrefWidth(130);

        TableColumn<RemoteOffice, String> colName = new TableColumn<>("Oficina");
        colName.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().companyName()));
        colName.setPrefWidth(170);

        TableColumn<RemoteOffice, String> colCode = new TableColumn<>("Código Activación");
        colCode.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().activationCode()));
        colCode.setPrefWidth(140);

        TableColumn<RemoteOffice, String> colStatus = new TableColumn<>("Licencia");
        colStatus.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().licenseStatus()));
        colStatus.setPrefWidth(95);

        TableColumn<RemoteOffice, String> colPlan = new TableColumn<>("Plan");
        colPlan.setCellValueFactory(c -> new SimpleStringProperty(c.getValue().licensePlan()));
        colPlan.setPrefWidth(90);

        table.getColumns().setAll(colId, colName, colCode, colStatus, colPlan);
        table.setItems(offices);
        table.setPrefHeight(220);

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.setOnAction(e -> refreshOffices());

        Button btnCopy = new Button("Copiar Código");
        btnCopy.setOnAction(e -> {
            RemoteOffice sel = table.getSelectionModel().getSelectedItem();
            if (sel != null) {
                copyToClipboard(sel.activationCode());
                lblStatus.setText("Código copiado: " + sel.activationCode());
            }
        });

        Button btnSuspend = new Button("Suspender / Activar");
        btnSuspend.setOnAction(e -> {
            RemoteOffice sel = table.getSelectionModel().getSelectedItem();
            if (sel == null) return;
            String next = "ACTIVE".equalsIgnoreCase(sel.licenseStatus()) ? "SUSPENDED" : "ACTIVE";
            try {
                licensingService.setOfficeLicenseStatus(sel.id(), next);
                lblStatus.setText("Licencia de " + sel.companyName() + " actualizada a " + next);
                refreshOffices();
            } catch (Exception ex) {
                showError(ex.getMessage());
            }
        });

        Button btnRegen = new Button("Regenerar Código");
        btnRegen.setOnAction(e -> {
            RemoteOffice sel = table.getSelectionModel().getSelectedItem();
            if (sel == null) return;
            try {
                String code = licensingService.regenerateActivationCode(sel.id());
                copyToClipboard(code);
                lblStatus.setText("Nuevo código para " + sel.companyName() + ": " + code + " (copiado)");
                refreshOffices();
            } catch (Exception ex) {
                showError(ex.getMessage());
            }
        });

        Button btnAddCollector = new Button("Crear Cobrador / Ruta");
        btnAddCollector.setStyle("-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-weight: bold; -fx-background-radius: 6;");
        btnAddCollector.setOnAction(e -> {
            RemoteOffice sel = table.getSelectionModel().getSelectedItem();
            if (sel == null) {
                showError("Selecciona primero una oficina en la tabla.");
                return;
            }
            openAddCollectorDialog(sel);
        });

        HBox actions = new HBox(8, btnRefresh, btnAddCollector, btnCopy, btnSuspend, btnRegen);
        actions.setAlignment(Pos.CENTER_LEFT);

        VBox box = new VBox(8, new Label("3. Oficinas Registradas"), table, actions);
        box.setPadding(new Insets(10));
        box.setStyle("-fx-background-color: white; -fx-border-color: #e2e8f0; -fx-border-radius: 10; -fx-background-radius: 10;");
        VBox.setVgrow(table, Priority.ALWAYS);
        return box;
    }

    private void openAddCollectorDialog(RemoteOffice office) {
        Dialog<Boolean> dlg = new Dialog<>();
        dlg.setTitle("Crear Ruta y Cobrador — " + office.companyName());
        dlg.setHeaderText("Crea credenciales únicas de cobrador para " + office.companyName());
        ButtonType okBtn = new ButtonType("Crear Credencial", ButtonBar.ButtonData.OK_DONE);
        dlg.getDialogPane().getButtonTypes().addAll(okBtn, ButtonType.CANCEL);

        TextField txtRouteName = new TextField();
        txtRouteName.setPromptText("Ej. Ruta 1 Norte");
        TextField txtColName = new TextField();
        txtColName.setPromptText("Nombre completo del cobrador");
        TextField txtUser = new TextField();
        txtUser.setPromptText("Usuario único (ej. ruta1.norte)");
        PasswordField txtPass = new PasswordField();
        txtPass.setPromptText("Contraseña (mín. 6 caracteres)");
        TextField txtPhone = new TextField();
        txtPhone.setPromptText("Teléfono (opcional)");

        GridPane g = new GridPane();
        g.setHgap(10);
        g.setVgap(8);
        g.addRow(0, new Label("Nombre Ruta:"), txtRouteName);
        g.addRow(1, new Label("Nombre Cobrador:"), txtColName);
        g.addRow(2, new Label("Usuario único:"), txtUser);
        g.addRow(3, new Label("Contraseña:"), txtPass);
        g.addRow(4, new Label("Teléfono:"), txtPhone);
        dlg.getDialogPane().setContent(g);

        dlg.setResultConverter(btn -> {
            if (btn != okBtn) return false;
            try {
                licensingService.registerCollectorForOffice(
                        office.id(),
                        txtRouteName.getText(),
                        txtColName.getText(),
                        txtUser.getText(),
                        txtPass.getText(),
                        txtPhone.getText()
                );
                lblStatus.setText("Cobrador '" + txtUser.getText().trim().toLowerCase()
                        + "' creado en " + office.companyName() + " (" + txtRouteName.getText().trim() + ")");
                return true;
            } catch (Exception ex) {
                showError(ex.getMessage());
                return false;
            }
        });
        dlg.showAndWait();
    }

    private void refreshOffices() {
        if (licensingService.getSupabaseUrl().isBlank() || licensingService.getSupabaseKey().isBlank()) {
            return;
        }
        try {
            List<RemoteOffice> list = licensingService.listRegisteredOffices();
            offices.setAll(list);
        } catch (Exception ex) {
            lblStatus.setText("No se pudo cargar lista remota: " + ex.getMessage());
        }
    }

    private static void copyToClipboard(String text) {
        if (text == null) return;
        ClipboardContent cc = new ClipboardContent();
        cc.putString(text);
        Clipboard.getSystemClipboard().setContent(cc);
    }

    private static void showError(String msg) {
        Alert a = new Alert(Alert.AlertType.ERROR, msg, ButtonType.OK);
        a.setHeaderText("Error");
        a.showAndWait();
    }
}
