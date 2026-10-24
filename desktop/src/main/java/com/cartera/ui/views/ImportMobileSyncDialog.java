package com.cartera.ui.views;

import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.application.MobileSyncProcessorService.SyncImportResult;
import com.cartera.sync.infrastructure.LanSyncServerService;
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

import java.io.File;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.Enumeration;

/**
 * Diálogo de Sincronización Bidireccional con Ruta Móvil:
 * 1. Sincronización directa por Red Local Wi-Fi / LAN (HTTP REST en puerto 8765, sin QR).
 * 2. Exportación de paquete de ruta a archivo .JSON para el móvil.
 * 3. Importación manual de archivo .JSON o texto pegado.
 */
public class ImportMobileSyncDialog extends Stage {

    private final MobileSyncProcessorService syncProcessorService;
    private final LanSyncServerService lanSyncServerService;
    private final Runnable onFinished;

    private final TextArea txtJson = new TextArea();
    private final Label lblStatus = new Label("Listo para sincronizar con el celular.");
    private final ProgressBar progressBar = new ProgressBar(0);

    public ImportMobileSyncDialog(Stage ownerStage,
                                  RecordPaymentUseCase paymentUseCase,
                                  CashMovementRepository cashMovementRepository,
                                  Runnable onFinished) {
        this(ownerStage, paymentUseCase, cashMovementRepository, null, null, null, null, null, null, null, null, null, onFinished);
    }

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
                                  Runnable onFinished) {
        this(ownerStage, paymentUseCase, cashMovementRepository, customerRepository, loanRepository,
                installmentRepository, createLoanUseCase, renewalRepository, paymentPromiseRepository,
                auditLogRepository, null, null, onFinished);
    }

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
        this.syncProcessorService = syncProcessorService != null
                ? syncProcessorService
                : new MobileSyncProcessorService(
                        paymentUseCase,
                        cashMovementRepository,
                        customerRepository,
                        loanRepository,
                        installmentRepository,
                        createLoanUseCase,
                        renewalRepository,
                        paymentPromiseRepository,
                        auditLogRepository,
                        null,
                        null
                );
        this.lanSyncServerService = lanSyncServerService;
        this.onFinished = onFinished;

        initModality(Modality.WINDOW_MODAL);
        initOwner(ownerStage);
        setTitle("Sincronización con el Celular del Cobrador");
        setWidth(680);
        setHeight(610);

        buildUI();
    }

    private void buildUI() {
        VBox root = new VBox(14);
        root.setPadding(new Insets(20));
        root.setStyle("-fx-background-color: #f8fafc;");

        // Cabecera
        VBox header = new VBox(4);
        Label title = new Label("Sincronización con el Celular del Cobrador");
        title.setStyle("-fx-text-fill: #0f172a; -fx-font-size: 16px; -fx-font-weight: bold;");
        Label sub = new Label("Transfiere la ruta del día al cobrador y recibe cobros, nuevos clientes y gastos registrados en calle.");
        sub.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        header.getChildren().addAll(title, sub);

        // 1. Banner Informativo de Conexión Wi-Fi
        VBox lanCard = buildLanBannerCard();

        // 2. Barra de Exportación e Importación de Datos
        HBox fileBar = new HBox(10);
        fileBar.setAlignment(Pos.CENTER_LEFT);

        Button btnExportRoute = new Button("📤 Enviar Ruta al Celular");
        btnExportRoute.setStyle("-fx-background-color: #2563eb; -fx-text-fill: white; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 8 14; -fx-cursor: hand;");
        btnExportRoute.setOnAction(e -> exportRouteToFile());

        Button btnPickFile = new Button("📁 Cargar Archivo de Cobros...");
        btnPickFile.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #1e293b; -fx-border-color: #cbd5e1; -fx-border-radius: 8; -fx-background-radius: 8; -fx-font-weight: bold; -fx-padding: 8 14; -fx-cursor: hand;");
        btnPickFile.setOnAction(e -> pickJsonFile());

        Label lblOr = new Label("o pega los datos recibidos:");
        lblOr.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        fileBar.getChildren().addAll(btnExportRoute, btnPickFile, lblOr);

        // TextArea
        txtJson.setPromptText("Pega aquí los datos de cobros si los enviaste por WhatsApp...");
        txtJson.setWrapText(true);
        txtJson.setStyle("-fx-font-family: 'Consolas', monospace; -fx-font-size: 11px;");
        VBox.setVgrow(txtJson, Priority.ALWAYS);

        // Status & Progress
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.setVisible(false);
        lblStatus.setStyle("-fx-text-fill: #64748b; -fx-font-size: 11px;");

        // Botones inferiores
        HBox actions = new HBox(12);
        actions.setAlignment(Pos.CENTER_RIGHT);

        Button btnCancel = new Button("Cerrar");
        btnCancel.setStyle("-fx-background-color: #f1f5f9; -fx-text-fill: #475569; -fx-font-weight: bold; -fx-padding: 8 16; -fx-background-radius: 8; -fx-cursor: hand;");
        btnCancel.setOnAction(e -> close());

        Button btnProcess = new Button("Guardar Cobros en el Sistema");
        btnProcess.setStyle("-fx-background-color: #059669; -fx-text-fill: white; -fx-font-weight: bold; -fx-padding: 8 20; -fx-background-radius: 8; -fx-cursor: hand;");
        btnProcess.setOnAction(e -> processImport());

        actions.getChildren().addAll(btnCancel, btnProcess);

        root.getChildren().addAll(header, lanCard, fileBar, txtJson, progressBar, lblStatus, actions);
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
        VBox card = new VBox(6);
        card.setPadding(new Insets(12, 16, 12, 16));
        card.setStyle("-fx-background-color: #eff6ff; -fx-border-color: #bfdbfe; -fx-border-radius: 10; -fx-background-radius: 10;");

        String ip = lanSyncServerService != null ? lanSyncServerService.getLocalIpAddress() : detectFallbackIp();
        int port = lanSyncServerService != null ? lanSyncServerService.getPort() : LanSyncServerService.DEFAULT_PORT;
        String connectionCode = ip + ":" + port;

        HBox topRow = new HBox(10);
        topRow.setAlignment(Pos.CENTER_LEFT);

        Label badge = new Label("📡 CONEXIÓN DIRECTA WI-FI");
        badge.setStyle("-fx-background-color: #1d4ed8; -fx-text-fill: white; -fx-font-size: 10px; -fx-font-weight: bold; -fx-padding: 3 8; -fx-background-radius: 10;");

        Label urlLabel = new Label("Código de Enlace: " + connectionCode);
        urlLabel.setStyle("-fx-text-fill: #1e3a8a; -fx-font-size: 13px; -fx-font-weight: bold;");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Button btnCopyUrl = new Button("📋 Copiar Código");
        btnCopyUrl.setStyle("-fx-background-color: #ffffff; -fx-text-fill: #1d4ed8; -fx-border-color: #93c5fd; -fx-border-radius: 6; -fx-background-radius: 6; -fx-font-size: 11px; -fx-font-weight: bold; -fx-padding: 4 10; -fx-cursor: hand;");
        btnCopyUrl.setOnAction(e -> {
            ClipboardContent content = new ClipboardContent();
            content.putString(connectionCode);
            Clipboard.getSystemClipboard().setContent(content);
            lblStatus.setText("Código de enlace copiado: " + connectionCode);
            lblStatus.setStyle("-fx-text-fill: #1d4ed8; -fx-font-size: 11px; -fx-font-weight: bold;");
        });

        topRow.getChildren().addAll(badge, urlLabel, spacer, btnCopyUrl);

        Label instructions = new Label(
                "En el celular del cobrador, conéctalo a la misma red Wi-Fi y usa este código en la opción 'Sincronizar' para transferir la ruta automáticamente."
        );
        instructions.setStyle("-fx-text-fill: #334155; -fx-font-size: 11px;");
        instructions.setWrapText(true);

        card.getChildren().addAll(topRow, instructions);
        return card;
    }

    private void exportRouteToFile() {
        try {
            String activeRoute = UserSessionContext.getSelectedRouteId();
            String routeForFile = "ALL".equalsIgnoreCase(activeRoute) ? "route-norte" : activeRoute;
            String jsonPackage = syncProcessorService.exportRoutePackage(activeRoute, LocalDate.now());

            txtJson.setText(jsonPackage);

            FileChooser chooser = new FileChooser();
            chooser.setTitle("Guardar Archivo de Ruta para Móvil");
            chooser.setInitialFileName("ruta_" + routeForFile + "_" + LocalDate.now() + ".json");
            chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivo de Ruta (*.json)", "*.json"));

            File dest = chooser.showSaveDialog(this);
            if (dest != null) {
                Files.writeString(dest.toPath(), jsonPackage, StandardCharsets.UTF_8);
                lblStatus.setText("Archivo de ruta guardado exitosamente: " + dest.getName());
                lblStatus.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");
            } else {
                lblStatus.setText("Datos de ruta listos en pantalla (puedes copiarlos o guardarlos).");
                lblStatus.setStyle("-fx-text-fill: #2563eb; -fx-font-size: 11px; -fx-font-weight: bold;");
            }
        } catch (Exception ex) {
            lblStatus.setText("Error al guardar archivo de ruta: " + ex.getMessage());
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
        }
    }

    private void pickJsonFile() {
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Seleccionar Archivo de Cobros");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("Archivo de Cobros (*.json)", "*.json"));
        File file = chooser.showOpenDialog(this);
        if (file != null) {
            try {
                String content = Files.readString(file.toPath());
                txtJson.setText(content);
                lblStatus.setText("Archivo cargado: " + file.getName());
                lblStatus.setStyle("-fx-text-fill: #059669; -fx-font-size: 11px; -fx-font-weight: bold;");
            } catch (Exception ex) {
                lblStatus.setText("Error al leer archivo: " + ex.getMessage());
                lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            }
        }
    }

    private void processImport() {
        String jsonText = txtJson.getText();
        if (jsonText == null || jsonText.isBlank()) {
            lblStatus.setText("Por favor selecciona un archivo o pega los cobros recibidos antes de continuar.");
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
            return;
        }

        try {
            SyncImportResult res = syncProcessorService.importPackage(jsonText);

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
        } catch (Exception e) {
            lblStatus.setText("Error al procesar los datos de cobro: " + e.getMessage());
            lblStatus.setStyle("-fx-text-fill: #dc2626; -fx-font-size: 11px;");
        }
    }

    private static String detectFallbackIp() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp() || iface.isVirtual()) continue;
                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        return addr.getHostAddress();
                    }
                }
            }
            return InetAddress.getLocalHost().getHostAddress();
        } catch (Exception e) {
            return "127.0.0.1";
        }
    }
}
