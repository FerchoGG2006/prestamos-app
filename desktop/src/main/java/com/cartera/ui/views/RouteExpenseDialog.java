package com.cartera.ui.views;

import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.ui.util.CurrencyInputUtil;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Diálogo rápido para registrar gastos operativos de la ruta (pinchazos, plan de datos, gasolina).
 * Estos gastos se cargan a la ruta y se descuentan de la entrega de efectivo de la liquidación diaria.
 */
public class RouteExpenseDialog {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public record ExpenseCategoryOption(String code, String displayName) {
        @Override
        public String toString() {
            return displayName;
        }
    }

    public static void show(
            Stage parentStage,
            String collectorId,
            String routeId,
            SettlementUseCase settlementUseCase,
            Consumer<Boolean> onFinished
    ) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        if (parentStage != null) {
            dialog.initOwner(parentStage);
        }
        dialog.setTitle("Reportar Gasto Operativo de Ruta");
        dialog.setResizable(false);

        VBox root = new VBox(16);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(440);

        Label title = new Label("Reportar Gasto Operativo de Ruta");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 17px; -fx-font-weight: bold;");

        Label subtitle = new Label("Gastos directos del trabajo (pinchazo, datos celular, gasolina). Se descuentan de la ruta.");
        subtitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        subtitle.setWrapText(true);

        // Selector de tipo de gasto
        Label lblType = new Label("Concepto del Gasto:");
        lblType.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 12px;");

        ComboBox<ExpenseCategoryOption> cmbCategory = new ComboBox<>(FXCollections.observableArrayList(
                new ExpenseCategoryOption(SettlementUseCase.CAT_GASTO_PINCHAZO, "Pinchazo / Reparación Llanta (Moto)"),
                new ExpenseCategoryOption(SettlementUseCase.CAT_GASTO_DATOS, "Recarga / Plan Datos Celular"),
                new ExpenseCategoryOption(SettlementUseCase.CAT_GASTO_GASOLINA, "Combustible / Gasolina de Ruta"),
                new ExpenseCategoryOption("GASTO_RUTA_VIATICOS", "Peaje / Viático Operativo"),
                new ExpenseCategoryOption(SettlementUseCase.CAT_GASTO_OTRO, "Otro Gasto Operativo de Ruta")
        ));
        cmbCategory.getSelectionModel().selectFirst();
        cmbCategory.setMaxWidth(Double.MAX_VALUE);
        cmbCategory.getStyleClass().add("search-field");

        // Monto
        Label lblAmount = new Label("Monto del Gasto ($) *:");
        lblAmount.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 12px;");

        TextField txtAmount = new TextField();
        txtAmount.setPromptText("Ej. 10000");
        txtAmount.getStyleClass().add("search-field");
        txtAmount.setStyle("-fx-font-size: 14px; -fx-font-weight: bold;");

        // Detalle / Justificación
        Label lblDesc = new Label("Detalle / Taller / Factura *:");
        lblDesc.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 12px;");

        TextField txtDesc = new TextField();
        txtDesc.setPromptText("Ej. Despinche rueda trasera en taller El Paisa");
        txtDesc.getStyleClass().add("search-field");

        // Feedback
        Label lblFeedback = new Label();
        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        // Botones
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);
        actions.setPadding(new Insets(12, 0, 0, 0));

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> {
            dialog.close();
            if (onFinished != null) onFinished.accept(false);
        });

        Button btnSave = new Button("Guardar Gasto");
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setOnAction(e -> {
            try {
                BigDecimal amount = CurrencyInputUtil.parseAmount(txtAmount.getText());
                if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                    lblFeedback.setText("El monto debe ser mayor a cero.");
                    lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.12); -fx-padding: 8; -fx-background-radius: 6;");
                    lblFeedback.setVisible(true);
                    lblFeedback.setManaged(true);
                    return;
                }

                String desc = txtDesc.getText() != null ? txtDesc.getText().trim() : "";
                if (desc.isEmpty()) {
                    lblFeedback.setText("Ingresa una breve descripción o detalle del gasto.");
                    lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.12); -fx-padding: 8; -fx-background-radius: 6;");
                    lblFeedback.setVisible(true);
                    lblFeedback.setManaged(true);
                    return;
                }

                ExpenseCategoryOption opt = cmbCategory.getValue();
                String categoryCode = opt != null ? opt.code() : SettlementUseCase.CAT_GASTO_OTRO;

                settlementUseCase.registerRouteExpense(
                        collectorId,
                        routeId,
                        categoryCode,
                        amount,
                        desc,
                        collectorId
                );

                dialog.close();
                if (onFinished != null) onFinished.accept(true);
            } catch (Exception ex) {
                lblFeedback.setText("Error: " + ex.getMessage());
                lblFeedback.setStyle("-fx-text-fill: #ef4444; -fx-background-color: rgba(239, 68, 68, 0.12); -fx-padding: 8; -fx-background-radius: 6;");
                lblFeedback.setVisible(true);
                lblFeedback.setManaged(true);
            }
        });

        actions.getChildren().addAll(btnCancel, btnSave);

        root.getChildren().addAll(
                title,
                subtitle,
                new VBox(4, lblType, cmbCategory),
                new VBox(4, lblAmount, txtAmount),
                new VBox(4, lblDesc, txtDesc),
                lblFeedback,
                actions
        );

        Scene scene = new Scene(root);
        try {
            scene.getStylesheets().add(RouteExpenseDialog.class.getResource("/ui/theme.css").toExternalForm());
        } catch (Exception ignored) {}

        dialog.setScene(scene);
        dialog.showAndWait();
    }
}
