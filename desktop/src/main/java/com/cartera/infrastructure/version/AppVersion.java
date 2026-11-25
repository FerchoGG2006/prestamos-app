package com.cartera.infrastructure.version;

/**
 * Única fuente de verdad para la versión del aplicativo nativo de escritorio
 * y del contenedor base (Shell) con soporte de actualizaciones OTA de ~1.6 MB.
 */
public final class AppVersion {

    public static final String CURRENT = "1.2.2";
    public static final String SHELL_VERSION = "1.2.0";
    public static final String BUILD_DATE = "2026-11-25";

    private AppVersion() {}

    public static String displayLabel() {
        return "Sistema Cartera v" + CURRENT + " • Operación Segura";
    }

    public static String shortTag() {
        return "v" + CURRENT;
    }

    /**
     * Versión del instalador base (Shell / runtime) que lanzó este proceso.
     * Vacío si se ejecutó en modo desarrollo o con un instalador heredado sin KrediaLauncher.
     */
    public static String installedShellVersion() {
        String prop = System.getProperty("kredia.shell.version", "");
        return prop == null ? "" : prop.trim();
    }

    /**
     * True únicamente cuando la aplicación fue lanzada por KrediaLauncher (instalador base >= 1.2.0),
     * lo que habilita la descarga y aplicación automática de parches OTA de ~1.6 MB.
     */
    public static boolean isOtaLauncherPresent() {
        String exe = System.getProperty("kredia.launcher.exe", "");
        return !installedShellVersion().isBlank() && exe != null && !exe.isBlank();
    }

    /**
     * Compara dos versiones SemVer (ej. "1.2.0" vs "1.2.1", tolerando prefijo "v").
     * Retorna > 0 si a > b, 0 si son equivalentes, < 0 si a < b.
     */
    public static int compareSemver(String a, String b) {
        int[] pa = parseParts(a);
        int[] pb = parseParts(b);
        int max = Math.max(pa.length, pb.length);
        for (int i = 0; i < max; i++) {
            int va = i < pa.length ? pa[i] : 0;
            int vb = i < pb.length ? pb[i] : 0;
            if (va != vb) {
                return Integer.compare(va, vb);
            }
        }
        return 0;
    }

    public static boolean isNewer(String candidate, String current) {
        if (candidate == null || candidate.isBlank()) {
            return false;
        }
        return compareSemver(candidate, current) > 0;
    }

    private static int[] parseParts(String version) {
        if (version == null || version.isBlank()) {
            return new int[]{0, 0, 0};
        }
        String clean = version.trim();
        if (clean.startsWith("v") || clean.startsWith("V")) {
            clean = clean.substring(1);
        }
        int dash = clean.indexOf('-');
        if (dash >= 0) {
            clean = clean.substring(0, dash);
        }
        String[] tokens = clean.split("\\.");
        int[] nums = new int[Math.max(3, tokens.length)];
        for (int i = 0; i < tokens.length; i++) {
            String digits = tokens[i].replaceAll("[^0-9]", "");
            try {
                nums[i] = digits.isEmpty() ? 0 : Integer.parseInt(digits);
            } catch (NumberFormatException ignored) {
                nums[i] = 0;
            }
        }
        return nums;
    }
}
