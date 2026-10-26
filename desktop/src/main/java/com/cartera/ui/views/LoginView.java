package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.AuthService.RouteSetupItem;
import com.cartera.infrastructure.security.UserSession;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Pantalla de inicio de sesión nativa JavaFX con selector de rol/ruta y Asistente Integrado
 * para que la oficina cree sus credenciales de Administrador y configure cuántas rutas tendrá a su gusto.
 */
public class LoginView extends StackPane {

    private static class RouteRowFields {
        final String existingRouteId;
        final TextField txtRouteName;
        final TextField txtCollectorName;
        final TextField txtUsername;
        final TextField txtPassword;

        RouteRowFields(String existingRouteId, String rName, String cName, String user, String pass) {
            this.existingRouteId = existingRouteId;
            this.txtRouteName = new TextField(rName);
            this.txtCollectorName = new TextField(cName);
            this.txtUsername = new TextField(user);
            this.txtPassword = new TextField(pass);
        }
    }

    private final AuthService authService;
    private final Consumer<UserSession> onLoginSuccess;

    private final Label lblBrandTitle = new Label("SISTEMA CARTERA");
    private final TextField txtUsername = new TextField();
    private final PasswordField txtPassword = new PasswordField();
    private final TextField txtPasswordVisible = new TextField();
    private final CheckBox chkShowPassword = new CheckBox("Mostrar contraseña");
    private final Label lblError = new Label();
    private final Button btnLogin = new Button("Ingresar al Sistema");
    private final FlowPane routeChipsPane = new FlowPane(8, 8);
    private final VBox routeSelectorSection = new VBox(6);

    private String selectedMode = "ADMIN";
    private Button btnTabAdmin;
    private Button btnTabCollector;

    public LoginView(AuthService authService, Consumer<UserSession> onLoginSuccess) {
        this.authService = authService;
        this.onLoginSuccess = onLoginSuccess;

        setStyle("-fx-background-color: #0f172a;");
        setAlignment(Pos.CENTER);
        setPadding(new Insets(24));

        // Sincronizar campo oculto y visible de contraseña
        txtPasswordVisible.setManaged(false);
        txtPasswordVisible.setVisible(false);
        txtPassword.textProperty().bindBidirectional(txtPasswordVisible.textProperty());

        buildUI();
        refreshDynamicData();
    }

    private void buildUI() {
        VBox card = new VBox(16);
        card.setAlignment(Pos.CENTER);
        card.setMaxWidth(480);
        card.setPadding(new Insets(30, 32, 28, 32));
        card.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 18; -fx-border-color: #cbd5e1; -fx-border-radius: 18; -fx-border-width: 1; -fx-effect: dropshadow(gaussian, rgba(0,0,0,0.22), 28, 0, 0, 10);");

        // 1. Logo e Isotipo
        HBox brandHeader = new HBox(12);
        brandHeader.setAlignment(Pos.CENTER);

        Label logo = new Label("\uD83C\uDFE2");
        logo.setStyle("-fx-background-color: #0284c7; -fx-text-fill: white; -fx-font-size: 22px; -fx-padding: 10 12; -fx-background-radius: 12;");

        VBox brandTitles = new VBox(2);
        brandTitles.setAlignment(Pos.CENTER_LEFT);
        lblBrandTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 17px; -fx-font-weight: bold; -fx-letter-spacing: 0.4px;");
        Label subtitle = new Label("Acceso de Oficina Central y Rutas de Cobro");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11.5px;");
        brandTitles.getChildren().addAll(lblBrandTitle, subtitle);

        brandHeader.getChildren().addAll(logo, brandTitles);

        // 2. Botón Destacado: Configurar Oficina, Credenciales de Admin y Rutas
        Button btnSetupWizard = new Button("\u2699 Configurar Oficina, Admin y Rutas (Crear Credenciales)");
        btnSetupWizard.setMaxWidth(Double.MAX_VALUE);
        btnSetupWizard.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #0369a1; -fx-border-color: #7dd3fc; -fx-border-width: 1.5; -fx-border-radius: 10; -fx-background-radius: 10; -fx-font-size: 12px; -fx-font-weight: bold; -fx-padding: 10 14; -fx-cursor: hand;");
        btnSetupWizard.setOnAction(e -> openOfficeSetupWizardDialog());

        // 3. Selector de Perfil (Administrador de Oficina vs Ruta / Cobrador)
        HBox roleTabs = new HBox(10);
        roleTabs.setAlignment(Pos.CENTER);

        btnTabAdmin = new Button("\uD83D\uDC51 Oficina / Admin");
        btnTabAdmin.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnTabAdmin, Priority.ALWAYS);
        btnTabAdmin.setOnAction(e -> switchRoleMode("ADMIN"));

        btnTabCollector = new Button("\uD83D\uDEF5 Ruta / Cobrador");
        btnTabCollector.setMaxWidth(Double.MAX_VALUE);
        HBox.setHgrow(btnTabCollector, Priority.ALWAYS);
        btnTabCollector.setOnAction(e -> switchRoleMode("COBRADOR"));

        roleTabs.getChildren().addAll(btnTabAdmin, btnTabCollector);

        // 4. Selector rápido de rutas activas (visible cuando elige Ruta / Cobrador)
        Label lblPickRoute = new Label("Selecciona tu Ruta Activa:");
        lblPickRoute.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;");
        routeSelectorSection.getChildren().addAll(lblPickRoute, routeChipsPane);
        routeSelectorSection.setVisible(false);
        routeSelectorSection.setManaged(false);

        // 5. Formulario de Credenciales
        VBox form = new VBox(10);
        form.setAlignment(Pos.CENTER_LEFT);

        Label lblUser = new Label("Usuario Asignado");
        lblUser.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px; -fx-font-weight: bold;");
        txtUsername.setPromptText("Ingresa tu usuario de administrador o de ruta");
        txtUsername.getStyleClass().add("search-field");
        txtUsername.setMaxWidth(Double.MAX_VALUE);
        txtUsername.setStyle("-fx-padding: 10 14; -fx-font-size: 13px;");

        Label lblPass = new Label("Contraseña de Acceso");
        lblPass.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px; -fx-font-weight: bold;");
        txtPassword.setPromptText("••••••••");
        txtPassword.getStyleClass().add("search-field");
        txtPassword.setMaxWidth(Double.MAX_VALUE);
        txtPassword.setStyle("-fx-padding: 10 14; -fx-font-size: 13px;");

        txtPasswordVisible.setPromptText("Escribe tu contraseña");
        txtPasswordVisible.getStyleClass().add("search-field");
        txtPasswordVisible.setMaxWidth(Double.MAX_VALUE);
        txtPasswordVisible.setStyle("-fx-padding: 10 14; -fx-font-size: 13px;");

        chkShowPassword.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11.5px;");
        chkShowPassword.setOnAction(e -> {
            boolean show = chkShowPassword.isSelected();
            txtPasswordVisible.setManaged(show);
            txtPasswordVisible.setVisible(show);
            txtPassword.setManaged(!show);
            txtPassword.setVisible(!show);
        });

        txtUsername.setOnAction(e -> {
            if (chkShowPassword.isSelected()) txtPasswordVisible.requestFocus();
            else txtPassword.requestFocus();
        });
        txtPassword.setOnAction(e -> doLogin());
        txtPasswordVisible.setOnAction(e -> doLogin());

        lblError.setVisible(false);
        lblError.setManaged(false);
        lblError.setWrapText(true);
        lblError.setMaxWidth(Double.MAX_VALUE);
        lblError.setStyle("-fx-text-fill: #dc2626; -fx-background-color: #fef2f2; -fx-border-color: #fecaca; -fx-border-radius: 8; -fx-padding: 8 12; -fx-background-radius: 8; -fx-font-size: 12px;");

        btnLogin.getStyleClass().add("btn-primary");
        btnLogin.setMaxWidth(Double.MAX_VALUE);
        btnLogin.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-padding: 11 20; -fx-background-radius: 10;");
        btnLogin.setOnAction(e -> doLogin());

        form.getChildren().addAll(
                lblUser,
                txtUsername,
                lblPass,
                txtPassword,
                txtPasswordVisible,
                chkShowPassword,
                lblError,
                btnLogin
        );

        card.getChildren().addAll(brandHeader, btnSetupWizard, roleTabs, routeSelectorSection, form);
        getChildren().add(card);

        switchRoleMode("ADMIN");
    }

    private void switchRoleMode(String mode) {
        this.selectedMode = mode;
        boolean isAdmin = "ADMIN".equals(mode);

        String activeStyle = "-fx-background-color: #0284c7; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 9 14; -fx-background-radius: 10; -fx-cursor: hand;";
        String inactiveStyle = "-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-border-color: #cbd5e1; -fx-border-radius: 10; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 9 14; -fx-cursor: hand;";

        btnTabAdmin.setStyle(isAdmin ? activeStyle : inactiveStyle);
        btnTabCollector.setStyle(!isAdmin ? activeStyle : inactiveStyle);

        routeSelectorSection.setVisible(!isAdmin);
        routeSelectorSection.setManaged(!isAdmin);

        List<AppUserEntity> users = authService.getActiveUsers();
        if (isAdmin) {
            AppUserEntity admin = users.stream()
                    .filter(u -> u.getId().startsWith("usr-admin") || "admin".equalsIgnoreCase(u.getUsername()))
                    .findFirst()
                    .orElse(null);
            if (admin != null) {
                txtUsername.setText(admin.getUsername());
            }
            btnLogin.setText("Ingresar al Panel de Oficina");
        } else {
            List<RouteEntity> routes = authService.getActiveRoutes();
            if (!routes.isEmpty()) {
                selectRouteChip(routes.get(0), users);
            }
            btnLogin.setText("Ingresar a Mi Ruta");
        }
        lblError.setVisible(false);
        lblError.setManaged(false);
    }

    private void refreshDynamicData() {
        lblBrandTitle.setText(authService.getCompanyName().toUpperCase());
        routeChipsPane.getChildren().clear();

        List<RouteEntity> routes = authService.getActiveRoutes();
        List<AppUserEntity> users = authService.getActiveUsers();

        for (RouteEntity r : routes) {
            AppUserEntity col = users.stream()
                    .filter(u -> u.getId().equals(r.getCollectorId()))
                    .findFirst()
                    .orElse(null);
            String label = r.getName() + (col != null ? " (" + col.getUsername() + ")" : "");
            Button chip = new Button(label);
            chip.setStyle("-fx-background-color: #f8fafc; -fx-text-fill: #0f172a; -fx-border-color: #94a3b8; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 10; -fx-cursor: hand;");
            chip.setOnAction(e -> selectRouteChip(r, users));
            routeChipsPane.getChildren().add(chip);
        }
    }

    private void selectRouteChip(RouteEntity route, List<AppUserEntity> users) {
        users.stream()
                .filter(u -> u.getId().equals(route.getCollectorId()))
                .findFirst()
                .ifPresent(u -> txtUsername.setText(u.getUsername()));
        txtPassword.requestFocus();
    }

    /**
     * Asistente Modal para que la oficina cree sus credenciales de Administrador,
     * elija cuántas rutas va a tener la oficina y configure cada ruta a su gusto.
     */
    private void openOfficeSetupWizardDialog() {
        Stage dialog = new Stage();
        dialog.initModality(Modality.APPLICATION_MODAL);
        if (getScene() != null && getScene().getWindow() != null) {
            dialog.initOwner(getScene().getWindow());
        }
        dialog.setTitle("Configurar Oficina, Credenciales de Administrador y Rutas");

        VBox root = new VBox(14);
        root.setPadding(new Insets(22));
        root.setStyle("-fx-background-color: #f8fafc;");
        root.setPrefWidth(680);
        root.setPrefHeight(640);

        Label headerTitle = new Label("\uD83C\uDFE2 Configurar Credenciales de Oficina y Rutas a tu Gusto");
        headerTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 17px; -fx-font-weight: bold;");
        Label headerSub = new Label("Define el usuario y clave del Administrador, indica cuántas rutas tendrá tu oficina y configura las credenciales de cada ruta.");
        headerSub.setStyle("-fx-text-fill: #475569; -fx-font-size: 12px;");
        headerSub.setWrapText(true);

        // Sección 1: Datos de Oficina y Credenciales de Administrador
        VBox adminCard = new VBox(10);
        adminCard.setStyle("-fx-background-color: #ffffff; -fx-padding: 16; -fx-background-radius: 12; -fx-border-color: #cbd5e1; -fx-border-radius: 12;");

        Label sec1Title = new Label("1. Datos de la Oficina y Credenciales del Administrador");
        sec1Title.setStyle("-fx-text-fill: #0284c7; -fx-font-size: 13.5px; -fx-font-weight: bold;");

        List<AppUserEntity> currentUsers = authService.getActiveUsers();
        AppUserEntity existingAdmin = currentUsers.stream()
                .filter(u -> u.getId().startsWith("usr-admin") || "admin".equalsIgnoreCase(u.getUsername()))
                .findFirst()
                .orElse(null);

        TextField txtCompany = new TextField(authService.getCompanyName());
        txtCompany.setPromptText("Ej. Inversiones & Créditos El Dorado");
        TextField txtCity = new TextField("Barranquilla");
        TextField txtPhone = new TextField("300 123 4567");

        HBox rowOffice = new HBox(10,
                createLabeledField("Nombre de la Oficina *", txtCompany, 260),
                createLabeledField("Ciudad", txtCity, 170),
                createLabeledField("Teléfono", txtPhone, 170)
        );

        TextField txtAdminName = new TextField(existingAdmin != null ? existingAdmin.getFullName() : "Administrador General");
        TextField txtAdminUser = new TextField(existingAdmin != null ? existingAdmin.getUsername() : "admin");
        TextField txtAdminPass = new TextField();
        txtAdminPass.setPromptText("Escribe la nueva clave de Admin");

        HBox rowAdmin = new HBox(10,
                createLabeledField("Nombre del Administrador *", txtAdminName, 220),
                createLabeledField("Usuario Administrador *", txtAdminUser, 180),
                createLabeledField("Contraseña Administrador *", txtAdminPass, 200)
        );

        adminCard.getChildren().addAll(sec1Title, rowOffice, rowAdmin);

        // Sección 2: ¿Cuántas rutas tendrá la oficina? + Reglas
        VBox countAndRulesCard = new VBox(10);
        countAndRulesCard.setStyle("-fx-background-color: #ffffff; -fx-padding: 16; -fx-background-radius: 12; -fx-border-color: #cbd5e1; -fx-border-radius: 12;");

        Label sec2Title = new Label("2. ¿Cuántas rutas va a tener esta oficina? y Políticas");
        sec2Title.setStyle("-fx-text-fill: #0284c7; -fx-font-size: 13.5px; -fx-font-weight: bold;");

        List<RouteEntity> currentRoutes = authService.getActiveRoutes();
        int initialRouteCount = Math.max(1, currentRoutes.size());

        Spinner<Integer> spnRouteCount = new Spinner<>(1, 20, initialRouteCount);
        spnRouteCount.setEditable(true);
        spnRouteCount.setPrefWidth(90);

        HBox quickCountBtns = new HBox(6);
        quickCountBtns.setAlignment(Pos.CENTER_LEFT);
        Label lblQty = new Label("Cantidad de Rutas:");
        lblQty.setStyle("-fx-font-weight: bold; -fx-text-fill: #1e293b; -fx-font-size: 12px;");
        quickCountBtns.getChildren().addAll(lblQty, spnRouteCount);

        for (int n : new int[]{1, 2, 3, 4, 5, 6}) {
            Button b = new Button(n + (n == 1 ? " Ruta" : " Rutas"));
            b.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-cursor: hand;");
            b.setOnAction(ev -> spnRouteCount.getValueFactory().setValue(n));
            quickCountBtns.getChildren().add(b);
        }

        TextField txtInterest = new TextField("20");
        TextField txtPaperworkFee = new TextField("5000");
        CheckBox chkPaperwork = new CheckBox("Cobrar Papelería");
        chkPaperwork.setSelected(true);
        CheckBox chkNoSundays = new CheckBox("Excluir Domingos");
        chkNoSundays.setSelected(true);
        CheckBox chkAllowNewLoans = new CheckBox("Permitir préstamos en calle");
        chkAllowNewLoans.setSelected(true);
        CheckBox chkAllowExpenses = new CheckBox("Permitir gastos en ruta");
        chkAllowExpenses.setSelected(true);

        HBox policiesRow = new HBox(12,
                createLabeledField("Interés (%)", txtInterest, 90),
                createLabeledField("Papelería ($)", txtPaperworkFee, 110),
                chkPaperwork,
                chkNoSundays,
                chkAllowNewLoans
        );
        policiesRow.setAlignment(Pos.CENTER_LEFT);

        countAndRulesCard.getChildren().addAll(sec2Title, quickCountBtns, policiesRow);

        // Sección 3: Lista dinámica de las N rutas configurables a su gusto
        VBox routesContainer = new VBox(10);
        List<RouteRowFields> routeRows = new ArrayList<>();

        Runnable rebuildRouteRows = () -> {
            int targetCount = spnRouteCount.getValue();
            while (routeRows.size() < targetCount) {
                int idx = routeRows.size();
                RouteEntity existingRoute = idx < currentRoutes.size() ? currentRoutes.get(idx) : null;
                AppUserEntity existingCol = existingRoute != null
                        ? currentUsers.stream().filter(u -> u.getId().equals(existingRoute.getCollectorId())).findFirst().orElse(null)
                        : null;
                routeRows.add(new RouteRowFields(
                        existingRoute != null ? existingRoute.getId() : null,
                        existingRoute != null ? existingRoute.getName() : "Ruta " + (idx + 1),
                        existingCol != null ? existingCol.getFullName() : "Cobrador Ruta " + (idx + 1),
                        existingCol != null ? existingCol.getUsername() : "ruta" + (idx + 1),
                        "ruta" + (idx + 1) + "123"
                ));
            }
            while (routeRows.size() > targetCount) {
                routeRows.remove(routeRows.size() - 1);
            }

            routesContainer.getChildren().clear();
            for (int i = 0; i < routeRows.size(); i++) {
                RouteRowFields rf = routeRows.get(i);
                VBox rCard = new VBox(8);
                rCard.setStyle("-fx-background-color: #ffffff; -fx-padding: 12; -fx-background-radius: 10; -fx-border-color: #93c5fd; -fx-border-radius: 10;");

                Label rTitle = new Label("\uD83D\uDEF5 RUTA #" + (i + 1) + " — Configura nombre y credenciales de acceso");
                rTitle.setStyle("-fx-text-fill: #1d4ed8; -fx-font-size: 12px; -fx-font-weight: bold;");

                HBox rRow = new HBox(8,
                        createLabeledField("Nombre de la Ruta *", rf.txtRouteName, 165),
                        createLabeledField("Nombre del Cobrador *", rf.txtCollectorName, 165),
                        createLabeledField("Usuario de Ruta *", rf.txtUsername, 130),
                        createLabeledField("Contraseña de Ruta *", rf.txtPassword, 145)
                );
                rCard.getChildren().addAll(rTitle, rRow);
                routesContainer.getChildren().add(rCard);
            }
        };

        spnRouteCount.valueProperty().addListener((obs, oldV, newV) -> rebuildRouteRows.run());
        rebuildRouteRows.run();

        VBox scrollContent = new VBox(12, adminCard, countAndRulesCard, routesContainer);
        ScrollPane scrollPane = new ScrollPane(scrollContent);
        scrollPane.setFitToWidth(true);
        scrollPane.setStyle("-fx-background: transparent; -fx-background-color: transparent;");
        VBox.setVgrow(scrollPane, Priority.ALWAYS);

        Label lblWizError = new Label();
        lblWizError.setVisible(false);
        lblWizError.setManaged(false);
        lblWizError.setStyle("-fx-text-fill: #dc2626; -fx-font-weight: bold; -fx-font-size: 12px;");

        HBox footer = new HBox(12);
        footer.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSaveAndLogin = new Button("\u2714 Guardar Credenciales, Configurar Rutas e Ingresar");
        btnSaveAndLogin.getStyleClass().add("btn-primary");
        btnSaveAndLogin.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 10 18; -fx-background-radius: 8;");
        btnSaveAndLogin.setOnAction(e -> {
            try {
                if (txtAdminPass.getText() == null || txtAdminPass.getText().trim().isEmpty()) {
                    lblWizError.setText("Por favor ingresa la contraseña que tendrá el Administrador de la oficina.");
                    lblWizError.setVisible(true);
                    lblWizError.setManaged(true);
                    return;
                }

                List<RouteSetupItem> items = new ArrayList<>();
                for (int i = 0; i < routeRows.size(); i++) {
                    RouteRowFields rf = routeRows.get(i);
                    items.add(new RouteSetupItem(
                            rf.existingRouteId,
                            rf.txtRouteName.getText(),
                            rf.txtCollectorName.getText(),
                            rf.txtUsername.getText(),
                            rf.txtPassword.getText()
                    ));
                }

                UserSession session = authService.setupOfficeAndRoutes(
                        txtCompany.getText(),
                        txtCity.getText(),
                        txtPhone.getText(),
                        txtAdminName.getText(),
                        txtAdminUser.getText(),
                        txtAdminPass.getText(),
                        txtInterest.getText(),
                        chkPaperwork.isSelected(),
                        txtPaperworkFee.getText(),
                        chkNoSundays.isSelected(),
                        chkAllowNewLoans.isSelected(),
                        chkAllowExpenses.isSelected(),
                        items
                );

                refreshDynamicData();
                dialog.close();
                if (onLoginSuccess != null) {
                    onLoginSuccess.accept(session);
                }
            } catch (Exception ex) {
                lblWizError.setText(ex.getMessage());
                lblWizError.setVisible(true);
                lblWizError.setManaged(true);
            }
        });

        footer.getChildren().addAll(btnCancel, btnSaveAndLogin);

        root.getChildren().addAll(headerTitle, headerSub, scrollPane, lblWizError, footer);

        Scene scene = new Scene(root);
        try {
            scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        } catch (Exception ignored) {}
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    private VBox createLabeledField(String label, TextField field, double prefWidth) {
        VBox box = new VBox(3);
        Label lbl = new Label(label);
        lbl.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;");
        field.getStyleClass().add("search-field");
        field.setPrefWidth(prefWidth);
        box.getChildren().addAll(lbl, field);
        return box;
    }

    private void doLogin() {
        String username = txtUsername.getText();
        String password = txtPassword.getText();

        if (username == null || username.trim().isEmpty()) {
            showError("Por favor ingresa tu nombre de usuario.");
            txtUsername.requestFocus();
            return;
        }

        if (password == null || password.isEmpty()) {
            showError("Por favor ingresa tu contraseña.");
            txtPassword.requestFocus();
            return;
        }

        btnLogin.setDisable(true);
        btnLogin.setText("Verificando credenciales...");

        try {
            var optSession = authService.authenticate(username, password);
            if (optSession.isPresent()) {
                lblError.setVisible(false);
                lblError.setManaged(false);
                if (onLoginSuccess != null) {
                    onLoginSuccess.accept(optSession.get());
                }
            } else {
                showError("Usuario o contraseña incorrectos. Verifica tus credenciales o configúralas en el botón superior.");
                txtPassword.clear();
                txtPassword.requestFocus();
            }
        } catch (Exception ex) {
            showError("Error al iniciar sesión: " + ex.getMessage());
        } finally {
            btnLogin.setDisable(false);
            btnLogin.setText("ADMIN".equals(selectedMode) ? "Ingresar al Panel de Oficina" : "Ingresar a Mi Ruta");
        }
    }

    private void showError(String message) {
        lblError.setText(message);
        lblError.setVisible(true);
        lblError.setManaged(true);
    }

    public void reset() {
        refreshDynamicData();
        txtPassword.clear();
        lblError.setVisible(false);
        lblError.setManaged(false);
        txtUsername.requestFocus();
    }
}
