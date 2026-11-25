package com.cartera.infrastructure.licensing;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient.RemoteOffice;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.UserSessionContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OfficeLicensingServiceTest {

    @Mock
    private SystemSettingRepository settingRepository;

    @Mock
    private AuditLogRepository auditLogRepository;

    @Mock
    private SupabaseRegistryClient registryClient;

    @Mock
    private DatabaseBackupService backupService;

    private OfficeLicensingService createServiceWithInMemorySettings(Map<String, String> store) {
        lenient().when(settingRepository.findById(anyString())).thenAnswer(inv -> {
            String key = inv.getArgument(0);
            String val = store.get(key);
            return val == null ? Optional.empty() : Optional.of(new SystemSettingEntity(key, val, "2026-11-20T00:00:00"));
        });
        lenient().when(settingRepository.save(any(SystemSettingEntity.class))).thenAnswer(inv -> {
            SystemSettingEntity e = inv.getArgument(0);
            store.put(e.getSettingKey(), e.getSettingValue());
            return e;
        });
        return new OfficeLicensingService(settingRepository, auditLogRepository, registryClient, backupService);
    }

    @Test
    void generatesImmutableIdAndActivationCodeFormat() {
        OfficeLicensingService svc = new OfficeLicensingService(settingRepository, auditLogRepository, registryClient, backupService);
        String id1 = svc.generateImmutableOfficeId();
        String id2 = svc.generateImmutableOfficeId();
        String code = svc.generateActivationCode();

        assertTrue(id1.startsWith("off-"));
        assertNotEquals(id1, id2);
        assertTrue(code.matches("KRD-[A-Z0-9]{4}-[A-Z0-9]{4}"));
    }

    @Test
    void vendorPinIsHashedAndVerifiedSecurely() {
        Map<String, String> store = new HashMap<>();
        OfficeLicensingService svc = createServiceWithInMemorySettings(store);

        assertFalse(svc.hasVendorPinConfigured());
        svc.configureVendorPin("9876");

        assertTrue(svc.hasVendorPinConfigured());
        assertNotEquals("9876", store.get(OfficeLicensingService.KEY_VENDOR_MASTER_PIN_HASH));
        assertTrue(svc.verifyVendorPin("9876"));
        assertFalse(svc.verifyVendorPin("0000"));
    }

    @Test
    void licenseActiveCheckHandlesSuspendedAndExpired() {
        String future = Instant.now().plus(10, ChronoUnit.DAYS).toString();
        String past = Instant.now().minus(1, ChronoUnit.DAYS).toString();

        assertTrue(OfficeLicensingService.isLicenseCurrentlyActive("ACTIVE", null));
        assertTrue(OfficeLicensingService.isLicenseCurrentlyActive("ACTIVE", future));
        assertFalse(OfficeLicensingService.isLicenseCurrentlyActive("ACTIVE", past));
        assertFalse(OfficeLicensingService.isLicenseCurrentlyActive("SUSPENDED", null));
        assertFalse(OfficeLicensingService.isLicenseCurrentlyActive("EXPIRED", future));
    }

    @Test
    void registerCommercialOfficeSavesOfficeAndAdminUser() throws Exception {
        UserSessionContext.clear();
        Map<String, String> store = new HashMap<>();
        store.put(OfficeLicensingService.KEY_SUPABASE_URL, "https://demo.supabase.co");
        store.put(OfficeLicensingService.KEY_SUPABASE_KEY, "anon-key");
        OfficeLicensingService svc = createServiceWithInMemorySettings(store);

        RemoteOffice created = svc.registerCommercialOffice(
                "Oficina Norte",
                "Carlos",
                "Barranquilla",
                "3001112233",
                "Admin Norte",
                "admin-norte",
                "ClaveSegura123",
                "MONTHLY",
                null,
                "4321"
        );

        assertTrue(created.id().startsWith("off-"));
        assertEquals("Oficina Norte", created.companyName());
        assertEquals("ACTIVE", created.licenseStatus());
        assertTrue(created.activationCode().startsWith("KRD-"));

        verify(registryClient).upsertOffice(eq("https://demo.supabase.co"), eq("anon-key"), eq(created), eq("4321"));
        ArgumentCaptor<String> hashCaptor = ArgumentCaptor.forClass(String.class);
        verify(registryClient).upsertAdminUser(
                eq("https://demo.supabase.co"),
                eq("anon-key"),
                anyString(),
                eq(created.id()),
                eq("Admin Norte"),
                eq("admin-norte"),
                hashCaptor.capture(),
                eq("3001112233")
        );
        assertNotEquals("ClaveSegura123", hashCaptor.getValue());
        verify(registryClient).upsertRoute(
                eq("https://demo.supabase.co"),
                eq("anon-key"),
                anyString(),
                eq(created.id()),
                eq("Ruta 1"),
                eq("R-01"),
                isNull()
        );

        ArgumentCaptor<AuditLogEntity> auditCaptor = ArgumentCaptor.forClass(AuditLogEntity.class);
        verify(auditLogRepository).save(auditCaptor.capture());
        assertNull(auditCaptor.getValue().getUserId(),
                "Vendor audit log outside a logged-in user session must use NULL user_id to satisfy SQLite FK");
        assertTrue(auditCaptor.getValue().getReason().startsWith("Panel distribuidor:"));
    }

    @Test
    void backupAndLinkExistingLocalOfficeCreatesBackupBeforeRegistering() throws Exception {
        Map<String, String> store = new HashMap<>();
        store.put(OfficeLicensingService.KEY_SUPABASE_URL, "https://demo.supabase.co");
        store.put(OfficeLicensingService.KEY_SUPABASE_KEY, "anon-key");
        OfficeLicensingService svc = createServiceWithInMemorySettings(store);

        RemoteOffice linked = svc.backupAndLinkExistingLocalOffice("Inversiones FBV", "Fernando");

        verify(backupService).createAfterCommit("LEGACY_OFFICE_LINK");
        assertEquals("Inversiones FBV", linked.companyName());
        assertEquals(linked.id(), store.get(OfficeLicensingService.KEY_OFFICE_ID));
        assertEquals("ACTIVE", store.get(OfficeLicensingService.KEY_LICENSE_STATUS));
    }

    @Test
    void rejectsDuplicateUsernameAcrossOffices() throws Exception {
        Map<String, String> store = new HashMap<>();
        store.put(OfficeLicensingService.KEY_SUPABASE_URL, "https://demo.supabase.co");
        store.put(OfficeLicensingService.KEY_SUPABASE_KEY, "anon-key");
        when(registryClient.usernameExists("https://demo.supabase.co", "anon-key", "admin.norte")).thenReturn(true);
        OfficeLicensingService svc = createServiceWithInMemorySettings(store);

        assertThrows(IllegalArgumentException.class, () -> svc.registerCommercialOffice(
                "Otra Oficina", "Luis", "Cali", "300", "Admin", "admin.norte", "Clave123", "LIFETIME", null, ""
        ));
        verify(registryClient, never()).upsertOffice(anyString(), anyString(), any(), anyString());
    }

    @Test
    void registerCollectorForOfficeCreatesRouteAndUniqueCollector() throws Exception {
        Map<String, String> store = new HashMap<>();
        store.put(OfficeLicensingService.KEY_SUPABASE_URL, "https://demo.supabase.co");
        store.put(OfficeLicensingService.KEY_SUPABASE_KEY, "anon-key");
        when(registryClient.usernameExists("https://demo.supabase.co", "anon-key", "ruta1.norte")).thenReturn(false);
        OfficeLicensingService svc = createServiceWithInMemorySettings(store);

        svc.registerCollectorForOffice("off-123", "Ruta 1 Norte", "Pedro", "ruta1.norte", "ClaveCol123", "301");

        verify(registryClient).upsertRoute(eq("https://demo.supabase.co"), eq("anon-key"), anyString(), eq("off-123"), eq("Ruta 1 Norte"), anyString(), anyString());
        verify(registryClient).upsertUser(eq("https://demo.supabase.co"), eq("anon-key"), anyString(), eq("off-123"), eq("Pedro"), eq("ruta1.norte"), anyString(), eq("COBRADOR"), anyList(), eq("301"));
    }
}
