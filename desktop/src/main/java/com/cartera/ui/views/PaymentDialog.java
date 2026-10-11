package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.RecordPaymentUseCase.RecordPaymentCommand;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Consumer;

public class PaymentDialog {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public static void show(Stage parentStage, CollectionItem item, RecordPaymentUseCase useCase, Consumer<Boolean> onFinished) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(parentStage);
        dialog.setTitle("Registrar Cobro - " + item.fullName());

        VBox root = new VBox(16);
        root.setStyle("-fx-background-color: #0f172a; -fx-padding: 24;");
        root.setPrefWidth(460);

        Label title = new Label("Registrar Cobro");
        title.setStyle("-fx-text-fill: #f8fafc; -fx-font-size: 18px; -fx-font-weight: bold;");

        // Info Card
        VBox infoCard = new VBox(6);
        infoCard.setStyle("-fx-background-color: #1e293b; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #334155; -fx-border-radius: 8;");
        Label lblName = new Label("Cliente: " + item.fullName() + " (" + item.documentNumber() + ")");
        lblName.setStyle("-fx-text-fill: #f8fafc; -fx-font-weight: bold; -fx-font-size: 14px;");
        Label lblAddress = new Label("Dirección: " + item.address() + " - " + item.neighborhood());
        lblAddress.setStyle("-fx-text-fill: #94a3b8;");
        Label lblLoan = new Label("Saldo total crédito: " + CURRENCY.format(item.loanBalance()));
        lblLoan.setStyle("-fx-text-fill: #38bdf8; -fx-font-weight: bold;");
        Label lblCuota = new Label("Cuota #" + item.installmentNumber() + " pendiente: " + CURRENCY.format(item.installmentPending()));
        lblCuota.setStyle("-fx-text-fill: #f59e0b; -fx-font-weight: bold;");
        infoCard.getChildren().addAll(lblName, lblAddress, lblLoan, lblCuota);

        // Input monto
        Label lblAmount = new Label("Monto a registrar ($):");
        lblAmount.setStyle("-fx-text-fill: #cbd5e1; -fx-font-weight: bold;");

        TextField txtAmount = new TextField(item.installmentPending().toPlainString());
        txtAmount.setStyle("-fx-background-color: #1e293b; -fx-text-fill: #f8fafc; -fx-border-color: #334155; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10; -fx-font-size: 16px; -fx-font-weight: bold;");

        // Botones de atajo
        HBox shortcuts = new HBox(8);
        Button btnExact = new Button("Cuota exacta (" + CURRENCY.format(item.installmentPending()) + ")");
        btnExact.setStyle("-fx-background-color: #334155; -fx-text-fill: #e2e8f0; -fx-background-radius: 6; -fx-cursor: hand;");
        btnExact.setOnAction(e -> txtAmount.setText(item.installmentPending().toPlainString()));

        Button btnTwo = new Button("2 Cuotas (" + CURRENCY.format(item.installmentPending().multiply(BigDecimal.valueOf(2))) + ")");
        btnTwo.setStyle("-fx-background-color: #334155; -fx-text-fill: #e2e8f0; -fx-background-radius: 6; -fx-cursor: hand;");
        btnTwo.setOnAction(e -> txtAmount.setText(item.installmentPending().multiply(BigDecimal.valueOf(2)).toPlainString()));

        shortcuts.getChildren().addAll(btnExact, btnTwo);

        // Método de pago
        Label lblMethod = new Label("Método de pago:");
        lblMethod.setStyle("-fx-text-fill: #cbd5e1; -fx-font-weight: bold;");
        ComboBox<String> cmbMethod = new ComboBox<>();
        cmbMethod.getItems().addAll("EFECTIVO", "TRANSFERENCIA");
        cmbMethod.setValue("EFECTIVO");
        cmbMethod.setMaxWidth(Double.MAX_VALUE);
        cmbMethod.setStyle("-fx-background-color: #1e293b; -fx-border-color: #334155; -fx-border-radius: 6;");

        // Mensaje de estado
        Label lblFeedback = new Label();
        lblFeedback.setStyle("-fx-font-size: 12px; -fx-wrap-text: true;");

        // Botones de acción
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);
        actions.setPadding(new Insets(10, 0, 0, 0));

        Button btnCancel = new Button("Cancelar");
        btnCancel.setStyle("-fx-background-color: #334155; -fx-text-fill: #cbd5e1; -fx-padding: 10 18; -fx-background-radius: 6; -fx-cursor: hand;");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnConfirm = new Button("Confirmar Cobro");
        btnConfirm.setStyle("-fx-background-color: #10b981; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 10 20; -fx-background-radius: 6; -fx-cursor: hand;");
        btnConfirm.setOnAction(e -> {
            try {
                String raw = txtAmount.getText().trim().replace("$", "").replace(".", "").replace(",", "");
                BigDecimal amount = new BigDecimal(raw);
                if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                    lblFeedback.setText("El monto debe ser mayor a cero.");
                    lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                    return;
                }

                btnConfirm.setDisable(true);
                lblFeedback.setText("Registrando pago transaccional en SQLite...");
                lblFeedback.setStyle("-fx-text-fill: #38bdf8;");

                var cmd = new RecordPaymentCommand(
                        item.loanId(),
                        amount,
                        cmbMethod.getValue(),
                        "usr-col-1",
                        LocalDate.now(),
                        UUID.randomUUID().toString()
                );

                var res = useCase.execute(cmd);

                Alert alert = new Alert(Alert.AlertType.INFORMATION);
                alert.setTitle("Cobro Exitoso");
                alert.setHeaderText("Pago registrado correctamente");
                alert.setContentText("Monto abonado: " + CURRENCY.format(res.allocatedAmount()) +
                        "\nCuotas impactadas: " + res.installmentsAffectedCount() +
                        "\nNuevo saldo pendiente: " + CURRENCY.format(res.remainingLoanBalance()) +
                        (res.isLoanFullyPaid() ? "\n¡Crédito completamente cancelado!" : ""));
                alert.showAndWait();

                dialog.close();
                if (onFinished != null) onFinished.accept(true);

            } catch (NumberFormatException nfe) {
                lblFeedback.setText("Ingrese un número válido.");
                lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                btnConfirm.setDisable(false);
            } catch (Exception ex) {
                lblFeedback.setText("Error: " + ex.getMessage());
                lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                btnConfirm.setDisable(false);
            }
        });

        actions.getChildren().addAll(btnCancel, btnConfirm);

        root.getChildren().addAll(title, infoCard, lblAmount, txtAmount, shortcuts, lblMethod, cmbMethod, lblFeedback, actions);

        Scene scene = new Scene(root);
        dialog.setScene(scene);
        dialog.showAndWait();
    }
}
