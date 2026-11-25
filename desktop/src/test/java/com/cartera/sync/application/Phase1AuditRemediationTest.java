package com.cartera.sync.application;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.ledger.application.ImmutableLedgerService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = CarteraInfrastructureApplication.class)
class Phase1AuditRemediationTest {

    private static Path tempDb;

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) throws Exception {
        tempDb = Files.createTempFile("kredia-phase1-test-", ".db");
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
    @Autowired private CustomerAttachmentRepository attachmentRepository;
    @Autowired private LoanRepository loanRepository;
    @Autowired private InstallmentRepository installmentRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private PaymentAllocationRepository allocationRepository;
    @Autowired private RenewalRepository renewalRepository;
    @Autowired private CashMovementRepository cashMovementRepository;
    @Autowired private SystemSettingRepository settingRepository;
    @Autowired private AuditLogRepository auditLogRepository;

    @Test
    void authServicePersistsRealRolesWithoutUsernameEscalationOrOfflineDowngrade() {
        String now = LocalDateTime.now().toString();
        String colId = "usr-col-escal-" + UUID.randomUUID().toString().substring(0, 6);
        // Nombre de usuario "admin.ruta1" asignado explícitamente como COBRADOR -> NO debe escalar a ADMIN
        AppUserEntity collector = userRepository.saveAndFlush(new AppUserEntity(
                colId, "admin.ruta1", PasswordHasher.hash("ClaveCol123"), "Cobrador Ruta 1", 1, now
        ));
        authService.assignRole(colId, "COBRADOR");
        assertEquals("COBRADOR", authService.resolveRole(collector));
        var colSession = authService.authenticate("admin.ruta1", "ClaveCol123").orElseThrow();
        assertEquals("COBRADOR", colSession.roleCode());
        assertTrue(colSession.isCollector());

        // Administrador real con UUID genérico y username "gerente.norte" -> conserva ADMIN offline
        String admId = "u-" + UUID.randomUUID().toString().substring(0, 8);
        AppUserEntity manager = userRepository.saveAndFlush(new AppUserEntity(
                admId, "gerente.norte", PasswordHasher.hash("ClaveAdm123"), "Gerente Norte", 1, now
        ));
        authService.assignRole(admId, "ADMIN");
        assertEquals("ADMIN", authService.resolveRole(manager));
        var admSession = authService.authenticate("gerente.norte", "ClaveAdm123").orElseThrow();
        assertEquals("ADMIN", admSession.roleCode());
        assertTrue(admSession.isAdmin());
    }

    @Test
    void licenseActiveCheckFailsClosedOnCorruptExpirationDate() {
        assertFalse(OfficeLicensingService.isLicenseCurrentlyActive("ACTIVE", "not-a-valid-date"));
        assertTrue(OfficeLicensingService.isLicenseCurrentlyActive("ACTIVE", LocalDate.now().plusDays(5).toString()));
        assertFalse(OfficeLicensingService.isLicenseCurrentlyActive("ACTIVE", Instant.now().minus(1, ChronoUnit.HOURS).toString()));
    }

    @Test
    void cloudSyncMapsTerminalAndSpecialStatusesSafely() {
        assertEquals("PAID", DesktopCloudSyncService.mapLoanStatusToCloud("FINALIZADO"));
        assertEquals("PAID", DesktopCloudSyncService.mapLoanStatusToCloud("COMPLETADO"));
        assertEquals("PAID", DesktopCloudSyncService.mapLoanStatusToCloud("PAGADO"));
        assertEquals("CANCELLED", DesktopCloudSyncService.mapLoanStatusToCloud("ANULADO"));

        assertEquals("PENDIENTE", DesktopCloudSyncService.mapInstallmentStatusToCloud("ANULADA"));
        assertEquals("ADELANTADA", DesktopCloudSyncService.mapInstallmentStatusToCloud("ADELANTADA"));
        assertEquals("ADELANTADA", DesktopCloudSyncService.mapInstallmentStatusToDesktop("ADELANTADA"));

        assertEquals("ANULADO", DesktopCloudSyncService.mapPaymentStatusToDesktop("REVERSED"));
        assertEquals("FIXED_DATE", DesktopCloudSyncService.mapFrequencyToCloud("FECHA FIJA"));
        assertEquals("FECHA FIJA", DesktopCloudSyncService.mapFrequencyToDesktop("FIXED_DATE"));
        assertEquals("BLOCKED", DesktopCloudSyncService.mapCustomerStatusToCloud("BLOQUEADO"));
        assertEquals("BLOQUEADO", DesktopCloudSyncService.mapCustomerStatusToDesktop("BLOCKED"));
        assertEquals("EXPENSE", DesktopCloudSyncService.mapCashCategoryToCloud("GASTO_RUTA_GASOLINA"));
        assertEquals("EXPENSE", DesktopCloudSyncService.mapCashCategoryToCloud("GASTO_VIATICOS"));
    }

    @Test
    void cloudSyncBlocksAutoPushInRecoveryReadOnlyModeAndPullsBeforePush() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        List<String> callOrder = new ArrayList<>();
        AtomicBoolean pushed = new AtomicBoolean(false);

        SupabaseRegistryClient stub = new SupabaseRegistryClient() {
            @Override
            public Optional<RemoteOffice> findOfficeById(String url, String key, String officeId) {
                return Optional.of(new RemoteOffice(officeId, "Oficina QA", "KRD-QA01-2026",
                        "ACTIVE", "LIFETIME", null, "Dueño", "3000000000", "Sincelejo"));
            }

            @Override
            public List<JsonNode> fetchOfficeRows(String url, String key, String table, String officeId) {
                if (!callOrder.contains("PULL")) callOrder.add("PULL");
                return List.of();
            }

            @Override
            public Optional<JsonNode> fetchOfficeSettings(String url, String key, String officeId) {
                ObjectNode s = mapper.createObjectNode();
                s.put("paperworkFeeEnabled", false);
                s.put("paperworkRate", 0.05);
                return Optional.of(s);
            }

            @Override
            public void upsertRowsBatch(String url, String key, String table, List<ObjectNode> rows, boolean ignoreDuplicates) {
                if (!callOrder.contains("PUSH")) callOrder.add("PUSH");
                pushed.set(true);
            }
        };

        DesktopCloudSyncService sync = new DesktopCloudSyncService(
                authService, licensingService, stub, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository
        );

        String now = LocalDateTime.now().toString();
        settingRepository.save(new SystemSettingEntity(OfficeLicensingService.KEY_OFFICE_ID, "off-qa-p1", now));
        settingRepository.save(new SystemSettingEntity(OfficeLicensingService.KEY_CLOUD_SESSION_TOKEN, "tok-qa-p1", now));
        settingRepository.save(new SystemSettingEntity(OfficeLicensingService.KEY_RECOVERY_READ_ONLY, "true", now));

        assertFalse(sync.syncSilentlyInBackground(), "Modo recuperación debe bloquear sync automático");
        assertFalse(pushed.get(), "No debe subir datos en modo recuperación");

        // Desactivar modo recuperación -> debe ejecutar PULL antes de PUSH e hidratar paperworkFeeEnabled=false
        settingRepository.save(new SystemSettingEntity(OfficeLicensingService.KEY_RECOVERY_READ_ONLY, "false", now));
        sync.syncSilentlyInBackground();

        assertEquals(List.of("PULL", "PUSH"), callOrder, "PULL debe ejecutarse estrictamente antes de PUSH");
        assertEquals("false", settingRepository.findById("paperwork_enabled").orElseThrow().getSettingValue());
    }

    @Test
    void officeSwitchAbortsWithoutLeakingOfficeAWhenHydrationFailsAndClearsAttachmentsOnSuccess() {
        ObjectMapper mapper = new ObjectMapper();
        String now = LocalDateTime.now().toString();

        // Sembrar Oficina A con adjunto en customer_attachment y weekly_settlement (foco de FK crash anterior)
        settingRepository.save(new SystemSettingEntity(OfficeLicensingService.KEY_OFFICE_ID, "off-A", now));
        String colA = "usr-col-a";
        userRepository.saveAndFlush(new AppUserEntity(colA, "col.a", PasswordHasher.hash("ClaveA123"), "Cobrador A", 1, now));
        routeRepository.saveAndFlush(new RouteEntity("rt-a-01", "Ruta A", colA, 1, now));
        customerRepository.saveAndFlush(new CustomerEntity(
                "cust-a-01", "Cliente Oficina A", "DOC-A-1", "3001111111", null, "", "", "", "", "", "", "ACTIVO", "rt-a-01", colA, now
        ));
        attachmentRepository.saveAndFlush(new CustomerAttachmentEntity(
                "att-a-01", "cust-a-01", "doc.pdf", "stored-doc.pdf", "application/pdf", 120L, "sha256", now
        ));
        jdbcTemplate.update(
                "INSERT INTO weekly_settlement (id, route_id, collector_id, period_start, period_end, total_collections, new_loans_capital, renewals_capital, paperwork_total, disbursements_total, delinquency_recovered, created_at) "
                        + "VALUES ('ws-a-1','rt-a-01',?,?,?,0,0,0,0,0,0,?)",
                colA, "2026-11-01", "2026-11-07", now
        );

        // 1. Intento de cambio a Oficina B con fallo de red -> DEBE abortar sin cambiar office.id a off-B
        SupabaseRegistryClient failingSwitchClient = new SupabaseRegistryClient() {
            @Override
            public CloudAuthResponse authenticateUser(String url, String key, String username, String rawPassword) {
                ObjectNode u = mapper.createObjectNode().put("id", "usr-adm-b").put("username", "admin.b").put("name", "Admin B").put("role", "ADMIN");
                RemoteOffice offB = new RemoteOffice("off-B", "Oficina B", "KRD-B001-2026", "ACTIVE", "LIFETIME", null, "B", "", "");
                return new CloudAuthResponse(true, "", "tok-b", offB, u);
            }

            @Override
            public List<JsonNode> fetchOfficeRows(String url, String key, String table, String officeId) {
                throw new IllegalStateException("Red caída durante cambio de oficina");
            }
        };

        DesktopCloudSyncService syncFail = new DesktopCloudSyncService(
                authService, licensingService, failingSwitchClient, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository
        );

        var failedResult = syncFail.authenticateAndSync("admin.b", "ClaveB123");
        assertFalse(failedResult.ok(), "Un fallo de hidratación al cambiar de oficina debe abortar para prevenir fuga multi-tenant");
        assertEquals("off-A", licensingService.getLinkedOfficeId().orElse(""), "office.id debe seguir apuntando a Oficina A");

        // 2. Cambio exitoso a Oficina B -> borra customer_attachment, weekly_settlement y app_user de Oficina A limpiamente
        SupabaseRegistryClient okSwitchClient = new SupabaseRegistryClient() {
            @Override
            public CloudAuthResponse authenticateUser(String url, String key, String username, String rawPassword) {
                ObjectNode u = mapper.createObjectNode().put("id", "usr-adm-b").put("username", "admin.b").put("name", "Admin B").put("role", "ADMIN");
                RemoteOffice offB = new RemoteOffice("off-B", "Oficina B", "KRD-B001-2026", "ACTIVE", "LIFETIME", null, "B", "", "");
                return new CloudAuthResponse(true, "", "tok-b", offB, u);
            }

            @Override
            public List<JsonNode> fetchOfficeRows(String url, String key, String table, String officeId) {
                if ("users".equals(table)) {
                    return List.of(mapper.createObjectNode().put("id", "usr-adm-b").put("username", "admin.b").put("name", "Admin B").put("role", "ADMIN").put("is_active", true));
                }
                if ("routes".equals(table)) {
                    return List.of(mapper.createObjectNode().put("id", "rt-b-01").put("name", "Ruta B").put("is_active", true));
                }
                return List.of();
            }
        };

        DesktopCloudSyncService syncOk = new DesktopCloudSyncService(
                authService, licensingService, okSwitchClient, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository
        );

        var okResult = syncOk.authenticateAndSync("admin.b", "ClaveB123");
        assertTrue(okResult.ok());
        assertEquals("off-B", licensingService.getLinkedOfficeId().orElse(""));
        assertEquals(0, customerRepository.count(), "Clientes de Oficina A deben eliminarse al cambiar a Oficina B");
        assertEquals(0, attachmentRepository.count(), "Adjuntos de Oficina A deben eliminarse limpiamente");
        assertTrue(userRepository.findById(colA).isEmpty(), "Usuarios de Oficina A no deben quedar activos en Oficina B");
    }
}
