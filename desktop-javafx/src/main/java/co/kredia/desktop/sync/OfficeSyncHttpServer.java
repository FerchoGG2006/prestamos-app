package co.kredia.desktop.sync;

import co.kredia.desktop.service.FinancialLedgerService;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * Servidor HTTP embebido en la aplicacion nativa JavaFX (Puerto 8765).
 * Permite que los telefonos de los cobradores y del administrador sincronicen
 * directamente por Wi-Fi o red local con `cartera.db` en el PC de Oficina.
 * Endpoints compatibles con `local-store.ts` y `cloud-sync.ts`:
 * - GET  /api/sync/status
 * - POST /api/sync/push
 * - GET  /api/sync/pull
 */
public class OfficeSyncHttpServer {

    private final int port;
    private final FinancialLedgerService ledgerService;
    private final Runnable onSyncCompletedCallback;
    private HttpServer server;

    public OfficeSyncHttpServer(
            int port,
            FinancialLedgerService ledgerService,
            Runnable onSyncCompletedCallback
    ) {
        this.port = port;
        this.ledgerService = ledgerService;
        this.onSyncCompletedCallback = onSyncCompletedCallback;
    }

    public void start() throws IOException {
        if (server != null) return;
        server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);

        server.createContext("/api/sync/status", exchange -> {
            addCorsHeaders(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            String json = "{\"ok\":true,\"companyName\":\"Kredia Oficina Central (JavaFX)\",\"message\":\"Conectado a Servidor Nativo JavaFX en puerto " + port + "\"}";
            sendJson(exchange, 200, json);
        });

        server.createContext("/api/sync/push", exchange -> {
            addCorsHeaders(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"ok\":false,\"message\":\"Metodo no permitido\"}");
                return;
            }
            try {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                int count = ledgerService.importMobileSyncJson(body);
                if (onSyncCompletedCallback != null) {
                    onSyncCompletedCallback.run();
                }
                sendJson(exchange, 200, "{\"ok\":true,\"message\":\"Paquete sincronizado en cartera.db (" + count + " registros procesados).\"}");
            } catch (Exception e) {
                sendJson(exchange, 400, "{\"ok\":false,\"message\":\"" + e.getMessage().replace("\"", "'") + "\"}");
            }
        });

        server.createContext("/api/sync/pull", exchange -> {
            addCorsHeaders(exchange);
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                return;
            }
            try {
                String query = exchange.getRequestURI().getQuery();
                String routeFilter = null;
                int limit = 500;
                int offset = 0;
                if (query != null) {
                    for (String param : query.split("&")) {
                        String[] kv = param.split("=", 2);
                        if (kv.length == 2) {
                            if ("routeId".equals(kv[0])) {
                                routeFilter = kv[1];
                            } else if ("limit".equals(kv[0])) {
                                try { limit = Integer.parseInt(kv[1]); } catch (NumberFormatException ignored) {}
                            } else if ("offset".equals(kv[0])) {
                                try { offset = Integer.parseInt(kv[1]); } catch (NumberFormatException ignored) {}
                            }
                        }
                    }
                }
                String payload = ledgerService.exportMobileSyncJson(routeFilter, limit, offset);
                sendJson(exchange, 200, payload);
            } catch (Exception e) {
                sendJson(exchange, 500, "{\"ok\":false,\"message\":\"" + e.getMessage().replace("\"", "'") + "\"}");
            }
        });

        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    private void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Accept");
    }

    private void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
}
