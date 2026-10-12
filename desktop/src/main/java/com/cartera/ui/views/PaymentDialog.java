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

        // Una sola clave por apertura del diálogo: reintentar tras un fallo no puede duplicar el cobro.
        final String idempotencyKey = UUID.randomUUID().toString();

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
                BigDecimal amount = parseAmount(txtAmount.getText());
                if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                    lblFeedback.setText("El monto debe ser mayor a cero.");
                    lblFeedback.setStyle("-fx-text-fill: #ef4444;");
                    return;
                }

                btnConfirm.setDisable(true);
                lblFeedback.setText("Registrando pago transaccional en SQLite...");
                lblFeedback.setStyle("-fx-text-fill: #38bdf8;");

                String collectorId = com.cartera.infrastructure.security.UserSessionContext.getSession()
                        .map(com.cartera.infrastructure.security.UserSession::userId)
                        .orElse("usr-col-1");

                var cmd = new RecordPaymentCommand(
                        item.loanId(),
                        amount,
                        cmbMethod.getValue(),
                        collectorId,
                        LocalDate.now(),
                        idempotencyKey
                );

                var res = useCase.execute(cmd);

                var receiptData = new ReceiptDialog.ReceiptData(
                        res.paymentId(),
                        item.fullName(),
                        item.documentNumber(),
                        item.loanId(),
                        res.allocatedAmount(),
                        res.remainingLoanBalance(),
                        res.installmentsAffectedCount(),
                        com.cartera.infrastructure.security.UserSessionContext.getSession()
                                .map(com.cartera.infrastructure.security.UserSession::fullName)
                                .orElse("Carlos Cobrador"),
                        cmbMethod.getValue(),
                        "SISTEMA DE CARTERA",
                        ""
                );

                dialog.close();
                new ReceiptDialog(receiptData, parentStage).showAndWait();

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
        var theme = PaymentDialog.class.getResource("/ui/theme.css");
        if (theme != null) scene.getStylesheets().add(theme.toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    /**
     * Parses a user-typed peso amount. Accepts "$ 15.000", "15,000", "15000", "15000.00", "15.000,50".
     * A lone separator followed by exactly 3 digits is a thousands separator; otherwise it is decimal.
     */
    static BigDecimal parseAmount(String input) {
        if (input == null) throw new NumberFormatException("vacío");
        String s = input.trim().replace("$", "").replace(" ", "").replace("\u00a0", "");
        if (s.isEmpty()) throw new NumberFormatException("vacío");
        int lastDot = s.lastIndexOf('.');
        int lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            char decimal = lastDot > lastComma ? '.' : ',';
            char group = decimal == '.' ? ',' : '.';
            s = s.replace(String.valueOf(group), "").replace(decimal, '.');
        } else if (lastDot >= 0 || lastComma >= 0) {
            char sep = lastDot >= 0 ? '.' : ',';
            int count = (int) s.chars().filter(c -> c == sep).count();
            int digitsAfter = s.length() - s.lastIndexOf(sep) - 1;
            if (count > 1 || digitsAfter == 3) {
                s = s.replace(String.valueOf(sep), "");
            } else {
                s = s.replace(sep, '.');
            }
        }
        return new BigDecimal(s);
    }
}
