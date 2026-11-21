package com.cartera.infrastructure.security;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.spec.InvalidKeySpecException;
import java.util.HexFormat;

/**
 * Utilidad criptográfica para hashing y verificación de contraseñas
 * mediante PBKDF2 con HMAC-SHA256 y sal aleatoria.
 */
public final class PasswordHasher {

    private static final int ITERATIONS = 65536;
    private static final int KEY_LENGTH = 256;
    private static final int SALT_BYTES = 16;
    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordHasher() {}

    /** Genera un hash seguro para la contraseña en formato saltHex$hashHex. */
    public static String hash(String password) {
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("La contraseña no puede estar vacía");
        }
        byte[] salt = new byte[SALT_BYTES];
        RANDOM.nextBytes(salt);
        byte[] hash = pbkdf2(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH);
        return HexFormat.of().formatHex(salt) + "$" + HexFormat.of().formatHex(hash);
    }

    /**
     * Verifica una contraseña contra el formato PBKDF2 de escritorio (saltHex$hashHex)
     * o el formato SHA-256 con sal de la app móvil/web (sha256$salt$hash).
     */
    public static boolean verify(String password, String storedHash) {
        if (password == null || storedHash == null || !storedHash.contains("$")) {
            return false;
        }

        String trimmedStored = storedHash.trim();
        if (trimmedStored.startsWith("sha256$")) {
            String[] parts = trimmedStored.split("\\$");
            if (parts.length == 3 && !parts[1].isBlank() && !parts[2].isBlank()) {
                try {
                    MessageDigest md = MessageDigest.getInstance("SHA-256");
                    byte[] digest = md.digest((parts[1] + ":" + password.trim()).getBytes(StandardCharsets.UTF_8));
                    byte[] expected = HexFormat.of().parseHex(parts[2]);
                    return constantTimeEquals(expected, digest);
                } catch (Exception e) {
                    return false;
                }
            }
            return false;
        }

        String[] parts = trimmedStored.split("\\$");
        if (parts.length != 2 || parts[0].isBlank() || parts[1].isBlank()) {
            return false;
        }

        try {
            byte[] salt = HexFormat.of().parseHex(parts[0]);
            byte[] expectedHash = HexFormat.of().parseHex(parts[1]);
            byte[] actualHash = pbkdf2(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH);

            // Comparación en tiempo constante para mitigar timing attacks
            return constantTimeEquals(expectedHash, actualHash);
        } catch (Exception e) {
            return false;
        }
    }

    private static byte[] pbkdf2(char[] password, byte[] salt, int iterations, int keyLength) {
        try {
            var spec = new PBEKeySpec(password, salt, iterations, keyLength);
            var skf = SecretKeyFactory.getInstance(ALGORITHM);
            return skf.generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException e) {
            throw new IllegalStateException("Error al computar el hash de la contraseña", e);
        }
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a.length != b.length) return false;
        int result = 0;
        for (int i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result == 0;
    }
}
