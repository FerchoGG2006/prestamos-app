package com.cartera.ui.views;

import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.ui.util.MotionUtil;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Consumer;

/**
 * Pantalla de inicio de sesión con Identidad Propia de la Aplicación (Kredia).
 * Solo solicita Usuario y Contraseña, identificando automáticamente rol y ruta asignada.
 */
public class LoginView extends StackPane {

    private static final Logger LOG = LoggerFactory.getLogger(LoginView.class);

    private final AuthService authService;
    private final Consumer<UserSession> onLoginSuccess;
    private com.cartera.infrastructure.licensing.OfficeLicensingService licensingService;
    private com.cartera.sync.application.DesktopCloudSyncService cloudSyncService;

    public void setOfficeLicensingService(com.cartera.infrastructure.licensing.OfficeLicensingService licensingService) {
        this.licensingService = licensingService;
    }

    public void setCloudSyncService(com.cartera.sync.application.DesktopCloudSyncService cloudSyncService) {
        this.cloudSyncService = cloudSyncService;
    }

    private final Label lblActiveOfficeBadge = new Label();
    private final TextField txtUsername = new TextField();
    private final PasswordField txtPassword = new PasswordField();
    private final Label lblError = new Label();
    private final Label lblSuccess = new Label();
    private final Button btnLogin = new Button("Ingresar");
    private VBox loginCard;

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

        var wordmark = new javafx.scene.image.ImageView(getClass().getResource("/ui/kredia.png").toExternalForm());
        wordmark.setFitWidth(152);
        wordmark.setPreserveRatio(true);
        wordmark.setAccessibleText("Kredia");
        Label subtitle = new Label("Sistema de Gestión de Cartera y Rutas");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px; -fx-font-weight: bold;");

        lblActiveOfficeBadge.setVisible(false);
        lblActiveOfficeBadge.setManaged(false);
        lblActiveOfficeBadge.setStyle("-fx-background-color: #e6f7f5; -fx-text-fill: #0f766e; -fx-border-color: #99f6e4; -fx-border-radius: 12; -fx-background-radius: 12; -fx-padding: 3 10; -fx-font-size: 11px; -fx-font-weight: bold;");

        header.getChildren().addAll(wordmark, subtitle, lblActiveOfficeBadge);

        // Tarjeta Blanca: solo Usuario y Contraseña
        loginCard = new VBox(12);
        loginCard.setAlignment(Pos.CENTER_LEFT);
        loginCard.setPadding(new Insets(22));
        loginCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 20; -fx-border-color: #e2e8f0; -fx-border-radius: 20; -fx-border-width: 1;");

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
        btnLogin.setMinHeight(42);
        btnLogin.setStyle("-fx-background-color: #0d9488; -fx-text-fill: white; -fx-font-size: 14px; -fx-font-weight: bold; -fx-padding: 10 20; -fx-background-radius: 12; -fx-cursor: hand;");
        btnLogin.setOnAction(e -> doLogin());
        MotionUtil.installTactileButton(btnLogin);

        loginCard.getChildren().addAll(lblSuccess, lblError, lblUser, txtUsername, lblPass, txtPassword, btnLogin);

        Button btnVendorPanel = new Button("Acceso distribuidor");
        btnVendorPanel.setMinHeight(30);
        btnVendorPanel.setStyle("-fx-background-color: transparent; -fx-text-fill: #64748b; -fx-font-size: 11.5px; -fx-font-weight: bold; -fx-cursor: hand; -fx-underline: true;");
        btnVendorPanel.setOnAction(e -> {
            Stage st = (getScene() != null && getScene().getWindow() instanceof Stage s) ? s : null;
            if (licensingService == null) {
                Alert a = new Alert(Alert.AlertType.WARNING, "El servicio comercial aún no está disponible. Reinicia la aplicación.", ButtonType.OK);
                a.setTitle("Acceso distribuidor");
                a.setHeaderText("Panel no disponible");
                if (st != null) a.initOwner(st);
                a.showAndWait();
                return;
            }
            try {
                new VendorLicensingDialog(st, licensingService).show();
                refreshDynamicData();
            } catch (Throwable ex) {
                LOG.error("Error abriendo Panel Comercial de Distribuidor", ex);
                Alert a = new Alert(Alert.AlertType.ERROR, "No se pudo abrir el panel de distribuidor: " + ex.getMessage(), ButtonType.OK);
                a.setTitle("Error");
                a.setHeaderText("Error al abrir Acceso distribuidor");
                if (st != null) a.initOwner(st);
                a.showAndWait();
            }
        });

        Label lblVersion = new Label("Kredia Desktop " + com.cartera.infrastructure.version.AppVersion.shortTag()
                + " (" + com.cartera.infrastructure.version.AppVersion.BUILD_DATE + ")");
        lblVersion.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 10.5px;");

        wrapper.getChildren().addAll(header, loginCard, btnVendorPanel, lblVersion);
        getChildren().add(wrapper);
        MotionUtil.transitionView(wrapper);
    }

    private void refreshDynamicData() {
        String comp = authService.getCompanyName();
        boolean isConfigured = authService.isOfficeConfigured()
                && comp != null
                && !comp.trim().isEmpty()
                && !"SISTEMA CARTERA".equalsIgnoreCase(comp.trim())
                && !"Inversiones & Cobranzas La Excelencia".equalsIgnoreCase(comp.trim())
                && !"Mi Oficina de Crédito".equalsIgnoreCase(comp.trim());
        if (isConfigured) {
            lblActiveOfficeBadge.setText("Oficina: " + comp.trim());
            lblActiveOfficeBadge.setVisible(true);
            lblActiveOfficeBadge.setManaged(true);
        } else {
            lblActiveOfficeBadge.setVisible(false);
            lblActiveOfficeBadge.setManaged(false);
        }
    }

    private void doLogin() {
        if (btnLogin.isDisabled()) {
            return;
        }
        String username = txtUsername.getText();
        String password = txtPassword.getText();

        if (username == null || username.trim().isEmpty() || password == null || password.isEmpty()) {
            showError("Ingresa tu usuario y contraseña.");
            return;
        }

        btnLogin.setDisable(true);
        txtUsername.setDisable(true);
        txtPassword.setDisable(true);
        btnLogin.setText("Ingresando...");
        lblError.setVisible(false);
        lblError.setManaged(false);

        Thread worker = new Thread(() -> {
            try {
                final boolean ok;
                final UserSession session;
                final String errMsg;

                if (cloudSyncService != null) {
                    var res = cloudSyncService.authenticateAndSync(username, password);
                    ok = res.ok();
                    session = res.session();
                    errMsg = res.message();
                } else {
                    var opt = authService.authenticate(username, password);
                    ok = opt.isPresent();
                    session = opt.orElse(null);
                    errMsg = "Usuario o contraseña incorrectos.";
                }

                javafx.application.Platform.runLater(() -> {
                    btnLogin.setDisable(false);
                    txtUsername.setDisable(false);
                    txtPassword.setDisable(false);
                    btnLogin.setText("Ingresar");
                    if (ok && session != null) {
                        try {
                            if (session.isCollector()) {
                                String assignedRoute = authService.getActiveRoutes().stream()
                                        .filter(r -> r.getCollectorId() != null && session.userId().equalsIgnoreCase(r.getCollectorId()))
                                        .map(r -> r.getId())
                                        .findFirst()
                                        .orElse("NONE");
                                UserSessionContext.setSelectedRouteId(assignedRoute);
                            } else {
                                UserSessionContext.setSelectedRouteId("ALL");
                            }
                            lblError.setVisible(false);
                            lblError.setManaged(false);
                            if (onLoginSuccess != null) {
                                onLoginSuccess.accept(session);
                            }
                        } catch (Exception uiEx) {
                            LOG.error("Error inicializando panel tras login exitoso", uiEx);
                            showError("Sesión válida, pero ocurrió un error al cargar la oficina: "
                                    + (uiEx.getMessage() != null ? uiEx.getMessage() : "intenta nuevamente."));
                        }
                    } else {
                        showError(errMsg == null || errMsg.isBlank() ? "Usuario o contraseña incorrectos." : errMsg);
                        txtPassword.clear();
                        txtPassword.requestFocus();
                    }
                });
            } catch (Exception ex) {
                LOG.error("Error inesperado en autenticación de escritorio", ex);
                javafx.application.Platform.runLater(() -> {
                    btnLogin.setDisable(false);
                    txtUsername.setDisable(false);
                    txtPassword.setDisable(false);
                    btnLogin.setText("Ingresar");
                    showError("No se pudo iniciar sesión. Intenta nuevamente.");
                });
            }
        }, "kredia-login-worker");
        worker.setDaemon(true);
        worker.start();
    }

    private void showError(String message) {
        lblSuccess.setVisible(false);
        lblSuccess.setManaged(false);
        lblError.setText(message);
        lblError.setVisible(true);
        lblError.setManaged(true);
        MotionUtil.shakeError(loginCard);
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
