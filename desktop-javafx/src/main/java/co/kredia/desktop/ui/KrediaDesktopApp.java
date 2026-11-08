package co.kredia.desktop.ui;

import co.kredia.desktop.domain.DelinquencyCalculator.FactualOverdueObservationalCalculator;
import co.kredia.desktop.domain.FinancialModels.*;
import co.kredia.desktop.service.FinancialLedgerService;
import co.kredia.desktop.sync.OfficeSyncHttpServer;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.Locale;

/**
 * Aplicacion Nativa de Escritorio en JavaFX para Windows (Kredia Oficina Central).
 * Cumple 100% con AGENTS.md:
 * - Interfaz nativa JavaFX (sin React, Electron, Tauri ni WebView).
 * - Valores monetarios en BigDecimal.
 * - Pagos persistidos separadamente de sus PaymentAllocation.
 * - Servidor HTTP de sincronizacion local en puerto 8765 para celulares de ruta.
 */
public class KrediaDesktopApp extends Application {

    private static final int SYNC_PORT = 8765;
    private FinancialLedgerService ledgerService;
    private OfficeSyncHttpServer syncServer;

    private final Label lblAdminCapital = new Label("$0");
    private final Label lblStreetCapital = new Label("$0");
    private final Label lblCashBase = new Label("$0");
    private final Label lblPaperwork = new Label("$0");
    private final Label lblCollectedToday = new Label("$0");
    private final Label lblSyncStatus = new Label("Servidor Local Activo en puerto " + SYNC_PORT);

    private final ObservableList<LoanRecord> loanItems = FXCollections.observableArrayList();
    private final NumberFormat copFormat = NumberFormat.getCurrencyInstance(new Locale("es", "CO"));

    @Override
    public void start(Stage primaryStage) {
        copFormat.setMaximumFractionDigits(0);
        this.ledgerService = new FinancialLedgerService(
                "cartera.db",
                new FactualOverdueObservationalCalculator()
        );

        try {
            this.syncServer = new OfficeSyncHttpServer(SYNC_PORT, ledgerService, () ->
                    Platform.runLater(this::refreshDashboard)
            );
            this.syncServer.start();
        } catch (Exception ex) {
            lblSyncStatus.setText("Puerto " + SYNC_PORT + " en uso o restringido: " + ex.getMessage());
        }

        BorderPane root = new BorderPane();
        root.setPadding(new Insets(16));

        // 1. Encabezado Ejecutivo
        HBox header = new HBox(16);
        header.setAlignment(Pos.CENTER_LEFT);
        header.setPadding(new Insets(0, 0, 14, 0));
        Label title = new Label("Kredia Desktop JavaFX - Consola de Oficina Central");
        title.setStyle("-fx-font-size: 20px; -fx-font-weight: bold;");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Button btnRefresh = new Button("Actualizar Indicadores");
        btnRefresh.setOnAction(e -> refreshDashboard());
        header.getChildren().addAll(title, spacer, lblSyncStatus, btnRefresh);
        root.setTop(header);

        // 2. Tarjetas de Indicadores Financieros (BigDecimal)
        HBox kpiBar = new HBox(12);
        kpiBar.setPadding(new Insets(0, 0, 16, 0));
        kpiBar.getChildren().addAll(
                createKpiCard("Administrativo Total", lblAdminCapital),
                createKpiCard("Cartera en Calle", lblStreetCapital),
                createKpiCard("Base Disponible", lblCashBase),
                createKpiCard("Papeleria Acumulada", lblPaperwork),
                createKpiCard("Pleno Cobrado Hoy", lblCollectedToday)
        );

        // 3. Tabla de Creditos y Taco Digitalizado
        TableView<LoanRecord> table = buildLoansTable();
        VBox.setVgrow(table, Priority.ALWAYS);

        // 4. Panel Lateral de Operaciones (Ingreso del Taco / Nuevo Prestamo / Abono / Liquidacion Inmutable)
        VBox sideForms = buildOperationsPanel();
        sideForms.setPrefWidth(370);

        VBox centerBox = new VBox(10, kpiBar, table);
        HBox.setHgrow(centerBox, Priority.ALWAYS);

        HBox mainSplit = new HBox(16, centerBox, sideForms);
        root.setCenter(mainSplit);

        refreshDashboard();

        Scene scene = new Scene(root, 1220, 720);
        primaryStage.setTitle("Kredia Oficina Central - Aplicacion Nativa JavaFX");
        primaryStage.setScene(scene);
        primaryStage.setOnCloseRequest(evt -> {
            if (syncServer != null) {
                syncServer.stop();
            }
        });
        primaryStage.show();
    }

    private VBox createKpiCard(String caption, Label valueLabel) {
        VBox box = new VBox(4);
        box.setPadding(new Insets(12));
        box.setPrefWidth(210);
        box.setStyle("-fx-border-color: #CBD5E1; -fx-border-radius: 8; -fx-background-color: #F8FAFC; -fx-background-radius: 8;");
        Label lblCaption = new Label(caption);
        lblCaption.setStyle("-fx-font-size: 12px; -fx-text-fill: #475569; -fx-font-weight: bold;");
        valueLabel.setStyle("-fx-font-size: 18px; -fx-text-fill: #0F172A; -fx-font-weight: bold;");
        box.getChildren().addAll(lblCaption, valueLabel);
        return box;
    }

    private TableView<LoanRecord> buildLoansTable() {
        TableView<LoanRecord> table = new TableView<>(loanItems);

        TableColumn<LoanRecord, String> colNum = new TableColumn<>("Credito");
        colNum.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().loanNumber()));
        colNum.setPrefWidth(80);

        TableColumn<LoanRecord, String> colOrigin = new TableColumn<>("Origen");
        colOrigin.setCellValueFactory(d -> new SimpleStringProperty(
                d.getValue().isTacoMigration() ? "Cartulina Taco" : "Nuevo Prestamo"
        ));
        colOrigin.setPrefWidth(120);

        TableColumn<LoanRecord, String> colPrincipal = new TableColumn<>("Capital Base");
        colPrincipal.setCellValueFactory(d -> new SimpleStringProperty(formatMoney(d.getValue().principal())));
        colPrincipal.setPrefWidth(120);

        TableColumn<LoanRecord, String> colTotal = new TableColumn<>("Total Pactado");
        colTotal.setCellValueFactory(d -> new SimpleStringProperty(formatMoney(d.getValue().totalAgreed())));
        colTotal.setPrefWidth(120);

        TableColumn<LoanRecord, String> colPaperwork = new TableColumn<>("Papeleria");
        colPaperwork.setCellValueFactory(d -> new SimpleStringProperty(formatMoney(d.getValue().paperworkFee())));
        colPaperwork.setPrefWidth(100);

        TableColumn<LoanRecord, String> colStatus = new TableColumn<>("Estado");
        colStatus.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().status()));
        colStatus.setPrefWidth(90);

        TableColumn<LoanRecord, String> colNotes = new TableColumn<>("Detalle / Auditoria");
        colNotes.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().notes()));
        colNotes.setPrefWidth(260);

        table.getColumns().addAll(colNum, colOrigin, colPrincipal, colTotal, colPaperwork, colStatus, colNotes);
        return table;
    }

    private VBox buildOperationsPanel() {
        VBox panel = new VBox(12);
        panel.setPadding(new Insets(12));
        panel.setStyle("-fx-border-color: #CBD5E1; -fx-border-radius: 8; -fx-background-color: #FFFFFF; -fx-background-radius: 8;");

        Label section1 = new Label("1. Ingresar Cliente (Taco o Nuevo Prestamo)");
        section1.setStyle("-fx-font-weight: bold; -fx-font-size: 13px;");

        TextField txtName = new TextField();
        txtName.setPromptText("Nombre completo del cliente");
        TextField txtDoc = new TextField();
        txtDoc.setPromptText("Cedula / Documento");
        TextField txtPhone = new TextField();
        txtPhone.setPromptText("Telefono / WhatsApp");
        TextField txtPrincipal = new TextField("200000");
        txtPrincipal.setPromptText("Capital prestado (Ej: 200000)");
        TextField txtInstallments = new TextField("30");
        txtInstallments.setPromptText("Numero de cuotas (Ej: 30)");
        CheckBox chkTaco = new CheckBox("Es Cartulina Fisica del Taco (Opcion A)");
        chkTaco.setSelected(true);
        TextField txtPaidInTaco = new TextField("10");
        txtPaidInTaco.setPromptText("Cuotas ya cobradas en la cartulina (Ej: 10)");

        Button btnSaveLoan = new Button("Registrar Cliente y Credito");
        btnSaveLoan.setMaxWidth(Double.MAX_VALUE);
        btnSaveLoan.setOnAction(e -> {
            try {
                BigDecimal principal = new BigDecimal(txtPrincipal.getText().trim());
                int instCount = Integer.parseInt(txtInstallments.getText().trim());
                int paidInTaco = chkTaco.isSelected() ? Integer.parseInt(txtPaidInTaco.getText().trim()) : 0;

                ledgerService.registerCustomerAndLoan(
                        UserRole.ADMIN,
                        "usr-adm-1",
                        txtName.getText(),
                        txtDoc.getText(),
                        txtPhone.getText(),
                        "Direccion registrada en oficina",
                        "Centro",
                        "route-norte",
                        principal,
                        new BigDecimal("0.20"),
                        instCount,
                        chkTaco.isSelected(),
                        paidInTaco,
                        LocalDate.now().toString()
                );
                txtName.clear();
                txtDoc.clear();
                txtPhone.clear();
                refreshDashboard();
            } catch (Exception ex) {
                showAlert("Error al registrar credito", ex.getMessage());
            }
        });

        Separator sep = new Separator();

        Label section2 = new Label("2. Registrar Abono Idempotente");
        section2.setStyle("-fx-font-weight: bold; -fx-font-size: 13px;");
        TextField txtLoanId = new TextField();
        txtLoanId.setPromptText("ID del Credito (seleccione en la tabla)");
        TextField txtPaymentAmount = new TextField("10000");
        txtPaymentAmount.setPromptText("Monto recibido en COP");

        Button btnRecordPayment = new Button("Aplicar Abono con Asignacion por Cuota");
        btnRecordPayment.setMaxWidth(Double.MAX_VALUE);
        btnRecordPayment.setOnAction(e -> {
            try {
                ledgerService.recordPaymentWithAllocations(
                        UserRole.ADMIN,
                        "usr-adm-1",
                        null,
                        txtLoanId.getText().trim(),
                        new BigDecimal(txtPaymentAmount.getText().trim()),
                        "CASH",
                        LocalDate.now().toString(),
                        "Abono registrado en consola JavaFX"
                );
                refreshDashboard();
            } catch (Exception ex) {
                showAlert("Error al registrar abono", ex.getMessage());
            }
        });

        Separator sep2 = new Separator();

        Label section3 = new Label("3. Cerrar Liquidacion Diaria Inmutable");
        section3.setStyle("-fx-font-weight: bold; -fx-font-size: 13px;");
        TextField txtCashHanded = new TextField("0");
        txtCashHanded.setPromptText("Efectivo fisico entregado en arqueo");
        TextField txtJustification = new TextField("Arqueo conforme en oficina");
        txtJustification.setPromptText("Observacion / Justificacion de auditoria");

        Button btnSettle = new Button("Cerrar Jornada (Inmutable)");
        btnSettle.setMaxWidth(Double.MAX_VALUE);
        btnSettle.setOnAction(e -> {
            try {
                ledgerService.closeImmutableDailySettlement(
                        UserRole.ADMIN,
                        "usr-adm-1",
                        "route-norte",
                        LocalDate.now().toString(),
                        new BigDecimal(txtCashHanded.getText().trim()),
                        txtJustification.getText().trim()
                );
                showAlert("Liquidacion Cerrada", "El cierre diario ha sido sellado de forma inmutable en cartera.db.");
            } catch (Exception ex) {
                showAlert("Aviso de Liquidacion", ex.getMessage());
            }
        });

        panel.getChildren().addAll(
                section1, txtName, txtDoc, txtPhone, txtPrincipal, txtInstallments, chkTaco, txtPaidInTaco, btnSaveLoan,
                sep,
                section2, txtLoanId, txtPaymentAmount, btnRecordPayment,
                sep2,
                section3, txtCashHanded, txtJustification, btnSettle
        );
        return panel;
    }

    private void refreshDashboard() {
        String today = LocalDate.now().toString();
        RouteMetricsSummary m = ledgerService.computeRouteMetrics(today, "ALL");
        lblAdminCapital.setText(formatMoney(m.totalAdministrativeCapital()));
        lblStreetCapital.setText(formatMoney(m.activeCapitalInStreet()));
        lblCashBase.setText(formatMoney(m.cashAvailableInHand()));
        lblPaperwork.setText(formatMoney(m.accumulatedPaperwork()));
        lblCollectedToday.setText(formatMoney(m.collectedToday()));

        loanItems.setAll(ledgerService.listAllLoans());
    }

    private String formatMoney(BigDecimal value) {
        if (value == null) return "$0";
        return copFormat.format(value);
    }

    private void showAlert(String title, String content) {
        Alert alert = new Alert(Alert.AlertType.INFORMATION);
        alert.setTitle(title);
        alert.setHeaderText(null);
        alert.setContentText(content);
        alert.showAndWait();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
