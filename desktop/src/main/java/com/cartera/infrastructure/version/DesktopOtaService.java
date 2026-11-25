package com.cartera.infrastructure.version;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Motor comercial de actualizaciones OTA (~1.6 MB):
 * - Descarga en segundo plano el JAR core verificado en ~/.sistema-cartera/updates/ (sin UAC).
 * - Valida integridad SHA-256 estricta antes de activar.
 * - Confirma arranque saludable para el watchdog anti-bloqueo de KrediaLauncher.
 * - Reinicia la aplicación de forma limpia cerrando SQLite antes de relanzar SistemaCartera.exe.
 */
@Service
public class DesktopOtaService {

    private static final Logger LOG = LoggerFactory.getLogger(DesktopOtaService.class);
    public static final String ACTIVE_STATE_FILE = "active-ota.json";

    public record StageResult(boolean success, String version, Path stagedJar, String message) {
        public static StageResult ok(String version, Path jar, String msg) {
            return new StageResult(true, version, jar, msg);
        }
        public static StageResult fail(String msg) {
            return new StageResult(false, "", null, msg);
        }
    }

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final Path updatesDir;

    public DesktopOtaService() {
        this(Paths.get(System.getProperty("user.home"), ".sistema-cartera", "updates"));
    }

    public DesktopOtaService(Path updatesDir) {
        this.updatesDir = updatesDir;
    }

    public Path getUpdatesDir() {
        return updatesDir;
    }

    /**
     * Marca el arranque actual como saludable (desactiva contador de rollback en KrediaLauncher).
     * Debe llamarse únicamente después de inicializar Spring Boot, Flyway y JavaFX sin errores.
     */
    public void markCurrentBootHealthy() {
        try {
            Path stateFile = updatesDir.resolve(ACTIVE_STATE_FILE);
            if (!Files.isRegularFile(stateFile)) return;

            JsonNode root = objectMapper.readTree(Files.readString(stateFile, StandardCharsets.UTF_8));
            if (!root.isObject()) return;

            String stagedVersion = root.path("version").asText("").trim();
            boolean pending = root.path("pending_verification").asBoolean(false);
            int attempts = root.path("attempts").asInt(0);

            if (AppVersion.CURRENT.equals(stagedVersion) && (pending || attempts > 0)) {
                ObjectNode updated = (ObjectNode) root.deepCopy();
                updated.put("pending_verification", false);
                updated.put("attempts", 0);
                Files.writeString(stateFile, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(updated), StandardCharsets.UTF_8);
                LOG.info("Arranque OTA v{} verificado correctamente.", stagedVersion);
            }
        } catch (Exception ex) {
            LOG.warn("No se pudo confirmar marca de arranque saludable OTA: {}", ex.getMessage());
        }
    }

    /**
     * Indica si una versión específica ya se encuentra descargada, verificada y lista para aplicar.
     */
    public boolean isVersionAlreadyStaged(String targetVersion, String expectedSha256) {
        if (targetVersion == null || targetVersion.isBlank()) return false;
        try {
            Path stateFile = updatesDir.resolve(ACTIVE_STATE_FILE);
            if (!Files.isRegularFile(stateFile)) return false;
            JsonNode root = objectMapper.readTree(Files.readString(stateFile, StandardCharsets.UTF_8));
            String stagedVer = root.path("version").asText("").trim();
            String jarFile = root.path("jar_file").asText("").trim();
            String sha = root.path("sha256").asText("").trim().toLowerCase(Locale.ROOT);
            if (!targetVersion.trim().equals(stagedVer) || jarFile.isBlank()) return false;
            if (expectedSha256 != null && !expectedSha256.isBlank()
                    && !expectedSha256.trim().equalsIgnoreCase(sha)) {
                return false;
            }
            Path jarPath = updatesDir.resolve(jarFile).normalize();
            return jarPath.startsWith(updatesDir.normalize())
                    && Files.isRegularFile(jarPath)
                    && sha.equals(computeSha256(jarPath));
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Descarga el parche OTA (~1.6 MB), valida SHA-256 y lo deja activado para el próximo reinicio.
     */
    public StageResult stageOtaUpdate(DesktopUpdateChecker.UpdateInfo info) {
        if (info == null || !info.updateAvailable()) {
            return StageResult.fail("No hay una versión más reciente disponible.");
        }
        if (info.coreJarUrl() == null || info.coreJarUrl().isBlank()
                || info.coreJarSha256() == null || info.coreJarSha256().isBlank()) {
            return StageResult.fail("El manifiesto no incluye paquete OTA verificable.");
        }

        String safeVer = info.latestVersion().replaceAll("[^0-9A-Za-z._-]", "");
        String expectedSha = info.coreJarSha256().trim().toLowerCase(Locale.ROOT);
        if (isVersionAlreadyStaged(safeVer, expectedSha)) {
            Path existing = updatesDir.resolve("kredia-app-" + safeVer + ".jar");
            return StageResult.ok(safeVer, existing, "Versión v" + safeVer + " lista para aplicar al reiniciar.");
        }

        try {
            Files.createDirectories(updatesDir);
            String targetFileName = "kredia-app-" + safeVer + ".jar";
            Path partFile = updatesDir.resolve(targetFileName + ".part");
            Path finalJar = updatesDir.resolve(targetFileName);

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(info.coreJarUrl()))
                    .timeout(Duration.ofSeconds(45))
                    .header("Cache-Control", "no-cache")
                    .GET()
                    .build();
            HttpResponse<Path> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofFile(partFile));
            if (resp.statusCode() != 200) {
                Files.deleteIfExists(partFile);
                return StageResult.fail("Error descargando actualización (HTTP " + resp.statusCode() + ").");
            }

            String actualSha = computeSha256(partFile);
            if (!expectedSha.equals(actualSha)) {
                Files.deleteIfExists(partFile);
                LOG.error("SHA-256 inválido al descargar OTA v{}: esperado={}, recibido={}", safeVer, expectedSha, actualSha);
                return StageResult.fail("Verificación de integridad SHA-256 fallida; parche descartado por seguridad.");
            }

            Files.move(partFile, finalJar, StandardCopyOption.REPLACE_EXISTING);

            // Preservar versión OTA previa sana para rollback automático
            String prevVersion = AppVersion.CURRENT;
            String prevJarFile = "";
            String prevSha = "";
            Path stateFile = updatesDir.resolve(ACTIVE_STATE_FILE);
            if (Files.isRegularFile(stateFile)) {
                try {
                    JsonNode prev = objectMapper.readTree(Files.readString(stateFile, StandardCharsets.UTF_8));
                    if (!prev.path("pending_verification").asBoolean(false)) {
                        String pVer = prev.path("version").asText("").trim();
                        String pJar = prev.path("jar_file").asText("").trim();
                        String pSha = prev.path("sha256").asText("").trim();
                        if (!pVer.isBlank() && !pVer.equals(safeVer) && !pJar.isBlank() && !pSha.isBlank()) {
                            prevVersion = pVer;
                            prevJarFile = pJar;
                            prevSha = pSha;
                        }
                    }
                } catch (Exception ignored) {}
            }

            ObjectNode newState = objectMapper.createObjectNode();
            newState.put("version", safeVer);
            newState.put("jar_file", targetFileName);
            newState.put("sha256", actualSha);
            newState.put("previous_version", prevVersion);
            newState.put("previous_jar_file", prevJarFile);
            newState.put("previous_sha256", prevSha);
            newState.put("pending_verification", true);
            newState.put("attempts", 0);

            Path stateTmp = updatesDir.resolve(ACTIVE_STATE_FILE + ".tmp");
            Files.writeString(stateTmp, objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(newState), StandardCharsets.UTF_8);
            Files.move(stateTmp, stateFile, StandardCopyOption.REPLACE_EXISTING);

            pruneObsoleteJars(Set.of(targetFileName, prevJarFile));

            LOG.info("Actualización OTA v{} descargada y verificada ({} bytes).", safeVer, Files.size(finalJar));
            return StageResult.ok(safeVer, finalJar, "Actualización v" + safeVer + " lista. Reinicia para aplicarla.");
        } catch (Exception ex) {
            LOG.warn("Error descargando actualización OTA: {}", ex.getMessage());
            return StageResult.fail("No se pudo descargar el parche OTA: " + ex.getMessage());
        }
    }

    /**
     * Cierra limpiamente los recursos actuales (Spring/SQLite) y relanza SistemaCartera.exe
     * esperando la salida del PID actual para aplicar la nueva versión en ~2 segundos.
     */
    public boolean relaunchToApplyUpdate(Runnable gracefulShutdown) {
        String launcherExe = System.getProperty("kredia.launcher.exe", "").trim();
        if (launcherExe.isBlank() || !Files.isRegularFile(Paths.get(launcherExe))) {
            return false;
        }
        long currentPid = ProcessHandle.current().pid();
        try {
            if (gracefulShutdown != null) {
                try {
                    gracefulShutdown.run();
                } catch (Exception ignored) {}
            }
            new ProcessBuilder(launcherExe, "--wait-pid=" + currentPid).start();
            return true;
        } catch (Exception ex) {
            LOG.error("No se pudo relanzar SistemaCartera.exe: {}", ex.getMessage());
            return false;
        }
    }

    public Optional<String> getStagedVersion() {
        try {
            Path stateFile = updatesDir.resolve(ACTIVE_STATE_FILE);
            if (!Files.isRegularFile(stateFile)) return Optional.empty();
            JsonNode root = objectMapper.readTree(Files.readString(stateFile, StandardCharsets.UTF_8));
            String ver = root.path("version").asText("").trim();
            return ver.isBlank() ? Optional.empty() : Optional.of(ver);
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }

    private void pruneObsoleteJars(Set<String> keepFileNames) {
        try (Stream<Path> files = Files.list(updatesDir)) {
            files.filter(Files::isRegularFile)
                    .filter(p -> {
                        String name = p.getFileName().toString();
                        return name.startsWith("kredia-app-") && name.endsWith(".jar") && !keepFileNames.contains(name);
                    })
                    .forEach(p -> {
                        try { Files.deleteIfExists(p); } catch (Exception ignored) {}
                    });
        } catch (Exception ignored) {}
    }

    public static String computeSha256(Path file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) {
                md.update(buf, 0, n);
            }
        }
        return HexFormat.of().formatHex(md.digest()).toLowerCase(Locale.ROOT);
    }
}
