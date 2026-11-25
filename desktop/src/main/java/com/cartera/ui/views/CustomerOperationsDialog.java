package com.cartera.ui.views;

import com.cartera.customers.application.AttachmentService;
import com.cartera.customers.application.FollowUpService;
import com.cartera.infrastructure.persistence.entity.CustomerAttachmentEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentPromiseEntity;
import com.cartera.infrastructure.persistence.repository.CustomerRepository;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.ui.util.CurrencyInputUtil;
import com.cartera.ui.util.UiLabels;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Label;
import javafx.scene.control.ListCell;
import javafx.scene.control.ListView;
import javafx.scene.control.Tab;
import javafx.scene.control.TabPane;
import javafx.scene.control.TextField;
import javafx.scene.control.TextInputDialog;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.util.StringConverter;

import java.awt.Desktop;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/** Native follow-up and managed files, without changing credit balances. */
public class CustomerOperationsDialog extends Stage {

    private static final NumberFormat CURRENCY = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static {
        CURRENCY.setMaximumFractionDigits(0);
    }

    public CustomerOperationsDialog(
            Stage owner,
            CustomerEntity customer,
            FollowUpService follow,
            AttachmentService attachments,
            LoanRepository loans
    ) {
        initOwner(owner);
        initModality(Modality.WINDOW_MODAL);
        setTitle("Seguimiento y archivos — " + customer.getFullName());

        VBox root = new VBox(12);
        root.setPadding(new Insets(20));
        root.setPrefWidth(760);

        ComboBox<LoanEntity> credit = new ComboBox<>();
        credit.getItems().setAll(
                loans.findByCustomerId(customer.getId()).stream()
                        .filter(l -> "ACTIVO".equalsIgnoreCase(l.getStatus()))
                        .toList()
        );
        credit.setConverter(new StringConverter<>() {
            @Override
            public String toString(LoanEntity l) {
                if (l == null) return "";
                String shortId = l.getId().length() > 8 ? l.getId().substring(0, 8).toUpperCase() : l.getId();
                return "Crédito #" + shortId + " · " + CURRENCY.format(l.getTotalAgreed()) + " · " + l.getStatus();
            }

            @Override
            public LoanEntity fromString(String s) {
                return null;
            }
        });
        credit.setMaxWidth(Double.MAX_VALUE);
        credit.getSelectionModel().selectFirst();

        TextField amount = new TextField();
        amount.setPromptText("Monto de la promesa ($)");
        DatePicker date = new DatePicker(LocalDate.now());
        TextField notes = new TextField();
        notes.setPromptText("Notas de la promesa / motivo de visita");

        ListView<PaymentPromiseEntity> promises = new ListView<>();
        promises.setPrefHeight(150);
        promises.setPlaceholder(UiLabels.emptyState("Sin promesas registradas", "Las promesas de pago de este cliente aparecerán aquí."));
        promises.setCellFactory(v -> new ListCell<>() {
            @Override
            protected void updateItem(PaymentPromiseEntity p, boolean empty) {
                super.updateItem(p, empty);
                if (empty || p == null) {
                    setText(null);
                } else {
                    String notePart = (p.getNotes() != null && !p.getNotes().isBlank()) ? " · " + p.getNotes() : "";
                    setText(p.getPromisedDate() + " · " + CURRENCY.format(p.getAmount()) + " · " + p.getStatus() + notePart);
                }
            }
        });

        ListView<String> visits = new ListView<>();
        visits.setPrefHeight(95);
        visits.setPlaceholder(UiLabels.emptyState("Sin visitas registradas", "Las visitas sin pago aparecerán aquí."));

        Runnable refresh = () -> {
            promises.getItems().setAll(follow.promises(customer.getId()));
            visits.getItems().setAll(
                    follow.visits(customer.getId()).stream()
                            .map(v -> {
                                String ts = v.getCreatedAt() != null && v.getCreatedAt().length() >= 16
                                        ? v.getCreatedAt().substring(0, 16).replace("T", " ")
                                        : (v.getCreatedAt() != null ? v.getCreatedAt() : "");
                                String reasonTxt = v.getReason() != null ? v.getReason() : "";
                                return ts + " · " + reasonTxt;
                            })
                            .toList()
            );
        };

        Button save = new Button("Registrar promesa");
        save.getStyleClass().add("btn-primary");
        final String[] pendingPromiseId = { UUID.randomUUID().toString() };
        save.setOnAction(e -> {
            save.setDisable(true);
            run(() -> {
                if (credit.getValue() == null) {
                    throw new IllegalArgumentException("Seleccione un crédito activo.");
                }
                follow.promise(
                        pendingPromiseId[0],
                        credit.getValue().getId(),
                        CurrencyInputUtil.parseAmount(amount.getText()),
                        date.getValue(),
                        notes.getText() != null && !notes.getText().isBlank() ? notes.getText().trim() : null
                );
                pendingPromiseId[0] = UUID.randomUUID().toString();
                amount.clear();
                notes.clear();
                refresh.run();
            });
            save.setDisable(false);
        });

        Button visit = new Button("Registrar visita sin pago");
        visit.getStyleClass().add("btn-secondary");
        final String[] pendingVisitId = { UUID.randomUUID().toString() };
        visit.setOnAction(e -> {
            visit.setDisable(true);
            run(() -> {
                if (credit.getValue() == null) {
                    throw new IllegalArgumentException("Seleccione un crédito activo.");
                }
                follow.visit(pendingVisitId[0], credit.getValue().getId(), notes.getText());
                pendingVisitId[0] = UUID.randomUUID().toString();
                notes.clear();
                refresh.run();
            });
            visit.setDisable(false);
        });

        Button fulfilled = new Button("Marcar cumplida");
        Button cancel = new Button("Cancelar promesa");
        Consumer<String> resolve = status -> run(() -> {
            var selected = promises.getSelectionModel().getSelectedItem();
            if (selected == null) {
                throw new IllegalArgumentException("Seleccione una promesa.");
            }
            TextInputDialog reason = new TextInputDialog();
            reason.initOwner(this);
            reason.setTitle("Actualizar promesa");
            reason.setHeaderText("Motivo. Esta acción no registra un cobro.");
            reason.showAndWait().ifPresent(r -> {
                follow.resolve(selected.getId(), status, r);
                refresh.run();
            });
        });
        fulfilled.setOnAction(e -> resolve.accept("CUMPLIDA"));
        cancel.setOnAction(e -> resolve.accept("CANCELADA"));

        VBox tracking = new VBox(
                10,
                new Label("Crédito activo"),
                credit,
                new HBox(8, amount, date),
                notes,
                new HBox(8, save, visit),
                new Label("Promesas"),
                promises,
                new HBox(8, fulfilled, cancel),
                new Label("Visitas sin pago"),
                visits
        );
        tracking.setPadding(new Insets(10, 0, 0, 0));

        ListView<CustomerAttachmentEntity> files = new ListView<>();
        files.setPrefHeight(320);
        files.setPlaceholder(UiLabels.emptyState("Sin archivos adjuntos", "Puede adjuntar fotos de cédula, pagarés, cartulinas o PDFs."));
        files.setCellFactory(v -> new ListCell<>() {
            @Override
            protected void updateItem(CustomerAttachmentEntity p, boolean empty) {
                super.updateItem(p, empty);
                if (empty || p == null) {
                    setText(null);
                } else {
                    String sizeLabel = p.getByteSize() >= 1024
                            ? (p.getByteSize() / 1024) + " KB"
                            : p.getByteSize() + " bytes";
                    String ts = p.getCreatedAt() != null && p.getCreatedAt().length() >= 16
                            ? p.getCreatedAt().substring(0, 16).replace("T", " ")
                            : (p.getCreatedAt() != null ? p.getCreatedAt() : "");
                    setText(p.getOriginalName() + " · " + p.getMediaType() + " · " + sizeLabel + " · " + ts);
                }
            }
        });

        Runnable refreshFiles = () -> files.getItems().setAll(attachments.list(customer.getId()));

        Button attach = new Button("Adjuntar archivo");
        attach.getStyleClass().add("btn-primary");
        attach.setOnAction(e -> run(() -> {
            FileChooser chooser = new FileChooser();
            chooser.setTitle("Foto, video o PDF del cliente");
            chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter(
                    "Archivos admitidos", "*.jpg", "*.jpeg", "*.png", "*.pdf", "*.mp4", "*.mov"
            ));
            var selected = chooser.showOpenDialog(this);
            if (selected != null) {
                attachments.attach(UUID.randomUUID().toString(), customer.getId(), selected.toPath());
                refreshFiles.run();
            }
        }));

        Button open = new Button("Abrir seleccionado");
        open.getStyleClass().add("btn-secondary");
        open.setOnAction(e -> run(() -> {
            var selected = files.getSelectionModel().getSelectedItem();
            if (selected == null) {
                throw new IllegalArgumentException("Seleccione un archivo.");
            }
            if (!Desktop.isDesktopSupported()) {
                throw new IllegalStateException("El sistema no soporta abrir archivos externos automáticamente.");
            }
            Desktop.getDesktop().open(attachments.openPath(selected.getId()).toFile());
        }));

        HBox fileActions = new HBox(8, attach, open);
        if (UserSessionContext.canCurrentUserReverseOrCancel()) {
            Button btnDeleteFile = new Button("Eliminar seleccionado");
            btnDeleteFile.setStyle("-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-weight: bold; -fx-cursor: hand;");
            btnDeleteFile.setOnAction(e -> run(() -> {
                var selected = files.getSelectionModel().getSelectedItem();
                if (selected == null) {
                    throw new IllegalArgumentException("Seleccione un archivo para eliminar.");
                }
                TextInputDialog dlg = new TextInputDialog();
                dlg.initOwner(this);
                dlg.setTitle("Eliminar archivo adjunto");
                dlg.setHeaderText("Eliminar \"" + selected.getOriginalName() + "\" (queda registrado en auditoría)");
                dlg.setContentText("Motivo obligatorio:");
                dlg.showAndWait().ifPresent(r -> {
                    attachments.delete(selected.getId(), r);
                    refreshFiles.run();
                });
            }));
            fileActions.getChildren().add(btnDeleteFile);
        }

        VBox filesBox = new VBox(
                10,
                new Label("Copias conservadas en la oficina; originales sin modificar"),
                files,
                fileActions
        );
        filesBox.setPadding(new Insets(10, 0, 0, 0));

        TabPane tabs = new TabPane(
                new Tab("Promesas y visitas", tracking),
                new Tab("Archivos", filesBox)
        );
        tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);

        Button close = new Button("Cerrar");
        close.getStyleClass().add("btn-secondary");
        close.setOnAction(e -> close());
        root.getChildren().addAll(tabs, close);

        refresh.run();
        refreshFiles.run();

        Scene scene = new Scene(root);
        scene.getStylesheets().add(getClass().getResource("/ui/theme.css").toExternalForm());
        setScene(scene);
    }

    private void run(Action action) {
        try {
            action.run();
        } catch (Exception ex) {
            Alert alert = new Alert(Alert.AlertType.ERROR, ex.getMessage());
            alert.initOwner(this);
            alert.showAndWait();
        }
    }

    private interface Action {
        void run() throws Exception;
    }

    public static void showAlerts(Stage owner, FollowUpService follow) {
        showAlerts(owner, follow, null);
    }

    public static void showAlerts(Stage owner, FollowUpService follow, CustomerRepository customerRepository) {
        Map<String, String> customerNames = customerRepository != null
                ? customerRepository.findAll().stream()
                        .collect(Collectors.toMap(CustomerEntity::getId, CustomerEntity::getFullName, (a, b) -> a))
                : Map.of();
        LocalDate today = LocalDate.now();
        var rows = follow.promises(null).stream()
                .filter(p -> "PENDIENTE".equalsIgnoreCase(p.getStatus()) && isDueOnOrBefore(p.getPromisedDate(), today))
                .map(p -> {
                    String custName = customerNames.getOrDefault(p.getCustomerId(), p.getCustomerId());
                    String noteSuffix = (p.getNotes() != null && !p.getNotes().isBlank()) ? " · " + p.getNotes() : "";
                    return p.getPromisedDate() + " · " + custName + " · " + CURRENCY.format(p.getAmount()) + noteSuffix;
                })
                .toList();
        Alert alert = new Alert(
                Alert.AlertType.INFORMATION,
                rows.isEmpty()
                        ? "No hay promesas pendientes para hoy o vencidas."
                        : String.join("\n", rows)
        );
        alert.initOwner(owner);
        alert.setTitle("Compromisos de Pago");
        alert.setHeaderText("Compromisos por atender (sin recargos automáticos)");
        alert.showAndWait();
    }

    private static boolean isDueOnOrBefore(String isoDate, LocalDate target) {
        if (isoDate == null || isoDate.isBlank()) return false;
        try {
            String d = isoDate.length() >= 10 ? isoDate.substring(0, 10) : isoDate;
            return !LocalDate.parse(d).isAfter(target);
        } catch (Exception ex) {
            return false;
        }
    }
}
