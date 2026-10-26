package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.AuthService.RouteSetupItem;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

/**
 * Pantalla de inicio de sesión con Identidad Propia de la Aplicación (Kredia).
 * Solo solicita Usuario y Contraseña, identificando automáticamente rol y ruta asignada.
 */
public class LoginView extends StackPane {

    private static class RouteRowFields {
        final String existingRouteId;
        final TextField txtRouteName;
        final TextField txtUsername;
        final TextField txtPassword;

        RouteRowFields(String existingRouteId, String rName, String user, String pass) {
            this.existingRouteId = existingRouteId;
            this.txtRouteName = new TextField(rName);
            this.txtUsername = new TextField(user);
            this.txtPassword = new TextField(pass);
        }
    }

    private final AuthService authService;
    private final Consumer<UserSession> onLoginSuccess;

    private final Label lblActiveOfficeBadge = new Label();
    private final TextField txtUsername = new TextField();
    private final PasswordField txtPassword = new PasswordField();
    private final Label lblError = new Label();
    private final Label lblSuccess = new Label();
    private final Button btnLogin = new Button("Ingresar");
    private final Button btnSetup = new Button("Registrar mi oficina y crear credenciales");

    public LoginView(AuthService authService, Consumer<UserSession> onLoginSuccess) {
        this.authService = authService;
        this.onLoginSuccess = onLoginSuccess;

        setStyle("-fx-background-color: #f3f7fa;");
        setAlignment(Pos.CENTER);
        setPadding(new Insets(24));

        buildUI();
        refreshDynamicData();
    }

    private void buildUI() {
        VBox wrapper = new VBox(14);
        wrapper.setAlignment(Pos.CENTER);
        wrapper.setMaxWidth(360);

        // Identidad Propia de la Aplicación: Kredia
        VBox header = new VBox(4);
        header.setAlignment(Pos.CENTER);

        Label emblem = new Label("K");
        emblem.setAlignment(Pos.CENTER);
        emblem.setPrefSize(50, 50);
        emblem.setStyle("-fx-background-color: #0d9488; -fx-text-fill: #ffffff; -fx-font-size: 24px; -fx-font-weight: 900; -fx-background-radius: 15;");

        Label appTitle = new Label("Kredia");
        appTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 23px; -fx-font-weight: 900;");
        Label subtitle = new Label("Sistema de Gestión de Cartera y Rutas");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-font-weight: bold;");

        lblActiveOfficeBadge.setVisible(false);
        lblActiveOfficeBadge.setManaged(false);
        lblActiveOfficeBadge.setStyle("-fx-background-color: #e6f7f5; -fx-text-fill: #0f766e; -fx-border-color: #99f6e4; -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 3 10; -fx-font-size: 11px; -fx-font-weight: bold;");

        header.getChildren().addAll(emblem, appTitle, subtitle, lblActiveOfficeBadge);

        // Tarjeta Blanca: solo Usuario y Contraseña
        VBox card = new VBox(12);
        card.setAlignment(Pos.CENTER_LEFT);
        card.setPadding(new Insets(22));
        card.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 20; -fx-border-color: #e2e8f0; -fx-border-radius: 20; -fx-border-width: 1;");

        lblSuccess.setVisible(false);
        lblSuccess.setManaged(false);
        lblSuccess.setWrapText(true);
        lblSuccess.setMaxWidth(Double.MAX_VALUE);
        lblSuccess.setStyle("-fx-text-fill: #065f46; -fx-background-color: #ecfdf5; -fx-border-color: #a7f3d0; -fx-border-radius: 10; -fx-padding: 8 10; -fx-background-radius: 10; -fx-font-size: 11.5px; -fx-font-weight: bold;");

        lblError.setVisible(false);
        lblError.setManaged(false);
        lblError.setWrapText(true);
        lblError.setMaxWidth(Double.MAX_VALUE);
        lblError.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 10; -fx-padding: 8 10; -fx-background-radius: 10; -fx-font-size: 12px; -fx-font-weight: bold;");

        Label lblUser = new Label("Usuario");
        lblUser.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px; -fx-font-weight: bold;");
        txtUsername.setPromptText("Ingresa tu usuario");
        txtUsername.setMaxWidth(Double.MAX_VALUE);
        txtUsername.setStyle("-fx-background-color: #f8fafc; -fx-text-fill: #0f172a; -fx-prompt-text-fill: #94a3b8; -fx-border-color: #cbd5e1; -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 10 12; -fx-font-size: 13.5px;");

        Label lblPass = new Label("Contraseña");
        lblPass.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px; -fx-font-weight: bold;");
        txtPassword.setPromptText("Ingresa tu contraseña");
        txtPassword.setMaxWidth(Double.MAX_VALUE);
        txtPassword.setStyle("-fx-background-color: #f8fafc; -fx-text-fill: #0f172a; -fx-prompt-text-fill: #94a3b8; -fx-border-color: #cbd5e1; -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 10 12; -fx-font-size: 13.5px;");

        txtUsername.setOnAction(e -> txtPassword.requestFocus());
        txtPassword.setOnAction(e -> doLogin());

        btnLogin.setMaxWidth(Double.MAX_VALUE);
        btnLogin.setStyle("-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-size: 14px; -fx-font-weight: bold; -fx-padding: 10 20; -fx-background-radius: 12; -fx-cursor: hand;");
        btnLogin.setOnAction(e -> doLogin());

        card.getChildren().addAll(lblSuccess, lblError, lblUser, txtUsername, lblPass, txtPassword, btnLogin);

        btnSetup.setStyle("-fx-background-color: #ffffff; -fx-border-color: #e2e8f0; -fx-border-radius: 20; -fx-background-radius: 20; -fx-text-fill: #475569; -fx-font-size: 12px; -fx-font-weight: bold; -fx-padding: 7 16; -fx-cursor: hand;");
        btnSetup.setOnAction(e -> openOfficeSetupDialog());

        wrapper.getChildren().addAll(header, card, btnSetup);
        getChildren().add(wrapper);
    }

    private void refreshDynamicData() {
        String comp = authService.getCompanyName();
        boolean isConfigured = authService.isOfficeConfigured()
                && comp != null
                && !comp.trim().isEmpty()
                && !"Inversiones & Cobranzas La Excelencia".equalsIgnoreCase(comp.trim())
                && !"Mi Oficina de Crédito".equalsIgnoreCase(comp.trim());
        if (isConfigured) {
            lblActiveOfficeBadge.setText("Oficina: " + comp.trim());
            lblActiveOfficeBadge.setVisible(true);
            lblActiveOfficeBadge.setManaged(true);
            btnSetup.setText("Configurar oficina y credenciales");
        } else {
            lblActiveOfficeBadge.setVisible(false);
            lblActiveOfficeBadge.setManaged(false);
            btnSetup.setText("Registrar mi oficina y crear credenciales");
        }
    }

    private void openOfficeSetupDialog() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        if (getScene() != null && getScene().getWindow() != null) {
            dialog.initOwner(getScene().getWindow());
        }
        dialog.setTitle("Configurar Oficina y Rutas");

        VBox root = new VBox(12);
        root.setPadding(new Insets(18));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(480);
        root.setPrefHeight(520);

        Label headerTitle = new Label("Configurar Oficina y Rutas");
        headerTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        boolean isAlreadyConfigured = authService.isOfficeConfigured();
        List<AppUserEntity> currentUsers = authService.getActiveUsers();
        AppUserEntity existingAdmin = currentUsers.stream()
                .filter(u -> u.getId().startsWith("usr-admin") || "admin".equalsIgnoreCase(u.getUsername()))
                .findFirst()
                .orElse(null);

        VBox adminCard = new VBox(8);
        adminCard.setStyle("-fx-background-color: #f8fafc; -fx-padding: 12; -fx-background-radius: 14; -fx-border-color: #e2e8f0; -fx-border-radius: 14;");
        Label lblAdmTitle = new Label("1. DATOS DE TU OFICINA Y ADMIN");
        lblAdmTitle.setStyle("-fx-text-fill: #4f46e5; -fx-font-size: 10px; -fx-font-weight: bold;");

        TextField txtCompany = new TextField(isAlreadyConfigured ? authService.getCompanyName() : "");
        txtCompany.setPromptText("Escribe el nombre de tu oficina");
        String adminUserStr = isAlreadyConfigured && existingAdmin != null ? existingAdmin.getUsername() : "";
        TextField txtAdminUser = new TextField(adminUserStr);
        txtAdminUser.setPromptText("Crea tu usuario admin");
        TextField txtAdminPass = new TextField("");
        txtAdminPass.setPromptText("Crea tu clave");

        HBox rowAdmin = new HBox(8,
                createLightField("Usuario Administrador", txtAdminUser, 205),
                createLightField("Clave Administrador", txtAdminPass, 205)
        );
        adminCard.getChildren().addAll(lblAdmTitle, createLightField("Nombre de la Oficina", txtCompany, 420), rowAdmin);

        List<RouteEntity> currentRoutes = authService.getActiveRoutes();
        int initialCount = isAlreadyConfigured ? Math.max(1, currentRoutes.size()) : 1;
        Spinner<Integer> spnCount = new Spinner<>(1, 15, initialCount);
        spnCount.setPrefWidth(80);

        HBox countBox = new HBox(12);
        countBox.setAlignment(Pos.CENTER_LEFT);
        countBox.setStyle("-fx-background-color: #f0fdfa; -fx-padding: 8 12; -fx-background-radius: 12; -fx-border-color: #ccfbf1; -fx-border-radius: 12;");
        Label lblCount = new Label("2. ¿Cuántas rutas tendrá la oficina?");
        lblCount.setStyle("-fx-text-fill: #0f766e; -fx-font-size: 12px; -fx-font-weight: bold;");
        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);
        countBox.getChildren().addAll(lblCount, sp, spnCount);

        VBox routesContainer = new VBox(8);
        List<RouteRowFields> routeRows = new ArrayList<>();
        Set<String> seenUsers = new HashSet<>();
        if (!adminUserStr.isEmpty()) {
            seenUsers.add(adminUserStr.toLowerCase());
        }

        Runnable rebuildRows = () -> {
            int target = spnCount.getValue();
            while (routeRows.size() < target) {
                int idx = routeRows.size();
                RouteEntity r = isAlreadyConfigured && idx < currentRoutes.size() ? currentRoutes.get(idx) : null;
                AppUserEntity col = r != null
                        ? currentUsers.stream().filter(u -> u.getId().equals(r.getCollectorId())).findFirst().orElse(null)
                        : null;
                String candidateUser = col != null && col.getUsername() != null
                        ? col.getUsername().toLowerCase()
                        : "";
                if (!candidateUser.isEmpty() && seenUsers.contains(candidateUser)) {
                    candidateUser = "";
                }
                if (!candidateUser.isEmpty()) {
                    seenUsers.add(candidateUser);
                }

                routeRows.add(new RouteRowFields(
                        r != null ? r.getId() : null,
                        r != null ? r.getName() : "",
                        candidateUser,
                        ""
                ));
            }
            while (routeRows.size() > target) {
                routeRows.remove(routeRows.size() - 1);
            }
            routesContainer.getChildren().clear();

            for (int i = 0; i < routeRows.size(); i++) {
                RouteRowFields rf = routeRows.get(i);
                rf.txtRouteName.setPromptText("Nombre Ruta " + (i + 1) + " (opcional)");
                rf.txtUsername.setPromptText("Crea usuario ruta " + (i + 1));
                rf.txtPassword.setPromptText("Crea su clave");

                VBox rCard = new VBox(6);
                rCard.setStyle("-fx-background-color: #f8fafc; -fx-padding: 10; -fx-background-radius: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 12;");

                HBox topRow = new HBox(8);
                topRow.setAlignment(Pos.CENTER_LEFT);
                Label rBadge = new Label("RUTA " + (i + 1));
                rBadge.setStyle("-fx-background-color: #e6f7f5; -fx-text-fill: #0d9488; -fx-font-size: 10.5px; -fx-font-weight: bold; -fx-padding: 6 10; -fx-background-radius: 8;");
                styleCompactCell(rf.txtRouteName, 340);
                HBox.setHgrow(rf.txtRouteName, Priority.ALWAYS);
                topRow.getChildren().addAll(rBadge, rf.txtRouteName);

                HBox bottomRow = new HBox(8,
                        createLightField("Usuario Cobrador", rf.txtUsername, 205),
                        createLightField("Clave de Acceso", rf.txtPassword, 205)
                );

                rCard.getChildren().addAll(topRow, bottomRow);
                routesContainer.getChildren().add(rCard);
            }
        };

        spnCount.valueProperty().addListener((o, oldV, newV) -> rebuildRows.run());
        rebuildRows.run();

        VBox scrollBody = new VBox(10, adminCard, countBox, routesContainer);
        ScrollPane scrollPane = new ScrollPane(scrollBody);
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background: #ffffff; -fx-background-color: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);

        Label lblWizErr = new Label();
        lblWizErr.setVisible(false);
        lblWizErr.setManaged(false);
        lblWizErr.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 12px; -fx-font-weight: bold;");

        Button btnSaveOnly = new Button("Guardar credenciales");
        btnSaveOnly.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnSaveOnly, Priority.ALWAYS);
        btnSaveOnly.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 10; -fx-background-radius: 10; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-padding: 9 14; -fx-cursor: hand;");

        Button btnSaveAndEnter = new Button("Guardar y Entrar");
        btnSaveAndEnter.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnSaveAndEnter, Priority.ALWAYS);
        btnSaveAndEnter.setStyle("-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 9 14; -fx-background-radius: 10; -fx-cursor: hand;");

        Consumer<Boolean> saveAction = enterDirectly -> {
            try {
                List<RouteSetupItem> items = new ArrayList<>();
                for (int i = 0; i < routeRows.size(); i++) {
                    RouteRowFields rf = routeRows.get(i);
                    String rName = rf.txtRouteName.getText() != null && !rf.txtRouteName.getText().trim().isEmpty()
                            ? rf.txtRouteName.getText().trim()
                            : "Ruta " + (i + 1);
                    items.add(new RouteSetupItem(
                            rf.existingRouteId,
                            rName,
                            rName,
                            rf.txtUsername.getText(),
                            rf.txtPassword.getText()
                    ));
                }
                UserSession session = authService.setupOfficeAndRoutes(
                        txtCompany.getText(),
                        "Barranquilla",
                        "",
                        "Administración General",
                        txtAdminUser.getText(),
                        txtAdminPass.getText(),
                        "20",
                        true,
                        "5000",
                        true,
                        true,
                        true,
                        items
                );
                refreshDynamicData();
                dialog.close();
                if (enterDirectly && onLoginSuccess != null) {
                    onLoginSuccess.accept(session);
                } else {
                    lblSuccess.setText("Oficina y " + items.size() + " ruta(s) configuradas.");
                    lblSuccess.setVisible(true);
                    lblSuccess.setManaged(true);
                }
            } catch (Exception ex) {
                lblWizErr.setText(ex.getMessage());
                lblWizErr.setVisible(true);
                lblWizErr.setManaged(true);
            }
        };

        btnSaveOnly.setOnAction(e -> saveAction.accept(false));
        btnSaveAndEnter.setOnAction(e -> saveAction.accept(true));

        HBox footerBtns = new HBox(8, btnSaveOnly, btnSaveAndEnter);
        root.getChildren().addAll(headerTitle, scrollPane, lblWizErr, footerBtns);
        dialog.setScene(new Scene(root));
        dialog.showAndWait();
    }

    private VBox createLightField(String label, TextField field, double width) {
        VBox box = new VBox(3);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;");
        field.setPrefWidth(width);
        field.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 6 10; -fx-font-size: 12.5px;");
        box.getChildren().addAll(lbl, field);
        return box;
    }

    private void styleCompactCell(TextField field, double width) {
        field.setPrefWidth(width);
        field.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 6 10; -fx-font-size: 12.5px;");
    }

    private void doLogin() {
        String username = txtUsername.getText();
        String password = txtPassword.getText();

        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            showError("Ingresa tu usuario y contraseña.");
            return;
        }

        btnLogin.setDisable(true);
        try {
            var optSession = authService.authenticate(username, password);
            if (optSession.isPresent()) {
                UserSession session = optSession.get();
                if (session.isCollector()) {
                    authService.getActiveRoutes().stream()
                            .filter(r -> session.userId().equals(r.getCollectorId()))
                            .findFirst()
                            .ifPresent(r -> UserSessionContext.setSelectedRouteId(r.getId()));
                } else {
                    UserSessionContext.setSelectedRouteId("ALL");
                }
                lblError.setVisible(false);
                lblError.setManaged(false);
                if (onLoginSuccess != null) {
                    onLoginSuccess.accept(session);
                }
            } else {
                showError("Credenciales incorrectas. Verifica tu usuario y clave.");
                txtPassword.clear();
                txtPassword.requestFocus();
            }
        } catch (Exception ex) {
            showError("Error: " + ex.getMessage());
        } finally {
            btnLogin.setDisable(false);
        }
    }

    private void showError(String message) {
        lblSuccess.setVisible(false);
        lblSuccess.setManaged(false);
        lblError.setText(message);
        lblError.setVisible(true);
        lblError.setManaged(true);
    }

    public void reset() {
        refreshDynamicData();
        txtUsername.clear();
        txtPassword.clear();
        lblError.setVisible(false);
        lblError.setManaged(false);
        lblSuccess.setVisible(false);
        lblSuccess.setManaged(false);
        txtUsername.requestFocus();
    }
}
