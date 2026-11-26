package com.cartera.sync.application;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.ledger.application.ImmutableLedgerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = CarteraInfrastructureApplication.class)
class DesktopCloudSyncServiceTest {

    private static Path tempDb;

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) throws Exception {
        tempDb = Files.createTempFile("kredia-sync-test-", ".db");
        tempDb.toFile().deleteOnExit();
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDb.toAbsolutePath());
        registry.add("cartera.demo-data.enabled", () -> "false");
        registry.add("cartera.cloud.url", () -> "https://example.supabase.co");
        registry.add("cartera.cloud.anon-key", () -> "test-anon-key");
    }

    @Autowired private AuthService authService;
    @Autowired private OfficeLicensingService licensingService;
    @Autowired private DatabaseBackupService backupService;
    @Autowired private ImmutableLedgerService ledgerService;
    @Autowired private PlatformTransactionManager txManager;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private AppUserRepository userRepository;
    @Autowired private RouteRepository routeRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private LoanRepository loanRepository;
    @Autowired private InstallmentRepository installmentRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private PaymentAllocationRepository allocationRepository;
    @Autowired private RenewalRepository renewalRepository;
    @Autowired private CashMovementRepository cashMovementRepository;
    @Autowired private SystemSettingRepository settingRepository;
    @Autowired private AuditLogRepository auditLogRepository;

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

        // 3. Exact FBV production hash verification
        String fbvHash = "sha256$def8b2fd33bb0444$acc2b8b827100c071a25cab939d609a4e0e5faa007b02cee34d4d878f418ba8c";
        assertTrue(PasswordHasher.verify("FBV2026*", fbvHash));
        assertFalse(PasswordHasher.verify("otra-clave", fbvHash));
    }

    @Test
    void authenticateAndSyncSucceedsEvenIfPostAuthHydrationFailsTransiently() {
        ObjectMapper mapper = new ObjectMapper();
        SupabaseRegistryClient stubClient = new SupabaseRegistryClient() {
            @Override
            public CloudAuthResponse authenticateUser(String supabaseUrl, String apiKey, String username, String rawPassword) {
                ObjectNode userNode = mapper.createObjectNode();
                userNode.put("id", "usr-adm-1");
                userNode.put("username", "admin-fbv");
                userNode.put("name", "Administrador FBV");
                userNode.put("role", "ADMIN");
                RemoteOffice office = new RemoteOffice(
                        "off-fbv-001", "Inversiones FBV", "KRD-FBV1-2026",
                        "ACTIVE", "LIFETIME", null, "Fernando Baquero", "3005390069", "Valledupar"
                );
                return new CloudAuthResponse(true, "", "tok-fbv-123", office, userNode);
            }

            @Override
            public List<com.fasterxml.jackson.databind.JsonNode> fetchOfficeRows(String supabaseUrl, String apiKey, String table, String officeId) {
                throw new IllegalStateException("Transient network timeout while downloading " + table);
            }
        };

        DesktopCloudSyncService service = new DesktopCloudSyncService(
                authService, licensingService, stubClient, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository
        );

        DesktopCloudSyncService.AuthResult result = service.authenticateAndSync("admin-FBV", "FBV2026*");
        assertTrue(result.ok(), "Valid cloud login must succeed even when post-auth hydration fails transiently");
        assertNotNull(result.session());
        assertEquals("admin-fbv", result.session().username());
        assertEquals("ADMIN", result.session().roleCode());
        assertTrue(result.session().isAdmin());
        assertEquals("off-fbv-001", licensingService.getLinkedOfficeId().orElse(""));
        assertTrue(authService.authenticate("admin-fbv", "FBV2026*").isPresent(),
                "Local PBKDF2 fallback must be persisted after authenticated login");
    }

    @Test
    void vendorCommercialOfficeRegistrationPersistsAuditLogWithSqliteForeignKeysEnabled() throws Exception {
        com.cartera.infrastructure.security.UserSessionContext.clear();
        SupabaseRegistryClient stubClient = new SupabaseRegistryClient() {
            @Override
            public boolean usernameExists(String supabaseUrl, String apiKey, String username) {
                return false;
            }

            @Override
            public void upsertOffice(String supabaseUrl, String apiKey, RemoteOffice office, String recoveryPin) {}

            @Override
            public void upsertAdminUser(
                    String supabaseUrl, String apiKey, String userId, String officeId,
                    String fullName, String username, String passwordHash, String phone
            ) {}

            @Override
            public void upsertRoute(
                    String supabaseUrl, String apiKey, String routeId, String officeId,
                    String routeName, String routeCode, String collectorId
            ) {}
        };
        OfficeLicensingService realDbLicensing = new OfficeLicensingService(
                settingRepository, auditLogRepository, stubClient, backupService,
                "https://example.supabase.co", "test-anon-key"
        );

        long beforeAudits = auditLogRepository.count();
        SupabaseRegistryClient.RemoteOffice created = realDbLicensing.registerCommercialOffice(
                "Inversiones La Plancha QA",
                "Keiner Romero",
                "Valledupar",
                "3127880287",
                "Jefe Plancha",
                "jefeplancha-qa",
                "Clave1234",
                "LIFETIME",
                null,
                ""
        );

        assertNotNull(created.id());
        assertEquals(beforeAudits + 1, auditLogRepository.count(),
                "Audit log must persist cleanly in SQLite with PRAGMA foreign_keys = ON");
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

    @Test
    void prunesEmptyLocalGhostRouteWhenAbsentFromServerWithoutLosingData() {
        ObjectMapper mapper = new ObjectMapper();
        String now = java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        userRepository.saveAndFlush(new com.cartera.infrastructure.persistence.entity.AppUserEntity(
                "usr-col-plancha", "plancha.r1", PasswordHasher.hash("Clave2026!"), "La plancha 1", 1, now
        ));
        routeRepository.saveAndFlush(new com.cartera.infrastructure.persistence.entity.RouteEntity(
                "rt-c995615d-01", "La plancha 1", "usr-col-plancha", 1, now
        ));
        routeRepository.saveAndFlush(new com.cartera.infrastructure.persistence.entity.RouteEntity(
                "rt-plancha-001", "Ruta 1", null, 1, now
        ));
        customerRepository.saveAndFlush(new com.cartera.infrastructure.persistence.entity.CustomerEntity(
                "cust-plancha-1", "Cliente Seguro Plancha", "1099001122", "3001112233", "3001112233",
                "Calle 1", "Centro", "Valledupar", "Comerciante", "Tienda", "", "ACTIVO",
                "rt-c995615d-01", "usr-col-plancha", now
        ));
        settingRepository.saveAndFlush(new com.cartera.infrastructure.persistence.entity.SystemSettingEntity(
                OfficeLicensingService.KEY_OFFICE_ID, "off-c995615df9", now
        ));
        licensingService.saveCloudSessionToken("tok-plancha-365d");

        java.util.concurrent.atomic.AtomicBoolean refreshCalled = new java.util.concurrent.atomic.AtomicBoolean(false);
        SupabaseRegistryClient stubClient = new SupabaseRegistryClient() {
            @Override
            public boolean refreshCloudSession(String supabaseUrl, String apiKey) {
                refreshCalled.set(true);
                return true;
            }

            @Override
            public java.util.Optional<RemoteOffice> findOfficeById(String supabaseUrl, String apiKey, String officeId) {
                return java.util.Optional.of(new RemoteOffice(
                        "off-c995615df9", "Inversiones La Plancha", "KRD-FXSG-TX4Z",
                        "ACTIVE", "LIFETIME", null, "Keiner", "3127880287", "Valledupar"
                ));
            }

            @Override
            public List<com.fasterxml.jackson.databind.JsonNode> fetchOfficeRows(String supabaseUrl, String apiKey, String table, String officeId) {
                if ("users".equals(table)) {
                    ObjectNode u = mapper.createObjectNode();
                    u.put("id", "usr-col-plancha");
                    u.put("username", "plancha.r1");
                    u.put("name", "La plancha 1");
                    u.put("role", "COBRADOR");
                    u.put("is_active", true);
                    return List.of(u);
                }
                if ("routes".equals(table)) {
                    ObjectNode r = mapper.createObjectNode();
                    r.put("id", "rt-c995615d-01");
                    r.put("name", "La plancha 1");
                    r.put("code", "R-01");
                    r.put("collector_id", "usr-col-plancha");
                    r.put("is_active", true);
                    return List.of(r);
                }
                if ("customers".equals(table)) {
                    ObjectNode c = mapper.createObjectNode();
                    c.put("id", "cust-plancha-1");
                    c.put("route_id", "rt-c995615d-01");
                    c.put("assigned_collector_id", "usr-col-plancha");
                    c.put("full_name", "Cliente Seguro Plancha");
                    c.put("document_number", "1099001122");
                    c.put("status", "ACTIVE");
                    return List.of(c);
                }
                return List.of();
            }

            @Override
            public void upsertRowsBatch(String supabaseUrl, String apiKey, String table, List<ObjectNode> rows, boolean ignoreDuplicates, String onConflict) {}
        };
        stubClient.setActiveSessionToken("tok-plancha-365d");

        DesktopCloudSyncService service = new DesktopCloudSyncService(
                authService, licensingService, stubClient, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository
        );

        try {
            service.syncSilentlyInBackground();

            assertTrue(refreshCalled.get(), "Silent sync must extend sliding 365-day session");
            assertTrue(routeRepository.findById("rt-plancha-001").isEmpty(), "Empty ghost route absent from server must be pruned locally");
            assertTrue(routeRepository.findById("rt-c995615d-01").isPresent(), "Active server route must be preserved");
            assertTrue(customerRepository.findById("cust-plancha-1").isPresent(), "Customer data must remain 100% intact");
        } finally {
            settingRepository.findById(OfficeLicensingService.KEY_OFFICE_ID).ifPresent(settingRepository::delete);
            settingRepository.findById(OfficeLicensingService.KEY_CLOUD_SESSION_TOKEN).ifPresent(settingRepository::delete);
            settingRepository.flush();
            customerRepository.findById("cust-plancha-1").ifPresent(customerRepository::delete);
            customerRepository.flush();
            routeRepository.findById("rt-plancha-001").ifPresent(routeRepository::delete);
            routeRepository.findById("rt-c995615d-01").ifPresent(routeRepository::delete);
            routeRepository.flush();
            jdbcTemplate.update("DELETE FROM user_role WHERE user_id = ?", "usr-col-plancha");
            userRepository.findById("usr-col-plancha").ifPresent(userRepository::delete);
            userRepository.flush();
        }
    }
}
