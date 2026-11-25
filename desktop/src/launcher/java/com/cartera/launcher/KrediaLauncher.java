package com.cartera.launcher;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Micro-lanzador comercial nativo (JDK 21 puro, ~10 KB, 0 dependencias externas).
 * Se empaqueta UNA sola vez en el instalador base Windows y permite aplicar actualizaciones OTA
 * de ~1.6 MB desde ~/.sistema-cartera/updates/ sin reinstalar .exe ni pedir permisos UAC.
 * Incluye verificación criptográfica SHA-256 y rollback automático ante fallos de arranque.
 */
public final class KrediaLauncher {

    public static final String ACTIVE_STATE_FILE = "active-ota.json";
    public static final String LAUNCHER_LOG_FILE = "launcher.log";
    public static final String MAIN_CLASS = "com.cartera.ui.CarteraMain";
    public static final int MAX_UNVERIFIED_ATTEMPTS = 2;

    public record LaunchPlan(
            Path coreJarPath,
            String resolvedVersion,
            boolean usingOta,
            boolean rolledBack,
            String note
    ) {}

    private KrediaLauncher() {}

    public static void main(String[] args) {
        List<String> forwardedArgs = new ArrayList<>();
        Long waitPid = null;
        if (args != null) {
            for (String arg : args) {
                if (arg != null && arg.startsWith("--wait-pid=")) {
                    try {
                        waitPid = Long.parseLong(arg.substring("--wait-pid=".length()).trim());
                    } catch (NumberFormatException ignored) {}
                } else if (arg != null) {
                    forwardedArgs.add(arg);
                }
            }
        }

        if (waitPid != null && waitPid > 0) {
            waitForProcessExit(waitPid, 15);
        }

        Path updatesDir = defaultUpdatesDir();
        try {
            Files.createDirectories(updatesDir);
            Path appDir = resolveAppDir();
            Path installDir = appDir.getParent() != null ? appDir.getParent() : appDir;
            Path bundledCoreJar = resolveBundledCoreJar(appDir);
            Path libsDir = appDir.resolve("libs");
            String shellVersion = System.getProperty("kredia.shell.version", "1.2.0");

            LaunchPlan plan = resolveLaunchPlan(bundledCoreJar, updatesDir, shellVersion);
            log(updatesDir, "Arrancando v" + plan.resolvedVersion()
                    + " (" + (plan.usingOta() ? "OTA" : "BASE") + "): " + plan.coreJarPath()
                    + (plan.note().isBlank() ? "" : " — " + plan.note()));

            Path javaExe = resolveJavaExecutable(installDir);
            String classpath = buildClasspath(plan.coreJarPath(), libsDir);
            Path launcherExe = installDir.resolve("SistemaCartera.exe");

            List<String> command = new ArrayList<>();
            command.add(javaExe.toAbsolutePath().toString());
            command.add("-Dfile.encoding=UTF-8");
            command.add("-Duser.timezone=America/Bogota");
            command.add("-Duser.language=es");
            command.add("-Duser.country=CO");
            command.add("-Dkredia.shell.version=" + shellVersion);
            command.add("-Dkredia.app.dir=" + appDir.toAbsolutePath());
            command.add("-Dkredia.active.jar=" + plan.coreJarPath().toAbsolutePath());
            command.add("-Dkredia.ota.active=" + plan.usingOta());
            if (Files.isRegularFile(launcherExe)) {
                command.add("-Dkredia.launcher.exe=" + launcherExe.toAbsolutePath());
            }
            command.add("-cp");
            command.add(classpath);
            command.add(MAIN_CLASS);
            command.addAll(forwardedArgs);

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.directory(installDir.toFile());
            pb.redirectError(ProcessBuilder.Redirect.to(updatesDir.resolve("last-boot-err.log").toFile()));
            pb.start();
        } catch (Throwable ex) {
            log(updatesDir, "ERROR fatal lanzando Kredia: " + ex.getClass().getSimpleName() + ": " + ex.getMessage());
            System.exit(1);
        }
    }

    /**
     * Resuelve de forma determinista y auditable qué JAR core arrancar (OTA o base empaquetado),
     * verificando SemVer, integridad SHA-256 y aplicando rollback automático tras 2 fallos sin confirmar.
     */
    public static LaunchPlan resolveLaunchPlan(Path bundledCoreJar, Path updatesDir, String shellVersion) {
        if (updatesDir == null) {
            return new LaunchPlan(bundledCoreJar, shellVersion, false, false, "Sin carpeta OTA");
        }
        Path stateFile = updatesDir.resolve(ACTIVE_STATE_FILE);
        if (!Files.isRegularFile(stateFile)) {
            return new LaunchPlan(bundledCoreJar, shellVersion, false, false, "Sin parche OTA activo");
        }

        try {
            Map<String, String> state = parseFlatJson(Files.readString(stateFile, StandardCharsets.UTF_8));
            String otaVersion = state.getOrDefault("version", "").trim();
            String jarFile = state.getOrDefault("jar_file", "").trim();
            String expectedSha = state.getOrDefault("sha256", "").trim().toLowerCase(Locale.ROOT);
            String prevVersion = state.getOrDefault("previous_version", "").trim();
            String prevJarFile = state.getOrDefault("previous_jar_file", "").trim();
            String prevSha = state.getOrDefault("previous_sha256", "").trim().toLowerCase(Locale.ROOT);
            boolean pendingVerification = "true".equalsIgnoreCase(state.getOrDefault("pending_verification", "false"));
            int attempts = parseIntSafe(state.getOrDefault("attempts", "0"), 0);

            // Si el instalador base fue actualizado a una versión >= OTA, descartar OTA viejo
            if (otaVersion.isBlank() || compareSemver(otaVersion, shellVersion) <= 0) {
                Files.deleteIfExists(stateFile);
                return new LaunchPlan(bundledCoreJar, shellVersion, false, false,
                        "Base " + shellVersion + " es igual o superior al OTA " + otaVersion);
            }

            // Watchdog anti-bloqueo: si el parche OTA falló 2 veces sin confirmar arranque sano -> ROLLBACK
            if (pendingVerification && attempts >= MAX_UNVERIFIED_ATTEMPTS) {
                log(updatesDir, "ROLLBACK automático: OTA v" + otaVersion + " falló " + attempts + " intentos sin arrancar.");
                return performRollback(bundledCoreJar, updatesDir, stateFile, shellVersion, prevVersion, prevJarFile, prevSha,
                        "Rollback automático desde v" + otaVersion);
            }

            Path candidateJar = safeResolveChild(updatesDir, jarFile);
            if (candidateJar == null || !Files.isRegularFile(candidateJar)) {
                return performRollback(bundledCoreJar, updatesDir, stateFile, shellVersion, prevVersion, prevJarFile, prevSha,
                        "Archivo OTA ausente: " + jarFile);
            }

            if (expectedSha.isBlank() || !expectedSha.equals(computeSha256(candidateJar))) {
                log(updatesDir, "SHA-256 inválido para " + candidateJar.getFileName() + " — ejecutando rollback.");
                return performRollback(bundledCoreJar, updatesDir, stateFile, shellVersion, prevVersion, prevJarFile, prevSha,
                        "Integridad SHA-256 inválida en v" + otaVersion);
            }

            if (pendingVerification) {
                Map<String, String> updated = new LinkedHashMap<>(state);
                updated.put("attempts", String.valueOf(attempts + 1));
                writeFlatJson(stateFile, updated);
            }

            return new LaunchPlan(candidateJar, otaVersion, true, false,
                    pendingVerification ? "Verificando arranque OTA (intento " + (attempts + 1) + ")" : "OTA verificado");
        } catch (Exception ex) {
            log(updatesDir, "Error leyendo estado OTA (" + ex.getMessage() + "), arrancando versión base.");
            return new LaunchPlan(bundledCoreJar, shellVersion, false, true, "Fallback por error leyendo estado OTA");
        }
    }

    private static LaunchPlan performRollback(
            Path bundledCoreJar,
            Path updatesDir,
            Path stateFile,
            String shellVersion,
            String prevVersion,
            String prevJarFile,
            String prevSha,
            String reason
    ) {
        try {
            if (!prevVersion.isBlank()
                    && !prevJarFile.isBlank()
                    && !prevSha.isBlank()
                    && compareSemver(prevVersion, shellVersion) > 0) {
                Path prevJar = safeResolveChild(updatesDir, prevJarFile);
                if (prevJar != null && Files.isRegularFile(prevJar) && prevSha.equals(computeSha256(prevJar))) {
                    Map<String, String> reverted = new LinkedHashMap<>();
                    reverted.put("version", prevVersion);
                    reverted.put("jar_file", prevJarFile);
                    reverted.put("sha256", prevSha);
                    reverted.put("previous_version", shellVersion);
                    reverted.put("previous_jar_file", "");
                    reverted.put("previous_sha256", "");
                    reverted.put("pending_verification", "false");
                    reverted.put("attempts", "0");
                    writeFlatJson(stateFile, reverted);
                    return new LaunchPlan(prevJar, prevVersion, true, true, reason + " -> revertido a v" + prevVersion);
                }
            }
            Files.deleteIfExists(stateFile);
        } catch (Exception ignored) {}
        return new LaunchPlan(bundledCoreJar, shellVersion, false, true, reason + " -> revertido a base v" + shellVersion);
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

    public static int compareSemver(String a, String b) {
        int[] pa = parseSemverParts(a);
        int[] pb = parseSemverParts(b);
        int max = Math.max(pa.length, pb.length);
        for (int i = 0; i < max; i++) {
            int va = i < pa.length ? pa[i] : 0;
            int vb = i < pb.length ? pb[i] : 0;
            if (va != vb) return Integer.compare(va, vb);
        }
        return 0;
    }

    private static int[] parseSemverParts(String v) {
        if (v == null || v.isBlank()) return new int[]{0, 0, 0};
        String s = v.trim();
        if (s.startsWith("v") || s.startsWith("V")) s = s.substring(1);
        int dash = s.indexOf('-');
        if (dash >= 0) s = s.substring(0, dash);
        String[] parts = s.split("\\.");
        int[] out = new int[Math.max(3, parts.length)];
        for (int i = 0; i < parts.length; i++) {
            String d = parts[i].replaceAll("[^0-9]", "");
            out[i] = d.isEmpty() ? 0 : parseIntSafe(d, 0);
        }
        return out;
    }

    public static String buildClasspath(Path coreJar, Path libsDir) {
        String sep = File.pathSeparator;
        StringBuilder cp = new StringBuilder();
        cp.append(coreJar.toAbsolutePath());
        if (libsDir != null && Files.isDirectory(libsDir)) {
            cp.append(sep).append(libsDir.toAbsolutePath()).append(File.separator).append("*");
        }
        return cp.toString();
    }

    private static Path resolveAppDir() throws Exception {
        Path self = Paths.get(KrediaLauncher.class.getProtectionDomain().getCodeSource().getLocation().toURI())
                .toAbsolutePath().normalize();
        return Files.isRegularFile(self) ? self.getParent() : self;
    }

    private static Path resolveBundledCoreJar(Path appDir) {
        Path preferred = appDir.resolve("core").resolve("kredia-app.jar");
        if (Files.isRegularFile(preferred)) {
            return preferred;
        }
        return appDir.resolve("kredia-app.jar");
    }

    private static Path resolveJavaExecutable(Path installDir) {
        boolean isWindows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        String binName = isWindows ? "javaw.exe" : "java";
        Path bundled = installDir.resolve("runtime").resolve("bin").resolve(binName);
        if (Files.isRegularFile(bundled)) {
            return bundled;
        }
        Path currentHome = Paths.get(System.getProperty("java.home", "")).resolve("bin").resolve(binName);
        if (Files.isRegularFile(currentHome)) {
            return currentHome;
        }
        return Paths.get(System.getProperty("java.home", "")).resolve("bin").resolve(isWindows ? "java.exe" : "java");
    }

    private static Path defaultUpdatesDir() {
        return Paths.get(System.getProperty("user.home"), ".sistema-cartera", "updates");
    }

    private static Path safeResolveChild(Path dir, String fileName) {
        if (fileName == null || fileName.isBlank()) return null;
        if (fileName.contains("/") || fileName.contains("\\") || fileName.contains("..")) return null;
        Path resolved = dir.resolve(fileName).normalize();
        return resolved.startsWith(dir.normalize()) ? resolved : null;
    }

    private static void waitForProcessExit(long pid, int timeoutSeconds) {
        try {
            ProcessHandle.of(pid).ifPresent(handle -> {
                try {
                    handle.onExit().orTimeout(timeoutSeconds, TimeUnit.SECONDS).join();
                } catch (Exception ignored) {}
            });
        } catch (Exception ignored) {}
    }

    private static int parseIntSafe(String text, int fallback) {
        try {
            return Integer.parseInt(text.trim());
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static final Pattern KV_PATTERN = Pattern.compile(
            "\"([a-zA-Z0-9_]+)\"\\s*:\\s*(?:\"((?:\\\\.|[^\"])*)\"|([0-9]+|true|false|null))"
    );

    static Map<String, String> parseFlatJson(String json) {
        Map<String, String> out = new LinkedHashMap<>();
        if (json == null) return out;
        Matcher m = KV_PATTERN.matcher(json);
        while (m.find()) {
            String key = m.group(1);
            String val = m.group(2) != null ? unescapeJson(m.group(2)) : m.group(3);
            if (!"null".equals(val)) {
                out.put(key, val);
            }
        }
        return out;
    }

    static void writeFlatJson(Path target, Map<String, String> map) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        int idx = 0;
        for (Map.Entry<String, String> e : map.entrySet()) {
            if (idx++ > 0) sb.append(",\n");
            sb.append("  \"").append(escapeJson(e.getKey())).append("\": ");
            String v = e.getValue() == null ? "" : e.getValue();
            if ("pending_verification".equals(e.getKey())) {
                sb.append("true".equalsIgnoreCase(v) ? "true" : "false");
            } else if ("attempts".equals(e.getKey())) {
                sb.append(parseIntSafe(v, 0));
            } else {
                sb.append("\"").append(escapeJson(v)).append("\"");
            }
        }
        sb.append("\n}\n");
        Files.writeString(target, sb.toString(), StandardCharsets.UTF_8);
    }

    private static String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String unescapeJson(String s) {
        return s.replace("\\\"", "\"").replace("\\\\", "\\");
    }

    private static void log(Path updatesDir, String msg) {
        try {
            if (updatesDir == null) return;
            Files.createDirectories(updatesDir);
            String line = Instant.now() + " [KrediaLauncher] " + msg + System.lineSeparator();
            Files.writeString(updatesDir.resolve(LAUNCHER_LOG_FILE), line, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (Exception ignored) {}
    }
}
