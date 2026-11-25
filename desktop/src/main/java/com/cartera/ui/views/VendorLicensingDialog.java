package com.cartera.ui.views;

import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient.RemoteOffice;
import javafx.application.Platform;
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
    private Stage activeModal;

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
        if (owner != null) {
            modal.initOwner(owner);
        }
        modal.initModality(Modality.APPLICATION_MODAL);
        modal.setTitle("Panel Comercial — Registro de Oficinas y Licencias");
        this.activeModal = modal;

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
        modal.setOnShown(ev -> {
            modal.toFront();
            modal.requestFocus();
            refreshOffices();
        });
        try {
            modal.showAndWait();
        } finally {
            this.activeModal = null;
        }
    }

    private Label lblLocalOfficeInfo;

    private boolean promptVendorAccess() {
        if (!licensingService.hasVendorPinConfigured()) {
            Dialog<String[]> setupDlg = new Dialog<>();
            if (owner != null) {
                setupDlg.initOwner(owner);
            }
            setupDlg.initModality(Modality.APPLICATION_MODAL);
            setupDlg.setTitle("Configurar PIN Maestro de Vendedor");
            setupDlg.setHeaderText("Primera vez en el Panel Comercial (uso exclusivo del distribuidor)");
            ButtonType okBtn = new ButtonType("Configurar PIN", ButtonBar.ButtonData.OK_DONE);
            setupDlg.getDialogPane().getButtonTypes().addAll(okBtn, ButtonType.CANCEL);

            PasswordField pf1 = new PasswordField();
            pf1.setPromptText("Nuevo PIN maestro (mín. 4 caracteres)");
            PasswordField pf2 = new PasswordField();
            pf2.setPromptText("Confirmar PIN maestro");
            GridPane g = new GridPane();
            g.setHgap(10);
            g.setVgap(8);
            g.addRow(0, new Label("PIN Maestro:"), pf1);
            g.addRow(1, new Label("Confirmar:"), pf2);
            setupDlg.getDialogPane().setContent(g);
            setupDlg.setOnShown(ev -> Platform.runLater(pf1::requestFocus));
            setupDlg.setResultConverter(btn -> btn == okBtn ? new String[]{pf1.getText(), pf2.getText()} : null);

            return setupDlg.showAndWait().map(pins -> {
                if (pins[0] == null || !pins[0].equals(pins[1])) {
                    showError("Los PIN ingresados no coinciden.");
                    return false;
                }
                try {
                    licensingService.configureVendorPin(pins[0]);
                    return true;
                } catch (Exception ex) {
                    showError(ex.getMessage());
                    return false;
                }
            }).orElse(false);
        }

        Dialog<String> dialog = new Dialog<>();
        if (owner != null) {
            dialog.initOwner(owner);
        }
        dialog.initModality(Modality.APPLICATION_MODAL);
        dialog.setTitle("Acceso Comercial Protegido");
        dialog.setHeaderText("Ingresa el PIN maestro de vendedor");
        ButtonType okBtn = new ButtonType("Desbloquear", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(okBtn, ButtonType.CANCEL);

        PasswordField pf = new PasswordField();
        pf.setPromptText("PIN maestro");
        dialog.getDialogPane().setContent(pf);
        dialog.setOnShown(ev -> Platform.runLater(pf::requestFocus));

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
            try {
                licensingService.saveCloudConnection(txtUrl.getText(), txtKey.getText(), txtVendorSecret.getText());
                lblStatus.setText("Conexión y clave de distribuidor guardadas.");
                refreshOffices();
            } catch (Exception ex) {
                showError("No se pudo guardar la conexión: " + ex.getMessage());
            }
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
            String company = txtCompany.getText();
            String ownerName = txtOwner.getText();
            String city = txtCity.getText();
            String phone = txtPhone.getText();
            String adminName = txtAdminName.getText();
            String adminUser = txtAdminUser.getText();
            String adminPass = txtAdminPass.getText();
            String plan = cmbPlan.getValue();
            String expires = txtExpires.getText().isBlank() ? null : txtExpires.getText().trim();

            btnCreate.setDisable(true);
            btnCreate.setText("Registrando...");
            lblStatus.setText("Registrando oficina en servidor...");

            Thread worker = new Thread(() -> {
                try {
                    RemoteOffice created = licensingService.registerCommercialOffice(
                            company, ownerName, city, phone, adminName, adminUser, adminPass, plan, expires, ""
                    );
                    Platform.runLater(() -> {
                        btnCreate.setDisable(false);
                        btnCreate.setText("Registrar Oficina y Generar Código");
                        copyToClipboard(created.activationCode());
                        lblStatus.setText("Oficina creada: " + created.companyName()
                                + " | ID: " + created.id()
                                + " | Código: " + created.activationCode() + " (copiado al portapapeles)");
                        txtCompany.clear();
                        txtOwner.clear();
                        txtCity.clear();
                        txtPhone.clear();
                        txtAdminName.clear();
                        txtAdminUser.clear();
                        txtAdminPass.clear();
                        txtExpires.clear();
                        refreshOffices();
                    });
                } catch (Exception ex) {
                    Platform.runLater(() -> {
                        btnCreate.setDisable(false);
                        btnCreate.setText("Registrar Oficina y Generar Código");
                        lblStatus.setText("Error al registrar oficina.");
                        showError(ex.getMessage());
                    });
                }
            }, "kredia-vendor-create-office");
            worker.setDaemon(true);
            worker.start();
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
        Button btnProtectLocal = new Button("Respaldar BD Local y Registrar esta Oficina");
        btnProtectLocal.setStyle("-fx-background-color: #1d4ed8; -fx-text-fill: white; -fx-font-weight: bold; -fx-background-radius: 8;");
        lblLocalOfficeInfo = new Label("Oficina local actual: " + licensingService.getLinkedOfficeId().orElse("Sin vincular"));
        lblLocalOfficeInfo.setStyle("-fx-font-weight: bold; -fx-text-fill: #334155;");

        btnProtectLocal.setOnAction(e -> {
            TextInputDialog dlg = new TextInputDialog("");
            dlg.getEditor().setPromptText("Ej. Mi Oficina de Crédito");
            Stage parent = activeModal != null ? activeModal : owner;
            if (parent != null) {
                dlg.initOwner(parent);
            }
            dlg.initModality(Modality.APPLICATION_MODAL);
            dlg.setTitle("Proteger y Vincular Oficina Local");
            dlg.setHeaderText("Se creará un respaldo automático antes de registrar la oficina.");
            dlg.setContentText("Nombre oficial de esta oficina:");
            dlg.showAndWait().ifPresent(name -> {
                if (name == null || name.isBlank()) {
                    showError("Ingresa el nombre comercial de la oficina.");
                    return;
                }
                btnProtectLocal.setDisable(true);
                lblStatus.setText("Respaldando y vinculando oficina local...");
                Thread worker = new Thread(() -> {
                    try {
                        RemoteOffice office = licensingService.backupAndLinkExistingLocalOffice(name.trim(), "");
                        Platform.runLater(() -> {
                            btnProtectLocal.setDisable(false);
                            copyToClipboard(office.activationCode());
                            lblLocalOfficeInfo.setText("Oficina local actual: " + office.id());
                            lblStatus.setText("Respaldo creado y oficina vinculada: " + office.id()
                                    + " | Código: " + office.activationCode() + " (copiado)");
                            refreshOffices();
                        });
                    } catch (Exception ex) {
                        Platform.runLater(() -> {
                            btnProtectLocal.setDisable(false);
                            showError(ex.getMessage());
                        });
                    }
                }, "kredia-vendor-protect-local");
                worker.setDaemon(true);
                worker.start();
            });
        });

        HBox bar = new HBox(12, btnProtectLocal, lblLocalOfficeInfo);
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
            if (sel == null) {
                showError("Selecciona primero una oficina en la tabla.");
                return;
            }
            copyToClipboard(sel.activationCode());
            lblStatus.setText("Código copiado: " + sel.activationCode());
        });

        Button btnSuspend = new Button("Suspender / Activar");
        btnSuspend.setOnAction(e -> {
            RemoteOffice sel = table.getSelectionModel().getSelectedItem();
            if (sel == null) {
                showError("Selecciona primero una oficina en la tabla.");
                return;
            }
            String next = "ACTIVE".equalsIgnoreCase(sel.licenseStatus()) ? "SUSPENDED" : "ACTIVE";
            String verb = "SUSPENDED".equals(next) ? "suspender" : "reactivar";
            if (!confirmAction("Confirmar cambio de licencia",
                    "¿Deseas " + verb + " la licencia de \"" + sel.companyName() + "\" (" + sel.id() + ")?")) {
                return;
            }
            btnSuspend.setDisable(true);
            lblStatus.setText("Actualizando licencia...");
            Thread worker = new Thread(() -> {
                try {
                    licensingService.setOfficeLicenseStatus(sel.id(), next);
                    Platform.runLater(() -> {
                        btnSuspend.setDisable(false);
                        lblStatus.setText("Licencia de " + sel.companyName() + " actualizada a " + next);
                        refreshOffices();
                    });
                } catch (Exception ex) {
                    Platform.runLater(() -> {
                        btnSuspend.setDisable(false);
                        showError(ex.getMessage());
                    });
                }
            }, "kredia-vendor-license-status");
            worker.setDaemon(true);
            worker.start();
        });

        Button btnRegen = new Button("Regenerar Código");
        btnRegen.setOnAction(e -> {
            RemoteOffice sel = table.getSelectionModel().getSelectedItem();
            if (sel == null) {
                showError("Selecciona primero una oficina en la tabla.");
                return;
            }
            if (!confirmAction("Confirmar regeneración de código",
                    "El código actual (" + sel.activationCode() + ") de \"" + sel.companyName()
                            + "\" dejará de funcionar. ¿Deseas regenerarlo?")) {
                return;
            }
            btnRegen.setDisable(true);
            lblStatus.setText("Regenerando código...");
            Thread worker = new Thread(() -> {
                try {
                    String code = licensingService.regenerateActivationCode(sel.id());
                    Platform.runLater(() -> {
                        btnRegen.setDisable(false);
                        copyToClipboard(code);
                        lblStatus.setText("Nuevo código para " + sel.companyName() + ": " + code + " (copiado)");
                        refreshOffices();
                    });
                } catch (Exception ex) {
                    Platform.runLater(() -> {
                        btnRegen.setDisable(false);
                        showError(ex.getMessage());
                    });
                }
            }, "kredia-vendor-regen-code");
            worker.setDaemon(true);
            worker.start();
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
        Stage parent = activeModal != null ? activeModal : owner;
        if (parent != null) {
            dlg.initOwner(parent);
        }
        dlg.initModality(Modality.APPLICATION_MODAL);
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
        Label lblDlgFeedback = new Label();
        lblDlgFeedback.setWrapText(true);
        lblDlgFeedback.setStyle("-fx-text-fill: #dc2626; -fx-font-weight: bold; -fx-font-size: 11.5px;");
        lblDlgFeedback.setVisible(false);
        lblDlgFeedback.setManaged(false);

        VBox content = new VBox(10, g, lblDlgFeedback);
        dlg.getDialogPane().setContent(content);

        Button okNode = (Button) dlg.getDialogPane().lookupButton(okBtn);
        okNode.addEventFilter(javafx.event.ActionEvent.ACTION, ev -> {
            ev.consume(); // No cerrar el diálogo hasta validar y guardar en segundo plano
            String rName = txtRouteName.getText();
            String cName = txtColName.getText();
            String user = txtUser.getText();
            String pass = txtPass.getText();
            String phone = txtPhone.getText();

            if (rName == null || rName.isBlank() || user == null || user.isBlank() || pass == null || pass.length() < 6) {
                lblDlgFeedback.setText("Completa nombre de ruta, usuario único y contraseña (mín. 6 caracteres).");
                lblDlgFeedback.setVisible(true);
                lblDlgFeedback.setManaged(true);
                return;
            }

            okNode.setDisable(true);
            okNode.setText("Creando...");
            lblDlgFeedback.setVisible(false);
            lblDlgFeedback.setManaged(false);

            Thread worker = new Thread(() -> {
                try {
                    licensingService.registerCollectorForOffice(office.id(), rName, cName, user, pass, phone);
                    Platform.runLater(() -> {
                        lblStatus.setText("Cobrador '" + user.trim().toLowerCase()
                                + "' creado en " + office.companyName() + " (" + rName.trim() + ")");
                        dlg.setResult(Boolean.TRUE);
                        dlg.close();
                    });
                } catch (Exception ex) {
                    Platform.runLater(() -> {
                        okNode.setDisable(false);
                        okNode.setText("Crear Credencial");
                        lblDlgFeedback.setText(ex.getMessage() != null ? ex.getMessage() : "Error creando credencial.");
                        lblDlgFeedback.setVisible(true);
                        lblDlgFeedback.setManaged(true);
                    });
                }
            }, "kredia-vendor-add-collector");
            worker.setDaemon(true);
            worker.start();
        });
        dlg.showAndWait();
    }

    private void refreshOffices() {
        if (licensingService.getSupabaseUrl().isBlank() || licensingService.getSupabaseKey().isBlank()) {
            lblStatus.setText("Configura la conexión en la sección 1 y haz clic en Guardar Conexión.");
            return;
        }
        if (licensingService.getVendorSecretKey().isBlank()) {
            lblStatus.setText("Ingresa tu Clave Maestra de Distribuidor en la sección 1 y haz clic en Guardar Conexión.");
            return;
        }
        lblStatus.setText("Consultando oficinas registradas...");
        Thread worker = new Thread(() -> {
            try {
                List<RemoteOffice> list = licensingService.listRegisteredOffices();
                Platform.runLater(() -> {
                    offices.setAll(list);
                    lblStatus.setText("Oficinas sincronizadas: " + list.size());
                });
            } catch (Exception ex) {
                Platform.runLater(() -> lblStatus.setText("No se pudo cargar lista remota: " + ex.getMessage()));
            }
        }, "kredia-vendor-offices-refresh");
        worker.setDaemon(true);
        worker.start();
    }

    private static void copyToClipboard(String text) {
        if (text == null) return;
        ClipboardContent cc = new ClipboardContent();
        cc.putString(text);
        Clipboard.getSystemClipboard().setContent(cc);
    }

    private boolean confirmAction(String title, String message) {
        Alert a = new Alert(Alert.AlertType.CONFIRMATION, message, ButtonType.OK, ButtonType.CANCEL);
        Stage parent = activeModal != null ? activeModal : owner;
        if (parent != null) {
            a.initOwner(parent);
        }
        a.initModality(Modality.APPLICATION_MODAL);
        a.setTitle(title);
        a.setHeaderText(title);
        return a.showAndWait().filter(b -> b == ButtonType.OK).isPresent();
    }

    private void showError(String msg) {
        Alert a = new Alert(Alert.AlertType.ERROR, msg, ButtonType.OK);
        Stage parent = activeModal != null ? activeModal : owner;
        if (parent != null) {
            a.initOwner(parent);
        }
        a.initModality(Modality.APPLICATION_MODAL);
        a.setHeaderText("Error");
        a.showAndWait();
    }
}
