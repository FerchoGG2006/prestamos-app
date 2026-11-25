package com.cartera.parity;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import com.cartera.collections.application.TodayCollectionsService.CollectionPeriod;
import com.cartera.collections.application.TodayCollectionsService.NotificationItem;
import com.cartera.collections.application.TodayCollectionsService.NotificationType;
import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.customers.application.CreateCustomerWithLoanUseCase;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.infrastructure.version.AppVersion;
import com.cartera.infrastructure.version.DesktopUpdateChecker;
import com.cartera.ledger.application.ImmutableLedgerService;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.settlement.application.SettlementUseCase;
import com.cartera.sync.application.DesktopCloudSyncService;
import com.cartera.ui.util.WhatsAppReceiptUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.AfterEach;
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
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Suite integral de verificación para Spec 013 — Desktop Full Mobile Parity (v1.1.5).
 */
@SpringBootTest(classes = CarteraInfrastructureApplication.class)
class DesktopFullMobileParityTest {

    private static Path tempDb;

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) throws Exception {
        tempDb = Files.createTempFile("kredia-parity-013-", ".db");
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
    @Autowired private CollectionSessionRepository collectionSessionRepository;
    @Autowired private DailySettlementRepository dailySettlementRepository;
    @Autowired private PaymentPromiseRepository paymentPromiseRepository;
    @Autowired private TodayCollectionsService collectionsService;
    @Autowired private SettlementUseCase settlementUseCase;
    @Autowired private CreateCustomerWithLoanUseCase createCustomerWithLoanUseCase;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @AfterEach
    void tearDownSession() {
        UserSessionContext.clear();
    }

    @Test
    void block1BidirectionalSyncSettingsOpeningBaseOrderIndexAndPromisesWithReadOnlyIdleSync() {
        Map<String, List<JsonNode>> tables = new HashMap<>();
        List<ObjectNode> patchedSettingsLog = new ArrayList<>();
        List<ObjectNode> pushedCustomersLog = new ArrayList<>();

        ObjectNode adminUser = MAPPER.createObjectNode();
        adminUser.put("id", "usr-adm-p13");
        adminUser.put("username", "admin-p13");
        adminUser.put("name", "Admin Parity");
        adminUser.put("role", "ADMIN");
        adminUser.put("is_active", true);
        adminUser.put("created_at", "2026-11-20T10:00:00Z");

        ObjectNode colUser = MAPPER.createObjectNode();
        colUser.put("id", "usr-col-p13");
        colUser.put("username", "col-p13");
        colUser.put("name", "Cobrador Parity");
        colUser.put("role", "COBRADOR");
        colUser.put("is_active", true);
        colUser.put("created_at", "2026-11-20T10:00:00Z");
        tables.put("users", List.of(adminUser, colUser));

        ObjectNode route = MAPPER.createObjectNode();
        route.put("id", "route-p13");
        route.put("name", "Ruta 13");
        route.put("code", "R13");
        route.put("collector_id", "usr-col-p13");
        route.put("initial_cash_base", 0);
        route.put("is_active", true);
        route.put("created_at", "2026-11-20T10:00:00Z");
        tables.put("routes", List.of(route));

        ObjectNode custA = MAPPER.createObjectNode();
        custA.put("id", "cust-a");
        custA.put("route_id", "route-p13");
        custA.put("assigned_collector_id", "usr-col-p13");
        custA.put("full_name", "Zulma Primero");
        custA.put("document_number", "9001001");
        custA.put("phone", "3001000001");
        custA.put("order_index", 1);
        custA.put("status", "ACTIVE");
        custA.put("created_at", "2026-11-20T10:00:00Z");

        ObjectNode custB = MAPPER.createObjectNode();
        custB.put("id", "cust-b");
        custB.put("route_id", "route-p13");
        custB.put("assigned_collector_id", "usr-col-p13");
        custB.put("full_name", "Andrés Segundo");
        custB.put("document_number", "9001002");
        custB.put("phone", "3001000002");
        custB.put("order_index", 2);
        custB.put("status", "ACTIVE");
        custB.put("created_at", "2026-11-20T10:00:00Z");
        tables.put("customers", List.of(custA, custB));

        ObjectNode loanA = MAPPER.createObjectNode();
        loanA.put("id", "loan-a");
        loanA.put("route_id", "route-p13");
        loanA.put("customer_id", "cust-a");
        loanA.put("collector_id", "usr-col-p13");
        loanA.put("loan_number", "#00001");
        loanA.put("principal", 100000);
        loanA.put("interest_rate", 0.20);
        loanA.put("interest_amount", 20000);
        loanA.put("total_agreed", 120000);
        loanA.put("installment_count", 2);
        loanA.put("frequency", "DAILY");
        loanA.put("start_date", "2026-11-20");
        loanA.put("status", "ACTIVE");
        loanA.put("created_at", "2026-11-20T10:00:00Z");

        ObjectNode loanB = MAPPER.createObjectNode();
        loanB.put("id", "loan-b");
        loanB.put("route_id", "route-p13");
        loanB.put("customer_id", "cust-b");
        loanB.put("collector_id", "usr-col-p13");
        loanB.put("loan_number", "#00002");
        loanB.put("principal", 100000);
        loanB.put("interest_rate", 0.20);
        loanB.put("interest_amount", 20000);
        loanB.put("total_agreed", 120000);
        loanB.put("installment_count", 2);
        loanB.put("frequency", "DAILY");
        loanB.put("start_date", "2026-11-20");
        loanB.put("status", "ACTIVE");
        loanB.put("created_at", "2026-11-20T10:00:00Z");
        tables.put("loans", List.of(loanA, loanB));

        String today = LocalDate.now().toString();
        ObjectNode instA = MAPPER.createObjectNode();
        instA.put("id", "inst-a-1");
        instA.put("loan_id", "loan-a");
        instA.put("installment_number", 1);
        instA.put("due_date", today);
        instA.put("amount", 60000);
        instA.put("paid_amount", 0);
        instA.put("status", "PENDIENTE");

        ObjectNode instB = MAPPER.createObjectNode();
        instB.put("id", "inst-b-1");
        instB.put("loan_id", "loan-b");
        instB.put("installment_number", 1);
        instB.put("due_date", today);
        instB.put("amount", 60000);
        instB.put("paid_amount", 0);
        instB.put("status", "PENDIENTE");
        tables.put("installments", List.of(instA, instB));

        tables.put("payments", List.of());
        tables.put("renewals", List.of());
        tables.put("cash_movements", List.of());
        tables.put("financial_events", List.of());
        tables.put("daily_settlements", List.of());

        // Remote offices.settings with Mobile keys + policies + dailyOpeningBaseByRouteDate + desktopPromises
        final ObjectNode[] remoteSettingsHolder = new ObjectNode[]{MAPPER.createObjectNode()};
        remoteSettingsHolder[0].put("defaultFrequency", "DAILY");
        remoteSettingsHolder[0].put("routeInitialCashBase", 0);
        remoteSettingsHolder[0].put("paperworkFeeEnabled", false);
        remoteSettingsHolder[0].put("paperworkRate", 5000);
        remoteSettingsHolder[0].put("defaultInterestRate", 0.2);
        remoteSettingsHolder[0].put("excludeSundays", true);
        remoteSettingsHolder[0].put("allowRouteReorder", true);
        remoteSettingsHolder[0].put("maxNewLoanLimit", 3500000);
        ObjectNode baseMap = remoteSettingsHolder[0].putObject("dailyOpeningBaseByRouteDate");
        baseMap.put("route-p13::2026-11-24", 150000);
        ObjectNode metaMap = remoteSettingsHolder[0].putObject("dailyOpeningBaseMeta");
        ObjectNode metaEntry = metaMap.putObject("route-p13::2026-11-24");
        metaEntry.put("amount", 150000);
        metaEntry.put("updatedAt", "2026-11-24T08:00:00Z");
        ArrayNode remotePromises = remoteSettingsHolder[0].putArray("desktopPromises");
        ObjectNode rPr = remotePromises.addObject();
        rPr.put("id", "prom-remote-1");
        rPr.put("customerId", "cust-a");
        rPr.put("loanId", "loan-a");
        rPr.put("amount", 60000);
        rPr.put("promisedDate", today);
        rPr.put("status", "PENDIENTE");
        rPr.put("notes", "Promesa remota");
        rPr.put("createdAt", "2026-11-24T09:00:00");

        ArrayNode remoteVisits = remoteSettingsHolder[0].putArray("nonPaymentVisits");
        ObjectNode rVisit = remoteVisits.addObject();
        rVisit.put("id", "npv-mobile-1");
        rVisit.put("customerId", "cust-a");
        rVisit.put("loanId", "loan-a");
        rVisit.put("reason", "LOCAL_CERRADO");
        rVisit.put("reasonLabel", "Negocio / local cerrado");
        rVisit.put("notes", "Cerrado en la mañana");
        rVisit.put("date", today);
        rVisit.put("createdAt", today + "T09:15:00Z");

        SupabaseRegistryClient.RemoteOffice office = new SupabaseRegistryClient.RemoteOffice(
                "off-p13", "Oficina Parity 13", "P13-CODE", "ACTIVE", "LIFETIME", null, "Admin", "3000000000", "Barranquilla"
        );

        SupabaseRegistryClient stubClient = new SupabaseRegistryClient() {
            @Override
            public CloudAuthResponse authenticateUser(String url, String key, String username, String password) {
                setActiveSessionToken("tok-p13");
                return new CloudAuthResponse(true, null, "tok-p13", office, adminUser);
            }
            @Override
            public Optional<RemoteOffice> findOfficeById(String url, String key, String officeId) {
                return Optional.of(office);
            }
            @Override
            public Optional<JsonNode> fetchOfficeSettings(String url, String key, String officeId) {
                return Optional.of(remoteSettingsHolder[0].deepCopy());
            }
            @Override
            public void patchOfficeSettings(String url, String key, String officeId, ObjectNode settings) {
                patchedSettingsLog.add(settings.deepCopy());
                remoteSettingsHolder[0] = settings.deepCopy();
            }
            @Override
            public List<JsonNode> fetchOfficeRows(String url, String key, String table, String officeId) {
                return tables.getOrDefault(table, List.of());
            }
            @Override
            public void upsertRowsBatch(String url, String key, String table, List<ObjectNode> rows, boolean ignoreDuplicates, String onConflict) {
                if ("customers".equals(table) && rows != null) {
                    pushedCustomersLog.addAll(rows);
                    tables.put("customers", new ArrayList<>(rows));
                }
            }
        };

        DesktopCloudSyncService sync = new DesktopCloudSyncService(
                authService, licensingService, stubClient, backupService, ledgerService, txManager, jdbcTemplate,
                userRepository, routeRepository, customerRepository, loanRepository, installmentRepository,
                paymentRepository, allocationRepository, renewalRepository, cashMovementRepository,
                settingRepository, auditLogRepository, collectionSessionRepository, dailySettlementRepository,
                paymentPromiseRepository
        );

        // 1. Login + Hydration
        var auth = sync.authenticateAndSync("admin-p13", "secret123");
        assertTrue(auth.ok(), "Autenticación falló: " + auth.message());

        // Verificar pull de order_index y ordenamiento en TodayCollectionsService
        List<CollectionItem> items = collectionsService.getTodayCollectionItemsForRoute(LocalDate.now(), "route-p13");
        assertEquals(2, items.size());
        assertEquals("cust-a", items.get(0).customerId(), "Zulma (#1) debe ir primero aunque alfabéticamente sea después de Andrés");
        assertEquals(1, items.get(0).orderIndex());
        assertEquals("cust-b", items.get(1).customerId());
        assertEquals(2, items.get(1).orderIndex());

        // Verificar pull de políticas, base diaria y promesa remota
        assertEquals("false", settingRepository.findById("paperwork_enabled").orElseThrow().getSettingValue());
        assertEquals("true", settingRepository.findById("route_allow_reorder").orElseThrow().getSettingValue());
        assertEquals("3500000", settingRepository.findById("max_new_loan_amount").orElseThrow().getSettingValue());
        assertEquals(0, new BigDecimal("150000").compareTo(
                settlementUseCase.getSavedOpeningRouteBase("route-p13", LocalDate.of(2026, 11, 24)).orElseThrow()
        ));
        assertTrue(paymentPromiseRepository.findById("prom-remote-1").isPresent());
        AuditLogEntity hydratedVisit = auditLogRepository.findById("npv-mobile-1").orElseThrow();
        assertEquals("NON_PAYMENT_VISIT", hydratedVisit.getEntityType());
        assertEquals("loan-a", hydratedVisit.getEntityId());
        assertTrue(hydratedVisit.getReason().contains("Negocio / local cerrado"));
        assertTrue(hydratedVisit.getReason().contains("Cerrado en la mañana"));

        // 2. Idle background sync MUST stay strictly read-only (0 pushes!)
        sync.syncSilentlyInBackground();
        assertTrue(patchedSettingsLog.isEmpty(), "Idle sync NO debe parchear offices.settings si no hubo cambios locales");
        assertTrue(pushedCustomersLog.isEmpty(), "Idle sync NO debe subir customers si no hubo cambios locales");

        // 3. Modificar orden de visita localmente + editar base diaria + cambiar política + registrar visita No Pago y cumplir promesa -> debe subir a Supabase
        collectionsService.saveCustomerRouteOrder(List.of("cust-b", "cust-a"));
        settlementUseCase.saveOpeningRouteBase("route-p13", LocalDate.of(2026, 11, 25), new BigDecimal("220000"));
        settingRepository.save(new SystemSettingEntity("exclude_sundays", "false", "2026-11-25T10:00:00"));
        settingRepository.save(new SystemSettingEntity(DesktopCloudSyncService.KEY_SETTINGS_LOCAL_DIRTY, "true", "2026-11-25T10:00:00Z"));

        PaymentPromiseEntity localProm = paymentPromiseRepository.findById("prom-remote-1").orElseThrow();
        localProm.setStatus("CUMPLIDA");
        paymentPromiseRepository.save(localProm);

        auditLogRepository.save(new AuditLogEntity(
                "npv-desktop-1", "usr-adm-p13", "NON_PAYMENT_VISIT", "loan-b",
                "VISITA_NO_PAGO", null, "Cliente=cust-b;Fecha=" + today,
                "No estaba en el domicilio — Se llamó dos veces", today + "T11:30:00"
        ));

        sync.syncSilentlyInBackground();
        assertEquals(1, patchedSettingsLog.size(), "Debe parchear offices.settings tras cambio local");
        ObjectNode pushedSettings = patchedSettingsLog.get(0);
        assertEquals("DAILY", pushedSettings.path("defaultFrequency").asText(), "Debe preservar llaves propias de Móvil");
        assertFalse(pushedSettings.path("excludeSundays").asBoolean(), "Debe reflejar nueva política local");
        assertEquals(220000L, pushedSettings.path("dailyOpeningBaseByRouteDate").path("route-p13::2026-11-25").asLong());
        assertEquals(150000L, pushedSettings.path("dailyOpeningBaseByRouteDate").path("route-p13::2026-11-24").asLong());
        assertFalse(pushedCustomersLog.isEmpty(), "Debe subir customers con el nuevo order_index");

        // Verificar unión bidireccional de promesas y visitas de no pago
        assertEquals("CUMPLIDA", pushedSettings.path("desktopPromises").get(0).path("status").asText());
        assertEquals(2, pushedSettings.path("nonPaymentVisits").size(), "Debe conservar visita móvil + agregar visita desktop");
        Map<String, JsonNode> pushedVisitsById = new HashMap<>();
        for (JsonNode vn : pushedSettings.path("nonPaymentVisits")) {
            pushedVisitsById.put(vn.path("id").asText(), vn);
        }
        assertEquals("LOCAL_CERRADO", pushedVisitsById.get("npv-mobile-1").path("reason").asText());
        assertEquals("NO_ESTABA", pushedVisitsById.get("npv-desktop-1").path("reason").asText());
        assertEquals("Se llamó dos veces", pushedVisitsById.get("npv-desktop-1").path("notes").asText());

        // 4. Siguiente sync en reposo tras subir NO debe volver a parchear settings
        sync.syncSilentlyInBackground();
        assertEquals(1, patchedSettingsLog.size(), "Tras quedar sincronizado, el siguiente sync idle NO debe parchear");

        Map<String, Integer> pushedOrderById = new HashMap<>();
        for (ObjectNode row : pushedCustomersLog) {
            pushedOrderById.put(row.path("id").asText(), row.path("order_index").asInt());
        }
        assertEquals(1, pushedOrderById.get("cust-b"));
        assertEquals(2, pushedOrderById.get("cust-a"));

        // 4. Segundo idle sync después del push -> otra vez 0 pushes!
        int prevPatches = patchedSettingsLog.size();
        int prevCustPushes = pushedCustomersLog.size();
        sync.syncSilentlyInBackground();
        assertEquals(prevPatches, patchedSettingsLog.size(), "Siguiente sync en reposo debe ser solo-lectura");
        assertEquals(prevCustPushes, pushedCustomersLog.size(), "Siguiente sync en reposo no debe reenviar clientes");
    }

    @Test
    void block2UnifiedNewCustomerPlusMigrationPaydayPeriodMetricsAndNotifications() {
        String now = "2026-11-25T08:00:00";
        if (userRepository.findById("usr-adm-b2").isEmpty()) {
            userRepository.save(new AppUserEntity("usr-adm-b2", "admin-b2", "hash", "Admin B2", 1, now));
        }
        if (routeRepository.findById("route-b2").isEmpty()) {
            routeRepository.save(new RouteEntity("route-b2", "Ruta B2", "usr-adm-b2", 1, now));
        }
        UserSessionContext.setSession(new UserSession("usr-adm-b2", "admin-b2", "Admin B2", "ADMIN"));

        // 1. Cliente nuevo + Cartulina migrada SEMANAL (6 cuotas, 2 pagadas en papel, próximo viernes)
        LocalDate nextFriday = CreateLoanUseCase.upcomingWeekday(LocalDate.of(2026, 11, 24), DayOfWeek.FRIDAY);
        assertEquals(DayOfWeek.FRIDAY, nextFriday.getDayOfWeek());

        var custCmd = new CreateCustomerUseCase.CreateCustomerCommand(
                "Marta Cartulina", "777888999", "3015556677", "3015556677",
                "Cra 10 # 20-30", "Centro", "Barranquilla", "Comerciante", "Tienda Marta",
                "", "route-b2", "usr-adm-b2", "usr-adm-b2"
        );
        var res = createCustomerWithLoanUseCase.execute(
                custCmd,
                new BigDecimal("300000"),
                new BigDecimal("0.20"),
                new BigDecimal("360000"),
                6,
                "SEMANAL",
                LocalDate.of(2026, 11, 24),
                BigDecimal.ZERO,
                true,
                Set.of(1, 2),
                null,
                "Migración prueba atómica",
                nextFriday
        );

        assertNotNull(res.customer());
        assertNotNull(res.loan());
        assertEquals("MIGRACION", res.loan().getOperationType());

        List<InstallmentEntity> insts = installmentRepository.findByLoanIdOrderByInstallmentNumberAsc(res.loan().getId());
        assertEquals(6, insts.size());
        assertEquals("PAGADA", insts.get(0).getStatus());
        assertEquals("PAGADA", insts.get(1).getStatus());
        assertEquals(nextFriday.toString(), insts.get(2).getDueDate(), "La cuota #3 debe vencer exactamente el próximo viernes");

        // 2. Period collection metrics (TODAY / YESTERDAY / LAST_7_DAYS / THIS_MONTH / ALL_TIME)
        LocalDate ref = LocalDate.of(2026, 11, 25);
        paymentRepository.save(new PaymentEntity("pay-t1", "idem-t1", res.loan().getId(), res.customer().getId(),
                "usr-adm-b2", null, new BigDecimal("60000"), "EFECTIVO", "APLICADO", "2026-11-25T10:00:00", null));
        paymentRepository.save(new PaymentEntity("pay-y1", "idem-y1", res.loan().getId(), res.customer().getId(),
                "usr-adm-b2", null, new BigDecimal("40000"), "EFECTIVO", "APLICADO", "2026-11-24T10:00:00", null));
        paymentRepository.save(new PaymentEntity("pay-w1", "idem-w1", res.loan().getId(), res.customer().getId(),
                "usr-adm-b2", null, new BigDecimal("50000"), "TRANSFERENCIA", "APLICADO", "2026-11-20T10:00:00", null));
        paymentRepository.save(new PaymentEntity("pay-old", "idem-old", res.loan().getId(), res.customer().getId(),
                "usr-adm-b2", null, new BigDecimal("90000"), "EFECTIVO", "APLICADO", "2026-10-15T10:00:00", null));

        assertEquals(0, new BigDecimal("60000").compareTo(
                collectionsService.getCollectedAmountForPeriod(CollectionPeriod.TODAY, ref, "route-b2")));
        assertEquals(0, new BigDecimal("40000").compareTo(
                collectionsService.getCollectedAmountForPeriod(CollectionPeriod.YESTERDAY, ref, "route-b2")));
        assertEquals(0, new BigDecimal("150000").compareTo(
                collectionsService.getCollectedAmountForPeriod(CollectionPeriod.LAST_7_DAYS, ref, "route-b2")));
        assertEquals(0, new BigDecimal("150000").compareTo(
                collectionsService.getCollectedAmountForPeriod(CollectionPeriod.THIS_MONTH, ref, "route-b2")));
        assertEquals(0, new BigDecimal("240000").compareTo(
                collectionsService.getCollectedAmountForPeriod(CollectionPeriod.ALL_TIME, ref, "route-b2")));

        // 3. Actionable notifications: marcar 4 cuotas pagadas (66% -> RENEWAL_READY), 1 vencida (OVERDUE), y 1 promesa de hoy (PROMISE)
        insts.get(2).setPaidAmount(insts.get(2).getAmount());
        insts.get(2).setStatus("PAGADA");
        insts.get(3).setPaidAmount(insts.get(3).getAmount());
        insts.get(3).setStatus("PAGADA");
        insts.get(4).setDueDate("2026-11-20"); // Vencida antes de ref (2026-11-25)
        installmentRepository.saveAll(insts);

        paymentPromiseRepository.save(new PaymentPromiseEntity(
                "prom-b2", res.customer().getId(), res.loan().getId(), new BigDecimal("60000"),
                "2026-11-25", "PENDIENTE", "Paga en la tarde", now
        ));

        List<NotificationItem> alerts = collectionsService.getActionableNotifications(ref, "route-b2");
        assertTrue(alerts.stream().anyMatch(a -> a.type() == NotificationType.OVERDUE && res.customer().getId().equals(a.customerId())),
                "Debe detectar cliente en mora");
        assertTrue(alerts.stream().anyMatch(a -> a.type() == NotificationType.PROMISE && res.customer().getId().equals(a.customerId())),
                "Debe detectar promesa del día");
        assertTrue(alerts.stream().anyMatch(a -> a.type() == NotificationType.RENEWAL_READY && res.customer().getId().equals(a.customerId())),
                "Debe detectar cliente listo para renovar (>=60%)");
    }

    @Test
    void block3SemverUpdateCheckerAndWhatsAppSettlementReport() {
        assertTrue(AppVersion.compareSemver(AppVersion.CURRENT, "1.2.3") >= 0);
        assertEquals("1.2.0", AppVersion.SHELL_VERSION);
        assertTrue(AppVersion.isNewer("1.2.2", "1.2.1"));
        assertTrue(AppVersion.isNewer("v1.3.0", "1.2.1"));
        assertFalse(AppVersion.isNewer("1.2.1", "1.2.1"));
        assertFalse(AppVersion.isNewer("1.2.0", "1.2.1"));

        // Regresión PGRST102: normalizeBatchChunk garantiza llaves idénticas para PostgREST en lotes heterogéneos
        SupabaseRegistryClient client = new SupabaseRegistryClient();
        ObjectNode loanNormal = client.createObjectNode();
        loanNormal.put("id", "l-1");
        loanNormal.put("frequency", "DAILY");
        ObjectNode loanFixedWithNotes = client.createObjectNode();
        loanFixedWithNotes.put("id", "l-2");
        loanFixedWithNotes.put("frequency", "FIXED_DATE");
        loanFixedWithNotes.put("fixed_due_date", "2026-12-15");
        loanFixedWithNotes.put("notes", "Migrado de cartulina física a digital");
        var normalizedArr = client.normalizeBatchChunk(List.of(loanNormal, loanFixedWithNotes));
        assertEquals(2, normalizedArr.size());
        Set<String> keys0 = new HashSet<>();
        Set<String> keys1 = new HashSet<>();
        normalizedArr.get(0).fieldNames().forEachRemaining(keys0::add);
        normalizedArr.get(1).fieldNames().forEachRemaining(keys1::add);
        assertEquals(keys0, keys1, "Todas las filas de un lote PostgREST deben tener exactamente las mismas llaves");
        assertTrue(normalizedArr.get(0).get("fixed_due_date").isNull());
        assertTrue(normalizedArr.get(0).get("notes").isNull());

        DesktopUpdateChecker checker = new DesktopUpdateChecker("http://127.0.0.1:1/never-called");
        String manifestJson = """
                {
                  "latest_version": "1.3.0",
                  "min_version": "1.2.1",
                  "min_shell_version": "1.2.0",
                  "core_jar_url": "https://example.com/kredia-app-1.3.0.jar",
                  "core_jar_sha256": "abc123",
                  "download_url": "https://example.com/setup.exe",
                  "release_notes": "Mejoras de velocidad"
                }
                """;
        var info = checker.parseUpdateInfo(manifestJson, "1.2.0").orElseThrow();
        assertTrue(info.updateAvailable());
        assertTrue(info.mandatory());
        assertTrue(info.supportsOtaForShell("1.2.0"));
        assertEquals("1.3.0", info.latestVersion());
        assertEquals("https://example.com/setup.exe", info.downloadUrl());

        var upToDate = checker.parseUpdateInfo(manifestJson, "1.3.0").orElseThrow();
        assertFalse(upToDate.updateAvailable());
        assertFalse(upToDate.mandatory());

        String waMsg = WhatsAppReceiptUtil.generateDailySettlementMessage(
                "Inversiones FBV",
                "Ruta 1",
                "2026-11-25",
                "Carlos Cobrador",
                new BigDecimal("450000"),
                new BigDecimal("400000"),
                new BigDecimal("50000"),
                new BigDecimal("100000"),
                new BigDecimal("20000"),
                new BigDecimal("480000"),
                true,
                new BigDecimal("480000"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                new BigDecimal("480000"),
                "Todo cuadrado",
                ""
        );
        assertTrue(waMsg.contains("INVERSIONES FBV"));
        assertTrue(waMsg.contains("Ruta 1"));
        assertTrue(waMsg.contains("Carlos Cobrador"));
        assertTrue(waMsg.contains("JORNADA CERRADA"));
        assertTrue(waMsg.contains("v" + AppVersion.CURRENT));
    }
}
