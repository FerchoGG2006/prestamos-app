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
}
