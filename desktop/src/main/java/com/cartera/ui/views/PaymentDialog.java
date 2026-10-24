package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.RecordPaymentUseCase.RecordPaymentCommand;
import com.cartera.ui.util.CurrencyInputUtil;
import com.cartera.ui.util.WhatsAppReceiptUtil;
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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import java.util.function.Consumer;

public class PaymentDialog {
    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public static void show(Stage parentStage, CollectionItem item, RecordPaymentUseCase useCase, Consumer<Boolean> onFinished) {
        show(parentStage, item, useCase, null, onFinished);
    }

    public static void show(Stage parentStage,
                            CollectionItem item,
                            RecordPaymentUseCase useCase,
                            SystemSettingRepository settingRepository,
                            Consumer<Boolean> onFinished) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(parentStage);
        dialog.setTitle("Registrar Cobro - " + item.fullName());

        // Una sola clave por apertura del diálogo: reintentar tras un fallo no puede duplicar el cobro.
        final String idempotencyKey = UUID.randomUUID().toString();

        VBox root = new VBox(16);
        root.setStyle("-fx-background-color: #ffffff; -fx-padding: 24;");
        root.setPrefWidth(480);

        Label title = new Label("Registrar Cobro");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");

        // Info Card
        VBox infoCard = new VBox(6);
        infoCard.setStyle("-fx-background-color: #f8fafc; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");
        Label lblName = new Label("Cliente: " + item.fullName() + " (" + item.documentNumber() + ")");
        lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 14px;");
        Label lblAddress = new Label("Dirección: " + item.address() + " - " + item.neighborhood());
        lblAddress.setStyle("-fx-text-fill: #64748b;");
        Label lblLoan = new Label("Saldo total crédito: " + CURRENCY.format(item.loanBalance()));
        lblLoan.setStyle("-fx-text-fill: #2563eb; -fx-font-weight: bold;");
        Label lblCuota = new Label("Cuota #" + item.installmentNumber() + " pendiente: " + CURRENCY.format(item.installmentPending()));
        lblCuota.setStyle("-fx-text-fill: #d97706; -fx-font-weight: bold;");
        infoCard.getChildren().addAll(lblName, lblAddress, lblLoan, lblCuota);

        // Input monto
        Label lblAmount = new Label("Monto a registrar ($):");
        lblAmount.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold;");

        TextField txtAmount = new TextField(item.installmentPending().toPlainString());
        txtAmount.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10; -fx-font-size: 16px; -fx-font-weight: bold;");

        // Botones de atajo
        HBox shortcuts = new HBox(8);
        Button btnExact = new Button("Cuota exacta (" + CURRENCY.format(item.installmentPending()) + ")");
        btnExact.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand;");
        btnExact.setOnAction(e -> txtAmount.setText(item.installmentPending().toPlainString()));

        Button btnTwo = new Button("2 Cuotas (" + CURRENCY.format(item.installmentPending().multiply(BigDecimal.valueOf(2))) + ")");
        btnTwo.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand;");
        btnTwo.setOnAction(e -> txtAmount.setText(item.installmentPending().multiply(BigDecimal.valueOf(2)).toPlainString()));

        shortcuts.getChildren().addAll(btnExact, btnTwo);

        // Método de pago
        Label lblMethod = new Label("Método de pago:");
        lblMethod.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold;");
        ComboBox<String> cmbMethod = new ComboBox<>();
        cmbMethod.getItems().addAll("EFECTIVO", "TRANSFERENCIA");
        cmbMethod.setValue("EFECTIVO");
        cmbMethod.setMaxWidth(Double.MAX_VALUE);
        cmbMethod.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 6;");

        CheckBox chkSendWhatsApp = new CheckBox("📲 Enviar recibo digital por WhatsApp automáticamente al confirmar");
        chkSendWhatsApp.setStyle("-fx-text-fill: #15803d; -fx-font-weight: bold; -fx-font-size: 12px;");
        chkSendWhatsApp.setSelected(false);

        // Mensaje de estado
        Label lblFeedback = new Label();
        lblFeedback.setStyle("-fx-font-size: 12px; -fx-wrap-text: true;");

        // Botones de acción
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);
        actions.setPadding(new Insets(10, 0, 0, 0));

        Button btnCancel = new Button("Cancelar");
        btnCancel.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-text-fill: #475569; -fx-padding: 10 18; -fx-background-radius: 6; -fx-cursor: hand;");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnConfirm = new Button("Confirmar Cobro");
        btnConfirm.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 10 20; -fx-background-radius: 6; -fx-cursor: hand; -fx-effect: dropshadow(gaussian, rgba(5,150,105,0.2), 6, 0, 0, 2);");
        btnConfirm.setOnAction(e -> {
            try {
                BigDecimal amount = parseAmount(txtAmount.getText());
                if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                    lblFeedback.setText("El monto debe ser mayor a cero.");
                    lblFeedback.setStyle("-fx-text-fill: #dc2626;");
                    return;
                }

                boolean allowPartial = settingRepository == null || settingRepository.findById("route_allow_partial_payments")
                        .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                        .orElse(true);
                BigDecimal minRequired = item.installmentPending().min(item.loanBalance());
                if (!allowPartial && amount.compareTo(minRequired) < 0) {
                    lblFeedback.setText("Los abonos parciales están deshabilitados en Configuración. Debe cobrar mínimo la cuota pendiente (" + CURRENCY.format(minRequired) + ").");
                    lblFeedback.setStyle("-fx-text-fill: #dc2626;");
                    return;
                }

                btnConfirm.setDisable(true);
                lblFeedback.setText("Guardando abono de cuota...");
                lblFeedback.setStyle("-fx-text-fill: #2563eb;");

                String collectorId = com.cartera.infrastructure.security.UserSessionContext.getSession()
                        .map(com.cartera.infrastructure.security.UserSession::userId)
                        .orElse("admin");

                var cmd = new RecordPaymentCommand(
                        item.loanId(),
                        amount,
                        cmbMethod.getValue(),
                        collectorId,
                        LocalDate.now(),
                        idempotencyKey
                );

                var res = useCase.execute(cmd);

                String companyName = settingRepository != null
                        ? settingRepository.findById("company_name").map(s -> s.getSettingValue()).orElse("SISTEMA DE CARTERA")
                        : "SISTEMA DE CARTERA";
                String collectorName = com.cartera.infrastructure.security.UserSessionContext.getSession()
                        .map(com.cartera.infrastructure.security.UserSession::fullName)
                        .orElse("Administración Central");

                var receiptData = new ReceiptDialog.ReceiptData(
                        res.paymentId(),
                        item.fullName(),
                        item.documentNumber(),
                        item.loanId(),
                        res.allocatedAmount(),
                        res.remainingLoanBalance(),
                        res.installmentsAffectedCount(),
                        collectorName,
                        cmbMethod.getValue(),
                        companyName,
                        item.phone()
                );

                if (chkSendWhatsApp.isSelected()) {
                    String msg = WhatsAppReceiptUtil.generatePaymentReceiptMessage(
                            companyName,
                            res.paymentId(),
                            item.fullName(),
                            item.documentNumber(),
                            res.allocatedAmount(),
                            res.remainingLoanBalance(),
                            res.installmentsAffectedCount(),
                            cmbMethod.getValue(),
                            collectorName,
                            LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
                    );
                    WhatsAppReceiptUtil.sendViaWhatsApp(item.phone(), msg);
                }

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

        root.getChildren().addAll(title, infoCard, lblAmount, txtAmount, shortcuts, lblMethod, cmbMethod, chkSendWhatsApp, lblFeedback, actions);

        Scene scene = new Scene(root);
        var theme = PaymentDialog.class.getResource("/ui/theme.css");
        if (theme != null) scene.getStylesheets().add(theme.toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }

    static BigDecimal parseAmount(String input) {
        return CurrencyInputUtil.parseRequiredAmount(input);
    }
}
