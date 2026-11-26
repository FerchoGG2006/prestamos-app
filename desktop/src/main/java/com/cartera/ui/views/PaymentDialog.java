package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.RecordPaymentUseCase.RecordPaymentCommand;
import com.cartera.receipts.application.OfficialReceiptService;
import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;
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
        show(parentStage, item, useCase, null, null, onFinished);
    }

    public static void show(Stage parentStage,
                            CollectionItem item,
                            RecordPaymentUseCase useCase,
                            SystemSettingRepository settingRepository,
                            Consumer<Boolean> onFinished) {
        show(parentStage, item, useCase, settingRepository, null, onFinished);
    }

    public static void show(Stage parentStage,
                            CollectionItem item,
                            RecordPaymentUseCase useCase,
                            SystemSettingRepository settingRepository,
                            LoanRepository loanRepository,
                            Consumer<Boolean> onFinished) {
        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(parentStage);
        dialog.setTitle("Registrar Cobro - " + item.fullName());

        // Una sola clave por apertura del diálogo: reintentar tras un fallo no puede duplicar el cobro.
        final String idempotencyKey = UUID.randomUUID().toString();

        BigDecimal loanBalance = item.loanBalance() != null ? item.loanBalance().max(BigDecimal.ZERO) : BigDecimal.ZERO;
        BigDecimal installmentPending = item.installmentPending() != null ? item.installmentPending().max(BigDecimal.ZERO) : BigDecimal.ZERO;
        BigDecimal installmentAmount = item.installmentAmount() != null ? item.installmentAmount().max(BigDecimal.ZERO) : BigDecimal.ZERO;

        // Para "Abonar +" (cuando hoy ya está pago), precargar el valor de la siguiente cuota o el saldo restante (nunca 0)
        BigDecimal suggestedAmount;
        if (installmentPending.compareTo(BigDecimal.ZERO) > 0) {
            suggestedAmount = installmentPending.min(loanBalance);
        } else if (installmentAmount.compareTo(BigDecimal.ZERO) > 0) {
            suggestedAmount = installmentAmount.min(loanBalance);
        } else {
            suggestedAmount = loanBalance;
        }

        VBox root = new VBox(16);
        root.setStyle("-fx-background-color: #ffffff; -fx-padding: 24;");
        root.setPrefWidth(500);

        Label title = new Label(item.isPaidToday() ? "Registrar Abono Adicional" : "Registrar Cobro");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");

        // Info Card
        VBox infoCard = new VBox(6);
        infoCard.setStyle("-fx-background-color: #f8fafc; -fx-padding: 14; -fx-background-radius: 8; -fx-border-color: #e2e8f0; -fx-border-radius: 8;");
        Label lblName = new Label("Cliente: " + item.fullName() + " (" + item.documentNumber() + ")");
        lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-weight: bold; -fx-font-size: 14px;");
        Label lblAddress = new Label("Dirección: " + item.address() + " - " + item.neighborhood());
        lblAddress.setStyle("-fx-text-fill: #64748b;");
        Label lblLoan = new Label("Saldo total crédito: " + CURRENCY.format(loanBalance));
        lblLoan.setStyle("-fx-text-fill: #2563eb; -fx-font-weight: bold;");
        String cuotaText = installmentPending.compareTo(BigDecimal.ZERO) > 0
                ? "Cuota #" + item.installmentNumber() + " pendiente: " + CURRENCY.format(installmentPending)
                : "Cuota de hoy cubierta · Valor cuota sugerida: " + CURRENCY.format(suggestedAmount);
        Label lblCuota = new Label(cuotaText);
        lblCuota.setStyle("-fx-text-fill: #d97706; -fx-font-weight: bold;");
        infoCard.getChildren().addAll(lblName, lblAddress, lblLoan, lblCuota);

        // Input monto
        Label lblAmount = new Label("Monto a registrar ($):");
        lblAmount.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold;");

        TextField txtAmount = new TextField(suggestedAmount.toPlainString());
        txtAmount.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #0f172a; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-padding: 10; -fx-font-size: 16px; -fx-font-weight: bold;");

        // Botones de atajo (con tope en el saldo real del crédito)
        HBox shortcuts = new HBox(8);
        Button btnExact = new Button("Cuota (" + CURRENCY.format(suggestedAmount) + ")");
        btnExact.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand;");
        btnExact.setOnAction(e -> txtAmount.setText(suggestedAmount.toPlainString()));
        shortcuts.getChildren().add(btnExact);

        BigDecimal twoInstallments = suggestedAmount.multiply(BigDecimal.valueOf(2)).min(loanBalance);
        if (twoInstallments.compareTo(suggestedAmount) > 0) {
            Button btnTwo = new Button("2 Cuotas (" + CURRENCY.format(twoInstallments) + ")");
            btnTwo.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-border-color: #cbd5e1; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand;");
            btnTwo.setOnAction(e -> txtAmount.setText(twoInstallments.toPlainString()));
            shortcuts.getChildren().add(btnTwo);
        }

        if (loanBalance.compareTo(twoInstallments) > 0 || (loanBalance.compareTo(suggestedAmount) > 0 && twoInstallments.compareTo(suggestedAmount) <= 0)) {
            Button btnFull = new Button("Saldo Total (" + CURRENCY.format(loanBalance) + ")");
            btnFull.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-border-color: #bfdbfe; -fx-border-radius: 6; -fx-background-radius: 6; -fx-cursor: hand; -fx-font-weight: bold;");
            btnFull.setOnAction(e -> txtAmount.setText(loanBalance.toPlainString()));
            shortcuts.getChildren().add(btnFull);
        }

        // Método de pago
        Label lblMethod = new Label("Método de pago:");
        lblMethod.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold;");
        ComboBox<String> cmbMethod = new ComboBox<>();
        cmbMethod.getItems().addAll("EFECTIVO", "NEQUI", "TRANSFERENCIA");
        cmbMethod.setValue("EFECTIVO");
        cmbMethod.setMaxWidth(Double.MAX_VALUE);
        cmbMethod.setStyle("-fx-background-color: #ffffff; -fx-border-color: #cbd5e1; -fx-border-radius: 6;");

        CheckBox chkSendWhatsApp = new CheckBox("Enviar recibo digital por WhatsApp automáticamente al confirmar");
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

                boolean isCollector = UserSessionContext.getSession().map(UserSession::isCollector).orElse(false);
                boolean allowPartial = settingRepository == null || settingRepository.findById("route_allow_partial_payments")
                        .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                        .orElse(true);
                BigDecimal minRequired = suggestedAmount.min(loanBalance);
                if (isCollector && !allowPartial && minRequired.compareTo(BigDecimal.ZERO) > 0 && amount.compareTo(minRequired) < 0) {
                    lblFeedback.setText("Los abonos parciales están deshabilitados en Configuración. Debe cobrar mínimo la cuota (" + CURRENCY.format(minRequired) + ").");
                    lblFeedback.setStyle("-fx-text-fill: #dc2626;");
                    return;
                }

                btnConfirm.setDisable(true);
                lblFeedback.setText("Guardando abono de cuota...");
                lblFeedback.setStyle("-fx-text-fill: #2563eb;");

                // Atribuir el pago al cobrador titular del crédito/ruta (no sobreescribir con Admin)
                String collectorId = null;
                if (loanRepository != null) {
                    collectorId = loanRepository.findById(item.loanId())
                            .map(LoanEntity::getCollectorId)
                            .filter(id -> id != null && !id.isBlank())
                            .orElse(null);
                }
                if (collectorId == null || collectorId.isBlank()) {
                    collectorId = UserSessionContext.getSession()
                            .map(UserSession::userId)
                            .orElseThrow(() -> new IllegalStateException("Inicie sesión para registrar cobros."));
                }

                var cmd = new RecordPaymentCommand(
                        item.loanId(),
                        amount,
                        cmbMethod.getValue(),
                        collectorId,
                        LocalDate.now(),
                        idempotencyKey
                );

                var res = useCase.execute(cmd);

                try {
                    String companyName = settingRepository != null
                            ? settingRepository.findById("company_name").map(s -> s.getSettingValue()).orElse("Kredia")
                            : "Kredia";
                    String footerMsg = settingRepository != null
                            ? settingRepository.findById("receipt_footer_message").map(s -> s.getSettingValue()).orElse("")
                            : "";
                    String collectorName = UserSessionContext.getSession()
                            .map(UserSession::fullName)
                            .orElse("Administración Central");
                    String loanShort = item.loanId() != null && item.loanId().length() > 8
                            ? "#" + item.loanId().substring(0, 8).toUpperCase()
                            : (item.loanId() != null ? item.loanId() : "");
                    String instLabel = res.installmentsAffectedCount() > 1
                            ? res.installmentsAffectedCount() + " cuotas"
                            : "Cuota #" + item.installmentNumber();

                    OfficialReceiptModel draftModel = new OfficialReceiptModel(
                            OfficialReceiptService.localCode(res.paymentId()),
                            "PAYMENT",
                            res.paymentId(),
                            companyName,
                            "",
                            item.fullName(),
                            item.documentNumber(),
                            item.phone(),
                            loanShort,
                            res.allocatedAmount(),
                            "APPROVED",
                            OfficialReceiptService.nowDisplay(),
                            "Pago de cuota · " + instLabel,
                            instLabel,
                            installmentAmount,
                            res.remainingLoanBalance().max(BigDecimal.ZERO),
                            cmbMethod.getValue(),
                            null,
                            null,
                            0,
                            "",
                            null,
                            null,
                            null,
                            "",
                            "",
                            collectorName,
                            footerMsg,
                            false
                    );

                    OfficialReceiptModel published = OfficialReceiptService.publishOrFallback(draftModel);

                    if (chkSendWhatsApp.isSelected()) {
                        String msg = WhatsAppReceiptUtil.formatOfficialReceiptWhatsAppMessage(published);
                        WhatsAppReceiptUtil.sendViaWhatsApp(item.phone(), msg);
                    }

                    dialog.close();
                    new ReceiptDialog(published, parentStage).showAndWait();
                } finally {
                    if (onFinished != null) onFinished.accept(true);
                }

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
