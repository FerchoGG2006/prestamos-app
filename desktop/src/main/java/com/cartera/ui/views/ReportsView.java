package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.InstallmentRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.persistence.repository.PaymentRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.reports.application.ExcelReportExporter;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * Vista unificada de Informes y Auditoría del Negocio con exportación ejecutiva a Excel (.xlsx).
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
    private final ExcelReportExporter excelReportExporter;
    private final Stage ownerStage;
    private AppUserRepository appUserRepository;

    public void setAppUserRepository(AppUserRepository appUserRepository) {
        this.appUserRepository = appUserRepository;
        if (auditLogRepository != null) {
            auditView = new AuditView(auditLogRepository, appUserRepository, true);
        }
    }

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
            BigDecimal principal,
            BigDecimal totalAgreed,
            BigDecimal paidAmount,
            BigDecimal balance,
            String status
    ) {}

    private final ObservableList<LoanReportItem> reportItems = FXCollections.observableArrayList();
    private final TableView<LoanReportItem> table = new TableView<>();

    public ReportsView(LoanRepository loanRepository,
                       InstallmentRepository installmentRepository,
                       PaymentRepository paymentRepository,
                       CustomerRepository customerRepository) {
        this(loanRepository, installmentRepository, paymentRepository, customerRepository, null, null, null);
    }

    public ReportsView(LoanRepository loanRepository,
                       InstallmentRepository installmentRepository,
                       PaymentRepository paymentRepository,
                       CustomerRepository customerRepository,
                       AuditLogRepository auditLogRepository) {
        this(loanRepository, installmentRepository, paymentRepository, customerRepository, auditLogRepository, null, null);
    }

    public ReportsView(LoanRepository loanRepository,
                       InstallmentRepository installmentRepository,
                       PaymentRepository paymentRepository,
                       CustomerRepository customerRepository,
                       AuditLogRepository auditLogRepository,
                       ExcelReportExporter excelReportExporter,
                       Stage ownerStage) {
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.customerRepository = customerRepository;
        this.auditLogRepository = auditLogRepository;
        this.excelReportExporter = excelReportExporter != null
                ? excelReportExporter
                : new ExcelReportExporter(loanRepository, installmentRepository, paymentRepository, customerRepository, null, null, null);
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildContentArea();
    }

    private void buildHeader() {
        HBox top = new HBox(14);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Informes y Auditoría");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Consolidado general de rentabilidad, colocación, exportación contable en Excel y auditoría");
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

        Button btnExportExcel = new Button("Exportar Reporte Contable en Excel (.xlsx)");
        btnExportExcel.setStyle("-fx-background-color: #15803d; -fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 12px; -fx-padding: 8 14; -fx-background-radius: 8; -fx-cursor: hand;");
        btnExportExcel.setOnAction(e -> exportExcelReport());

        Button btnRefresh = new Button("Actualizar");
        btnRefresh.getStyleClass().add("btn-secondary");
        btnRefresh.setOnAction(e -> refresh());

        top.getChildren().addAll(titleBox, segmentBar, btnExportExcel, btnRefresh);
        getChildren().add(top);
    }

    private void exportExcelReport() {
        try {
            FileChooser chooser = new FileChooser();
            chooser.setTitle("Exportar Libro Contable en Excel (.xlsx)");
            chooser.setInitialFileName("Reporte_Contable_Cartera_" + LocalDate.now() + ".xlsx");
            chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Libro de Excel (*.xlsx)", "*.xlsx"));

            File dest = chooser.showSaveDialog(ownerStage);
            if (dest != null) {
                Path targetPath = dest.toPath();
                if (!targetPath.getFileName().toString().toLowerCase().endsWith(".xlsx")) {
                    targetPath = targetPath.resolveSibling(targetPath.getFileName() + ".xlsx");
                }
                String activeRoute = UserSessionContext.getSelectedRouteId();
                Path savedPath = excelReportExporter.exportAccountingWorkbook(targetPath, activeRoute);
                Alert ok = new Alert(Alert.AlertType.INFORMATION);
                if (ownerStage != null) ok.initOwner(ownerStage);
                ok.setTitle("Exportación Contable Completada");
                ok.setHeaderText("Libro Excel (.xlsx) generado con éxito");
                ok.setContentText(
                        "Archivo guardado en:\n" + savedPath.toAbsolutePath() + "\n\n" +
                        "Hojas incluidas:\n" +
                        "1. Resumen Ejecutivo (KPIs)\n" +
                        "2. Cartera Activa y Contratos\n" +
                        "3. Cartera en Mora\n" +
                        "4. Historial de Cobros\n" +
                        "5. Libro Diario de Caja"
                );
                ok.showAndWait();

                final File fileToOpen = savedPath.toFile();
                Thread opener = new Thread(() -> {
                    try {
                        if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.OPEN)) {
                            Desktop.getDesktop().open(fileToOpen);
                        }
                    } catch (Exception openEx) {
                        javafx.application.Platform.runLater(() -> {
                            Alert warn = new Alert(Alert.AlertType.WARNING,
                                    "El archivo Excel se guardó correctamente, pero no se pudo abrir automáticamente: " + openEx.getMessage());
                            if (ownerStage != null) warn.initOwner(ownerStage);
                            warn.showAndWait();
                        });
                    }
                }, "kredia-open-excel");
                opener.setDaemon(true);
                opener.start();
            }
        } catch (Exception ex) {
            Alert err = new Alert(Alert.AlertType.ERROR, "Error al exportar a Excel: " + ex.getMessage());
            if (ownerStage != null) err.initOwner(ownerStage);
            err.showAndWait();
        }
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
            auditView = new AuditView(auditLogRepository, appUserRepository, true);
        } else if (btnTabAudit != null) {
            btnTabAudit.setVisible(false);
            btnTabAudit.setManaged(false);
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
                createMetricCard("Total Cobrado Histórico", lblTotalCollected),
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
        title.setStyle("-fx-text-fill: #64748b; -fx-font-size: 13px; -fx-font-weight: bold; -fx-padding: 14 16 8 16;");

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<LoanReportItem, String> colCust = new TableColumn<>("CLIENTE");
        colCust.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().customerName()));
        colCust.setPrefWidth(180);

        TableColumn<LoanReportItem, BigDecimal> colPrin = createMoneyCol("CAPITAL", LoanReportItem::principal);
        TableColumn<LoanReportItem, BigDecimal> colTot = createMoneyCol("TOTAL PACTADO", LoanReportItem::totalAgreed);
        TableColumn<LoanReportItem, BigDecimal> colPaid = createMoneyCol("TOTAL ABONADO", LoanReportItem::paidAmount);
        TableColumn<LoanReportItem, BigDecimal> colBal = createMoneyCol("SALDO RESTANTE", LoanReportItem::balance);

        TableColumn<LoanReportItem, String> colSt = new TableColumn<>("ESTADO");
        colSt.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().status() != null ? d.getValue().status() : ""));
        colSt.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String statusVal, boolean empty) {
                super.updateItem(statusVal, empty);
                if (empty || statusVal == null) {
                    setText(null);
                    setGraphic(null);
                } else {
                    String st = statusVal.toUpperCase();
                    Label badge = new Label(st);
                    if (st.contains("FINALIZADO") || st.contains("COMPLETADO") || st.contains("PAGADO") || st.contains("CANCELADO")) {
                        badge.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #2563eb; -fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else if (st.contains("RENOVADO")) {
                        badge.setStyle("-fx-background-color: #eef2ff; -fx-text-fill: #4338ca; -fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else if (st.contains("ACTIVO")) {
                        badge.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #059669; -fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else if (st.contains("ANULADO")) {
                        badge.setStyle("-fx-background-color: #fef2f2; -fx-text-fill: #991b1b; -fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else if (st.contains("MORA")) {
                        badge.setStyle("-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else {
                        badge.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #64748b; -fx-padding: 3 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colSt.setPrefWidth(120);

        table.setPlaceholder(com.cartera.ui.util.UiLabels.emptyState("Sin datos de cartera", "No hay créditos registrados bajo el criterio o ruta seleccionada."));
        table.getColumns().addAll(colCust, colPrin, colTot, colPaid, colBal, colSt);
        table.setItems(reportItems);

        tableCard.getChildren().addAll(title, table);
        return tableCard;
    }

    private TableColumn<LoanReportItem, BigDecimal> createMoneyCol(String title, java.util.function.Function<LoanReportItem, BigDecimal> extractor) {
        TableColumn<LoanReportItem, BigDecimal> col = new TableColumn<>(title);
        col.setCellValueFactory(d -> new SimpleObjectProperty<>(extractor.apply(d.getValue())));
        col.setCellFactory(c -> new TableCell<>() {
            @Override protected void updateItem(BigDecimal val, boolean empty) {
                super.updateItem(val, empty);
                setText(empty || val == null ? null : CURRENCY.format(val));
            }
        });
        col.setPrefWidth(120);
        return col;
    }

    public void refresh() {
        String selectedRoute = UserSessionContext.getSelectedRouteId();
        boolean filterRoute = selectedRoute != null && !"ALL".equalsIgnoreCase(selectedRoute);

        List<LoanEntity> loans = loanRepository.findAll().stream()
                .filter(l -> !filterRoute || selectedRoute.equalsIgnoreCase(l.getRouteId()))
                .toList();
        var filteredLoanIds = loans.stream().map(LoanEntity::getId).collect(java.util.stream.Collectors.toSet());
        var activeLoanIds = loans.stream()
                .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                .map(LoanEntity::getId)
                .collect(java.util.stream.Collectors.toSet());
        var instByLoan = installmentRepository.findAll().stream()
                .filter(i -> filteredLoanIds.contains(i.getLoanId()))
                .collect(java.util.stream.Collectors.groupingBy(InstallmentEntity::getLoanId));
        List<PaymentEntity> payments = paymentRepository.findAll().stream()
                .filter(p -> filteredLoanIds.contains(p.getLoanId()))
                .toList();
        var customerMap = customerRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(CustomerEntity::getId, CustomerEntity::getFullName, (a, b) -> a));

        BigDecimal totalPrincipal = loans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus()))
                .map(LoanEntity::getPrincipal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalInterest = loans.stream()
                .filter(l -> !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus()))
                .map(LoanEntity::getInterestAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCollected = payments.stream()
                .filter(p -> "APLICADO".equalsIgnoreCase(p.getStatus()) || "REGISTRADO".equalsIgnoreCase(p.getStatus()))
                .map(PaymentEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String todayStr = LocalDate.now().toString();
        BigDecimal totalOverdue = instByLoan.entrySet().stream()
                .filter(e -> activeLoanIds.contains(e.getKey()))
                .flatMap(e -> e.getValue().stream())
                .filter(i -> !"ANULADA".equalsIgnoreCase(i.getStatus()))
                .filter(i -> i.getPendingAmount() != null && i.getPendingAmount().compareTo(BigDecimal.ZERO) > 0)
                .filter(i -> i.getDueDate() != null && i.getDueDate().compareTo(todayStr) < 0)
                .map(InstallmentEntity::getPendingAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        lblTotalPrincipal.setText(CURRENCY.format(totalPrincipal));
        lblTotalInterest.setText(CURRENCY.format(totalInterest));
        lblTotalCollected.setText(CURRENCY.format(totalCollected));
        lblTotalOverdue.setText(CURRENCY.format(totalOverdue));

        var items = loans.stream().map(l -> {
            String cName = customerMap.getOrDefault(l.getCustomerId(), "Cliente #" + l.getCustomerId());
            boolean isCancelled = "ANULADO".equalsIgnoreCase(l.getStatus()) || "CANCELLED".equalsIgnoreCase(l.getStatus());
            BigDecimal paid = isCancelled
                    ? BigDecimal.ZERO
                    : instByLoan.getOrDefault(l.getId(), List.of()).stream()
                            .filter(i -> !"ANULADA".equalsIgnoreCase(i.getStatus()))
                            .map(i -> i.getPaidAmount() != null ? i.getPaidAmount() : BigDecimal.ZERO)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal balance = isCancelled
                    ? BigDecimal.ZERO
                    : l.getTotalAgreed().subtract(paid).max(BigDecimal.ZERO);

            return new LoanReportItem(
                    l.getId(),
                    cName,
                    l.getPrincipal() != null ? l.getPrincipal() : BigDecimal.ZERO,
                    l.getTotalAgreed() != null ? l.getTotalAgreed() : BigDecimal.ZERO,
                    paid,
                    balance,
                    l.getStatus()
            );
        }).toList();

        reportItems.setAll(items);
        if (auditView != null) {
            auditView.refresh();
        }
    }
}
