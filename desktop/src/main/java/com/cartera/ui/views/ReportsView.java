package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * Vista unificada de Informes y Auditoría del Negocio.
 */
public class ReportsView extends VBox {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final CustomerRepository customerRepository;
    private final AuditLogRepository auditLogRepository;

    private AuditView auditView;
    private StackPane contentArea;
    private VBox reportsContainer;
    private Button btnTabReports;
    private Button btnTabAudit;

    private final Label lblTotalPrincipal = new Label("$ 0");
    private final Label lblTotalInterest = new Label("$ 0");
    private final Label lblTotalCollected = new Label("$ 0");
    private final Label lblTotalOverdue = new Label("$ 0");

    public record LoanReportItem(
            String loanId,
            String customerName,
            String principal,
            String totalAgreed,
            String paidAmount,
            String balance,
            String status
    ) {}

    private final ObservableList<LoanReportItem> reportItems = FXCollections.observableArrayList();
    private final TableView<LoanReportItem> table = new TableView<>();

    public ReportsView(LoanRepository loanRepository,
                       InstallmentRepository installmentRepository,
                       PaymentRepository paymentRepository,
                       CustomerRepository customerRepository) {
        this(loanRepository, installmentRepository, paymentRepository, customerRepository, null);
    }

    public ReportsView(LoanRepository loanRepository,
                       InstallmentRepository installmentRepository,
                       PaymentRepository paymentRepository,
                       CustomerRepository customerRepository,
                       AuditLogRepository auditLogRepository) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.customerRepository = customerRepository;
        this.auditLogRepository = auditLogRepository;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #0f172a;");

        buildHeader();
        buildContentArea();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(16);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Informes y Auditoría");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Consolidado general de rentabilidad, colocación y auditoría de transacciones");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        // Segmented Control
        HBox segmentBar = new HBox(4);
        segmentBar.getStyleClass().add("segment-bar");
        segmentBar.setAlignment(Pos.CENTER);

        btnTabReports = new Button("Métricas y Rentabilidad");
        btnTabReports.getStyleClass().addAll("segment-btn", "segment-btn-active");
        btnTabReports.setOnAction(e -> showSection("reports"));

        btnTabAudit = new Button("Auditoría del Sistema");
        btnTabAudit.getStyleClass().add("segment-btn");
        btnTabAudit.setOnAction(e -> showSection("audit"));

        segmentBar.getChildren().addAll(btnTabReports, btnTabAudit);

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, segmentBar, btnRefresh);
        getChildren().add(top);
    }

    public void showSection(String section) {
        btnTabReports.getStyleClass().remove("segment-btn-active");
        btnTabAudit.getStyleClass().remove("segment-btn-active");

        if ("audit".equalsIgnoreCase(section)) {
            btnTabAudit.getStyleClass().add("segment-btn-active");
            if (auditView != null) {
                auditView.refresh();
                contentArea.getChildren().setAll(auditView);
            }
        } else {
            btnTabReports.getStyleClass().add("segment-btn-active");
            contentArea.getChildren().setAll(reportsContainer);
        }
    }

    private void buildContentArea() {
        contentArea = new StackPane();
        VBox.setVgrow(contentArea, Priority.ALWAYS);

        reportsContainer = new VBox(18);
        VBox.setVgrow(reportsContainer, Priority.ALWAYS);
        reportsContainer.getChildren().addAll(buildMetrics(), buildTableCard());

        if (auditLogRepository != null) {
            auditView = new AuditView(auditLogRepository);
            auditView.setPadding(new Insets(0));
        }

        contentArea.getChildren().setAll(reportsContainer);
        getChildren().add(contentArea);
    }

    private HBox buildMetrics() {
        HBox metrics = new HBox(16);

        lblTotalPrincipal.getStyleClass().add("metric-value");
        lblTotalInterest.getStyleClass().add("metric-value");
        lblTotalCollected.getStyleClass().add("metric-value-green");
        lblTotalOverdue.getStyleClass().add("metric-value-red");

        metrics.getChildren().addAll(
                createMetricCard("Capital Total Colocado", lblTotalPrincipal),
                createMetricCard("Intereses Proyectados", lblTotalInterest),
                createMetricCard("Recaudo Total Histórico", lblTotalCollected),
                createMetricCard("Cuotas Vencidas / Riesgo", lblTotalOverdue)
        );
        return metrics;
    }

    private VBox createMetricCard(String title, Label val) {
        VBox card = new VBox(6);
        card.getStyleClass().add("metric-card");
        HBox.setHgrow(card, Priority.ALWAYS);
        Label lbl = new Label(title);
        lbl.getStyleClass().add("muted");
        card.getChildren().addAll(lbl, val);
        return card;
    }

    @SuppressWarnings("unchecked")
    private VBox buildTableCard() {
        VBox tableCard = new VBox();
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        Label title = new Label("Consolidado por Crédito");
        title.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 13px; -fx-font-weight: bold; -fx-padding: 14 16 8 16;");

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<LoanReportItem, String> colCust = new TableColumn<>("CLIENTE");
        colCust.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().customerName()));
        colCust.setPrefWidth(180);

        TableColumn<LoanReportItem, String> colPrin = new TableColumn<>("CAPITAL");
        colPrin.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().principal()));
        colPrin.setPrefWidth(120);

        TableColumn<LoanReportItem, String> colTot = new TableColumn<>("TOTAL PACTADO");
        colTot.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().totalAgreed()));
        colTot.setPrefWidth(120);

        TableColumn<LoanReportItem, String> colPaid = new TableColumn<>("TOTAL ABONADO");
        colPaid.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().paidAmount()));
        colPaid.setPrefWidth(120);

        TableColumn<LoanReportItem, String> colBal = new TableColumn<>("SALDO RESTANTE");
        colBal.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().balance()));
        colBal.setPrefWidth(120);

        TableColumn<LoanReportItem, String> colSt = new TableColumn<>("ESTADO");
        colSt.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().status()));
        colSt.setPrefWidth(110);

        table.getColumns().addAll(colCust, colPrin, colTot, colPaid, colBal, colSt);
        table.setItems(reportItems);

        tableCard.getChildren().addAll(title, table);
        return tableCard;
    }

    public void refresh() {
        List<LoanEntity> loans = loanRepository.findAll();
        List<InstallmentEntity> installments = installmentRepository.findAll();
        List<PaymentEntity> payments = paymentRepository.findAll();
        var customerMap = customerRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(CustomerEntity::getId, CustomerEntity::getFullName, (a, b) -> a));

        BigDecimal totalPrincipal = loans.stream().map(LoanEntity::getPrincipal).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalInterest = loans.stream().map(LoanEntity::getInterestAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCollected = payments.stream()
                .filter(p -> "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String todayStr = LocalDate.now().toString();
        BigDecimal totalOverdue = installments.stream()
                .filter(i -> "PENDIENTE".equalsIgnoreCase(i.getStatus()))
                .filter(i -> i.getDueDate().compareTo(todayStr) < 0)
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblTotalPrincipal.setText(CURRENCY.format(totalPrincipal));
        lblTotalInterest.setText(CURRENCY.format(totalInterest));
        lblTotalCollected.setText(CURRENCY.format(totalCollected));
        lblTotalOverdue.setText(CURRENCY.format(totalOverdue));

        // Construir filas de reporte
        var items = loans.stream().map(l -> {
            String cName = customerMap.getOrDefault(l.getCustomerId(), "Cliente #" + l.getCustomerId());
            BigDecimal paid = installments.stream()
                    .filter(i -> l.getId().equals(i.getLoanId()))
                    .map(i -> i.getPaidAmount() != null ? i.getPaidAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal balance = l.getTotalAgreed().subtract(paid);

            return new LoanReportItem(
                    l.getId(),
                    cName,
                    CURRENCY.format(l.getPrincipal()),
                    CURRENCY.format(l.getTotalAgreed()),
                    CURRENCY.format(paid),
                    CURRENCY.format(balance),
                    l.getStatus()
            );
        }).toList();

        reportItems.setAll(items);
        if (auditView != null) {
            auditView.refresh();
        }
    }
}
