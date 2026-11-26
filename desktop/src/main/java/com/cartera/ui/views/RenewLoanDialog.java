package com.cartera.ui.views;

import com.cartera.domain.money.Money;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.domain.LoanCalculator;
import com.cartera.renewals.application.RenewLoanUseCase;
import com.cartera.renewals.application.RenewLoanUseCase.RenewLoanCommand;
import com.cartera.receipts.application.OfficialReceiptService;
import com.cartera.receipts.application.OfficialReceiptService.OfficialReceiptModel;
import com.cartera.ui.util.CurrencyInputUtil;
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
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;

/**
 * Diálogo modal para renovar un crédito activo con deducción de saldo pendiente, cartulina y desembolso neto.
 */
public class RenewLoanDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final LoanEntity currentLoan;
    private final String customerName;
    private final RenewLoanUseCase renewLoanUseCase;
    private final InstallmentRepository installmentRepository;
    private final SystemSettingRepository settingRepository;
    private final Consumer<RenewLoanUseCase.RenewalResult> onSuccess;

    private BigDecimal currentBalance = BigDecimal.ZERO;

    private final TextField txtNewPrincipal = new TextField("400000");
    private final TextField txtInterestPercent = new TextField("20");
    private final TextField txtInstallmentCount = new TextField("24");
    private final ComboBox<String> cmbFrequency = new ComboBox<>();
    private final DatePicker dpStartDate = new DatePicker(LocalDate.now());
    private final Label lblStartDate = new Label("Fecha Inicio *");
    private final HBox boxFixedDateQuick = new HBox(6);

    private final Label lblCurrentBalance = new Label("$ 0");
    private final Label lblPaperworkFee = new Label("$ 0");
    private final Label lblNetCash = new Label("$ 0");
    private final Label lblNewTotal = new Label("$ 0");
    private final Label lblInterest = new Label("$ 0");
    private final Label lblSummaryRoute = new Label();
    private final Label lblCashBefore = new Label(), lblCashAfter = new Label();
    private final Label lblDebtBefore = new Label(), lblDebtAfter = new Label();
    private final Label lblAdminBefore = new Label(), lblAdminAfter = new Label();
    private final Label lblCashWarning = new Label();
    private RenewLoanUseCase.RenewalPreview reviewedPreview;
    private final Label lblFeedback = new Label();
    private final Button btnConfirm = new Button("Revisar y confirmar renovación");

    public RenewLoanDialog(LoanEntity currentLoan,
                           String customerName,
                           RenewLoanUseCase renewLoanUseCase,
                           InstallmentRepository installmentRepository,
                           Stage ownerStage,
                           Consumer<RenewLoanUseCase.RenewalResult> onSuccess) {
        this(currentLoan, customerName, renewLoanUseCase, installmentRepository, null, ownerStage, onSuccess);
    }

    public RenewLoanDialog(LoanEntity currentLoan,
                           String customerName,
                           RenewLoanUseCase renewLoanUseCase,
                           InstallmentRepository installmentRepository,
                           SystemSettingRepository settingRepository,
                           Stage ownerStage,
                           Consumer<RenewLoanUseCase.RenewalResult> onSuccess) {
        this.currentLoan = currentLoan;
        this.customerName = customerName;
        this.renewLoanUseCase = renewLoanUseCase;
        this.installmentRepository = installmentRepository;
        this.settingRepository = settingRepository;
        this.onSuccess = onSuccess;

        if (settingRepository != null) {
            settingRepository.findById("default_interest_percent")
                    .map(s -> s.getSettingValue())
                    .filter(v -> v != null && !v.isBlank())
                    .ifPresent(txtInterestPercent::setText);
        }

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        String shortId = currentLoan.getId().length() > 8 ? currentLoan.getId().substring(0, 8) : currentLoan.getId();
        setTitle("Renovar Crédito #" + shortId);
        setResizable(false);

        calculateCurrentBalance();
        // Sugerir capital nuevo por encima del saldo pendiente actual para no abrir en estado de error
        BigDecimal suggestedPrincipal = currentLoan.getPrincipal() != null ? currentLoan.getPrincipal() : new BigDecimal("400000");
        BigDecimal minimumCover = currentBalance.add(new BigDecimal("100000"));
        if (suggestedPrincipal.compareTo(minimumCover) < 0) {
            suggestedPrincipal = minimumCover;
        }
        txtNewPrincipal.setText(suggestedPrincipal.setScale(0, java.math.RoundingMode.CEILING).toPlainString());
        buildUI();
        recalculateNet();
    }

    private void calculateCurrentBalance() {
        List<InstallmentEntity> list = installmentRepository.findByLoanId(currentLoan.getId());
        currentBalance = list.stream()
                .filter(i -> i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0)
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal computeConfiguredPaperwork(BigDecimal principal) {
        boolean isPaperworkEnabled = settingRepository == null || settingRepository.findById("paperwork_enabled")
                .map(s -> !"false".equalsIgnoreCase(s.getSettingValue()))
                .orElse(true);
        if (!isPaperworkEnabled) {
            return BigDecimal.ZERO;
        }
        BigDecimal feePer100k = new BigDecimal("5000");
        if (settingRepository != null) {
            try {
                String raw = settingRepository.findById("paperwork_fee").map(s -> s.getSettingValue()).orElse("5000");
                BigDecimal parsed = CurrencyInputUtil.parseAmount(raw);
                if (parsed.compareTo(BigDecimal.ZERO) >= 0) {
                    feePer100k = parsed;
                }
            } catch (Exception ignored) {}
        }
        return LoanCalculator.calculatePaperworkFee(new Money(principal), feePer100k).amount();
    }

    private void buildUI() {
        VBox root = new VBox(18);
        root.setPadding(new Insets(24));
        root.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12;");
        root.setPrefWidth(740);

        // Header
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);
        Label icon = new Label("RENOVACIÓN");
        icon.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 6 12; -fx-background-radius: 8; -fx-border-color: #bfdbfe; -fx-border-radius: 8;");
        VBox titleBox = new VBox(2);
        Label title = new Label("Renovación de Crédito");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 18px; -fx-font-weight: bold;");
        Label subtitle = new Label("Cliente: " + customerName);
        subtitle.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 13px; -fx-font-weight: bold;");
        titleBox.getChildren().addAll(title, subtitle);
        header.getChildren().addAll(icon, titleBox);

        // Tarjeta resumen del crédito actual
        HBox balanceCard = new HBox(16);
        balanceCard.getStyleClass().add("table-card");
        balanceCard.setStyle("-fx-background-color: #f8fafc; -fx-background-radius: 10; -fx-border-color: #e2e8f0; -fx-border-radius: 10; -fx-border-width: 1;");
        balanceCard.setPadding(new Insets(14));
        balanceCard.setAlignment(Pos.CENTER_LEFT);

        VBox b1 = new VBox(2, new Label("Saldo Pendiente Anterior") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;"); }}, lblCurrentBalance);
        lblCurrentBalance.setText("- " + CURRENCY.format(currentBalance));
        lblCurrentBalance.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 15px; -fx-font-weight: bold;");

        VBox bPaperwork = new VBox(2, new Label("Cartulina / Papelería") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;"); }}, lblPaperworkFee);
        lblPaperworkFee.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 15px; -fx-font-weight: bold;");

        Region sp = new Region();
        HBox.setHgrow(sp, Priority.ALWAYS);

        VBox b2 = new VBox(2, new Label("Efectivo Neto a Entregar") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;"); }}, lblNetCash);
        lblNetCash.setStyle("-fx-text-fill: #059669; -fx-font-size: 18px; -fx-font-weight: bold;");

        balanceCard.getChildren().addAll(b1, bPaperwork, sp, b2);

        // Formulario
        GridPane grid = new GridPane();
        grid.setHgap(14);
        grid.setVgap(10);

        txtNewPrincipal.getStyleClass().add("search-field");
        txtNewPrincipal.setId("renewal-principal");
        txtInterestPercent.getStyleClass().add("search-field");
        txtInterestPercent.setId("renewal-total-rate");
        txtInstallmentCount.getStyleClass().add("search-field");
        txtInstallmentCount.setId("renewal-installments");
        cmbFrequency.getItems().addAll("DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL", "FECHA FIJA");
        String freq = currentLoan.getFrequency() != null ? currentLoan.getFrequency().trim().toUpperCase() : "DIARIO";
        if ("FECHA_FIJA".equals(freq) || "FIXED_DATE".equals(freq)) freq = "FECHA FIJA";
        if (!cmbFrequency.getItems().contains(freq)) freq = "DIARIO";
        cmbFrequency.setValue(freq);
        cmbFrequency.getStyleClass().add("search-field");
        dpStartDate.getStyleClass().add("search-field");

        txtNewPrincipal.textProperty().addListener((obs, old, val) -> recalculateNet());
        txtInterestPercent.textProperty().addListener((obs, old, val) -> recalculateNet());
        txtInstallmentCount.textProperty().addListener((obs, old, val) -> recalculateNet());
        cmbFrequency.valueProperty().addListener((obs, old, val) -> {
            applyFrequencyUi(val);
            recalculateNet();
        });
        dpStartDate.valueProperty().addListener((obs, old, val) -> recalculateNet());

        setupField(grid, "Nuevo Capital Solicitado ($) *", txtNewPrincipal, 0, 0);
        setupField(grid, "Interés TOTAL del plazo (%) *", txtInterestPercent, 1, 0);
        setupField(grid, "Modalidad *", cmbFrequency, 0, 1);
        setupField(grid, "Cuotas *", txtInstallmentCount, 1, 1);

        lblStartDate.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        for (int days : new int[]{7, 15, 30}) {
            Button btnDays = new Button("+" + days + "d");
            btnDays.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 11px; -fx-padding: 3 8; -fx-background-radius: 6; -fx-cursor: hand;");
            btnDays.setOnAction(e -> dpStartDate.setValue(LocalDate.now().plusDays(days)));
            boxFixedDateQuick.getChildren().add(btnDays);
        }
        VBox boxStartDate = new VBox(4, lblStartDate, dpStartDate, boxFixedDateQuick);
        grid.add(boxStartDate, 0, 2);

        applyFrequencyUi(cmbFrequency.getValue());

        VBox boxTotal = new VBox(4, new Label("Nuevo Total Pactado") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;"); }}, lblNewTotal);
        lblNewTotal.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 15px; -fx-font-weight: bold;");
        grid.add(boxTotal, 1, 2);

        Label rateHelp = new Label("Ejemplo: 20% mensual durante 2 meses = 40% total. El interés se calcula sobre el capital nuevo completo.");
        rateHelp.setWrapText(true);
        Label interestTitle = new Label("Interés nuevo: ");
        HBox interestRow = new HBox(8, interestTitle, lblInterest);
        lblSummaryRoute.setWrapText(true);
        GridPane projection = new GridPane();
        projection.setHgap(24);
        projection.setVgap(10);
        projection.addRow(0, new Label("Indicador de la ruta"), new Label("Antes"), new Label("Después"));
        projection.addRow(1, new Label("Base operativa"), lblCashBefore, lblCashAfter);
        projection.addRow(2, new Label("Cartera en calle"), lblDebtBefore, lblDebtAfter);
        projection.addRow(3, new Label("Administrativo"), lblAdminBefore, lblAdminAfter);
        Label paperworkHelp = new Label("La Base operativa descuenta el neto entregado más la papelería (si está activa). La papelería permanece separada en caja y no suma al Administrativo.");
        paperworkHelp.setWrapText(true);
        Label ledgerHelp = new Label("Base operativa según movimientos físicos registrados; fondos digitales (Nequi/Transferencia) se llevan por separado.");
        ledgerHelp.setWrapText(true);
        lblCashWarning.setWrapText(true);
        lblCashWarning.setStyle("-fx-text-fill: #b45309;");
        VBox summary = new VBox(10, new Label("Resumen antes de confirmar"), lblSummaryRoute,
                interestRow, projection, paperworkHelp, ledgerHelp, lblCashWarning);
        summary.setPadding(new Insets(16));
        summary.getStyleClass().add("table-card");

        // Feedback
        lblFeedback.setWrapText(true);
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        // Acciones
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> close());

        btnConfirm.getStyleClass().add("btn-primary");
        btnConfirm.setOnAction(e -> doRenew());

        actions.getChildren().addAll(btnCancel, btnConfirm);

        root.getChildren().addAll(header, balanceCard, grid, rateHelp, summary, lblFeedback, actions);

        var scroll = new ScrollPane(root);
        scroll.setFitToWidth(true);
        double height = Math.min(780, javafx.stage.Screen.getPrimary().getVisualBounds().getHeight() - 100);
        var scene = new Scene(scroll, 770, height);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private void applyFrequencyUi(String freq) {
        boolean isFixed = "FECHA FIJA".equalsIgnoreCase(freq) || "FECHA_FIJA".equalsIgnoreCase(freq) || "FIXED_DATE".equalsIgnoreCase(freq);
        if (isFixed) {
            txtInstallmentCount.setText("1");
            txtInstallmentCount.setDisable(true);
            lblStartDate.setText("Fecha Fija de Pago Único *");
            boxFixedDateQuick.setVisible(true);
            boxFixedDateQuick.setManaged(true);
            if (dpStartDate.getValue() == null || dpStartDate.getValue().equals(LocalDate.now())) {
                dpStartDate.setValue(LocalDate.now().plusDays(7));
            }
        } else {
            txtInstallmentCount.setDisable(false);
            if ("1".equals(txtInstallmentCount.getText().trim())) {
                String defaultCount = switch (freq != null ? freq.trim().toUpperCase() : "DIARIO") {
                    case "SEMANAL" -> "4";
                    case "QUINCENAL" -> "2";
                    case "MENSUAL" -> "1";
                    default -> "30";
                };
                txtInstallmentCount.setText(defaultCount);
            }
            lblStartDate.setText("Fecha Inicio *");
            boxFixedDateQuick.setVisible(false);
            boxFixedDateQuick.setManaged(false);
        }
    }

    private void setupField(GridPane grid, String label, javafx.scene.Node field, int col, int row) {
        VBox box = new VBox(4);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        box.getChildren().addAll(l, field);
        grid.add(box, col, row);
    }

    private void recalculateNet() {
        reviewedPreview = null;
        btnConfirm.setDisable(true);
        try {
            var preview = renewLoanUseCase.preview(buildCommand());
            var quote = preview.quote();
            currentBalance = quote.priorBalanceDeducted().amount();
            lblCurrentBalance.setText("- " + CURRENCY.format(currentBalance));
            BigDecimal paperworkFee = quote.paperworkDeducted().amount();
            lblPaperworkFee.setText(paperworkFee.compareTo(BigDecimal.ZERO) > 0 ? "- " + CURRENCY.format(paperworkFee) : "$ 0");
            BigDecimal netCash = quote.actualCashDisbursed().amount();
            lblNetCash.setText(CURRENCY.format(netCash));
            lblNewTotal.setText(CURRENCY.format(quote.totalAgreed().amount()));
            lblInterest.setText(CURRENCY.format(quote.interest().amount()));
            lblSummaryRoute.setText("Alcance: ruta " + preview.routeId() + " (incluye sus otros créditos)");
            lblCashBefore.setText(CURRENCY.format(quote.cashBefore().amount()));
            lblCashAfter.setText(CURRENCY.format(quote.cashAfter().amount()));
            lblDebtBefore.setText(CURRENCY.format(quote.debtBefore().amount()));
            lblDebtAfter.setText(CURRENCY.format(quote.debtAfter().amount()));
            lblAdminBefore.setText(CURRENCY.format(quote.administrativeBefore().amount()));
            lblAdminAfter.setText(CURRENCY.format(quote.administrativeAfter().amount()));
            lblCashWarning.setText(quote.cashAfter().isNegative()
                    ? "Atención: la Base proyectada es negativa. Revise los fondos antes de entregar dinero." : "");
            lblFeedback.setVisible(false);
            lblFeedback.setManaged(false);
            reviewedPreview = preview;
            btnConfirm.setDisable(false);
        } catch (Exception ex) {
            lblNetCash.setText("—");
            lblPaperworkFee.setText("—");
            lblCashWarning.setText("");
            lblNewTotal.setText("—");
            lblInterest.setText("—");
            for (Label label : List.of(lblCashBefore, lblCashAfter, lblDebtBefore, lblDebtAfter, lblAdminBefore, lblAdminAfter)) {
                label.setText("—");
            }
            showFeedback(ex.getMessage() == null ? "Revise los datos ingresados." : ex.getMessage());
        }
    }

    private RenewLoanCommand buildCommand() {
        BigDecimal principal = parseAmount(txtNewPrincipal.getText());
        BigDecimal ratePct = new BigDecimal(txtInterestPercent.getText().trim().replace(',', '.'));
        BigDecimal rate = ratePct.movePointLeft(2);
        BigDecimal total = new Money(principal).add(new Money(principal).multiply(rate)).amount();
        return new RenewLoanCommand(currentLoan.getId(), principal, rate, total,
                Integer.parseInt(txtInstallmentCount.getText().trim()), cmbFrequency.getValue(), dpStartDate.getValue(),
                computeConfiguredPaperwork(principal), UserSessionContext.requireSession().userId());
    }

    private void showFeedback(String message) {
        lblFeedback.setText(message);
        lblFeedback.setStyle("-fx-text-fill: #b91c1c; -fx-background-color: #fef2f2; -fx-padding: 6 10;");
        lblFeedback.setVisible(true);
        lblFeedback.setManaged(true);
    }

    private void doRenew() {
        if (reviewedPreview == null) return;
        var expected = reviewedPreview;
        RenewLoanUseCase.RenewalResult result;
        try {
            var cmd = buildCommand().withPreview(expected);
            var q = expected.quote();
            Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
            confirm.initOwner(this);
            confirm.setTitle("Confirmar renovación");
            confirm.setHeaderText("Revisar renovación de " + customerName);
            confirm.setContentText("Ruta: " + expected.routeId()
                    + "\nCapital nuevo: " + CURRENCY.format(q.newPrincipal().amount())
                    + "\nSaldo anterior compensado: " + CURRENCY.format(q.priorBalanceDeducted().amount())
                    + "\nPapelería: " + CURRENCY.format(q.paperworkDeducted().amount())
                    + "\nInterés nuevo: " + CURRENCY.format(q.interest().amount())
                    + "\nNeto a entregar: " + CURRENCY.format(q.actualCashDisbursed().amount())
                    + "\nNueva deuda: " + CURRENCY.format(q.totalAgreed().amount())
                    + "\nBase después: " + CURRENCY.format(q.cashAfter().amount())
                    + "\nCartera después: " + CURRENCY.format(q.debtAfter().amount())
                    + "\nAdministrativo después: " + CURRENCY.format(q.administrativeAfter().amount()));
            if (confirm.showAndWait().filter(ButtonType.OK::equals).isEmpty()) return;
            btnConfirm.setDisable(true);
            result = renewLoanUseCase.execute(cmd);
        } catch (Exception ex) {
            recalculateNet();
            showFeedback("No se registró la renovación: " + ex.getMessage());
            return;
        }
        Stage parentOwner = (getOwner() instanceof Stage s) ? s : null;
        close();
        if (onSuccess != null) onSuccess.accept(result);

        try {
            var q = expected.quote();
            String companyName = settingRepository != null
                    ? settingRepository.findById("company_name").map(s -> s.getSettingValue()).orElse("Kredia")
                    : "Kredia";
            String footerMsg = settingRepository != null
                    ? settingRepository.findById("receipt_footer_message").map(s -> s.getSettingValue()).orElse("")
                    : "";
            int instCount = Math.max(1, Integer.parseInt(txtInstallmentCount.getText().trim()));
            String freqLabel = OfficialReceiptService.normalizeFrequencyLabel(cmbFrequency.getValue());
            boolean isFixed = "Fecha Fija".equalsIgnoreCase(freqLabel);
            BigDecimal instAmt = q.totalAgreed().amount().divide(BigDecimal.valueOf(instCount), 0, java.math.RoundingMode.HALF_UP);
            String newLoanShort = result.newLoanId() != null && result.newLoanId().length() > 8
                    ? "#" + result.newLoanId().substring(0, 8).toUpperCase()
                    : (result.newLoanId() != null ? result.newLoanId() : "");

            OfficialReceiptModel renDraft = new OfficialReceiptModel(
                    OfficialReceiptService.localCode(result.newLoanId()),
                    "RENEWAL",
                    result.newLoanId() != null ? result.newLoanId() : ("ren-" + currentLoan.getId()),
                    companyName,
                    expected.routeId() != null ? expected.routeId() : "",
                    customerName,
                    "",
                    "",
                    newLoanShort,
                    q.actualCashDisbursed().amount(),
                    "APPROVED",
                    OfficialReceiptService.nowDisplay(),
                    isFixed ? "Renovación · Fecha fija" : "Renovación · " + instCount + " cuotas (" + freqLabel + ")",
                    "",
                    instAmt,
                    q.totalAgreed().amount(),
                    "EFECTIVO",
                    q.newPrincipal().amount(),
                    q.totalAgreed().amount(),
                    instCount,
                    freqLabel,
                    q.paperworkDeducted().amount(),
                    q.actualCashDisbursed().amount(),
                    q.priorBalanceDeducted().amount(),
                    "",
                    isFixed && dpStartDate.getValue() != null ? dpStartDate.getValue().toString() : "",
                    UserSessionContext.getSession().map(s -> s.fullName()).orElse("Oficina"),
                    footerMsg,
                    false
            );
            OfficialReceiptModel published = OfficialReceiptService.publishOrFallback(renDraft);
            new ReceiptDialog(published, parentOwner).showAndWait();
        } catch (Exception ignored) {}
    }

    private static BigDecimal parseAmount(String text) {
        return CurrencyInputUtil.parseAmount(text);
    }
}
