package com.cartera.ui.views;

import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.customers.application.CreateCustomerUseCase.CreateCustomerCommand;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.security.UserSessionContext;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.util.function.Consumer;

/**
 * Diálogo modal para registrar nuevos clientes en el sistema.
 */
public class CustomerDialog extends Stage {

    private final CreateCustomerUseCase createCustomerUseCase;
    private final Consumer<CustomerEntity> onSuccess;

    private final TextField txtFullName = new TextField();
    private final TextField txtDoc = new TextField();
    private final TextField txtPhone = new TextField();
    private final TextField txtAltPhone = new TextField();
    private final TextField txtAddress = new TextField();
    private final TextField txtNeighborhood = new TextField();
    private final TextField txtCity = new TextField("Barranquilla");
    private final TextField txtBusiness = new TextField();
    private final TextField txtOccupation = new TextField();
    private final TextField txtNotes = new TextField();

    private final Label lblFeedback = new Label();
    private final Button btnSave = new Button("Guardar Cliente");
    private final Button btnCancel = new Button("Cancelar");

    public CustomerDialog(CreateCustomerUseCase createCustomerUseCase, Stage ownerStage, Consumer<CustomerEntity> onSuccess) {
        this.createCustomerUseCase = createCustomerUseCase;
        this.onSuccess = onSuccess;

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Registrar Nuevo Cliente");
        setResizable(false);

        buildUI();
    }

    private void buildUI() {
        VBox root = new VBox(20);
        root.setPadding(new Insets(24, 28, 24, 28));
        root.setStyle("-fx-background-color: #1e293b;");
        root.setPrefWidth(540);

        // Header
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label icon = new Label("👤");
        icon.setStyle("-fx-font-size: 24px;");
        VBox titleBox = new VBox(2);
        Label title = new Label("Nuevo Cliente");
        title.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 18px; -fx-font-weight: bold;");
        Label subtitle = new Label("Ingresa los datos personales y de ubicación del cliente");
        subtitle.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 12px;");
        titleBox.getChildren().addAll(title, subtitle);
        header.getChildren().addAll(icon, titleBox);

        // Formulario en Grid de 2 columnas
        GridPane grid = new GridPane();
        grid.setHgap(16);
        grid.setVgap(12);

        setupField(grid, "Nombres Completos *", txtFullName, 0, 0, 2);
        setupField(grid, "Cédula / Documento *", txtDoc, 0, 1, 1);
        setupField(grid, "Teléfono Celular *", txtPhone, 1, 1, 1);
        setupField(grid, "Dirección Principal *", txtAddress, 0, 2, 1);
        setupField(grid, "Barrio", txtNeighborhood, 1, 2, 1);
        setupField(grid, "Teléfono Alternativo", txtAltPhone, 0, 3, 1);
        setupField(grid, "Ciudad", txtCity, 1, 3, 1);
        setupField(grid, "Nombre de Negocio / Local", txtBusiness, 0, 4, 1);
        setupField(grid, "Ocupación / Actividad", txtOccupation, 1, 4, 1);
        setupField(grid, "Notas / Referencias adicionales", txtNotes, 0, 5, 2);

        // Feedback
        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        // Acciones
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> close());

        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> saveCustomer());

        actions.getChildren().addAll(spacer, btnCancel, btnSave);

        root.getChildren().addAll(header, grid, lblFeedback, actions);

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private void setupField(GridPane grid, String labelText, TextField field, int col, int row, int colSpan) {
        VBox box = new VBox(4);
        Label lbl = new Label(labelText);
        lbl.setStyle("-fx-text-fill: #cbd5e1; -fx-font-size: 11px; -fx-font-weight: bold;");
        field.getStyleClass().add("search-field");
        field.setMaxWidth(Double.MAX_VALUE);
        box.getChildren().addAll(lbl, field);
        grid.add(box, col, row, colSpan, 1);
    }

    private void saveCustomer() {
        String name = txtFullName.getText();
        String doc = txtDoc.getText();
        String phone = txtPhone.getText();

        if (name == null || name.trim().isEmpty()) {
            showError("El nombre completo es obligatorio.");
            txtFullName.requestFocus();
            return;
        }
        if (doc == null || doc.trim().isEmpty()) {
            showError("El documento o cédula es obligatorio.");
            txtDoc.requestFocus();
            return;
        }
        if (phone == null || phone.trim().isEmpty()) {
            showError("El teléfono es obligatorio.");
            txtPhone.requestFocus();
            return;
        }

        btnSave.setDisable(true);
        lblFeedback.setText("Guardando cliente...");
        lblFeedback.setStyle("-fx-text-fill: #38bdf8; -fx-background-color: rgba(56, 189, 248, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);

        try {
            String authorId = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("usr-col-1");

            var cmd = new CreateCustomerCommand(
                    name,
                    doc,
                    phone,
                    txtAltPhone.getText(),
                    txtAddress.getText(),
                    txtNeighborhood.getText(),
                    txtCity.getText(),
                    txtOccupation.getText(),
                    txtBusiness.getText(),
                    txtNotes.getText(),
                    "route-norte",
                    authorId,
                    authorId
            );

            CustomerEntity customer = createCustomerUseCase.execute(cmd);
            if (onSuccess != null) {
                onSuccess.accept(customer);
            }
            close();
        } catch (Exception ex) {
            btnSave.setDisable(false);
            showError(ex.getMessage());
        }
    }

    private void showError(String msg) {
        lblFeedback.setText("⚠ " + msg);
        lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.15); -fx-padding: 8 12; -fx-background-radius: 6;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }
}
