package com.cartera.ui.views;

import com.cartera.customers.application.AttachmentService;
import com.cartera.customers.application.FollowUpService;
import com.cartera.infrastructure.persistence.entity.CustomerAttachmentEntity;
import com.cartera.infrastructure.persistence.entity.CustomerEntity;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.PaymentPromiseEntity;
import com.cartera.infrastructure.persistence.repository.LoanRepository;
import com.cartera.ui.util.CurrencyInputUtil;
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
import java.time.LocalDate;
import java.util.UUID;
import java.util.function.Consumer;

/** Native follow-up and managed files, without changing credit balances. */
public class CustomerOperationsDialog extends Stage {

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
                        .filter(l -> "ACTIVO".equals(l.getStatus()))
                        .toList()
        );
        credit.setConverter(new StringConverter<>() {
            @Override
            public String toString(LoanEntity l) {
                return l == null ? "" : l.getId() + " · " + l.getStatus();
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
        promises.setCellFactory(v -> new ListCell<>() {
            @Override
            protected void updateItem(PaymentPromiseEntity p, boolean empty) {
                super.updateItem(p, empty);
                setText(empty || p == null
                        ? null
                        : p.getPromisedDate() + " · $" + p.getAmount().toPlainString()
                        + " · " + p.getStatus() + " · " + p.getNotes());
            }
        });

        ListView<String> visits = new ListView<>();
        visits.setPrefHeight(85);

        Runnable refresh = () -> {
            promises.getItems().setAll(follow.promises(customer.getId()));
            visits.getItems().setAll(
                    follow.visits(customer.getId()).stream()
                            .map(v -> v.getCreatedAt() + " · " + v.getReason())
                            .toList()
            );
        };

        Button save = new Button("Registrar promesa");
        String promiseId = UUID.randomUUID().toString();
        save.setOnAction(e -> run(() -> {
            if (credit.getValue() == null) {
                throw new IllegalArgumentException("Seleccione un crédito activo.");
            }
            follow.promise(
                    promiseId,
                    credit.getValue().getId(),
                    CurrencyInputUtil.parseAmount(amount.getText()),
                    date.getValue(),
                    notes.getText()
            );
            save.setDisable(true);
            refresh.run();
        }));

        Button visit = new Button("Registrar visita sin pago");
        visit.setOnAction(e -> run(() -> {
            if (credit.getValue() == null) {
                throw new IllegalArgumentException("Seleccione un crédito activo.");
            }
            follow.visit(UUID.randomUUID().toString(), credit.getValue().getId(), notes.getText());
            refresh.run();
        }));

        Button fulfilled = new Button("Marcar cumplida");
        Button cancel = new Button("Cancelar promesa");
        Consumer<String> resolve = status -> run(() -> {
            var selected = promises.getSelectionModel().getSelectedItem();
            if (selected == null) {
                throw new IllegalArgumentException("Seleccione una promesa.");
            }
            TextInputDialog reason = new TextInputDialog();
            reason.initOwner(this);
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

        ListView<CustomerAttachmentEntity> files = new ListView<>();
        files.setPrefHeight(320);
        files.setCellFactory(v -> new ListCell<>() {
            @Override
            protected void updateItem(CustomerAttachmentEntity p, boolean empty) {
                super.updateItem(p, empty);
                setText(empty || p == null
                        ? null
                        : p.getOriginalName() + " · " + p.getMediaType()
                        + " · " + p.getByteSize() + " bytes · " + p.getCreatedAt());
            }
        });

        Runnable refreshFiles = () -> files.getItems().setAll(attachments.list(customer.getId()));

        Button attach = new Button("Adjuntar archivo");
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
        open.setOnAction(e -> run(() -> {
            var selected = files.getSelectionModel().getSelectedItem();
            if (selected == null) {
                throw new IllegalArgumentException("Seleccione un archivo.");
            }
            Desktop.getDesktop().open(attachments.openPath(selected.getId()).toFile());
        }));

        VBox filesBox = new VBox(
                10,
                new Label("Copias conservadas en la oficina; originales sin modificar"),
                files,
                new HBox(8, attach, open)
        );
        TabPane tabs = new TabPane(
                new Tab("Promesas y visitas", tracking),
                new Tab("Archivos", filesBox)
        );
        tabs.setTabClosingPolicy(TabPane.TabClosingPolicy.UNAVAILABLE);

        Button close = new Button("Cerrar");
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
            new Alert(Alert.AlertType.ERROR, ex.getMessage()).showAndWait();
        }
    }

    private interface Action {
        void run() throws Exception;
    }

    public static void showAlerts(Stage owner, FollowUpService follow) {
        var rows = follow.promises(null).stream()
                .filter(p -> "PENDIENTE".equals(p.getStatus())
                        && !LocalDate.parse(p.getPromisedDate()).isAfter(LocalDate.now()))
                .map(p -> p.getPromisedDate() + " · cliente " + p.getCustomerId()
                        + " · $" + p.getAmount().toPlainString())
                .toList();
        Alert alert = new Alert(
                Alert.AlertType.INFORMATION,
                rows.isEmpty()
                        ? "No hay promesas pendientes para hoy o vencidas."
                        : String.join("\n", rows)
        );
        alert.initOwner(owner);
        alert.setHeaderText("Compromisos por atender (sin recargos automáticos)");
        alert.showAndWait();
    }
}
