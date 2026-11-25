package com.cartera.ui.views;

import com.cartera.infrastructure.backup.OfficeRecoveryService;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.TextField;
import javafx.scene.control.TextInputDialog;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.stage.DirectoryChooser;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;

import java.awt.Desktop;
import java.io.File;
import java.nio.file.Path;
import java.time.LocalDate;

public final class RecoveryDialog extends Stage {

    public RecoveryDialog(Stage owner, OfficeRecoveryService service) {
        initOwner(owner);
        initModality(Modality.WINDOW_MODAL);
        setTitle("Respaldo y recuperación de oficina");

        Label header = new Label("Respaldo Completo y Recuperación Segura");
        header.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");

        Label result = new Label(
                "La oficina actual permanece abierta y sin cambios. La recuperación crea una carpeta nueva en modo consulta seguro (sin sobreescribir la nube)."
        );
        result.setWrapText(true);
        result.setStyle("-fx-text-fill: #334155; -fx-font-size: 12px;");

        ProgressBar progress = new ProgressBar(ProgressBar.INDETERMINATE_PROGRESS);
        progress.setMaxWidth(Double.MAX_VALUE);
        progress.setVisible(false);
        progress.setManaged(false);

        VBox commandBox = new VBox(6);
        commandBox.setVisible(false);
        commandBox.setManaged(false);
        commandBox.setStyle("-fx-background-color: #f8fafc; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-padding: 10;");
        Label lblCmdTitle = new Label("Comando para abrir la oficina recuperada:");
        lblCmdTitle.setStyle("-fx-text-fill: #475569; -fx-font-size: 11px; -fx-font-weight: bold;");
        TextField txtCommand = new TextField();
        txtCommand.setEditable(false);
        txtCommand.setStyle("-fx-font-family: 'Consolas', monospace; -fx-font-size: 11px;");
        HBox.setHgrow(txtCommand, Priority.ALWAYS);

        final Path[] lastRecoveredDir = { null };
        Button btnCopyCmd = new Button("Copiar Comando");
        btnCopyCmd.getStyleClass().add("btn-primary");
        btnCopyCmd.setOnAction(e -> {
            ClipboardContent content = new ClipboardContent();
            content.putString(txtCommand.getText());
            Clipboard.getSystemClipboard().setContent(content);
            result.setText("Comando copiado al portapapeles.");
            result.setStyle("-fx-text-fill: #059669; -fx-font-size: 12px; -fx-font-weight: bold;");
        });

        Button btnOpenRecovered = new Button("Abrir Carpeta");
        btnOpenRecovered.getStyleClass().add("btn-secondary");
        btnOpenRecovered.setOnAction(e -> {
            try {
                if (lastRecoveredDir[0] != null && Desktop.isDesktopSupported()) {
                    Desktop.getDesktop().open(lastRecoveredDir[0].toFile());
                }
            } catch (Exception ex) {
                result.setText("No se pudo abrir la carpeta: " + ex.getMessage());
                result.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 12px;");
            }
        });

        HBox cmdRow = new HBox(8, txtCommand, btnCopyCmd, btnOpenRecovered);
        cmdRow.setAlignment(Pos.CENTER_LEFT);
        commandBox.getChildren().addAll(lblCmdTitle, cmdRow);

        Button export = new Button("Exportar oficina y adjuntos (.zip)");
        export.getStyleClass().add("btn-primary");

        Button restore = new Button("Recuperar en una carpeta nueva");
        restore.getStyleClass().add("btn-secondary");

        Button close = new Button("Cerrar");
        close.getStyleClass().add("btn-secondary");
        close.setOnAction(e -> close());

        export.setOnAction(e -> {
            FileChooser chooser = new FileChooser();
            chooser.setTitle("Exportar Paquete Completo de Oficina (.zip)");
            chooser.setInitialFileName("Oficina-" + LocalDate.now() + ".zip");
            chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Paquete de oficina (*.zip)", "*.zip"));
            File chosen = chooser.showSaveDialog(this);
            if (chosen == null) return;
            Path targetPath = chosen.getName().toLowerCase().endsWith(".zip")
                    ? chosen.toPath()
                    : chosen.toPath().resolveSibling(chosen.getName() + ".zip");

            export.setDisable(true);
            restore.setDisable(true);
            progress.setVisible(true);
            progress.setManaged(true);
            result.setText("Empaquetando base de datos y adjuntos verificados...");
            result.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 12px;");

            Thread t = new Thread(() -> {
                try {
                    Path saved = service.exportOffice(targetPath);
                    Platform.runLater(() -> {
                        export.setDisable(false);
                        restore.setDisable(false);
                        progress.setVisible(false);
                        progress.setManaged(false);
                        result.setText("Paquete verificado exportado con éxito en:\n" + saved);
                        result.setStyle("-fx-text-fill: #059669; -fx-font-size: 12px; -fx-font-weight: bold;");
                    });
                } catch (Exception ex) {
                    Platform.runLater(() -> {
                        export.setDisable(false);
                        restore.setDisable(false);
                        progress.setVisible(false);
                        progress.setManaged(false);
                        result.setText("Error al exportar: " + ex.getMessage());
                        result.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 12px;");
                    });
                }
            }, "cartera-office-export");
            t.setDaemon(true);
            t.start();
        });

        restore.setOnAction(e -> {
            FileChooser chooser = new FileChooser();
            chooser.setTitle("Seleccionar Respaldo (.zip o .db)");
            chooser.getExtensionFilters().add(
                    new FileChooser.ExtensionFilter("Respaldo de oficina (*.zip, *.db)", "*.zip", "*.db")
            );
            File source = chooser.showOpenDialog(this);
            if (source == null) return;

            DirectoryChooser directory = new DirectoryChooser();
            directory.setTitle("Carpeta donde crear la oficina recuperada");
            File parent = directory.showDialog(this);
            if (parent == null) return;

            TextInputDialog reason = new TextInputDialog();
            reason.initOwner(this);
            reason.setTitle("Motivo de recuperación");
            reason.setHeaderText("Motivo de recuperación. No reemplaza la oficina actual.");
            reason.showAndWait().ifPresent(value -> {
                export.setDisable(true);
                restore.setDisable(true);
                progress.setVisible(true);
                progress.setManaged(true);
                commandBox.setVisible(false);
                commandBox.setManaged(false);
                result.setText("Verificando integridad SQLite y preparando oficina recuperada...");
                result.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 12px;");

                Thread t = new Thread(() -> {
                    try {
                        Path target = service.recover(source.toPath(), parent.toPath(), value);
                        String warning = service.getLastRecoveryWarning();
                        Platform.runLater(() -> {
                            export.setDisable(false);
                            restore.setDisable(false);
                            progress.setVisible(false);
                            progress.setManaged(false);
                            lastRecoveredDir[0] = target;
                            txtCommand.setText("SistemaCartera.exe --office-dir=\"" + target + "\"");
                            commandBox.setVisible(true);
                            commandBox.setManaged(true);
                            String msg = "Oficina recuperada y verificada en: " + target
                                    + "\n(Modo seguro activado: no enviará datos históricos a la nube).";
                            if (warning != null && !warning.isBlank()) {
                                msg += "\n" + warning;
                            }
                            result.setText(msg);
                            result.setStyle("-fx-text-fill: #059669; -fx-font-size: 12px; -fx-font-weight: bold;");
                        });
                    } catch (Exception ex) {
                        Platform.runLater(() -> {
                            export.setDisable(false);
                            restore.setDisable(false);
                            progress.setVisible(false);
                            progress.setManaged(false);
                            result.setText("No se pudo recuperar: " + ex.getMessage());
                            result.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 12px;");
                        });
                    }
                }, "cartera-office-recovery");
                t.setDaemon(true);
                t.start();
            });
        });

        HBox actionBtns = new HBox(10, export, restore);
        actionBtns.setAlignment(Pos.CENTER_LEFT);

        HBox bottomRow = new HBox(close);
        bottomRow.setAlignment(Pos.CENTER_RIGHT);

        VBox root = new VBox(14, header, result, progress, actionBtns, commandBox, bottomRow);
        root.setPadding(new Insets(22));
        root.setStyle("-fx-background-color: #ffffff;");
        root.setPrefWidth(680);

        Scene scene = new Scene(root);
        var css = getClass().getResource("/ui/theme.css");
        if (css != null) scene.getStylesheets().add(css.toExternalForm());
        setScene(scene);
    }
}
