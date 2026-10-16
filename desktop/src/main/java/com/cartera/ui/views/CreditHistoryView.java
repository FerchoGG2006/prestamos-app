package com.cartera.ui.views;

import com.cartera.history.application.CreditHistoryService;
import com.cartera.history.application.CreditHistoryService.CreditHistoryReport;
import com.cartera.history.application.CreditHistoryService.LoanHistoryItem;
import com.cartera.history.application.CreditHistoryService.RepaymentRating;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.InstallmentEntity;
import javafx.beans.property.SimpleObjectProperty;
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
import java.util.List;
import java.util.Locale;

/**
 * Vista de Historial Crediticio por Cédula (Desktop JavaFX).
 * Permite buscar clientes por cédula y verificar de inmediato su récord
 * de préstamos anteriores y si la persona "pagó bien o pagó mal".
 */
public class CreditHistoryView extends VBox {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    private final CreditHistoryService creditHistoryService;
    private final Stage ownerStage;

    private TextField txtDocument;
    private ComboBox<CustomerEntity> cbCustomerSuggest;
    private VBox contentContainer;
    private FlowPane quickChipsPane;

    public CreditHistoryView(CreditHistoryService creditHistoryService, Stage ownerStage) {
        this.creditHistoryService = creditHistoryService;
        this.ownerStage = ownerStage;

        setSpacing(20);
        setPadding(new Insets(24));
        setStyle("-fx-background-color: #f8fafc;");

        buildHeader();
        buildSearchBar();
        buildContentArea();
    }

    private void buildHeader() {
        VBox titleBox = new VBox(4);
        Label title = new Label("Historial Crediticio por Cédula");
        title.getStyleClass().add("section-title");
        Label subtitle = new Label("Consulta integral de récord de préstamos y verificación de solvencia/cumplimiento");
        subtitle.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, subtitle);
        getChildren().add(titleBox);
    }

    private void buildSearchBar() {
        VBox searchCard = new VBox(10);
        searchCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12; -fx-padding: 16 20; -fx-border-color: #e2e8f0; -fx-border-radius: 12; -fx-border-width: 1;");

        Label lblSearchPrompt = new Label("Ingrese la Cédula o Documento del Cliente:");
        lblSearchPrompt.setStyle("-fx-text-fill: #1e293b; -fx-font-size: 13px; -fx-font-weight: bold;");

        HBox searchRow = new HBox(12);
        searchRow.setAlignment(Pos.CENTER_LEFT);

        txtDocument = new TextField();
        txtDocument.setPromptText("Ej: 1098765432 o nombre...");
        txtDocument.getStyleClass().add("search-field");
        txtDocument.setPrefWidth(280);
        txtDocument.setOnAction(e -> handleSearch());

        Button btnSearch = new Button("🔍 Consultar Historial");
        btnSearch.getStyleClass().add("btn-primary");
        btnSearch.setOnAction(e -> handleSearch());

        // Selector rápido opcional con clientes registrados
        cbCustomerSuggest = new ComboBox<>();
        cbCustomerSuggest.setPromptText("O seleccionar de la lista...");
        cbCustomerSuggest.setPrefWidth(260);
        cbCustomerSuggest.setConverter(new javafx.util.StringConverter<>() {
            @Override
            public String toString(CustomerEntity c) {
                if (c == null) return "";
                return c.getFullName() + " (C.C. " + c.getDocumentNumber() + ")";
            }
            @Override
            public CustomerEntity fromString(String string) {
                return null;
            }
        });
        cbCustomerSuggest.setOnAction(e -> {
            CustomerEntity selected = cbCustomerSuggest.getValue();
            if (selected != null) {
                txtDocument.setText(selected.getDocumentNumber());
                loadReportForCustomer(selected.getDocumentNumber());
            }
        });

        Button btnClear = new Button("Limpiar");
        btnClear.getStyleClass().add("btn-secondary");
        btnClear.setOnAction(e -> {
            txtDocument.clear();
            cbCustomerSuggest.setValue(null);
            showEmptyState();
        });

        searchRow.getChildren().addAll(txtDocument, btnSearch, cbCustomerSuggest, btnClear);

        // Chips de clientes rápidos
        quickChipsPane = new FlowPane(8, 8);
        quickChipsPane.setAlignment(Pos.CENTER_LEFT);
        loadQuickSuggestions();

        searchCard.getChildren().addAll(lblSearchPrompt, searchRow, quickChipsPane);
        getChildren().add(searchCard);
    }

    private void buildContentArea() {
        contentContainer = new VBox(16);
        VBox.setVgrow(contentContainer, Priority.ALWAYS);
        getChildren().add(contentContainer);
        showEmptyState();
    }

    private void loadQuickSuggestions() {
        quickChipsPane.getChildren().clear();
        Label lblTips = new Label("Búsqueda rápida:");
        lblTips.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");
        quickChipsPane.getChildren().add(lblTips);

        List<CustomerEntity> list = creditHistoryService.searchCustomers("");
        cbCustomerSuggest.setItems(FXCollections.observableArrayList(list));

        int limit = Math.min(6, list.size());
        for (int i = 0; i < limit; i++) {
            CustomerEntity c = list.get(i);
            Button chip = new Button(c.getFullName() + " (" + c.getDocumentNumber() + ")");
            chip.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #334155; -fx-font-size: 11px; -fx-padding: 4 10; -fx-background-radius: 12; -fx-border-color: #cbd5e1; -fx-border-radius: 12; -fx-cursor: hand;");
            chip.setOnAction(e -> {
                txtDocument.setText(c.getDocumentNumber());
                loadReportForCustomer(c.getDocumentNumber());
            });
            quickChipsPane.getChildren().add(chip);
        }
    }

    private void handleSearch() {
        String doc = txtDocument.getText();
        if (doc == null || doc.trim().isEmpty()) {
            showError("Por favor ingrese un número de cédula o documento.");
            return;
        }
        loadReportForCustomer(doc.trim());
    }

    public void queryByDocument(String documentNumber) {
        if (txtDocument != null) {
            txtDocument.setText(documentNumber);
        }
        loadReportForCustomer(documentNumber);
    }

    private void loadReportForCustomer(String documentNumber) {
        var opt = creditHistoryService.getReportByDocument(documentNumber);
        if (opt.isEmpty()) {
            // Si no lo encuentra por cédula exacta, intentamos búsqueda por coincidencia
            List<CustomerEntity> matches = creditHistoryService.searchCustomers(documentNumber);
            if (!matches.isEmpty()) {
                opt = creditHistoryService.getReportByDocument(matches.get(0).getDocumentNumber());
            }
        }

        if (opt.isPresent()) {
            renderReport(opt.get());
        } else {
            showNotFoundState(documentNumber);
        }
    }

    private void showEmptyState() {
        contentContainer.getChildren().clear();

        VBox emptyCard = new VBox(12);
        emptyCard.setAlignment(Pos.CENTER);
        emptyCard.setPadding(new Insets(40, 20, 40, 20));
        emptyCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12; -fx-border-color: #e2e8f0; -fx-border-radius: 12;");

        Label icon = new Label("📋");
        icon.setStyle("-fx-font-size: 42px;");

        Label title = new Label("Verificación de Historial y Calificación de Pago");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        Label sub = new Label("Ingrese la cédula de la persona en el buscador superior para comprobar si es buen pagador,\nsus créditos finalizados, demoras históricas y saldo activo en cartera.");
        sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 13px; -fx-text-alignment: center;");

        emptyCard.getChildren().addAll(icon, title, sub);
        contentContainer.getChildren().add(emptyCard);
    }

    private void showNotFoundState(String searched) {
        contentContainer.getChildren().clear();

        VBox notFoundCard = new VBox(12);
        notFoundCard.setAlignment(Pos.CENTER);
        notFoundCard.setPadding(new Insets(40, 20, 40, 20));
        notFoundCard.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12; -fx-border-color: #fecaca; -fx-border-radius: 12;");

        Label icon = new Label("🔍");
        icon.setStyle("-fx-font-size: 36px;");

        Label title = new Label("No se encontró ningún cliente con el documento: " + searched);
        title.setStyle("-fx-text-fill: #b91c1c; -fx-font-size: 15px; -fx-font-weight: bold;");

        Label sub = new Label("Verifique el número ingresado o asegúrese de que el cliente haya sido registrado previamente.");
        sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");

        notFoundCard.getChildren().addAll(icon, title, sub);
        contentContainer.getChildren().add(notFoundCard);
    }

    private void renderReport(CreditHistoryReport report) {
        contentContainer.getChildren().clear();

        // 1. Banner del Cliente + Calificación ("¿Pagó bien o pagó mal?")
        VBox profileCard = buildCustomerProfileCard(report);

        // 2. Tira de Métricas KPI
        HBox kpiStrip = buildKpiStrip(report);

        // 3. Tabla de Préstamos Históricos
        VBox historyTableCard = buildHistoryTableCard(report);

        contentContainer.getChildren().addAll(profileCard, kpiStrip, historyTableCard);
    }

    private VBox buildCustomerProfileCard(CreditHistoryReport report) {
        VBox card = new VBox(14);
        card.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 12; -fx-padding: 18 22; -fx-border-color: #e2e8f0; -fx-border-radius: 12; -fx-border-width: 1;");

        HBox topRow = new HBox(16);
        topRow.setAlignment(Pos.CENTER_LEFT);

        // Avatar
        String initials = getInitials(report.customer().getFullName());
        Label lblInitials = new Label(initials);
        lblInitials.setStyle("-fx-text-fill: white; -fx-font-weight: bold; -fx-font-size: 18px;");
        StackPane avatar = new StackPane(lblInitials);
        avatar.setPrefSize(52, 52);
        avatar.setMinSize(52, 52);
        avatar.setStyle("-fx-background-color: linear-gradient(to bottom right, #2563eb, #1e40af); -fx-background-radius: 26;");

        // Datos Personales
        VBox personal = new VBox(3);
        Label lblName = new Label(report.customer().getFullName());
        lblName.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 17px; -fx-font-weight: bold;");

        String doc = "C.C. " + report.customer().getDocumentNumber();
        String phone = report.customer().getPhone() != null ? " • Tel: " + report.customer().getPhone() : "";
        String addr = report.customer().getAddress() != null ? " • Dir: " + report.customer().getAddress() : "";
        Label lblDetails = new Label(doc + phone + addr);
        lblDetails.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");

        personal.getChildren().addAll(lblName, lblDetails);
        topRow.getChildren().addAll(avatar, personal);

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        topRow.getChildren().add(spacer);

        // Sello Fáctico de Calificación ("¿Pagó bien o mal?")
        RepaymentRating rating = report.rating();
        VBox ratingBox = new VBox(4);
        ratingBox.setAlignment(Pos.CENTER_RIGHT);

        Label lblBadge = new Label(rating.getLabel());
        lblBadge.setStyle(String.format(
                "-fx-background-color: %s; -fx-text-fill: %s; -fx-font-size: 13px; -fx-font-weight: bold; -fx-padding: 6 14; -fx-background-radius: 20; -fx-border-color: %s; -fx-border-radius: 20; -fx-border-width: 1.5;",
                rating.getBgColor(), rating.getTextColor(), rating.getBorderColor()
        ));

        ratingBox.getChildren().add(lblBadge);
        topRow.getChildren().add(ratingBox);

        // Explicación de la calificación
        HBox explanationBox = new HBox(8);
        explanationBox.setAlignment(Pos.CENTER_LEFT);
        explanationBox.setStyle(String.format(
                "-fx-background-color: %s; -fx-background-radius: 8; -fx-padding: 10 14; -fx-border-color: %s; -fx-border-radius: 8;",
                rating.getBgColor(), rating.getBorderColor()
        ));

        Label expText = new Label("Diagnóstico de Pago: " + report.ratingExplanation());
        expText.setWrapText(true);
        expText.setStyle(String.format("-fx-text-fill: %s; -fx-font-size: 12px; -fx-font-weight: bold;", rating.getTextColor()));
        explanationBox.getChildren().add(expText);

        card.getChildren().addAll(topRow, explanationBox);
        return card;
    }

    private HBox buildKpiStrip(CreditHistoryReport report) {
        HBox strip = new HBox(12);
        strip.setAlignment(Pos.CENTER_LEFT);

        VBox c1 = createMetricCard("Préstamos Totales", report.totalLoansCount() + " contratos",
                report.completedLoansCount() + " pagados • " + report.activeLoansCount() + " activos", "#2563eb");
        HBox.setHgrow(c1, Priority.ALWAYS);

        VBox c2 = createMetricCard("Total Desembolsado", CURRENCY.format(report.totalBorrowed()),
                "Pactado c/int: " + CURRENCY.format(report.totalAgreed()), "#0f172a");
        HBox.setHgrow(c2, Priority.ALWAYS);

        VBox c3 = createMetricCard("Total Pagado / Recuperado", CURRENCY.format(report.totalPaid()),
                "Cumplimiento en cuotas", "#059669");
        HBox.setHgrow(c3, Priority.ALWAYS);

        String balColor = report.currentRemainingBalance().compareTo(BigDecimal.ZERO) > 0 ? "#dc2626" : "#059669";
        VBox c4 = createMetricCard("Saldo Activo Pendiente", CURRENCY.format(report.currentRemainingBalance()),
                report.currentOverdueAmount().compareTo(BigDecimal.ZERO) > 0 ? "Mora: " + CURRENCY.format(report.currentOverdueAmount()) : "Sin mora activa", balColor);
        HBox.setHgrow(c4, Priority.ALWAYS);

        String delayText = report.maxOverdueDaysRecorded() == 0 ? "0 días (Puntual)" : report.maxOverdueDaysRecorded() + " días máx";
        String delayColor = report.maxOverdueDaysRecorded() > 0 ? "#d97706" : "#059669";
        VBox c5 = createMetricCard("Atraso Máximo Registrado", delayText,
                report.maxOverdueDaysRecorded() > 0 ? "Registró mora histórica" : "Nunca cayó en mora", delayColor);
        HBox.setHgrow(c5, Priority.ALWAYS);

        strip.getChildren().addAll(c1, c2, c3, c4, c5);
        return strip;
    }

    private VBox createMetricCard(String title, String value, String sub, String colorHex) {
        VBox card = new VBox(4);
        card.setStyle("-fx-background-color: #ffffff; -fx-background-radius: 10; -fx-padding: 12 16; -fx-border-color: #e2e8f0; -fx-border-radius: 10; -fx-border-width: 1;");

        Label lblTitle = new Label(title);
        lblTitle.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px; -fx-font-weight: bold;");

        Label lblVal = new Label(value);
        lblVal.setStyle("-fx-text-fill: " + colorHex + "; -fx-font-size: 18px; -fx-font-weight: bold;");

        Label lblSub = new Label(sub);
        lblSub.setStyle("-fx-text-fill: #94a3b8; -fx-font-size: 10px;");

        card.getChildren().addAll(lblTitle, lblVal, lblSub);
        return card;
    }

    @SuppressWarnings("unchecked")
    private VBox buildHistoryTableCard(CreditHistoryReport report) {
        VBox card = new VBox(10);
        card.getStyleClass().add("table-card");
        VBox.setVgrow(card, Priority.ALWAYS);

        HBox tableHeader = new HBox(8);
        tableHeader.setAlignment(Pos.CENTER_LEFT);
        Label tableTitle = new Label("Historial Detallado de Préstamos (" + report.loans().size() + ")");
        tableTitle.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 14px; -fx-font-weight: bold;");
        tableHeader.getChildren().add(tableTitle);

        TableView<LoanHistoryItem> table = new TableView<>();
        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<LoanHistoryItem, String> colId = new TableColumn<>("CRÉDITO");
        colId.setCellValueFactory(d -> new SimpleObjectProperty<>("#" + d.getValue().loan().getId().substring(0, Math.min(8, d.getValue().loan().getId().length()))));
        colId.setPrefWidth(90);

        TableColumn<LoanHistoryItem, String> colDate = new TableColumn<>("FECHA INICIO");
        colDate.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().loan().getStartDate()));
        colDate.setPrefWidth(95);

        TableColumn<LoanHistoryItem, String> colPrincipal = new TableColumn<>("PRESTADO");
        colPrincipal.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().loan().getPrincipal())));
        colPrincipal.setPrefWidth(100);

        TableColumn<LoanHistoryItem, String> colAgreed = new TableColumn<>("TOTAL C/INT");
        colAgreed.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().loan().getTotalAgreed())));
        colAgreed.setPrefWidth(105);

        TableColumn<LoanHistoryItem, String> colPaid = new TableColumn<>("PAGADO");
        colPaid.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().totalPaid())));
        colPaid.setPrefWidth(100);

        TableColumn<LoanHistoryItem, String> colBal = new TableColumn<>("SALDO RESTANTE");
        colBal.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().remainingBalance())));
        colBal.setPrefWidth(110);

        TableColumn<LoanHistoryItem, LoanHistoryItem> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colStatus.setCellFactory(c -> new TableCell<>() {
            @Override
            protected void updateItem(LoanHistoryItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    String st = item.loan().getStatus() != null ? item.loan().getStatus().toUpperCase() : "DESCONOCIDO";
                    Label badge = new Label(st);
                    if ("PAGADO".equals(st) || "PAID".equals(st)) {
                        badge.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-padding: 2 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else if ("ACTIVO".equals(st) || "ACTIVE".equals(st)) {
                        badge.setStyle("-fx-background-color: #eff6ff; -fx-text-fill: #1d4ed8; -fx-padding: 2 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    } else {
                        badge.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #64748b; -fx-padding: 2 8; -fx-background-radius: 10; -fx-font-weight: bold; -fx-font-size: 11px;");
                    }
                    setGraphic(badge);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(100);

        // Columna de Comportamiento de Pago ("¿Cómo pagó este préstamo?")
        TableColumn<LoanHistoryItem, LoanHistoryItem> colVerdict = new TableColumn<>("¿CÓMO PAGÓ? (CALIFICACIÓN)");
        colVerdict.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colVerdict.setCellFactory(c -> new TableCell<>() {
            @Override
            protected void updateItem(LoanHistoryItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    Label lbl = new Label(item.behaviorVerdict());
                    lbl.setStyle("-fx-text-fill: " + item.behaviorColor() + "; -fx-font-weight: bold; -fx-font-size: 12px;");
                    setGraphic(lbl);
                    setText(null);
                }
            }
        });
        colVerdict.setPrefWidth(220);

        // Acciones: Ver Plan de Cuotas
        TableColumn<LoanHistoryItem, LoanHistoryItem> colActions = new TableColumn<>("DETALLES");
        colActions.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colActions.setCellFactory(c -> new TableCell<>() {
            private final Button btn = new Button("Ver Cuotas");
            {
                btn.getStyleClass().add("btn-secondary");
                btn.setStyle("-fx-font-size: 11px; -fx-padding: 4 10;");
                btn.setOnAction(e -> {
                    LoanHistoryItem item = getItem();
                    if (item != null) {
                        showInstallmentsModal(item);
                    }
                });
            }
            @Override
            protected void updateItem(LoanHistoryItem item, boolean empty) {
                super.updateItem(item, empty);
                if (empty || item == null) {
                    setGraphic(null);
                } else {
                    setGraphic(btn);
                }
            }
        });
        colActions.setPrefWidth(110);

        table.getColumns().addAll(colId, colDate, colPrincipal, colAgreed, colPaid, colBal, colStatus, colVerdict, colActions);
        table.setItems(FXCollections.observableArrayList(report.loans()));

        card.getChildren().addAll(tableHeader, table);
        return card;
    }

    @SuppressWarnings("unchecked")
    private void showInstallmentsModal(LoanHistoryItem item) {
        Stage modal = new Stage();
        modal.initModality(Modality.WINDOW_MODAL);
        modal.initOwner(ownerStage);
        modal.setTitle("Plan de Pagos y Cumplimiento — Crédito #" + item.loan().getId());

        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(600);
        root.setPrefHeight(450);

        HBox modalHeader = new HBox(12);
        modalHeader.setAlignment(Pos.CENTER_LEFT);

        VBox mTitle = new VBox(2);
        Label title = new Label("Desglose de Cuotas — Crédito #" + item.loan().getId());
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 15px; -fx-font-weight: bold;");
        Label sub = new Label("Prestado: " + CURRENCY.format(item.loan().getPrincipal()) + " • Total: " + CURRENCY.format(item.totalAgreed()) + " • " + item.behaviorVerdict());
        sub.setStyle("-fx-text-fill: " + item.behaviorColor() + "; -fx-font-size: 12px; -fx-font-weight: bold;");
        mTitle.getChildren().addAll(title, sub);

        modalHeader.getChildren().add(mTitle);

        TableView<InstallmentEntity> tableInst = new TableView<>();
        tableInst.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        VBox.setVgrow(tableInst, Priority.ALWAYS);

        TableColumn<InstallmentEntity, String> colNum = new TableColumn<>("#");
        colNum.setCellValueFactory(d -> new SimpleObjectProperty<>("Cuota #" + d.getValue().getInstallmentNumber()));
        colNum.setPrefWidth(70);

        TableColumn<InstallmentEntity, String> colDate = new TableColumn<>("VENCE");
        colDate.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue().getDueDate()));
        colDate.setPrefWidth(95);

        TableColumn<InstallmentEntity, String> colAmount = new TableColumn<>("VALOR");
        colAmount.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().getAmount())));
        colAmount.setPrefWidth(95);

        TableColumn<InstallmentEntity, String> colPaid = new TableColumn<>("ABONADO");
        colPaid.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().getPaidAmount() != null ? d.getValue().getPaidAmount() : BigDecimal.ZERO)));
        colPaid.setPrefWidth(95);

        TableColumn<InstallmentEntity, String> colPending = new TableColumn<>("PENDIENTE");
        colPending.setCellValueFactory(d -> new SimpleObjectProperty<>(CURRENCY.format(d.getValue().getPendingAmount())));
        colPending.setPrefWidth(95);

        TableColumn<InstallmentEntity, InstallmentEntity> colStatus = new TableColumn<>("ESTADO");
        colStatus.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colStatus.setCellFactory(c -> new TableCell<>() {
            @Override
            protected void updateItem(InstallmentEntity inst, boolean empty) {
                super.updateItem(inst, empty);
                if (empty || inst == null) {
                    setGraphic(null);
                    setText(null);
                } else {
                    BigDecimal pend = inst.getPendingAmount();
                    Label b = new Label();
                    if (pend.compareTo(BigDecimal.ZERO) <= 0) {
                        b.setText("PAGADA");
                        b.setStyle("-fx-background-color: #ecfdf5; -fx-text-fill: #047857; -fx-padding: 2 6; -fx-background-radius: 8; -fx-font-weight: bold; -fx-font-size: 10px;");
                    } else {
                        b.setText("PENDIENTE");
                        b.setStyle("-fx-background-color: #fef2f2; -fx-text-fill: #dc2626; -fx-padding: 2 6; -fx-background-radius: 8; -fx-font-weight: bold; -fx-font-size: 10px;");
                    }
                    setGraphic(b);
                    setText(null);
                }
            }
        });
        colStatus.setPrefWidth(100);

        tableInst.getColumns().addAll(colNum, colDate, colAmount, colPaid, colPending, colStatus);
        tableInst.setItems(FXCollections.observableArrayList(item.installments()));

        Button btnClose = new Button("Cerrar");
        btnClose.getStyleClass().add("btn-secondary");
        btnClose.setOnAction(e -> modal.close());

        HBox footer = new HBox(btnClose);
        footer.setAlignment(Pos.CENTER_RIGHT);

        root.getChildren().addAll(modalHeader, tableInst, footer);

        Scene scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        modal.setScene(scene);
        modal.showAndWait();
    }

    private void showError(String msg) {
        Alert alert = new Alert(Alert.AlertType.WARNING, msg, ButtonType.OK);
        alert.initOwner(ownerStage);
        alert.setHeaderText("Historial Crediticio");
        alert.showAndWait();
    }

    private String getInitials(String name) {
        if (name == null || name.isBlank()) return "CL";
        String[] parts = name.trim().split("\\s+");
        if (parts.length == 1) return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase();
        return (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase();
    }

    public void refresh() {
        loadQuickSuggestions();
        if (txtDocument != null && !txtDocument.getText().isBlank()) {
            loadReportForCustomer(txtDocument.getText().trim());
        }
    }
}
