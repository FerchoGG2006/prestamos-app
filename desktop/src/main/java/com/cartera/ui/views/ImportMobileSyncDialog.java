package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.application.MobileSyncProcessorService.SyncImportResult;
import com.cartera.sync.infrastructure.LanSyncServerService;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.*;
import javafx.scene.input.Clipboard;
import javafx.scene.input.ClipboardContent;
import javafx.scene.layout.*;
import javafx.stage.FileChooser;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.util.StringConverter;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.List;

/**
 * Diálogo de Sincronización Bidireccional con Ruta Móvil:
 * 1. Sincronización directa por Red Local Wi-Fi / LAN mediante enlace temporal autorizado por ruta.
 * 2. Exportación de paquete de una ruta concreta a archivo .JSON para el móvil.
 * 3. Importación manual de archivo .JSON o texto pegado (en segundo plano).
 */
public class ImportMobileSyncDialog extends Stage {

    private final MobileSyncProcessorService syncProcessorService;
    private final LanSyncServerService lanSyncServerService;
    private final Runnable onFinished;

    private final ComboBox<RouteEntity> cmbRoute = new ComboBox<>();
    private final TextArea txtJson = new TextArea();
    private final Label lblStatus = new Label("Seleccione una ruta para generar un enlace temporal o exportar su paquete.");
    private final ProgressBar progressBar = new ProgressBar(ProgressBar.INDETERMINATE_PROGRESS);
    private Button btnExportRoute;
    private Button btnPickFile;
    private Button btnProcess;

    public ImportMobileSyncDialog(Stage ownerStage,
                                  RecordPaymentUseCase paymentUseCase,
                                  CashMovementRepository cashMovementRepository,
                                  CustomerRepository customerRepository,
                                  LoanRepository loanRepository,
                                  InstallmentRepository installmentRepository,
                                  CreateLoanUseCase createLoanUseCase,
                                  RenewalRepository renewalRepository,
                                  PaymentPromiseRepository paymentPromiseRepository,
                                  AuditLogRepository auditLogRepository,
                                  MobileSyncProcessorService syncProcessorService,
                                  LanSyncServerService lanSyncServerService,
                                  Runnable onFinished) {
        this.syncProcessorService = java.util.Objects.requireNonNull(syncProcessorService, "Se requiere el servicio transaccional de sincronización.");
        this.lanSyncServerService = lanSyncServerService;
        this.onFinished = onFinished;

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Sincronización con el Celular del Cobrador");
        setWidth(720);
        setHeight(650);

        loadRoutes();
        buildUI();
    }

    private void loadRoutes() {
        List<RouteEntity> available = List.of();
        if (lanSyncServerService != null) {
            try {
                available = lanSyncServerService.pairingRoutes();
            } catch (Exception ignored) {}
        }
        cmbRoute.setItems(FXCollections.observableArrayList(available));
        cmbRoute.setConverter(new StringConverter<>() {
            @Override
            public String toString(RouteEntity r) {
                return r == null ? "" : r.getName() + " [" + r.getId() + "]";
            }
            @Override
            public RouteEntity fromString(String s) { return null; }
        });

        String activeGlobal = UserSessionContext.getSelectedRouteId();
        RouteEntity matched = available.stream()
                .filter(r -> activeGlobal != null && activeGlobal.equalsIgnoreCase(r.getId()))
                .findFirst()
                .orElse(available.isEmpty() ? null : available.get(0));
        cmbRoute.setValue(matched);
    }

    private void buildUI() {
        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #f8fafc;");

        // Cabecera
        VBox header = new VBox(4);
        Label title = new Label("Sincronización con el Celular del Cobrador");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");
        Label sub = new Label("Habilite un enlace Wi-Fi temporal por ruta o intercambie paquetes JSON de cobros de forma segura.");
        sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        header.getChildren().addAll(title, sub);

        // Selector de ruta obligatorio
        HBox routeRow = new HBox(10);
        routeRow.setAlignment(Pos.CENTER_LEFT);
        Label lblRoute = new Label("Ruta a sincronizar:");
        lblRoute.setStyle("-fx-text-fill: #334155; -fx-font-weight: bold; -fx-font-size: 12px;");
        cmbRoute.setPrefWidth(300);
        cmbRoute.getStyleClass().add("search-field");
        routeRow.getChildren().addAll(lblRoute, cmbRoute);

        // 1. Banner Informativo de Conexión Wi-Fi (Pairing-First)
        VBox lanCard = buildLanBannerCard();

        // 2. Barra de Exportación e Importación de Datos
        HBox fileBar = new HBox(10);
        fileBar.setAlignment(Pos.CENTER_LEFT);

        btnExportRoute = new Button("Exportar Ruta (.json)");
        btnExportRoute.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 8 14; -fx-cursor: hand;");
        btnExportRoute.setOnAction(e -> exportRouteToFile());

        btnPickFile = new Button("Cargar Archivo de Cobros...");
        btnPickFile.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #1e293b; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 8 14; -fx-cursor: hand;");
        btnPickFile.setOnAction(e -> pickJsonFile());

        Label lblOr = new Label("o pega el JSON recibido del cobrador:");
        lblOr.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        fileBar.getChildren().addAll(btnExportRoute, btnPickFile, lblOr);

        // TextArea (solo para pegar/importar paquete del cobrador)
        txtJson.setPromptText("Pega aquí el paquete JSON de cobros enviado desde el celular...");
        txtJson.setWrapText(true);
        txtJson.setStyle("-fx-font-family: 'Consolas', monospace; -fx-font-size: 11px;");
        VBox.setVgrow(txtJson, Priority.ALWAYS);

        // Status & Progress
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setVisible(false);
        progressBar.setManaged(false);
        lblStatus.setWrapText(true);
        lblStatus.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

        // Botones inferiores
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cerrar");
        btnCancel.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-weight: bold; -fx-padding: 8 16; -fx-background-radius: 8; -fx-cursor: hand;");
        btnCancel.setOnAction(e -> close());

        btnProcess = new Button("Guardar Cobros en el Sistema");
        btnProcess.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 20; -fx-background-radius: 8; -fx-cursor: hand;");
        btnProcess.setOnAction(e -> processImport());

        actions.getChildren().addAll(btnCancel, btnProcess);

        root.getChildren().addAll(header, routeRow, lanCard, fileBar, txtJson, progressBar, lblStatus, actions);
        Scene scene = new Scene(root);
        try {
            var cssUrl = getClass().getResource("/ui/theme.css");
            if (cssUrl != null) {
                scene.getStylesheets().add(cssUrl.toExternalForm());
            }
        } catch (Exception ignored) {}
        setScene(scene);
    }

    private VBox buildLanBannerCard() {
        VBox card = new VBox(8);
        card.setPadding(new Insets(12, 16, 12, 16));
        card.setStyle("-fx-background-color: #eff6ff; -fx-border-color: #bfdbfe; -fx-border-radius: 10; -fx-background-radius: 10;");

        boolean running = lanSyncServerService != null && lanSyncServerService.isRunning();
        String baseEndpoint = lanSyncServerService != null ? lanSyncServerService.getServerEndpointDisplay() : "No disponible";
        final String[] pairingUrl = { null };

        HBox topRow = new HBox(10);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label badge = new Label(running ? "SERVIDOR WI-FI ACTIVO" : "SERVIDOR DETENIDO");
        badge.setStyle(running
                ? "-fx-background-color: #15803d; -fx-text-fill: white; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-background-radius: 10;"
                : "-fx-background-color: #dc2626; -fx-text-fill: white; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-background-radius: 10;");

        Label lblBase = new Label(running ? ("Red local: " + baseEndpoint) : "El servidor Wi-Fi local no está activo.");
        lblBase.setStyle("-fx-text-fill: #1e3a8a; -fx-font-size: 12px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        TextField txtPairingLink = new TextField();
        txtPairingLink.setEditable(false);
        txtPairingLink.setPromptText("Pulse 'Habilitar ruta (30 min)' para generar el enlace autorizado...");
        txtPairingLink.setStyle("-fx-font-family: 'Consolas', monospace; -fx-font-size: 11px;");
        HBox.setHgrow(txtPairingLink, Priority.ALWAYS);

        Button btnCopyUrl = new Button("Copiar Enlace");
        btnCopyUrl.setDisable(true);
        btnCopyUrl.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #1d4ed8; -fx-border-color: #93c5fd; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 10; -fx-cursor: hand;");
        btnCopyUrl.setOnAction(e -> {
            if (pairingUrl[0] == null || pairingUrl[0].isBlank()) return;
            ClipboardContent content = new ClipboardContent();
            content.putString(pairingUrl[0]);
            Clipboard.getSystemClipboard().setContent(content);
            lblStatus.setText("Enlace autorizado copiado al portapapeles.");
            lblStatus.setStyle("-fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold;");
        });

        Button btnPair = new Button("Habilitar ruta (30 min)");
        btnPair.getStyleClass().add("btn-primary");
        btnPair.setDisable(!running);
        btnPair.setOnAction(e -> {
            try {
                if (lanSyncServerService == null || !lanSyncServerService.isRunning()) {
                    throw new IllegalStateException("El servidor LAN no está activo.");
                }
                RouteEntity selected = cmbRoute.getValue();
                if (selected == null) {
                    throw new IllegalArgumentException("Seleccione una ruta activa antes de habilitar el enlace.");
                }
                pairingUrl[0] = lanSyncServerService.createPairingLink(selected.getId());
                txtPairingLink.setText(pairingUrl[0]);
                btnCopyUrl.setDisable(false);
                lblStatus.setText("Enlace temporal habilitado por 30 min para [" + selected.getName() + "]. Copie este enlace en el celular de esa ruta.");
                lblStatus.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");
            } catch (Exception ex) {
                lblStatus.setText("Error: " + ex.getMessage());
                lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            }
        });

        Button btnRevoke = new Button("Revocar enlaces");
        btnRevoke.setStyle("-fx-background-color: #fee2e2; -fx-text-fill: #dc2626; -fx-border-color: #fca5a5; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 5 10; -fx-cursor: hand;");
        btnRevoke.setDisable(!running);
        btnRevoke.setOnAction(e -> {
            try {
                if (lanSyncServerService != null) {
                    lanSyncServerService.revokePairings();
                }
                pairingUrl[0] = null;
                txtPairingLink.clear();
                btnCopyUrl.setDisable(true);
                lblStatus.setText("Todos los enlaces temporales Wi-Fi fueron revocados.");
                lblStatus.setStyle("-fx-text-fill: #b45309; -fx-font-size: 11px; -fx-font-weight: bold;");
            } catch (Exception ex) {
                lblStatus.setText("Error: " + ex.getMessage());
                lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            }
        });

        topRow.getChildren().addAll(badge, lblBase, spacer, btnPair, btnRevoke);

        HBox linkRow = new HBox(8, txtPairingLink, btnCopyUrl);
        linkRow.setAlignment(Pos.CENTER_LEFT);

        Label instructions = new Label(
                "Por seguridad, la app móvil solo puede sincronizar usando un enlace temporal (/enlace/...) habilitado para su ruta específica."
        );
        instructions.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px;");
        instructions.setWrapText(true);

        card.getChildren().addAll(topRow, linkRow, instructions);
        return card;
    }

    private void setBusy(boolean busy, String message) {
        progressBar.setVisible(busy);
        progressBar.setManaged(busy);
        if (btnExportRoute != null) btnExportRoute.setDisable(busy);
        if (btnPickFile != null) btnPickFile.setDisable(busy);
        if (btnProcess != null) btnProcess.setDisable(busy);
        if (message != null) {
            lblStatus.setText(message);
            lblStatus.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold;");
        }
    }

    private void exportRouteToFile() {
        RouteEntity selected = cmbRoute.getValue();
        if (selected == null) {
            lblStatus.setText("Seleccione una ruta específica antes de exportar el archivo JSON.");
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            return;
        }
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Guardar Archivo de Ruta para Móvil");
        chooser.setInitialFileName("ruta_" + selected.getId() + "_" + LocalDate.now() + ".json");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivo de Ruta (*.json)", "*.json"));

        File dest = chooser.showSaveDialog(this);
        if (dest == null) return;

        setBusy(true, "Generando paquete de la ruta " + selected.getName() + "...");
        Thread t = new Thread(() -> {
            try {
                String jsonPackage = syncProcessorService.exportRoutePackage(selected.getId(), LocalDate.now());
                Files.writeString(dest.toPath(), jsonPackage, StandardCharsets.UTF_8);
                Platform.runLater(() -> {
                    setBusy(false, null);
                    lblStatus.setText("Archivo de ruta guardado exitosamente: " + dest.getName());
                    lblStatus.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");
                });
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    setBusy(false, null);
                    lblStatus.setText("Error al exportar ruta: " + ex.getMessage());
                    lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
                });
            }
        }, "cartera-export-route-json");
        t.setDaemon(true);
        t.start();
    }

    private void pickJsonFile() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Seleccionar Archivo de Cobros");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivo de Cobros (*.json)", "*.json"));
        File file = chooser.showOpenDialog(this);
        if (file == null) return;

        setBusy(true, "Leyendo archivo " + file.getName() + "...");
        Thread t = new Thread(() -> {
            try {
                String content = Files.readString(file.toPath(), StandardCharsets.UTF_8);
                Platform.runLater(() -> {
                    setBusy(false, null);
                    txtJson.setText(content);
                    lblStatus.setText("Archivo cargado: " + file.getName() + ". Pulse 'Guardar Cobros en el Sistema' para aplicarlo.");
                    lblStatus.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");
                });
            } catch (Exception ex) {
                Platform.runLater(() -> {
                    setBusy(false, null);
                    lblStatus.setText("Error al leer archivo: " + ex.getMessage());
                    lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
                });
            }
        }, "cartera-read-sync-json");
        t.setDaemon(true);
        t.start();
    }

    private void processImport() {
        String jsonText = txtJson.getText();
        if (jsonText == null || jsonText.isBlank()) {
            lblStatus.setText("Por favor selecciona un archivo o pega los cobros recibidos antes de continuar.");
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            return;
        }

        setBusy(true, "Validando e importando paquete de cobros...");
        Thread t = new Thread(() -> {
            try {
                SyncImportResult res = syncProcessorService.importPackage(jsonText);
                Platform.runLater(() -> {
                    setBusy(false, null);
                    Alert alert = new Alert(res.paymentsFailed() > 0 ? Alert.AlertType.WARNING : Alert.AlertType.INFORMATION);
                    alert.initOwner(this);
                    alert.setTitle("Resultado de Sincronización");
                    alert.setHeaderText(res.paymentsFailed() > 0
                            ? "Paquete importado con observaciones"
                            : "Paquete de ruta importado correctamente");
                    alert.setContentText(res.summaryText());
                    alert.showAndWait();

                    if (onFinished != null) onFinished.run();
                    close();
                });
            } catch (Exception e) {
                Platform.runLater(() -> {
                    setBusy(false, null);
                    lblStatus.setText("Error al procesar los datos de cobro: " + e.getMessage());
                    lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
                });
            }
        }, "cartera-import-sync-json");
        t.setDaemon(true);
        t.start();
    }
}
