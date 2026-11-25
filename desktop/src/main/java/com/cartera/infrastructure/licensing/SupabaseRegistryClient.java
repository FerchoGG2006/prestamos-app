package com.cartera.infrastructure.licensing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Cliente HTTP para Supabase con soporte de RLS estricto por token de sesión (x-kredia-session)
 * y RPCs protegidas del Panel Comercial (x-kredia-vendor-key).
 */
@Component
public class SupabaseRegistryClient {

    public record RemoteOffice(
            String id,
            String companyName,
            String activationCode,
            String licenseStatus,
            String licensePlan,
            String licenseExpiresAt,
            String ownerName,
            String supportPhone,
            String city
    ) {}

    public record CloudAuthResponse(
            boolean ok,
            String error,
            String sessionToken,
            RemoteOffice office,
            JsonNode userNode
    ) {}

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private volatile String activeSessionToken = "";
    private volatile String vendorSecretKey = "";

    public SupabaseRegistryClient() {
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    public void setActiveSessionToken(String token) {
        this.activeSessionToken = token == null ? "" : token.trim();
    }

    public String getActiveSessionToken() {
        return activeSessionToken;
    }

    public void setVendorSecretKey(String vendorKey) {
        this.vendorSecretKey = vendorKey == null ? "" : vendorKey.trim();
    }

    /**
     * Autentica al usuario directamente en servidor (RPC authenticate_kredia_user) sin exponer hashes,
     * validando contraseña y licencia activa, y recibiendo un token de sesión de 30 días.
     */
    public CloudAuthResponse authenticateUser(String supabaseUrl, String apiKey, String username, String rawPassword) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/authenticate_kredia_user";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_username", username.trim().toLowerCase());
        body.put("p_password", rawPassword);

        HttpRequest req = baseRequest(url, apiKey, null, null)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();

        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Error autenticando en servidor (" + resp.statusCode() + "): " + resp.body());
        }

        JsonNode root = objectMapper.readTree(resp.body());
        boolean ok = root.path("ok").asBoolean(false);
        if (!ok) {
            return new CloudAuthResponse(false, root.path("error").asText("Usuario o contraseña incorrectos."), null, null, null);
        }

        String token = root.path("session_token").asText("");
        RemoteOffice office = parseOffice(root.path("office"));
        JsonNode userNode = root.path("user");
        setActiveSessionToken(token);
        return new CloudAuthResponse(true, "", token, office, userNode);
    }

    public List<RemoteOffice> listOffices(String supabaseUrl, String apiKey) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_list_offices";

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Error consultando oficinas (" + resp.statusCode() + "): " + resp.body());
        }

        JsonNode arr = objectMapper.readTree(resp.body());
        List<RemoteOffice> result = new ArrayList<>();
        if (arr.isArray()) {
            for (JsonNode n : arr) {
                result.add(parseOffice(n));
            }
        }
        return result;
    }

    public Optional<RemoteOffice> findOfficeById(String supabaseUrl, String apiKey, String officeId) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String encoded = URLEncoder.encode(officeId.trim(), StandardCharsets.UTF_8);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/offices?id=eq." + encoded + "&limit=1";

        HttpRequest req = baseRequest(url, apiKey, activeSessionToken, null).GET().build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Error consultando oficina (" + resp.statusCode() + "): " + resp.body());
        }

        JsonNode arr = objectMapper.readTree(resp.body());
        if (arr.isArray() && !arr.isEmpty()) {
            return Optional.of(parseOffice(arr.get(0)));
        }
        return Optional.empty();
    }

    public Optional<JsonNode> fetchOfficeSettings(String supabaseUrl, String apiKey, String officeId) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String encoded = URLEncoder.encode(officeId.trim(), StandardCharsets.UTF_8);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/offices?id=eq." + encoded + "&select=settings&limit=1";

        HttpRequest req = baseRequest(url, apiKey, activeSessionToken, null).GET().build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            return Optional.empty();
        }
        JsonNode arr = objectMapper.readTree(resp.body());
        if (arr.isArray() && !arr.isEmpty()) {
            JsonNode settings = arr.get(0).path("settings");
            if (settings != null && settings.isObject()) {
                return Optional.of(settings);
            }
        }
        return Optional.empty();
    }

    public void patchOfficeSettings(String supabaseUrl, String apiKey, String officeId, ObjectNode settings) throws Exception {
        if (settings == null) return;
        validateConnection(supabaseUrl, apiKey);
        String encoded = URLEncoder.encode(officeId.trim(), StandardCharsets.UTF_8);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/offices?id=eq." + encoded;

        ObjectNode body = objectMapper.createObjectNode();
        body.set("settings", settings);
        body.put("updated_at", java.time.Instant.now().toString());

        HttpRequest req = baseRequest(url, apiKey, activeSessionToken, null)
                .header("Prefer", "return=minimal")
                .method("PATCH", HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Error actualizando configuración de oficina (" + resp.statusCode() + "): " + resp.body());
        }
    }

    public List<JsonNode> fetchOfficeRows(String supabaseUrl, String apiKey, String table, String officeId) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String encoded = URLEncoder.encode(officeId.trim(), StandardCharsets.UTF_8);
        String baseUrl = normalizeBaseUrl(supabaseUrl) + "/rest/v1/" + table + "?office_id=eq." + encoded + "&order=id.asc";

        final int pageSize = 1000;
        List<JsonNode> out = new ArrayList<>();
        int offset = 0;
        while (true) {
            int end = offset + pageSize - 1;
            HttpRequest req = baseRequest(baseUrl, apiKey, activeSessionToken, null)
                    .header("Range-Unit", "items")
                    .header("Range", offset + "-" + end)
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 416) {
                // Range not satisfiable: exact boundary reached on previous page
                break;
            }
            if (resp.statusCode() >= 400) {
                throw new IllegalStateException("Error descargando " + table + " (" + resp.statusCode() + "): " + resp.body());
            }

            JsonNode arr = objectMapper.readTree(resp.body());
            int fetched = 0;
            if (arr.isArray()) {
                for (JsonNode n : arr) {
                    out.add(n);
                    fetched++;
                }
            }
            if (fetched < pageSize) {
                break;
            }
            offset += pageSize;
        }
        return out;
    }

    public void upsertRowsBatch(String supabaseUrl, String apiKey, String table, List<ObjectNode> rows, boolean ignoreDuplicates) throws Exception {
        upsertRowsBatch(supabaseUrl, apiKey, table, rows, ignoreDuplicates, null);
    }

    public void upsertRowsBatch(String supabaseUrl, String apiKey, String table, List<ObjectNode> rows, boolean ignoreDuplicates, String onConflict) throws Exception {
        if (rows == null || rows.isEmpty()) return;
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/" + table
                + (onConflict != null && !onConflict.isBlank()
                ? "?on_conflict=" + URLEncoder.encode(onConflict.trim(), StandardCharsets.UTF_8)
                : "");
        String prefer = ignoreDuplicates
                ? "resolution=ignore-duplicates,return=minimal"
                : "resolution=merge-duplicates,return=minimal";

        int chunkSize = 100;
        for (int i = 0; i < rows.size(); i += chunkSize) {
            ArrayNode arr = objectMapper.createArrayNode();
            for (int j = i; j < Math.min(i + chunkSize, rows.size()); j++) {
                arr.add(rows.get(j));
            }
            HttpRequest req = baseRequest(url, apiKey, activeSessionToken, null)
                    .header("Prefer", prefer)
                    .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(arr)))
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() >= 400) {
                throw new IllegalStateException("Error sincronizando " + table + " (" + resp.statusCode() + "): " + resp.body());
            }
        }
    }

    public ObjectNode createObjectNode() {
        return objectMapper.createObjectNode();
    }

    public Optional<RemoteOffice> findByActivationCode(String supabaseUrl, String apiKey, String activationCode) throws Exception {
        return listOffices(supabaseUrl, apiKey).stream()
                .filter(o -> activationCode != null && activationCode.trim().equalsIgnoreCase(o.activationCode()))
                .findFirst();
    }

    public void upsertOffice(String supabaseUrl, String apiKey, RemoteOffice office, String recoveryPin) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_upsert_office";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_id", office.id());
        body.put("p_company_name", office.companyName());
        body.put("p_activation_code", office.activationCode());
        body.put("p_license_status", office.licenseStatus());
        body.put("p_license_plan", office.licensePlan());
        if (office.licenseExpiresAt() != null && !office.licenseExpiresAt().isBlank()) {
            body.put("p_license_expires_at", office.licenseExpiresAt());
        } else {
            body.putNull("p_license_expires_at");
        }
        body.put("p_owner_name", office.ownerName() == null ? "" : office.ownerName());
        body.put("p_support_phone", office.supportPhone() == null ? "" : office.supportPhone());
        body.put("p_city", office.city() == null ? "" : office.city());
        body.put("p_recovery_pin", recoveryPin == null ? "" : recoveryPin);

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();

        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("No se pudo guardar la oficina (" + resp.statusCode() + "): " + resp.body());
        }
    }

    public boolean usernameExists(String supabaseUrl, String apiKey, String username) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_username_exists";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_username", username.trim().toLowerCase());

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("Error verificando disponibilidad de usuario (" + resp.statusCode() + "): " + resp.body());
        }
        return objectMapper.readTree(resp.body()).asBoolean(false);
    }

    public void upsertUser(
            String supabaseUrl,
            String apiKey,
            String userId,
            String officeId,
            String fullName,
            String username,
            String passwordHash,
            String role,
            List<String> assignedRouteIds,
            String phone
    ) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_upsert_user";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_id", userId);
        body.put("p_office_id", officeId);
        body.put("p_name", fullName);
        body.put("p_username", username.trim().toLowerCase());
        body.put("p_password_hash", passwordHash);
        body.put("p_role", role);
        ArrayNode routesArr = body.putArray("p_assigned_route_ids");
        if (assignedRouteIds != null) {
            for (String rid : assignedRouteIds) routesArr.add(rid);
        }
        body.put("p_phone", phone == null ? "" : phone);

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("No se pudo registrar el usuario (" + resp.statusCode() + "): " + resp.body());
        }
    }

    public void upsertRoute(
            String supabaseUrl,
            String apiKey,
            String routeId,
            String officeId,
            String routeName,
            String routeCode,
            String collectorId
    ) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_upsert_route";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_id", routeId);
        body.put("p_office_id", officeId);
        body.put("p_name", routeName);
        body.put("p_code", routeCode);
        if (collectorId != null && !collectorId.isBlank()) body.put("p_collector_id", collectorId);
        else body.putNull("p_collector_id");

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("No se pudo registrar la ruta (" + resp.statusCode() + "): " + resp.body());
        }
    }

    public void upsertAdminUser(
            String supabaseUrl,
            String apiKey,
            String userId,
            String officeId,
            String fullName,
            String username,
            String passwordHash,
            String phone
    ) throws Exception {
        upsertUser(supabaseUrl, apiKey, userId, officeId, fullName, username, passwordHash, "ADMIN", List.of("ALL"), phone);
    }

    public void updateLicenseStatus(String supabaseUrl, String apiKey, String officeId, String newStatus) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_set_license_status";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_office_id", officeId);
        body.put("p_status", newStatus);

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("No se pudo actualizar la licencia (" + resp.statusCode() + "): " + resp.body());
        }
    }

    public void updateActivationCode(String supabaseUrl, String apiKey, String officeId, String newCode) throws Exception {
        validateConnection(supabaseUrl, apiKey);
        String url = normalizeBaseUrl(supabaseUrl) + "/rest/v1/rpc/vendor_regenerate_code";

        ObjectNode body = objectMapper.createObjectNode();
        body.put("p_office_id", officeId);
        body.put("p_new_code", newCode);

        HttpRequest req = baseRequest(url, apiKey, null, vendorSecretKey)
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
                .build();
        HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400) {
            throw new IllegalStateException("No se pudo regenerar el código (" + resp.statusCode() + "): " + resp.body());
        }
    }

    private HttpRequest.Builder baseRequest(String url, String apiKey, String sessionToken, String vendorKey) {
        HttpRequest.Builder b = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("apikey", apiKey.trim())
                .header("Authorization", "Bearer " + apiKey.trim())
                .header("Content-Type", "application/json");
        if (sessionToken != null && !sessionToken.isBlank()) {
            b.header("x-kredia-session", sessionToken.trim());
        }
        if (vendorKey != null && !vendorKey.isBlank()) {
            b.header("x-kredia-vendor-key", vendorKey.trim());
        }
        return b;
    }

    private static void validateConnection(String supabaseUrl, String apiKey) {
        if (supabaseUrl == null || supabaseUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("Configura primero la URL y la API Key de Supabase.");
        }
    }

    private static String normalizeBaseUrl(String url) {
        String trimmed = url.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }

    private static RemoteOffice parseOffice(JsonNode n) {
        return new RemoteOffice(
                n.path("id").asText(""),
                n.path("company_name").asText(""),
                n.path("activation_code").asText(""),
                n.path("license_status").asText("ACTIVE"),
                n.path("license_plan").asText("LIFETIME"),
                n.path("license_expires_at").isNull() ? null : n.path("license_expires_at").asText(null),
                n.path("owner_name").asText(""),
                n.path("support_phone").asText(""),
                n.path("city").asText("")
        );
    }
}
