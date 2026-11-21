package com.cartera.sync.application;

import com.cartera.infrastructure.security.PasswordHasher;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class DesktopCloudSyncServiceTest {

    @Test
    void passwordHasherVerifiesBothPbkdf2AndMobileSha256Hashes() throws Exception {
        String raw = "FBV2026*";

        // 1. PBKDF2-HMAC-SHA256 (Desktop)
        String pbkdf2Hash = PasswordHasher.hash(raw);
        assertTrue(PasswordHasher.verify(raw, pbkdf2Hash));
        assertFalse(PasswordHasher.verify("wrong", pbkdf2Hash));

        // 2. sha256$salt$hash (Mobile/Web)
        String salt = "abcdef0123456789";
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest((salt + ":" + raw).getBytes(StandardCharsets.UTF_8));
        String mobileHash = "sha256$" + salt + "$" + HexFormat.of().formatHex(digest);

        assertTrue(PasswordHasher.verify(raw, mobileHash));
        assertFalse(PasswordHasher.verify("wrong", mobileHash));
    }

    @Test
    void mapsCloudAndDesktopStatusesAndCashCategoriesSafely() {
        assertEquals("ACTIVO", DesktopCloudSyncService.mapLoanStatusToDesktop("ACTIVE"));
        assertEquals("RENOVADO", DesktopCloudSyncService.mapLoanStatusToDesktop("RENEWED"));
        assertEquals("APLICADO", DesktopCloudSyncService.mapPaymentStatusToDesktop("COMPLETED"));
        assertEquals("EFECTIVO", DesktopCloudSyncService.mapMethodToDesktop("CASH"));
        assertEquals("ENTRADA", DesktopCloudSyncService.mapMovementTypeToDesktop("INCOME"));
        assertEquals("SALIDA", DesktopCloudSyncService.mapMovementTypeToDesktop("EXPENSE"));

        // CashLedger protection: COLLECTION maps to PAGO_CUOTA only if payment exists, else COBRO_HISTORICO
        assertEquals("PAGO_CUOTA", DesktopCloudSyncService.mapCashCategoryToDesktop("COLLECTION", "pay-1", Set.of("pay-1")));
        assertEquals("COBRO_HISTORICO", DesktopCloudSyncService.mapCashCategoryToDesktop("COLLECTION", "pay-missing", Set.of("pay-1")));
        assertEquals("EXPENSE", DesktopCloudSyncService.mapCashCategoryToCloud("GASTO_RUTA"));
        assertEquals("CAPITAL_INJECTION", DesktopCloudSyncService.mapCashCategoryToCloud("INYECCION_CAPITAL"));
        assertEquals("RECAUDO_OFICINA", DesktopCloudSyncService.mapCashCategoryToCloud("RETIRO_OFICINA"));
        assertEquals("EXPENSE", DesktopCloudSyncService.mapMovementTypeToCloud("SALIDA"));
        assertEquals("INCOME", DesktopCloudSyncService.mapMovementTypeToCloud("ENTRADA"));
        assertEquals("ADMIN", DesktopCloudSyncService.normalizeRole("ADMIN"));
        assertEquals("COBRADOR", DesktopCloudSyncService.normalizeRole("COBRADOR"));
    }
}
