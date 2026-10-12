package com.cartera.ui.views;

import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.UserSession;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

import java.util.function.Consumer;

/**
 * Pantalla de inicio de sesión nativa JavaFX con diseño premium y autenticación real.
 */
public class LoginView extends StackPane {

    private final AuthService authService;
    private final Consumer<UserSession> onLoginSuccess;

    private final TextField txtUsername = new TextField();
    private final PasswordField txtPassword = new PasswordField();
    private final Label lblError = new Label();
    private final Button btnLogin = new Button("Ingresar al Sistema →");

    public LoginView(AuthService authService, Consumer<UserSession> onLoginSuccess) {
        this.authService = authService;
        this.onLoginSuccess = onLoginSuccess;

        setStyle("-fx-background-color: #0b1120;");
        setAlignment(Pos.CENTER);
        setPadding(new Insets(24));

        buildUI();
    }

    private void buildUI() {
        VBox card = new VBox(20);
        card.setAlignment(Pos.CENTER);
        card.setMaxWidth(420);
        card.setPadding(new Insets(36, 32, 32, 32));
        card.setStyle("-fx-background-color: #1e293b; -fx-background-radius: 16; -fx-border-color: #334155; -fx-border-radius: 16; -fx-border-width: 1; -fx-effect: dropshadow(gaussian, rgba(0,0,0,0.4), 20, 0, 0, 8);");

        // Logo e Isotipo
        HBox brandHeader = new HBox(12);
        brandHeader.setAlignment(Pos.CENTER);

        Label logo = new Label("\uD83D\uDCBC");
        logo.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-font-size: 22px; -fx-padding: 10 12; -fx-background-radius: 12;");

        VBox brandTitles = new VBox(2);
        brandTitles.setAlignment(Pos.CENTER_LEFT);
        Label title = new Label("SISTEMA CARTERA");
        title.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 18px; -fx-font-weight: bold; -fx-letter-spacing: 0.5px;");
        Label subtitle = new Label("Plataforma Nativa de Cobros & Préstamos");
        subtitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
        brandTitles.getChildren().addAll(title, subtitle);

        brandHeader.getChildren().addAll(logo, brandTitles);

        // Separador sutil
        Label divider = new Label();
        divider.setMaxWidth(Double.MAX_VALUE);
        divider.setPrefHeight(1);
        divider.setStyle("-fx-background-color: #334155;");

        // Formulario
        VBox form = new VBox(14);
        form.setAlignment(Pos.CENTER_LEFT);

        Label lblUser = new Label("Nombre de Usuario");
        lblUser.setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 12px; -fx-font-weight: bold;");
        txtUsername.setPromptText("Ej. carlos o admin");
        txtUsername.getStyleClass().add("search-field");
        txtUsername.setMaxWidth(Double.MAX_VALUE);
        txtUsername.setStyle("-fx-padding: 10 14; -fx-font-size: 13px;");

        Label lblPass = new Label("Contraseña");
        lblPass.setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 12px; -fx-font-weight: bold;");
        txtPassword.setPromptText("••••••••");
        txtPassword.getStyleClass().add("search-field");
        txtPassword.setMaxWidth(Double.MAX_VALUE);
        txtPassword.setStyle("-fx-padding: 10 14; -fx-font-size: 13px;");

        // Acción Enter en los campos
        txtUsername.setOnAction(e -> txtPassword.requestFocus());
        txtPassword.setOnAction(e -> doLogin());

        // Mensaje de Error
        lblError.setVisible(false);
        lblError.setManaged(false);
        lblError.setWrapText(true);
        lblError.setMaxWidth(Double.MAX_VALUE);
        lblError.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.15); -fx-padding: 8 12; -fx-background-radius: 8; -fx-font-size: 12px;");

        // Botón Login
        btnLogin.getStyleClass().add("btn-primary");
        btnLogin.setMaxWidth(Double.MAX_VALUE);
        btnLogin.setStyle("-fx-font-size: 14px; -fx-font-weight: bold; -fx-padding: 11 20; -fx-background-radius: 8;");
        btnLogin.setOnAction(e -> doLogin());

        form.getChildren().addAll(lblUser, txtUsername, lblPass, txtPassword, lblError, btnLogin);

        // Ayuda demo
        VBox helpBox = new VBox(4);
        helpBox.setAlignment(Pos.CENTER);
        Label helpTitle = new Label("Credenciales Demo Activas:");
        helpTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        Label helpText = new Label("Cobrador: carlos / carlos123   •   Admin: admin / admin123");
        helpText.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 11px;");
        helpBox.getChildren().addAll(helpTitle, helpText);

        card.getChildren().addAll(brandHeader, divider, form, helpBox);
        getChildren().add(card);
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
                showError("Usuario o contraseña incorrectos, o usuario inactivo.");
                txtPassword.clear();
                txtPassword.requestFocus();
            }
        } catch (Exception ex) {
            showError("Error al iniciar sesión: " + ex.getMessage());
        } finally {
            btnLogin.setDisable(false);
            btnLogin.setText("Ingresar al Sistema →");
        }
    }

    private void showError(String message) {
        lblError.setText("⚠ " + message);
        lblError.setVisible(true);
        lblError.setManaged(true);
    }

    public void reset() {
        txtUsername.clear();
        txtPassword.clear();
        lblError.setVisible(false);
        lblError.setManaged(false);
        txtUsername.requestFocus();
    }
}
