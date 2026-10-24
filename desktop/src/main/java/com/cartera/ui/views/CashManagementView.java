package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.CashMovementEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.CashMovementRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.settlement.application.CashMovementUseCase;
import com.cartera.settlement.application.CashMovementUseCase.CashMovementCommand;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.ui.util.CurrencyInputUtil;
import com.cartera.ui.util.UiLabels;
import javafx.beans.property.SimpleObjectProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.layout.*;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Caja de ruta: saldo disponible, entradas, salidas e historial de movimientos.
 * Todos los registros pasan por {@link CashMovementUseCase} (transaccional, autorizado e idempotente)
 * y se imputan a la ruta seleccionada en la barra superior.
 */
public class CashManagementView extends VBox {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    /** Categorías que el administrador puede registrar manualmente (código → etiqueta comercial). */
    private static final Map<String, String> MANUAL_INFLOW_CATEGORIES = new LinkedHashMap<>();
    private static final Map<String, String> MANUAL_OUTFLOW_CATEGORIES = new LinkedHashMap<>();
    static {
        MANUAL_INFLOW_CATEGORIES.put("BASE_INICIAL", "Base inicial / Fondeo de ruta");
        MANUAL_INFLOW_CATEGORIES.put("AJUSTE_ARQUEO", "Ajuste de arqueo (sobrante)");
        MANUAL_INFLOW_CATEGORIES.put("OTRO", "Otro ingreso");
        MANUAL_OUTFLOW_CATEGORIES.put("GASTO_GASOLINA", "Gasolina");
        MANUAL_OUTFLOW_CATEGORIES.put("GASTO_VIATICOS", "Viáticos");
        MANUAL_OUTFLOW_CATEGORIES.put("RETIRO_CAJA_PRINCIPAL", "Retiro a caja principal");
        MANUAL_OUTFLOW_CATEGORIES.put("AJUSTE_ARQUEO", "Ajuste de arqueo (faltante)");
        MANUAL_OUTFLOW_CATEGORIES.put("OTRO", "Otro egreso");
    }

    private final CashMovementRepository cashMovementRepository;
    private final CashMovementUseCase cashMovementUseCase;
    private final RouteRepository routeRepository;
    private final Stage ownerStage;

    private final Label lblScope = new Label();
    private final Label lblBalance = new Label("$ 0");
    private final Label lblInflow = new Label("$ 0");
    private final Label lblOutflow = new Label("$ 0");
    private final Label lblCount = new Label("0");
    private final ObservableList<CashMovementEntity> movementsList = FXCollections.observableArrayList();
    private final TableView<CashMovementEntity> table = new TableView<>();

    public CashManagementView(CashMovementRepository cashMovementRepository,
                              CashMovementUseCase cashMovementUseCase,
                              RouteRepository routeRepository,
                              Stage ownerStage) {
        this.cashMovementRepository = cashMovementRepository;
        this.cashMovementUseCase = cashMovementUseCase;
        this.routeRepository = routeRepository;
        this.ownerStage = ownerStage;

        setSpacing(18);
        setPadding(new Insets(24));
        getStyleClass().add("page");

        buildHeader();
        buildMetrics();
        buildTableCard();
        refresh();
    }

    private void buildHeader() {
        HBox top = new HBox(12);
        top.setAlignment(Pos.CENTER_LEFT);

        VBox titleBox = new VBox(4);
        Label title = new Label("Caja de Ruta");
        title.getStyleClass().add("section-title");
        lblScope.getStyleClass().add("muted");
        titleBox.getChildren().addAll(title, lblScope);
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        Button btnIn = new Button("+ Ingreso");
        btnIn.getStyleClass().add("btn-success");
        btnIn.setOnAction(e -> openMovementDialog(CashMovementUseCase.TYPE_INFLOW));

        Button btnOut = new Button("− Egreso");
        btnOut.getStyleClass().add("btn-secondary");
        btnOut.setOnAction(e -> openMovementDialog(CashMovementUseCase.TYPE_OUTFLOW));

        Button btnRecaudo = new Button("Entregar recaudo a oficina");
        btnRecaudo.getStyleClass().add("btn-primary");
        btnRecaudo.setOnAction(e -> openRecaudoDialog());

        top.getChildren().addAll(titleBox, btnIn, btnOut, btnRecaudo);
        getChildren().add(top);
    }

    private void buildMetrics() {
        HBox metrics = new HBox(14);
        lblBalance.getStyleClass().add("metric-value-green");
        lblInflow.getStyleClass().add("metric-value");
        lblOutflow.getStyleClass().add("metric-value-red");
        lblCount.getStyleClass().add("metric-value");
        metrics.getChildren().addAll(
                metricCard("SALDO DISPONIBLE", lblBalance),
                metricCard("TOTAL ENTRADAS", lblInflow),
                metricCard("TOTAL SALIDAS", lblOutflow),
                metricCard("MOVIMIENTOS", lblCount)
        );
        getChildren().add(metrics);
    }

    private VBox metricCard(String title, Label valueLabel) {
        VBox card = new VBox(6);
        card.getStyleClass().add("metric-card");
        HBox.setHgrow(card, Priority.ALWAYS);
        Label lbl = new Label(title);
        lbl.getStyleClass().add("metric-title");
        card.getChildren().addAll(lbl, valueLabel);
        return card;
    }

    @SuppressWarnings("unchecked")
    private void buildTableCard() {
        VBox tableCard = new VBox(10);
        tableCard.getStyleClass().add("table-card");
        VBox.setVgrow(tableCard, Priority.ALWAYS);

        Label cardTitle = new Label("Historial de movimientos");
        cardTitle.getStyleClass().add("card-title");

        table.setColumnResizePolicy(TableView.CONSTRAINED_RESIZE_POLICY_ALL_COLUMNS);
        table.setPlaceholder(UiLabels.emptyState("Sin movimientos registrados", "Los ingresos y egresos de la caja aparecerán aquí."));
        VBox.setVgrow(table, Priority.ALWAYS);

        TableColumn<CashMovementEntity, String> colDate = new TableColumn<>("FECHA");
        colDate.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.formatDateTime(d.getValue().getCreatedAt())));
        colDate.setPrefWidth(130);

        TableColumn<CashMovementEntity, String> colType = new TableColumn<>("TIPO");
        colType.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getMovementType()));
        colType.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(String type, boolean empty) {
                super.updateItem(type, empty);
                setText(null);
                if (empty || type == null) {
                    setGraphic(null);
                } else {
                    boolean in = CashMovementUseCase.isInflow(type);
                    Label badge = new Label(in ? "Entrada" : "Salida");
                    badge.getStyleClass().addAll("badge", in ? "badge-al-dia" : "badge-mora");
                    setGraphic(badge);
                }
            }
        });
        colType.setPrefWidth(90);

        TableColumn<CashMovementEntity, String> colCat = new TableColumn<>("CONCEPTO");
        colCat.setCellValueFactory(d -> new SimpleStringProperty(UiLabels.cashCategory(d.getValue().getCategory())));
        colCat.setPrefWidth(170);

        TableColumn<CashMovementEntity, String> colRoute = new TableColumn<>("RUTA");
        colRoute.setCellValueFactory(d -> new SimpleStringProperty(routeName(d.getValue().getRouteId())));
        colRoute.setPrefWidth(120);

        TableColumn<CashMovementEntity, CashMovementEntity> colAmount = new TableColumn<>("MONTO");
        colAmount.setCellValueFactory(d -> new SimpleObjectProperty<>(d.getValue()));
        colAmount.setCellFactory(col -> new TableCell<>() {
            @Override
            protected void updateItem(CashMovementEntity m, boolean empty) {
                super.updateItem(m, empty);
                getStyleClass().removeAll("amount-positive", "amount-negative");
                if (empty || m == null) {
                    setText(null);
                } else {
                    boolean in = CashMovementUseCase.isInflow(m.getMovementType());
                    setText((in ? "+ " : "− ") + CURRENCY.format(m.getAmount()));
                    getStyleClass().add(in ? "amount-positive" : "amount-negative");
                }
            }
        });
        colAmount.setPrefWidth(120);

        TableColumn<CashMovementEntity, String> colDesc = new TableColumn<>("DETALLE");
        colDesc.setCellValueFactory(d -> new SimpleStringProperty(d.getValue().getDescription()));
        colDesc.setPrefWidth(260);

        table.getColumns().addAll(colDate, colType, colCat, colRoute, colAmount, colDesc);
        table.setItems(movementsList);

        tableCard.getChildren().addAll(cardTitle, table);
        getChildren().add(tableCard);
    }

    private String selectedRoute() {
        return UserSessionContext.getSelectedRouteId();
    }

    private String routeName(String routeId) {
        String normalized = SettlementUseCase.normalizeRouteId(routeId);
        if (routeRepository == null) return normalized;
        return routeRepository.findById(normalized).map(RouteEntity::getName).orElse("Ruta sin nombre");
    }

    public void refresh() {
        String route = selectedRoute();
        boolean all = UserSessionContext.isAllRoutesSelected();
        lblScope.setText(all
                ? "Consolidado de todas las rutas • Seleccione una ruta para registrar movimientos"
                : "Movimientos de efectivo de " + routeName(route));

        List<CashMovementEntity> list = cashMovementRepository.findAll().stream()
                .filter(m -> all || route.equalsIgnoreCase(SettlementUseCase.normalizeRouteId(m.getRouteId())))
                .sorted(Comparator.comparing(CashMovementEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        movementsList.setAll(list);

        BigDecimal inflow = list.stream().filter(m -> CashMovementUseCase.isInflow(m.getMovementType()))
                .map(CashMovementEntity::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal outflow = list.stream().filter(m -> CashMovementUseCase.isOutflow(m.getMovementType()))
                .map(CashMovementEntity::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

        lblInflow.setText(CURRENCY.format(inflow));
        lblOutflow.setText(CURRENCY.format(outflow));
        lblBalance.setText(CURRENCY.format(inflow.subtract(outflow)));
        lblCount.setText(String.valueOf(list.size()));
    }

    private boolean ensureSpecificRoute() {
        if (UserSessionContext.isAllRoutesSelected()) {
            Alert alert = new Alert(Alert.AlertType.INFORMATION);
            alert.initOwner(ownerStage);
            alert.setTitle("Seleccione una ruta");
            alert.setHeaderText("Los movimientos de caja se registran por ruta");
            alert.setContentText("Elija la ruta en el selector «Ruta activa» de la parte superior y vuelva a intentarlo.");
            alert.showAndWait();
            return false;
        }
        return true;
    }

    private void openMovementDialog(String type) {
        if (!ensureSpecificRoute()) return;
        boolean inflow = CashMovementUseCase.TYPE_INFLOW.equals(type);
        Map<String, String> categories = inflow ? MANUAL_INFLOW_CATEGORIES : MANUAL_OUTFLOW_CATEGORIES;

        ComboBox<String> cmbCategory = new ComboBox<>(FXCollections.observableArrayList(categories.values()));
        cmbCategory.getSelectionModel().selectFirst();
        cmbCategory.setMaxWidth(Double.MAX_VALUE);
        cmbCategory.getStyleClass().add("search-field");

        TextField txtAmount = new TextField();
        txtAmount.setPromptText("Ej. 50.000");
        txtAmount.getStyleClass().add("search-field");

        TextField txtDesc = new TextField();
        txtDesc.setPromptText(inflow ? "Ej. Fondeo semanal de la ruta" : "Ej. Tanqueo de la moto");
        txtDesc.getStyleClass().add("search-field");

        showFormDialog(
                inflow ? "Registrar ingreso de caja" : "Registrar egreso de caja",
                routeName(selectedRoute()),
                List.of(field("Concepto", cmbCategory), field("Monto ($)", txtAmount), field("Detalle", txtDesc)),
                inflow ? "Guardar ingreso" : "Guardar egreso",
                () -> {
                    String code = categories.entrySet().stream()
                            .filter(en -> en.getValue().equals(cmbCategory.getValue()))
                            .map(Map.Entry::getKey).findFirst().orElse("OTRO");
                    return new CashMovementCommand(null, selectedRoute(), type, code,
                            CurrencyInputUtil.parseAmount(txtAmount.getText()),
                            txtDesc.getText(), "REGISTRO_MOVIMIENTO_CAJA");
                });
    }

    private void openRecaudoDialog() {
        if (!ensureSpecificRoute()) return;
        BigDecimal available = cashMovementUseCase.availableBalance(selectedRoute()).max(BigDecimal.ZERO);

        VBox baseBox = new VBox(4);
        baseBox.getStyleClass().add("highlight-box");
        Label lblBaseTitle = new Label("DISPONIBLE EN CAJA DE LA RUTA");
        lblBaseTitle.getStyleClass().add("metric-title");
        Label lblBaseVal = new Label(CURRENCY.format(available));
        lblBaseVal.getStyleClass().add("metric-value-green");
        baseBox.getChildren().addAll(lblBaseTitle, lblBaseVal);

        TextField txtAmount = new TextField();
        txtAmount.setPromptText("Ej. 300.000");
        txtAmount.getStyleClass().add("search-field");

        ComboBox<String> cmbDestination = new ComboBox<>(FXCollections.observableArrayList(
                "Entrega a oficina central",
                "Retiro de utilidad del dueño",
                "Consignación bancaria",
                "Traslado a otra ruta"
        ));
        cmbDestination.getSelectionModel().selectFirst();
        cmbDestination.setMaxWidth(Double.MAX_VALUE);
        cmbDestination.getStyleClass().add("search-field");

        TextField txtNotes = new TextField();
        txtNotes.setPromptText("Ej. Recibido por administración");
        txtNotes.getStyleClass().add("search-field");

        showFormDialog(
                "Entregar recaudo a oficina",
                routeName(selectedRoute()),
                List.of(baseBox, field("Monto a entregar ($)", txtAmount), field("Destino", cmbDestination), field("Observación", txtNotes)),
                "Confirmar entrega",
                () -> {
                    String reason = cmbDestination.getValue()
                            + (txtNotes.getText() == null || txtNotes.getText().isBlank() ? "" : " - " + txtNotes.getText().trim());
                    return new CashMovementCommand(null, selectedRoute(), CashMovementUseCase.TYPE_OUTFLOW,
                            "RECAUDO_OFICINA", CurrencyInputUtil.parseAmount(txtAmount.getText()),
                            reason, "RECAUDO_OFICINA_RETIRO");
                });
    }

    private VBox field(String label, Node control) {
        Label lbl = new Label(label);
        lbl.getStyleClass().add("field-label");
        return new VBox(4, lbl, control);
    }

    /**
     * Diálogo de formulario común. El identificador del movimiento se genera UNA vez por diálogo,
     * de modo que un doble clic o reintento no duplica el registro.
     */
    private void showFormDialog(String titleText, String subtitleText, List<Node> fields, String confirmText,
                                java.util.function.Supplier<CashMovementCommand> commandFactory) {
        final String movementId = UUID.randomUUID().toString();

        Stage dialog = new Stage();
        dialog.initModality(Modality.WINDOW_MODAL);
        dialog.initOwner(ownerStage);
        dialog.setTitle(titleText);
        dialog.setResizable(false);

        VBox root = new VBox(14);
        root.getStyleClass().add("dialog-root");
        root.setPrefWidth(440);

        Label title = new Label(titleText);
        title.getStyleClass().add("dialog-title");
        Label subtitle = new Label(subtitleText);
        subtitle.getStyleClass().add("muted");

        Label lblFeedback = new Label();
        lblFeedback.setWrapText(true);
        lblFeedback.getStyleClass().add("feedback-error");
        lblFeedback.setVisible(false);
        lblFeedback.setManaged(false);

        Button btnCancel = new Button("Cancelar");
        btnCancel.getStyleClass().add("btn-secondary");
        btnCancel.setOnAction(e -> dialog.close());

        Button btnSave = new Button(confirmText);
        btnSave.getStyleClass().add("btn-primary");
        btnSave.setDefaultButton(true);
        btnSave.setOnAction(e -> {
            btnSave.setDisable(true);
            try {
                CashMovementCommand c = commandFactory.get();
                cashMovementUseCase.register(new CashMovementCommand(movementId, c.routeId(), c.movementType(),
                        c.category(), c.amount(), c.description(), c.auditAction()));
                refresh();
                dialog.close();
            } catch (Exception ex) {
                lblFeedback.setText(ex.getMessage() != null ? ex.getMessage() : "No se pudo guardar el movimiento.");
                lblFeedback.setVisible(true);
                lblFeedback.setManaged(true);
                btnSave.setDisable(false);
            }
        });

        HBox actions = new HBox(10, btnCancel, btnSave);
        actions.setAlignment(Pos.CENTER_RIGHT);

        root.getChildren().add(new VBox(2, title, subtitle));
        root.getChildren().addAll(fields);
        root.getChildren().addAll(lblFeedback, actions);

        Scene scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        dialog.setScene(scene);
        dialog.showAndWait();
    }
}
