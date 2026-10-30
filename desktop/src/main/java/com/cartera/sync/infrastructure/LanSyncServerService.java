package com.cartera.sync.infrastructure;

import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.application.MobileSyncProcessorService.SyncImportResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import javafx.application.Platform;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Enumeration;
import java.util.concurrent.Executors;

/**
 * Servidor HTTP ligero integrado (Java HttpServer) en puerto 8765 para sincronización
 * bidireccional por red local Wi-Fi / LAN con la aplicación móvil (sin depender de internet ni QR).
 */
@Service
public class LanSyncServerService {

    public static final int DEFAULT_PORT = 8765;
    private static final int MAX_SYNC_PAYLOAD_BYTES = 5 * 1024 * 1024; // Límite defensivo de 5 MB por paquete
    private static final long MIN_REQUEST_INTERVAL_MS = 150L; // Rate limit básico por IP en LAN

    private final MobileSyncProcessorService syncProcessorService;
    private final ObjectMapper mapper = new ObjectMapper();
    private final java.util.concurrent.ConcurrentHashMap<String, Long> lastRequestByIp = new java.util.concurrent.ConcurrentHashMap<>();
    private HttpServer server;
    private int activePort = DEFAULT_PORT;
    private volatile Runnable onSyncReceivedCallback;
    private volatile String requiredSyncPin = null;

    public LanSyncServerService(MobileSyncProcessorService syncProcessorService) {
        this.syncProcessorService = syncProcessorService;
    }

    public void setRequiredSyncPin(String syncPin) {
        this.requiredSyncPin = (syncPin != null && !syncPin.isBlank()) ? syncPin.trim() : null;
    }

    public void setOnSyncReceivedCallback(Runnable callback) {
        this.onSyncReceivedCallback = callback;
    }

    @PostConstruct
    public void startServer() {
        try {
            try {
                server = HttpServer.create(new InetSocketAddress("0.0.0.0", DEFAULT_PORT), 0);
                activePort = DEFAULT_PORT;
            } catch (IOException bindEx) {
                // Si el puerto 8765 está ocupado (ej. otra instancia o test concurrente), usar un puerto libre
                server = HttpServer.create(new InetSocketAddress("0.0.0.0", 0), 0);
                activePort = server.getAddress().getPort();
            }

            server.createContext("/api/sync/status", this::handleStatus);
            server.createContext("/api/sync/package", this::handlePackage);
            server.createContext("/api/v1/app-version", this::handleAppVersion);
            server.createContext("/api/v1/download-apk", this::handleDownloadApk);
            server.setExecutor(Executors.newCachedThreadPool(r -> {
                Thread t = new Thread(r, "lan-sync-http-worker");
                t.setDaemon(true);
                return t;
            }));
            server.start();
        } catch (Exception ignored) {
            // No bloquear el arranque de la aplicación si el entorno restringe sockets
        }
    }

    @PreDestroy
    public void stopServer() {
        if (server != null) {
            try {
                server.stop(0);
            } catch (Exception ignored) {}
        }
    }

    public boolean isRunning() {
        return server != null;
    }

    public int getPort() {
        return activePort;
    }

    public String getLocalIpAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp() || iface.isVirtual()) continue;
                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        String ip = addr.getHostAddress();
                        if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
                            return ip;
                        }
                    }
                }
            }
            return InetAddress.getLocalHost().getHostAddress();
        } catch (Exception e) {
            return "127.0.0.1";
        }
    }

    public String getServerEndpointDisplay() {
        return "http://" + getLocalIpAddress() + ":" + activePort;
    }

    private void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Office-Sync-Pin");
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
    }

    private boolean isRateLimited(HttpExchange exchange) {
        if (exchange.getRemoteAddress() == null || exchange.getRemoteAddress().getAddress() == null) {
            return false;
        }
        String ip = exchange.getRemoteAddress().getAddress().getHostAddress();
        long now = System.currentTimeMillis();
        Long prev = lastRequestByIp.put(ip, now);
        return prev != null && (now - prev) < MIN_REQUEST_INTERVAL_MS;
    }

    private boolean isAuthorizedSyncRequest(HttpExchange exchange) {
        String expectedPin = this.requiredSyncPin;
        if (expectedPin == null || expectedPin.isBlank()) {
            return true;
        }
        String headerPin = exchange.getRequestHeaders().getFirst("X-Office-Sync-Pin");
        String queryPin = extractQueryParam(exchange.getRequestURI(), "pin");
        return expectedPin.equals(headerPin) || expectedPin.equals(queryPin);
    }

    private void handleStatus(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        ObjectNode node = mapper.createObjectNode();
        node.put("status", "OK");
        node.put("service", "Sistema Cartera Desktop LAN Sync");
        node.put("ip", getLocalIpAddress());
        node.put("port", activePort);
        node.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));

        sendJsonResponse(exchange, 200, mapper.writeValueAsString(node));
    }

    private void handlePackage(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        String method = exchange.getRequestMethod();

        if ("OPTIONS".equalsIgnoreCase(method)) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        try {
            if (isRateLimited(exchange)) {
                sendErrorResponse(exchange, 429, "Demasiadas solicitudes seguidas desde este dispositivo. Intente en unos segundos.");
                return;
            }
            if (!isAuthorizedSyncRequest(exchange)) {
                sendErrorResponse(exchange, 401, "PIN de sincronización de oficina inválido o no autorizado.");
                return;
            }

            if ("GET".equalsIgnoreCase(method)) {
                String routeId = extractQueryParam(exchange.getRequestURI(), "routeId");
                String jsonPackage = syncProcessorService.exportRoutePackage(routeId, LocalDate.now());
                sendJsonResponse(exchange, 200, jsonPackage);
            } else if ("POST".equalsIgnoreCase(method)) {
                byte[] rawBytes = exchange.getRequestBody().readNBytes(MAX_SYNC_PAYLOAD_BYTES + 1);
                if (rawBytes.length > MAX_SYNC_PAYLOAD_BYTES) {
                    sendErrorResponse(exchange, 413, "El paquete de sincronización supera el tamaño máximo permitido (5 MB).");
                    return;
                }
                String body = new String(rawBytes, StandardCharsets.UTF_8);
                if (body.isBlank()) {
                    sendErrorResponse(exchange, 400, "El cuerpo del paquete de sincronización está vacío.");
                    return;
                }
                SyncImportResult res = syncProcessorService.importPackage(body);

                if (onSyncReceivedCallback != null) {
                    try {
                        Platform.runLater(onSyncReceivedCallback);
                    } catch (IllegalStateException notFx) {
                        onSyncReceivedCallback.run();
                    }
                }

                ObjectNode resp = mapper.createObjectNode();
                resp.put("status", "OK");
                resp.put("routeId", res.routeId());
                resp.put("operatingDate", res.operatingDate());
                resp.put("paymentsApplied", res.paymentsApplied());
                resp.put("paymentsSkipped", res.paymentsSkipped());
                resp.put("customersImported", res.customersImported());
                resp.put("loansImported", res.loansImported());
                resp.put("renewalsImported", res.renewalsImported());
                resp.put("expensesImported", res.expensesImported());
                resp.put("summary", res.summaryText());

                sendJsonResponse(exchange, 200, mapper.writeValueAsString(resp));
            } else {
                sendErrorResponse(exchange, 405, "Método HTTP no soportado: " + method);
            }
        } catch (Exception ex) {
            sendErrorResponse(exchange, 400, ex.getMessage());
        }
    }

    private String extractQueryParam(URI uri, String key) {
        if (uri == null || uri.getRawQuery() == null) return null;
        for (String pair : uri.getRawQuery().split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && key.equalsIgnoreCase(kv[0])) {
                return java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private void sendJsonResponse(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        } finally {
            exchange.close();
        }
    }

    private void handleAppVersion(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        // Si existe un archivo app-version.json personalizado en el directorio, devolverlo directamente
        java.nio.file.Path configPath = resolveFilePath("app-version.json");
        if (configPath != null && java.nio.file.Files.isRegularFile(configPath)) {
            try {
                String customJson = java.nio.file.Files.readString(configPath, StandardCharsets.UTF_8);
                sendJsonResponse(exchange, 200, customJson);
                return;
            } catch (Exception ignored) {}
        }

        ObjectNode node = mapper.createObjectNode();
        node.put("status", "OK");
        node.put("app_name", "Kredia");
        node.put("min_version", "1.2.0");
        node.put("latest_version", "1.2.1");
        node.put("version_code", 4);
        node.put("apk_url", "/api/v1/download-apk");
        node.put("force_update", false);
        node.put("release_notes", "• Selección rápida de modalidades de pago con pastillas ergonómicas.\n• Selector de fecha fija con calendario integrado.\n• Modo privacidad aislado por sesión y recordar contraseña.\n• Sincronización ultrarrápida bidireccional por Wi-Fi local sin internet.");

        sendJsonResponse(exchange, 200, mapper.writeValueAsString(node));
    }

    private void handleDownloadApk(HttpExchange exchange) throws IOException {
        addCorsHeaders(exchange);
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
            return;
        }

        java.nio.file.Path apkPath = resolveFilePath("kredia.apk");
        if (apkPath == null || !java.nio.file.Files.isRegularFile(apkPath)) {
            sendErrorResponse(exchange, 404, "El archivo instalador kredia.apk no se encuentra disponible en el servidor.");
            return;
        }

        long fileSize = java.nio.file.Files.size(apkPath);
        exchange.getResponseHeaders().set("Content-Type", "application/vnd.android.package-archive");
        exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=\"kredia.apk\"");
        exchange.getResponseHeaders().set("Content-Length", String.valueOf(fileSize));

        if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }

        exchange.sendResponseHeaders(200, fileSize);
        try (OutputStream os = exchange.getResponseBody();
             java.io.InputStream is = java.nio.file.Files.newInputStream(apkPath)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = is.read(buffer)) != -1) {
                os.write(buffer, 0, read);
            }
            os.flush();
        } finally {
            exchange.close();
        }
    }

    private java.nio.file.Path resolveFilePath(String fileName) {
        java.nio.file.Path direct = java.nio.file.Path.of(fileName);
        if (java.nio.file.Files.exists(direct)) return direct;

        java.nio.file.Path parent = java.nio.file.Path.of("..", fileName);
        if (java.nio.file.Files.exists(parent)) return parent;

        String userDir = System.getProperty("user.dir", ".");
        java.nio.file.Path inUserDir = java.nio.file.Path.of(userDir, fileName);
        if (java.nio.file.Files.exists(inUserDir)) return inUserDir;

        return null;
    }

    private void sendErrorResponse(HttpExchange exchange, int statusCode, String message) throws IOException {
        ObjectNode err = mapper.createObjectNode();
        err.put("status", "ERROR");
        err.put("message", message != null ? message : "Error interno de sincronización");
        sendJsonResponse(exchange, statusCode, mapper.writeValueAsString(err));
    }
}
