package com.cartera.infrastructure.version;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Optional;

/**
 * Verificador liviano y no bloqueante de actualizaciones (parches OTA de ~1.6 MB en Supabase Storage
 * con respaldo automático a instalador completo únicamente si sube min_shell_version).
 */
@Service
public class DesktopUpdateChecker {

    private static final Logger LOG = LoggerFactory.getLogger(DesktopUpdateChecker.class);
    public static final String DEFAULT_MANIFEST_URL =
            "https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/latest.json";

    public record UpdateInfo(
            String currentVersion,
            String latestVersion,
            String minVersion,
            String minShellVersion,
            String coreJarUrl,
            String coreJarSha256,
            long coreJarSizeBytes,
            String downloadUrl,
            String releaseNotes,
            boolean updateAvailable,
            boolean mandatory
    ) {
        /**
         * Indica si esta actualización puede aplicarse mediante parche rápido OTA (~1.6 MB)
         * sobre el instalador base actualmente instalado, sin descargar un nuevo .exe.
         */
        public boolean supportsOtaForShell(String installedShellVersion) {
            if (!updateAvailable) return false;
            if (coreJarUrl == null || coreJarUrl.isBlank()) return false;
            if (coreJarSha256 == null || coreJarSha256.isBlank()) return false;
            if (installedShellVersion == null || installedShellVersion.isBlank()) return false;
            if (minShellVersion != null && !minShellVersion.isBlank()) {
                return AppVersion.compareSemver(installedShellVersion, minShellVersion) >= 0;
            }
            return true;
        }
    }

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private final String manifestUrl;

    public DesktopUpdateChecker(
            @Value("${cartera.update.url:" + DEFAULT_MANIFEST_URL + "}") String manifestUrl
    ) {
        this.manifestUrl = (manifestUrl == null || manifestUrl.isBlank()) ? DEFAULT_MANIFEST_URL : manifestUrl.trim();
    }

    public String getManifestUrl() {
        return manifestUrl;
    }

    public Optional<UpdateInfo> checkForUpdate() {
        return checkForUpdate(AppVersion.CURRENT);
    }

    public Optional<UpdateInfo> checkForUpdate(String installedVersion) {
        if (manifestUrl == null || manifestUrl.isBlank()) {
            return Optional.empty();
        }
        try {
            String bustUrl = manifestUrl + (manifestUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis();
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(bustUrl))
                    .timeout(Duration.ofSeconds(6))
                    .header("Accept", "application/json")
                    .header("Cache-Control", "no-cache")
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body() == null || response.body().isBlank()) {
                LOG.debug("Manifiesto de actualización no disponible (HTTP {}).", response.statusCode());
                return Optional.empty();
            }
            return parseUpdateInfo(response.body(), installedVersion);
        } catch (Exception ex) {
            LOG.debug("Verificación de actualización omitida (sin conexión o tiempo agotado): {}", ex.getMessage());
            return Optional.empty();
        }
    }

    public Optional<UpdateInfo> parseUpdateInfo(String jsonBody, String installedVersion) {
        if (jsonBody == null || jsonBody.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(jsonBody);
            String latest = root.path("latest_version").asText("").trim();
            if (latest.isBlank()) {
                latest = root.path("version").asText("").trim();
            }
            if (latest.isBlank()) {
                return Optional.empty();
            }
            String minVersion = root.path("min_version").asText("").trim();
            String minShellVersion = root.path("min_shell_version").asText("").trim();
            String coreJarUrl = root.path("core_jar_url").asText("").trim();
            String coreJarSha256 = root.path("core_jar_sha256").asText("").trim().toLowerCase();
            long coreJarSize = root.path("core_jar_size_bytes").asLong(0L);
            String installerUrl = root.path("installer_url").asText("").trim();
            String downloadUrl = !installerUrl.isBlank()
                    ? installerUrl
                    : root.path("download_url").asText("").trim();
            String releaseNotes = root.path("release_notes").asText("").trim();
            String current = (installedVersion == null || installedVersion.isBlank())
                    ? AppVersion.CURRENT : installedVersion.trim();

            boolean available = AppVersion.isNewer(latest, current);
            boolean mandatory = !minVersion.isBlank() && AppVersion.compareSemver(current, minVersion) < 0;
            return Optional.of(new UpdateInfo(
                    current, latest, minVersion, minShellVersion,
                    coreJarUrl, coreJarSha256, coreJarSize,
                    downloadUrl, releaseNotes, available, mandatory
            ));
        } catch (Exception ex) {
            LOG.debug("Error interpretando manifiesto de versión: {}", ex.getMessage());
            return Optional.empty();
        }
    }
}
