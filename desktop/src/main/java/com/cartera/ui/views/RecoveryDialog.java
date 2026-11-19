package com.cartera.ui.views;

import com.cartera.infrastructure.backup.OfficeRecoveryService;
import javafx.geometry.Insets;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.TextInputDialog;
import javafx.scene.layout.VBox;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.time.LocalDate;

public final class RecoveryDialog extends Stage {

    public RecoveryDialog(Stage owner, OfficeRecoveryService service) {
        initOwner(owner);
        initModality(Modality.WINDOW_MODAL);
        setTitle("Respaldo y recuperación de oficina");

        Label result = new Label(
                "La oficina actual permanece abierta y sin cambios. Se recupera en una carpeta nueva."
        );
        result.setWrapText(true);

        Button export = new Button("Exportar oficina y adjuntos (.zip)");
        export.setOnAction(e -> {
            try {
                FileChooser chooser = new FileChooser();
                chooser.setInitialFileName("Oficina-" + LocalDate.now() + ".zip");
                var target = chooser.showSaveDialog(this);
                if (target != null) {
                    result.setText("Paquete verificado: " + service.exportOffice(target.toPath()));
                }
            } catch (Exception ex) {
                result.setText(ex.getMessage());
            }
        });

        Button restore = new Button("Recuperar en una carpeta nueva");
        restore.setOnAction(e -> {
            try {
                FileChooser chooser = new FileChooser();
                chooser.getExtensionFilters().add(
                        new FileChooser.ExtensionFilter("Respaldo de oficina", "*.zip", "*.db")
                );
                var source = chooser.showOpenDialog(this);
                if (source == null) {
                    return;
                }
                DirectoryChooser directory = new DirectoryChooser();
                directory.setTitle("Carpeta donde crear la oficina recuperada");
                var parent = directory.showDialog(this);
                if (parent == null) {
                    return;
                }
                TextInputDialog reason = new TextInputDialog();
                reason.initOwner(this);
                reason.setHeaderText("Motivo de recuperación. No reemplaza la oficina actual.");
                reason.showAndWait().ifPresent(value -> {
                    try {
                        var target = service.recover(source.toPath(), parent.toPath(), value);
                        result.setText(
                                "Oficina recuperada y verificada: " + target
                                        + "\nPara abrirla: SistemaCartera.exe --office-dir=\"" + target
                                        + "\". Conserve la oficina anterior."
                        );
                    } catch (Exception ex) {
                        result.setText(ex.getMessage());
                    }
                });
            } catch (Exception ex) {
                result.setText(ex.getMessage());
            }
        });

        Button close = new Button("Cerrar");
        close.setOnAction(e -> close());

        VBox root = new VBox(14, result, export, restore, close);
        root.setPadding(new Insets(22));
        root.setPrefWidth(660);
        setScene(new Scene(root));
    }
}
