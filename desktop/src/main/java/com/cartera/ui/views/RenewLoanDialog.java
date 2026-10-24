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
import com.cartera.ui.util.CurrencyInputUtil;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

    private final Label lblCurrentBalance = new Label("$ 0");
    private final Label lblPaperworkFee = new Label("$ 0");
    private final Label lblNetCash = new Label("$ 0");
    private final Label lblNewTotal = new Label("$ 0");
    private final Label lblFeedback = new Label();
    private final Button btnConfirm = new Button("Aprobar Renovación");

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
        root.setPrefWidth(540);

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

        VBox b2 = new VBox(2, new Label("💵 Efectivo Neto a Entregar") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;"); }}, lblNetCash);
        lblNetCash.setStyle("-fx-text-fill: #059669; -fx-font-size: 18px; -fx-font-weight: bold;");

        balanceCard.getChildren().addAll(b1, bPaperwork, sp, b2);

        // Formulario
        GridPane grid = new GridPane();
        grid.setHgap(14);
        grid.setVgap(10);

        txtNewPrincipal.getStyleClass().add("search-field");
        txtInterestPercent.getStyleClass().add("search-field");
        txtInstallmentCount.getStyleClass().add("search-field");
        cmbFrequency.getItems().addAll("DIARIO", "SEMANAL", "QUINCENAL", "MENSUAL");
        cmbFrequency.setValue(currentLoan.getFrequency());
        cmbFrequency.getStyleClass().add("search-field");
        dpStartDate.getStyleClass().add("search-field");

        txtNewPrincipal.textProperty().addListener((obs, old, val) -> recalculateNet());
        txtInterestPercent.textProperty().addListener((obs, old, val) -> recalculateNet());
        txtInstallmentCount.textProperty().addListener((obs, old, val) -> recalculateNet());

        setupField(grid, "Nuevo Capital Solicitado ($) *", txtNewPrincipal, 0, 0);
        setupField(grid, "Interés (%) *", txtInterestPercent, 1, 0);
        setupField(grid, "Modalidad *", cmbFrequency, 0, 1);
        setupField(grid, "Cuotas *", txtInstallmentCount, 1, 1);
        setupField(grid, "Fecha Inicio *", dpStartDate, 0, 2);

        VBox boxTotal = new VBox(4, new Label("Nuevo Total Pactado") {{ setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;"); }}, lblNewTotal);
        lblNewTotal.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 15px; -fx-font-weight: bold;");
        grid.add(boxTotal, 1, 2);

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

        root.getChildren().addAll(header, balanceCard, grid, lblFeedback, actions);

        var scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private void setupField(GridPane grid, String label, javafx.scene.Node field, int col, int row) {
        VBox box = new VBox(4);
        Label l = new Label(label);
        l.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px; -fx-font-weight: bold;");
        box.getChildren().addAll(l, field);
        grid.add(box, col, row);
    }

    private void recalculateNet() {
        try {
            BigDecimal principal = parseAmount(txtNewPrincipal.getText());
            BigDecimal ratePct = parseAmount(txtInterestPercent.getText());
            BigDecimal rate = ratePct.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal totalAgreed = principal.add(principal.multiply(rate));

            BigDecimal paperworkFee = computeConfiguredPaperwork(principal);
            lblPaperworkFee.setText(paperworkFee.compareTo(BigDecimal.ZERO) > 0 ? "- " + CURRENCY.format(paperworkFee) : "$ 0");

            BigDecimal netCash = principal.subtract(currentBalance).subtract(paperworkFee);
            lblNetCash.setText(CURRENCY.format(netCash));
            lblNewTotal.setText(CURRENCY.format(totalAgreed));

            if (netCash.compareTo(BigDecimal.ZERO) < 0) {
                lblNetCash.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 18px; -fx-font-weight: bold;");
                btnConfirm.setDisable(true);
            } else {
                lblNetCash.setStyle("-fx-text-fill: #059669; -fx-font-size: 18px; -fx-font-weight: bold;");
                btnConfirm.setDisable(false);
            }
        } catch (Exception ignored) {
            btnConfirm.setDisable(true);
        }
    }

    private void doRenew() {
        try {
            BigDecimal principal = parseAmount(txtNewPrincipal.getText());
            BigDecimal ratePct = parseAmount(txtInterestPercent.getText());
            int count = Integer.parseInt(txtInstallmentCount.getText().trim());
            BigDecimal rate = ratePct.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP);
            BigDecimal totalAgreed = principal.add(principal.multiply(rate));
            LocalDate start = dpStartDate.getValue() != null ? dpStartDate.getValue() : LocalDate.now();
            BigDecimal paperworkFee = computeConfiguredPaperwork(principal);

            String author = UserSessionContext.getSession()
                    .map(com.cartera.infrastructure.security.UserSession::userId)
                    .orElse("admin");

            var cmd = new RenewLoanCommand(
                    currentLoan.getId(),
                    principal,
                    rate,
                    totalAgreed,
                    count,
                    cmbFrequency.getValue(),
                    start,
                    paperworkFee,
                    author
            );

            var res = renewLoanUseCase.execute(cmd);
            if (onSuccess != null) {
                onSuccess.accept(res);
            }
            close();
        } catch (Exception ex) {
            lblFeedback.setText("Error: " + ex.getMessage());
            lblFeedback.setStyle("-fx-text-fill: #b91c1c; -fx-background-color: #fef2f2; -fx-padding: 6 10; -fx-background-radius: 6; -fx-border-color: #fecaca; -fx-border-radius: 6;");
            lblFeedback.setVisible(true);
            lblFeedback.setManaged(true);
        }
    }

    private static BigDecimal parseAmount(String text) {
        return CurrencyInputUtil.parseAmount(text);
    }
}
