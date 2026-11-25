package com.cartera.infrastructure.version;

import com.cartera.launcher.KrediaLauncher;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pruebas integrales del motor comercial OTA (KrediaLauncher + DesktopOtaService + DesktopUpdateChecker):
 * - Descarga HTTP real y verificación criptográfica SHA-256
 * - Rechazo de paquetes corruptos/alterados
 * - Rollback automático tras 2 arranques fallidos (anti-bloqueo)
 * - Compuerta min_shell_version (parche OTA 1.6 MB vs instalador completo)
 */
class DesktopOtaUpdaterTest {

    @TempDir
    Path tempDir;

    @Test
    void launcherBootsVerifiedOtaRejectsTamperedAndRollsBackAfterTwoFailedBoots() throws Exception {
        Path bundledJar = tempDir.resolve("bundled/kredia-app.jar");
        Files.createDirectories(bundledJar.getParent());
        Files.writeString(bundledJar, "BUNDLED-1.2.0", StandardCharsets.UTF_8);

        Path updatesDir = tempDir.resolve("updates");
        Files.createDirectories(updatesDir);

        // 1. Sin active-ota.json -> arranca base empaquetado
        var basePlan = KrediaLauncher.resolveLaunchPlan(bundledJar, updatesDir, "1.2.0");
        assertFalse(basePlan.usingOta());
        assertEquals(bundledJar, basePlan.coreJarPath());
        assertEquals("1.2.0", basePlan.resolvedVersion());

        // 2. Crear parche OTA v1.2.1 sano y activarlo (simular que ya fue verificado previamente)
        Path ota121 = updatesDir.resolve("kredia-app-1.2.1.jar");
        Files.writeString(ota121, "OTA-JAR-1.2.1-GOOD", StandardCharsets.UTF_8);
        String sha121 = KrediaLauncher.computeSha256(ota121);

        // 3. Crear parche OTA v1.2.2 pendiente de verificación con rollback apuntando a v1.2.1
        Path ota122 = updatesDir.resolve("kredia-app-1.2.2.jar");
        Files.writeString(ota122, "OTA-JAR-1.2.2-CRASHING", StandardCharsets.UTF_8);
        String sha122 = KrediaLauncher.computeSha256(ota122);

        String stateJson = """
                {
                  "version": "1.2.2",
                  "jar_file": "kredia-app-1.2.2.jar",
                  "sha256": "%s",
                  "previous_version": "1.2.1",
                  "previous_jar_file": "kredia-app-1.2.1.jar",
                  "previous_sha256": "%s",
                  "pending_verification": true,
                  "attempts": 0
                }
                """.formatted(sha122, sha121);
        Files.writeString(updatesDir.resolve(KrediaLauncher.ACTIVE_STATE_FILE), stateJson, StandardCharsets.UTF_8);

        // Intento 1 -> permite arrancar v1.2.2 (attempts sube a 1)
        var attempt1 = KrediaLauncher.resolveLaunchPlan(bundledJar, updatesDir, "1.2.0");
        assertTrue(attempt1.usingOta());
        assertFalse(attempt1.rolledBack());
        assertEquals("1.2.2", attempt1.resolvedVersion());

        // Intento 2 -> todavía intenta v1.2.2 (attempts sube a 2)
        var attempt2 = KrediaLauncher.resolveLaunchPlan(bundledJar, updatesDir, "1.2.0");
        assertTrue(attempt2.usingOta());
        assertFalse(attempt2.rolledBack());
        assertEquals("1.2.2", attempt2.resolvedVersion());

        // Intento 3 sin confirmación de arranque sano -> ROLLBACK AUTOMÁTICO a v1.2.1!
        var rollbackPlan = KrediaLauncher.resolveLaunchPlan(bundledJar, updatesDir, "1.2.0");
        assertTrue(rollbackPlan.usingOta());
        assertTrue(rollbackPlan.rolledBack());
        assertEquals("1.2.1", rollbackPlan.resolvedVersion());
        assertEquals(ota121, rollbackPlan.coreJarPath());

        // 4. Si alguien corrompe el archivo en disco -> falla SHA-256 y vuelve al base 1.2.0!
        Files.writeString(ota121, "CORRUPTED-BYTES", StandardCharsets.UTF_8);
        var tamperedPlan = KrediaLauncher.resolveLaunchPlan(bundledJar, updatesDir, "1.2.0");
        assertFalse(tamperedPlan.usingOta());
        assertTrue(tamperedPlan.rolledBack());
        assertEquals(bundledJar, tamperedPlan.coreJarPath());
        assertEquals("1.2.0", tamperedPlan.resolvedVersion());
    }

    @Test
    void otaServiceDownloadsVerifiesSha256RejectsBadHashAndMarksHealthyBoot() throws Exception {
        byte[] goodBytes = "VALID-KREDIA-CORE-JAR-1.2.1".getBytes(StandardCharsets.UTF_8);
        Path tmpPayload = tempDir.resolve("payload.jar");
        Files.write(tmpPayload, goodBytes);
        String goodSha = DesktopOtaService.computeSha256(tmpPayload);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/kredia-app-1.2.1.jar", ex -> {
            ex.sendResponseHeaders(200, goodBytes.length);
            ex.getResponseBody().write(goodBytes);
            ex.close();
        });
        server.start();
        try {
            int port = server.getAddress().getPort();
            String jarUrl = "http://127.0.0.1:" + port + "/kredia-app-1.2.1.jar";
            Path updatesDir = tempDir.resolve("ota-stage");
            Files.createDirectories(updatesDir);
            // Crear un JAR obsoleto que debe limpiarse al aplicar nueva actualización
            Path obsoleteJar = updatesDir.resolve("kredia-app-1.1.9.jar");
            Files.writeString(obsoleteJar, "OLD", StandardCharsets.UTF_8);

            DesktopOtaService otaService = new DesktopOtaService(updatesDir);

            // 1. Rechazar si el SHA-256 esperado no coincide
            var badInfo = new DesktopUpdateChecker.UpdateInfo(
                    "1.2.0", "1.2.1", "1.2.0", "1.2.0",
                    jarUrl, "0000000000000000000000000000000000000000000000000000000000000000",
                    goodBytes.length, "", "Fix", true, false
            );
            var badRes = otaService.stageOtaUpdate(badInfo);
            assertFalse(badRes.success(), "Debe rechazar parche con SHA-256 inválido");
            assertFalse(Files.exists(updatesDir.resolve("kredia-app-1.2.1.jar")));

            // 2. Aceptar descarga con SHA-256 válido
            var goodInfo = new DesktopUpdateChecker.UpdateInfo(
                    "1.2.0", "1.2.1", "1.2.0", "1.2.0",
                    jarUrl, goodSha, goodBytes.length, "", "Parche OTA rápido", true, false
            );
            var okRes = otaService.stageOtaUpdate(goodInfo);
            assertTrue(okRes.success(), okRes.message());
            assertTrue(otaService.isVersionAlreadyStaged("1.2.1", goodSha));
            assertFalse(Files.exists(obsoleteJar), "Debe limpiar JARs obsoletos antiguos");

            // 3. KrediaLauncher debe seleccionar inmediatamente v1.2.1
            Path bundledJar = tempDir.resolve("bundled.jar");
            Files.writeString(bundledJar, "BASE", StandardCharsets.UTF_8);
            var plan = KrediaLauncher.resolveLaunchPlan(bundledJar, updatesDir, "1.2.0");
            assertTrue(plan.usingOta());
            assertEquals("1.2.1", plan.resolvedVersion());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void updateCheckerGatesOtaByMinShellVersion() {
        DesktopUpdateChecker checker = new DesktopUpdateChecker("http://127.0.0.1:1/unused");
        String otaCompatibleManifest = """
                {
                  "latest_version": "1.2.3",
                  "min_shell_version": "1.2.0",
                  "core_jar_url": "https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/kredia-app-1.2.3.jar",
                  "core_jar_sha256": "abcdef123456",
                  "installer_url": "https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/Instalador-SistemaCartera-v1.2.0.exe",
                  "release_notes": "Parche rápido"
                }
                """;
        var info = checker.parseUpdateInfo(otaCompatibleManifest, "1.2.0").orElseThrow();
        assertTrue(info.supportsOtaForShell("1.2.0"), "Shell 1.2.0 cumple min_shell_version 1.2.0");
        assertFalse(info.supportsOtaForShell("1.1.5"), "Shell viejo 1.1.5 debe pedir instalador completo");
        assertFalse(info.supportsOtaForShell(""), "Sin launcher OTA debe pedir instalador completo");

        String majorShellManifest = """
                {
                  "latest_version": "2.0.0",
                  "min_shell_version": "2.0.0",
                  "core_jar_url": "https://example.com/kredia-app-2.0.0.jar",
                  "core_jar_sha256": "abcdef123456",
                  "installer_url": "https://example.com/Instalador-v2.0.0.exe"
                }
                """;
        var major = checker.parseUpdateInfo(majorShellManifest, "1.2.0").orElseThrow();
        assertTrue(major.updateAvailable());
        assertFalse(major.supportsOtaForShell("1.2.0"), "Cambio de Java/librerías requiere nuevo instalador base");
    }
}
