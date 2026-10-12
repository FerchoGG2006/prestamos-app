package com.cartera.infrastructure.security;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
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

    /** Verifica si la contraseña en texto plano coincide con el hash almacenado. */
    public static boolean verify(String password, String storedHash) {
        if (password == null || storedHash == null) {
            return false;
        }

        // Compatibilidad con hashes de semilla antiguos o contraseñas simples de demo
        if (storedHash.startsWith("hash_") || !storedHash.contains("$")) {
            if (storedHash.equals(password) || storedHash.equals("hash_" + password)) {
                return true;
            }
            String normStored = storedHash.replace("_", "").toLowerCase();
            String normInput = ("hash" + password).replace("_", "").toLowerCase();
            return normStored.equals(normInput);
        }

        String[] parts = storedHash.split("\\$");
        if (parts.length != 2) {
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
