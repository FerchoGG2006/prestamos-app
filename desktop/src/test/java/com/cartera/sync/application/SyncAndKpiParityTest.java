package com.cartera.sync.application;

import com.cartera.CarteraInfrastructureApplication;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient;
import com.cartera.infrastructure.persistence.entity.LoanEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
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
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(classes = CarteraInfrastructureApplication.class)
class SyncAndKpiParityTest {

    private static Path tempDb;

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) throws Exception {
        tempDb = Files.createTempFile("kredia-parity-sync-", ".db");
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
    @Autowired private TodayCollectionsService collectionsService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static BigDecimal bd(String s) { return new BigDecimal(s); }
    private static void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, bd(expected).compareTo(actual), "Esperado " + expected + " pero fue " + actual);
    }

    @Test
    void cloudHydrationMatchesMobileCashFormulaFixesPaperworkRatePreservesLoanNumberAndSyncsSettlements() {
        Map<String, List<JsonNode>> tables = new HashMap<>();
        List<ObjectNode> pushedLoans = new ArrayList<>();
        List<ObjectNode> pushedRoutes = new ArrayList<>();
        List<ObjectNode> pushedCash = new ArrayList<>();

        ObjectNode adminUser = MAPPER.createObjectNode();
        adminUser.put("id", "usr-adm-1");
        adminUser.put("username", "admin-fbv");
        adminUser.put("name", "Administrador FBV");
        adminUser.put("role", "ADMIN");
        adminUser.put("is_active", true);
        adminUser.put("created_at", "2026-11-10T12:00:00Z");

        ObjectNode colUser = MAPPER.createObjectNode();
        colUser.put("id", "usr-col-1");
        colUser.put("username", "ruta1-fbv");
        colUser.put("name", "Cobrador Ruta 1");
        colUser.put("role", "COBRADOR");
        colUser.put("is_active", true);
        colUser.put("created_at", "2026-11-10T12:00:00Z");
        tables.put("users", List.of(adminUser, colUser));

        ObjectNode route = MAPPER.createObjectNode();
        route.put("id", "route-1");
        route.put("name", "Ruta 1");
        route.put("code", "RUTA");
        route.put("collector_id", "usr-col-1");
        route.put("initial_cash_base", 0);
        route.put("is_active", true);
        route.put("created_at", "2026-11-10T12:00:00Z");
        tables.put("routes", List.of(route));

        ObjectNode cust = MAPPER.createObjectNode();
        cust.put("id", "cust-1");
        cust.put("route_id", "route-1");
        cust.put("assigned_collector_id", "usr-col-1");
        cust.put("full_name", "Cliente FBV");
        cust.put("document_number", "1065001001");
        cust.put("phone", "3001112233");
        cust.put("status", "ACTIVE");
        cust.put("created_at", "2026-11-10T12:00:00Z");
        tables.put("customers", List.of(cust));

        // 1. Cartulina física migrada ($2.000.000 pactados, $1.126.000 pagados en papel + $70.000 pagados en app -> $804.000 saldo)
        ObjectNode migLoan = MAPPER.createObjectNode();
        migLoan.put("id", "loan-mig-001");
        migLoan.put("route_id", "route-1");
        migLoan.put("customer_id", "cust-1");
        migLoan.put("collector_id", "usr-col-1");
        migLoan.put("loan_number", "#00112");
        migLoan.put("principal", 1600000);
        migLoan.put("interest_rate", 0.25);
        migLoan.put("interest_amount", 400000);
        migLoan.put("total_agreed", 2000000);
        migLoan.put("installment_count", 2);
        migLoan.put("frequency", "DAILY");
        migLoan.put("start_date", "2026-11-01");
        migLoan.put("status", "ACTIVE");
        migLoan.put("notes", "Migrado de cartulina física a digital (10/20 cuotas pagadas en papel)");
        migLoan.put("created_at", "2026-11-01T12:00:00Z");

        // 2. Crédito nuevo ($1.300.000 capital -> $1.560.000 pactado; $1.000.000 abonados en app -> $560.000 saldo)
        ObjectNode newLoan = MAPPER.createObjectNode();
        newLoan.put("id", "loan-new-002");
        newLoan.put("route_id", "route-1");
        newLoan.put("customer_id", "cust-1");
        newLoan.put("collector_id", "usr-col-1");
        newLoan.put("loan_number", "#00120");
        newLoan.put("principal", 1300000);
        newLoan.put("interest_rate", 0.20);
        newLoan.put("interest_amount", 260000);
        newLoan.put("total_agreed", 1560000);
        newLoan.put("installment_count", 1);
        newLoan.put("frequency", "DAILY");
        newLoan.put("start_date", "2026-11-13");
        newLoan.put("status", "ACTIVE");
        newLoan.put("notes", "");
        newLoan.put("created_at", "2026-11-13T12:00:00Z");

        // 3. Renovación desde nube con papelería $25.000 (sin fila separada PAPELERIA_RENOVACION)
        ObjectNode renPrevLoan = MAPPER.createObjectNode();
        renPrevLoan.put("id", "loan-prev-003");
        renPrevLoan.put("route_id", "route-1");
        renPrevLoan.put("customer_id", "cust-1");
        renPrevLoan.put("collector_id", "usr-col-1");
        renPrevLoan.put("loan_number", "#00115");
        renPrevLoan.put("principal", 500000);
        renPrevLoan.put("interest_rate", 0.20);
        renPrevLoan.put("interest_amount", 100000);
        renPrevLoan.put("total_agreed", 600000);
        renPrevLoan.put("installment_count", 1);
        renPrevLoan.put("frequency", "DAILY");
        renPrevLoan.put("start_date", "2026-10-20");
        renPrevLoan.put("status", "RENEWED");
        renPrevLoan.put("notes", "");
        renPrevLoan.put("created_at", "2026-10-20T12:00:00Z");

        ObjectNode renNewLoan = MAPPER.createObjectNode();
        renNewLoan.put("id", "loan-ren-004");
        renNewLoan.put("route_id", "route-1");
        renNewLoan.put("customer_id", "cust-1");
        renNewLoan.put("collector_id", "usr-col-1");
        renNewLoan.put("loan_number", "#00122");
        renNewLoan.put("principal", 500000);
        renNewLoan.put("interest_rate", 0.20);
        renNewLoan.put("interest_amount", 100000);
        renNewLoan.put("total_agreed", 600000);
        renNewLoan.put("installment_count", 1);
        renNewLoan.put("frequency", "DAILY");
        renNewLoan.put("start_date", "2026-11-19");
        renNewLoan.put("status", "ACTIVE");
        renNewLoan.put("previous_loan_id", "loan-prev-003");
        renNewLoan.put("notes", "");
        renNewLoan.put("created_at", "2026-11-19T12:00:00Z");

        tables.put("loans", List.of(migLoan, newLoan, renPrevLoan, renNewLoan));

        ObjectNode instMig1 = MAPPER.createObjectNode();
        instMig1.put("id", "inst-mig-1"); instMig1.put("loan_id", "loan-mig-001"); instMig1.put("installment_number", 1);
        instMig1.put("due_date", "2026-11-10"); instMig1.put("amount", 1196000); instMig1.put("paid_amount", 1196000); instMig1.put("status", "PAGADA");
        ObjectNode instMig2 = MAPPER.createObjectNode();
        instMig2.put("id", "inst-mig-2"); instMig2.put("loan_id", "loan-mig-001"); instMig2.put("installment_number", 2);
        instMig2.put("due_date", "2026-11-25"); instMig2.put("amount", 804000); instMig2.put("paid_amount", 0); instMig2.put("status", "PENDIENTE");

        ObjectNode instNew1 = MAPPER.createObjectNode();
        instNew1.put("id", "inst-new-1"); instNew1.put("loan_id", "loan-new-002"); instNew1.put("installment_number", 1);
        instNew1.put("due_date", "2026-11-25"); instNew1.put("amount", 1560000); instNew1.put("paid_amount", 1000000); instNew1.put("status", "PARCIAL");

        ObjectNode instPrev1 = MAPPER.createObjectNode();
        instPrev1.put("id", "inst-prev-1"); instPrev1.put("loan_id", "loan-prev-003"); instPrev1.put("installment_number", 1);
        instPrev1.put("due_date", "2026-11-19"); instPrev1.put("amount", 600000); instPrev1.put("paid_amount", 600000); instPrev1.put("status", "PAGADA");

        ObjectNode instRen1 = MAPPER.createObjectNode();
        instRen1.put("id", "inst-ren-1"); instRen1.put("loan_id", "loan-ren-004"); instRen1.put("installment_number", 1);
        instRen1.put("due_date", "2026-11-25"); instRen1.put("amount", 600000); instRen1.put("paid_amount", 0); instRen1.put("status", "PENDIENTE");

        tables.put("installments", List.of(instMig1, instMig2, instNew1, instPrev1, instRen1));

        // Pagos en app: $70.000 sobre migrado (con timestamp UTC 01:30Z del 24 nov = 20:30 Bogota del 23 nov!) + $1.000.000 sobre nuevo
        ObjectNode pay1 = MAPPER.createObjectNode();
        pay1.put("id", "pay-1"); pay1.put("idempotency_key", "pay-1"); pay1.put("loan_id", "loan-mig-001");
        pay1.put("customer_id", "cust-1"); pay1.put("collector_id", "usr-col-1"); pay1.put("amount_received", 70000);
        pay1.put("payment_method", "CASH"); pay1.put("status", "COMPLETED");
        pay1.put("local_created_at", "");
        pay1.put("created_at", "2026-11-24T01:30:00+00:00");

        ObjectNode pay2 = MAPPER.createObjectNode();
        pay2.put("id", "pay-2"); pay2.put("idempotency_key", "pay-2"); pay2.put("loan_id", "loan-new-002");
        pay2.put("customer_id", "cust-1"); pay2.put("collector_id", "usr-col-1"); pay2.put("amount_received", 1000000);
        pay2.put("payment_method", "CASH"); pay2.put("status", "COMPLETED");
        pay2.put("local_created_at", "2026-11-19 15:00:00");
        tables.put("payments", List.of(pay1, pay2));

        // Renovación: $500k nuevo - $315k saldo anterior = $185k total salida base ($160k neto + $25k papelería)
        ObjectNode ren = MAPPER.createObjectNode();
        ren.put("id", "ren-1"); ren.put("previous_loan_id", "loan-prev-003"); ren.put("new_loan_id", "loan-ren-004");
        ren.put("new_principal", 500000); ren.put("previous_balance_deducted", 315000);
        ren.put("paperwork_deducted", 25000); ren.put("actual_cash_disbursed", 160000);
        ren.put("local_created_at", "2026-11-19 20:20:00");
        tables.put("renewals", List.of(ren));

        // Movimientos de caja exactamente replicando FBV + huérfanos COBRO_HISTORICO/REVERSO_HISTORICO
        List<JsonNode> cms = new ArrayList<>();
        cms.add(cm("cm-cap", "INCOME", "CAPITAL_INJECTION", 260000, null, "2026-11-12 08:00:00"));
        cms.add(cm("cm-p1", "INCOME", "COLLECTION", 70000, "pay-1", "2026-11-23 20:30:00"));
        cms.add(cm("cm-p2", "INCOME", "COLLECTION", 1000000, "pay-2", "2026-11-19 15:00:00"));
        cms.add(cm("cm-orphan-in", "INCOME", "COLLECTION", 550000, "pay-deleted-old", "2026-11-11 09:00:00"));
        cms.add(cm("cm-orphan-rev", "EXPENSE", "PAYMENT_REVERSAL", 20000, "pay-deleted-old2", "2026-11-11 10:00:00"));
        cms.add(cm("cm-disb", "EXPENSE", "LOAN_DISBURSEMENT", 1300000, "loan-new-002", "2026-11-13 10:00:00"));
        cms.add(cm("cm-ren", "EXPENSE", "RENEWAL_DISBURSEMENT", 160000, "ren-1", "2026-11-19 20:20:00"));
        cms.add(cm("cm-rec", "EXPENSE", "RECAUDO_OFICINA", 875000, null, "2026-11-19 21:00:00"));
        tables.put("cash_movements", cms);
        tables.put("financial_events", List.of());

        ObjectNode setRow = MAPPER.createObjectNode();
        setRow.put("id", "set-cloud-1");
        setRow.put("route_id", "route-1");
        setRow.put("collector_id", "usr-col-1");
        setRow.put("session_id", "ses-cloud-1");
        setRow.put("settlement_date", "2026-11-19");
        setRow.put("status", "SETTLED");
        setRow.put("settled_at", "2026-11-20T02:38:57+00:00");
        ObjectNode setPayload = setRow.putObject("payload");
        setPayload.put("expectedCollection", 604000);
        setPayload.put("actualCollection", 604000);
        setPayload.put("cashDifference", 0);
        tables.put("daily_settlements", List.of(setRow));

        ObjectNode officeSettings = MAPPER.createObjectNode();
        officeSettings.put("paperworkFeeEnabled", true);
        officeSettings.put("paperworkRate", 5000); // Formato real del Móvil (COP por $100k)
        officeSettings.put("defaultInterestRate", 0.2);

        SupabaseRegistryClient stubClient = new SupabaseRegistryClient() {
            @Override
            public CloudAuthResponse authenticateUser(String supabaseUrl, String apiKey, String username, String rawPassword) {
                SupabaseRegistryClient.RemoteOffice office = new SupabaseRegistryClient.RemoteOffice(
                        "off-fbv-001", "Inversiones FBV", "KRD-FBV1-2026",
                        "ACTIVE", "LIFETIME", null, "Fernando Baquero", "3005390069", "Valledupar"
                );
                return new CloudAuthResponse(true, "", "tok-fbv-sync", office, adminUser);
            }

            @Override
            public Optional<RemoteOffice> findOfficeById(String supabaseUrl, String apiKey, String officeId) {
                return Optional.of(new RemoteOffice(
                        "off-fbv-001", "Inversiones FBV", "KRD-FBV1-2026",
                        "ACTIVE", "LIFETIME", null, "Fernando Baquero", "3005390069", "Valledupar"
                ));
            }

            @Override
            public List<JsonNode> fetchOfficeRows(String supabaseUrl, String apiKey, String table, String officeId) {
                return tables.getOrDefault(table, List.of());
            }

            @Override
            public Optional<JsonNode> fetchOfficeSettings(String supabaseUrl, String apiKey, String officeId) {
                return Optional.of(officeSettings);
            }

            @Override
            public void upsertRowsBatch(String supabaseUrl, String apiKey, String table, List<ObjectNode> rows, boolean ignoreDuplicates) {
                if ("loans".equals(table)) pushedLoans.addAll(rows);
                if ("routes".equals(table)) pushedRoutes.addAll(rows);
                if ("cash_movements".equals(table)) pushedCash.addAll(rows);
            }
        };

        DesktopCloudSyncService syncService = new DesktopCloudSyncService(
                authService, licensingService, stubClient, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository,
                collectionSessionRepository, dailySettlementRepository
        );

        var authRes = syncService.authenticateAndSync("admin-fbv", "FBV2026*");
        assertTrue(authRes.ok());
        assertTrue(syncService.getLastSyncStatus().synced());

        // 1. Verificar detección MIGRACION y preservación de loan_number
        LoanEntity hydratedMig = loanRepository.findById("loan-mig-001").orElseThrow();
        assertEquals("MIGRACION", hydratedMig.getOperationType());
        assertEquals("#00112", hydratedMig.getLoanNumber());

        // 2. Verificar paperworkRate=5000 NO se multiplica por 100.000
        assertEquals("5000", settingRepository.findById("paperwork_fee").orElseThrow().getSettingValue());

        // 3. Verificar liquidación diaria hidratada desde Supabase
        assertTrue(dailySettlementRepository.findById("set-cloud-1").isPresent());
        assertMoney("604000", dailySettlementRepository.findById("set-cloud-1").orElseThrow().getActualCollection());

        // 4. Verificar cálculo exacto de KPIs en paridad 100% con Móvil:
        // Base = +260k (cap) + 1.070k (pagos app) + 1.126k (cuotas previas cartulina migrada)
        //        - 1.300k (desembolso) - 160k (ren neto) - 25k (papelería ren) - 875k (retiro oficina) = +96.000!
        // Cartera activa = 804k + 560k + 600k = 1.964.000
        // Patrimonio = 1.964.000 + 96.000 = 2.060.000
        // Cobrado hoy (2026-11-23 Bogota) = 70.000 (normalizado desde 2026-11-24T01:30:00+00:00!)
        var metrics = collectionsService.getDailyMetricsForRoute(LocalDate.of(2026, 11, 23), "ALL");
        assertMoney("96000", metrics.cashBalance());
        assertMoney("25000", metrics.paperworkBalance());
        assertMoney("121000", metrics.totalPhysicalCashInBox());
        assertMoney("1964000", metrics.totalActiveDebt());
        assertMoney("2060000", metrics.totalAdministrativeCapital());
        assertMoney("70000", metrics.collectedToday());

        // 5. En modo reposo (sin cambios locales en escritorio), syncSilentlyInBackground NO debe empujar nada a Supabase
        syncService.syncSilentlyInBackground();
        assertTrue(pushedLoans.isEmpty(), "Idle desktop sync must be read-only and never push loans");
        assertTrue(pushedRoutes.isEmpty(), "Idle desktop sync must be read-only and never push routes");
        assertTrue(pushedCash.isEmpty(), "Idle desktop sync must be read-only and never push cash_movements");

        // 6. Al hacer un cambio local real (editar ruta y crear préstamo local), push selectivo preserva loan_number,
        // initial_cash_base, fixed_due_date y excluye cm-mig-paper-* sin tocar préstamos remotos intactos
        RouteEntity localRoute = routeRepository.findById("route-1").orElseThrow();
        localRoute.setInitialCashBase(bd("50000"));
        routeRepository.saveAndFlush(localRoute);

        LoanEntity localFixedLoan = new LoanEntity(
                "loan-local-fixed-99", "cust-1", "route-1", "usr-col-1", null, "NUEVO",
                bd("200000"), bd("0.2000"), bd("40000"), bd("240000"), 1, "FECHA FIJA",
                "2026-12-10", "2026-12-10", "ACTIVO", "2026-11-24T10:00:00"
        );
        localFixedLoan.setLoanNumber("#00199");
        loanRepository.saveAndFlush(localFixedLoan);

        syncService.syncSilentlyInBackground();
        assertEquals(1, pushedLoans.size(), "Only the dirty/new loan should be pushed, leaving remote loans untouched");
        ObjectNode pushedLocalFixed = pushedLoans.get(0);
        assertEquals("loan-local-fixed-99", pushedLocalFixed.path("id").asText());
        assertEquals("#00199", pushedLocalFixed.path("loan_number").asText());
        assertEquals("FIXED_DATE", pushedLocalFixed.path("frequency").asText());
        assertEquals("2026-12-10", pushedLocalFixed.path("fixed_due_date").asText());
        assertFalse(pushedRoutes.isEmpty());
        assertTrue(pushedRoutes.get(0).has("initial_cash_base"));
        assertTrue(pushedCash.stream().noneMatch(c -> c.path("id").asText("").startsWith("cm-mig-paper-")),
                "Local migration reconciliation row must never be pushed back to Supabase");

        // Limpiar el préstamo de prueba y restaurar base de ruta para verificar idempotencia de KPIs
        loanRepository.deleteById("loan-local-fixed-99");
        localRoute.setInitialCashBase(BigDecimal.ZERO);
        routeRepository.saveAndFlush(localRoute);
        var metricsAfterResync = collectionsService.getDailyMetricsForRoute(LocalDate.of(2026, 11, 23), "ALL");
        assertMoney("96000", metricsAfterResync.cashBalance());
    }

    @Test
    void renewedPreviousLoanInvariantForcesRenovadoAndPaidInstallmentsWhenRemoteLoanIsStaleActive() {
        Map<String, List<JsonNode>> tables = new HashMap<>();
        ObjectNode adminUser = MAPPER.createObjectNode();
        adminUser.put("id", "usr-adm-inv"); adminUser.put("username", "admin-inv"); adminUser.put("name", "Admin");
        adminUser.put("role", "ADMIN"); adminUser.put("is_active", true); adminUser.put("created_at", "2026-11-10T12:00:00Z");
        tables.put("users", List.of(adminUser));

        ObjectNode route = MAPPER.createObjectNode();
        route.put("id", "rt-inv"); route.put("name", "Ruta Inv"); route.put("code", "RINV");
        route.put("collector_id", "usr-adm-inv"); route.put("initial_cash_base", 0); route.put("is_active", true);
        tables.put("routes", List.of(route));

        ObjectNode cust = MAPPER.createObjectNode();
        cust.put("id", "cust-inv"); cust.put("route_id", "rt-inv"); cust.put("assigned_collector_id", "usr-adm-inv");
        cust.put("full_name", "Cliente Inv"); cust.put("document_number", "777000111"); cust.put("status", "ACTIVE");
        tables.put("customers", List.of(cust));

        // Préstamo anterior corrupto en remoto como ACTIVE pero referenciado en renewals.previous_loan_id
        ObjectNode prevLoan = MAPPER.createObjectNode();
        prevLoan.put("id", "loan-inv-prev"); prevLoan.put("route_id", "rt-inv"); prevLoan.put("customer_id", "cust-inv");
        prevLoan.put("collector_id", "usr-adm-inv"); prevLoan.put("loan_number", "#00103");
        prevLoan.put("principal", 800000); prevLoan.put("interest_rate", 0.2); prevLoan.put("interest_amount", 160000);
        prevLoan.put("total_agreed", 960000); prevLoan.put("installment_count", 1); prevLoan.put("frequency", "DAILY");
        prevLoan.put("start_date", "2026-11-01"); prevLoan.put("status", "ACTIVE");

        ObjectNode newLoan = MAPPER.createObjectNode();
        newLoan.put("id", "loan-inv-new"); newLoan.put("route_id", "rt-inv"); newLoan.put("customer_id", "cust-inv");
        newLoan.put("collector_id", "usr-adm-inv"); newLoan.put("loan_number", "#00130");
        newLoan.put("principal", 1000000); newLoan.put("interest_rate", 0.2); newLoan.put("interest_amount", 200000);
        newLoan.put("total_agreed", 1200000); newLoan.put("installment_count", 1); newLoan.put("frequency", "FIXED_DATE");
        newLoan.put("start_date", "2026-11-24"); newLoan.put("end_date", "2026-12-10"); newLoan.put("status", "ACTIVE");
        newLoan.put("previous_loan_id", "loan-inv-prev");
        tables.put("loans", List.of(prevLoan, newLoan));

        ObjectNode prevInst = MAPPER.createObjectNode();
        prevInst.put("id", "inst-inv-prev-1"); prevInst.put("loan_id", "loan-inv-prev"); prevInst.put("installment_number", 1);
        prevInst.put("due_date", "2026-11-20"); prevInst.put("amount", 960000); prevInst.put("paid_amount", 500000); prevInst.put("status", "PARCIAL");
        tables.put("installments", List.of(prevInst));

        ObjectNode ren = MAPPER.createObjectNode();
        ren.put("id", "ren-inv-1"); ren.put("previous_loan_id", "loan-inv-prev"); ren.put("new_loan_id", "loan-inv-new");
        ren.put("new_principal", 1000000); ren.put("previous_balance_deducted", 460000);
        ren.put("paperwork_deducted", 50000); ren.put("actual_cash_disbursed", 490000);
        tables.put("renewals", List.of(ren));
        tables.put("payments", List.of());
        tables.put("cash_movements", List.of());
        tables.put("financial_events", List.of());

        SupabaseRegistryClient stubClient = new SupabaseRegistryClient() {
            @Override
            public CloudAuthResponse authenticateUser(String u, String k, String usr, String pwd) {
                var office = new RemoteOffice("off-inv-001", "Oficina Inv", "KRD-INV", "ACTIVE", "LIFETIME", null, "Admin", "", "");
                return new CloudAuthResponse(true, "", "tok-inv", office, adminUser);
            }
            @Override
            public List<JsonNode> fetchOfficeRows(String u, String k, String table, String oid) {
                return tables.getOrDefault(table, List.of());
            }
            @Override
            public Optional<JsonNode> fetchOfficeSettings(String u, String k, String oid) {
                return Optional.empty();
            }
        };

        DesktopCloudSyncService syncService = new DesktopCloudSyncService(
                authService, licensingService, stubClient, backupService, ledgerService,
                txManager, jdbcTemplate, userRepository, routeRepository, customerRepository,
                loanRepository, installmentRepository, paymentRepository, allocationRepository,
                renewalRepository, cashMovementRepository, settingRepository, auditLogRepository,
                collectionSessionRepository, dailySettlementRepository
        );

        assertTrue(syncService.authenticateAndSync("admin-inv", "Secret123!").ok());
        LoanEntity hydratedPrev = loanRepository.findById("loan-inv-prev").orElseThrow();
        assertEquals("RENOVADO", hydratedPrev.getStatus(), "Relational renewal invariant must force RENOVADO");
        var hydratedInst = installmentRepository.findById("inst-inv-prev-1").orElseThrow();
        assertEquals("PAGADA", hydratedInst.getStatus());
        assertMoney("960000", hydratedInst.getPaidAmount());
    }

    @Test
    void routeInitialCashBaseAddsToOperationalCashAndUtcHelperNormalizesBogota() {
        assertEquals("2026-11-23T20:30:00",
                DesktopCloudSyncService.normalizeCloudTimestampToBogota("", "2026-11-24T01:30:00+00:00", "fallback"));
        assertEquals("2026-11-23 14:10:00",
                DesktopCloudSyncService.normalizeCloudTimestampToBogota("2026-11-23 14:10:00", "2026-11-23T19:10:00Z", "fallback"));
        assertTrue(DesktopCloudSyncService.isMigratedNotes("Migrado de cartulina física a digital (3/20)"));
        assertTrue(DesktopCloudSyncService.isMigratedNotes("Migrado de cartulina fisica"));
        assertFalse(DesktopCloudSyncService.isMigratedNotes("Crédito nuevo regular"));

        RouteEntity r = new RouteEntity("rt-base-test", "Ruta Base", null, 1, "2026-11-23T08:00:00");
        r.setInitialCashBase(bd("150000"));
        routeRepository.saveAndFlush(r);
        var m = collectionsService.getDailyMetricsForRoute(LocalDate.of(2026, 11, 23), "rt-base-test");
        assertMoney("150000", m.cashBalance());
    }

    private static ObjectNode cm(String id, String type, String category, int amount, String refId, String localTs) {
        ObjectNode n = MAPPER.createObjectNode();
        n.put("id", id);
        n.put("route_id", "route-1");
        n.put("collector_id", "usr-col-1");
        n.put("type", type);
        n.put("category", category);
        n.put("amount", amount);
        if (refId != null) n.put("reference_id", refId); else n.putNull("reference_id");
        n.put("description", category);
        n.put("local_created_at", localTs);
        return n;
    }
}
