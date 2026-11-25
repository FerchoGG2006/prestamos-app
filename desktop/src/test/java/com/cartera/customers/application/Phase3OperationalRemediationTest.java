package com.cartera.customers.application;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.backup.OfficeRecoveryService;
import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.payments.application.RecordPaymentUseCase;
import com.cartera.payments.application.ReversePaymentUseCase;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.cartera.sync.infrastructure.LanSyncServerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = "cartera.sync.port=0")
class Phase3OperationalRemediationTest {

    @Autowired private CreateCustomerUseCase createCustomerUseCase;
    @Autowired private CreateCustomerWithLoanUseCase createCustomerWithLoanUseCase;
    @Autowired private CustomerLifecycleService lifecycleService;
    @Autowired private FollowUpService followUpService;
    @Autowired private AttachmentService attachmentService;
    @Autowired private CreateLoanUseCase createLoanUseCase;
    @Autowired private RecordPaymentUseCase recordPaymentUseCase;
    @Autowired private ReversePaymentUseCase reversePaymentUseCase;
    @Autowired private MobileSyncProcessorService mobileSyncProcessorService;
    @Autowired private LanSyncServerService lanSyncServerService;
    @Autowired private DatabaseBackupService backupService;
    @Autowired private OfficeRecoveryService recoveryService;

    @Autowired private AppUserRepository userRepository;
    @Autowired private RouteRepository routeRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private LoanRepository loanRepository;
    @Autowired private InstallmentRepository installmentRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private SystemSettingRepository settingRepository;
    @Autowired private CustomerAttachmentRepository attachmentRepository;

    @TempDir Path tempDir;

    private String adminId;
    private String collectorId;
    private String routeId;

    @BeforeEach
    void setUp() {
        adminId = "usr-admin-p3-" + UUID.randomUUID().toString().substring(0, 6);
        collectorId = "usr-col-p3-" + UUID.randomUUID().toString().substring(0, 6);
        routeId = "route-p3-" + UUID.randomUUID().toString().substring(0, 6);
        String now = LocalDateTime.now().toString();

        userRepository.saveAndFlush(new AppUserEntity(adminId, adminId, "unused", "Admin P3", 1, now));
        userRepository.saveAndFlush(new AppUserEntity(collectorId, collectorId, "unused", "Cobrador P3", 1, now));
        routeRepository.saveAndFlush(new RouteEntity(routeId, "Ruta Fase 3", collectorId, 1, now));

        UserSessionContext.setSession(new UserSession(adminId, adminId, "Admin P3", "ADMIN"));
        UserSessionContext.setSelectedRouteId(routeId);

        settingRepository.save(new SystemSettingEntity("paperwork_enabled", "true", now));
        settingRepository.save(new SystemSettingEntity("paperwork_fee", "5000", now));
        settingRepository.save(new SystemSettingEntity("max_new_loan_amount", "2000000", now));
        settingRepository.save(new SystemSettingEntity("route_allow_partial_payments", "true", now));
        settingRepository.save(new SystemSettingEntity("route_allow_new_loans", "true", now));
        settingRepository.save(new SystemSettingEntity("default_interest_percent", "20", now));
    }

    @AfterEach
    void tearDown() {
        String now = LocalDateTime.now().toString();
        settingRepository.save(new SystemSettingEntity("max_new_loan_amount", "2000000", now));
        settingRepository.save(new SystemSettingEntity("route_allow_partial_payments", "true", now));
        UserSessionContext.clear();
    }

    @Test
    void createCustomerWithLoanRollsBackCustomerWhenDisbursementFails() {
        String now = LocalDateTime.now().toString();
        settingRepository.save(new SystemSettingEntity("max_new_loan_amount", "100000", now));

        String uniqueDoc = "DOC-ATOMIC-" + UUID.randomUUID().toString().substring(0, 6);
        var customerCmd = new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Rollback", uniqueDoc, "3001112233", "3009998877",
                "Calle 1", "Centro", "Barranquilla", "Comerciante", "Tienda", "Notas",
                routeId, collectorId, adminId
        );

        assertThrows(IllegalArgumentException.class, () ->
                createCustomerWithLoanUseCase.execute(
                        customerCmd,
                        new BigDecimal("300000"),
                        new BigDecimal("0.20"),
                        new BigDecimal("360000"),
                        24,
                        "DIARIO",
                        LocalDate.now(),
                        new BigDecimal("15000")
                ));

        assertTrue(customerRepository.findByDocumentNumber(uniqueDoc).isEmpty(),
                "Si el préstamo falla, el cliente NO debe quedar huérfano en la base de datos");
    }

    @Test
    void reversePaymentBlocksRevertidoAndReopensCompletadoLoan() {
        var customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Reverso", "DOC-REV-" + UUID.randomUUID().toString().substring(0, 6),
                "3001234567", null, "Dir", "Barrio", "Ciudad", null, null, null,
                routeId, collectorId, adminId
        ));
        var loan = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(), routeId, collectorId,
                new BigDecimal("100000"), new BigDecimal("0.20"), new BigDecimal("120000"),
                1, "FECHA FIJA", LocalDate.now(), adminId, new BigDecimal("5000")
        ));

        var payRes = recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                loan.getId(), new BigDecimal("120000"), "EFECTIVO", collectorId, LocalDate.now(), UUID.randomUUID().toString()
        ));

        // Simular estado COMPLETADO (como viene de móvil/nube)
        var persistedLoan = loanRepository.findById(loan.getId()).orElseThrow();
        persistedLoan.setStatus("COMPLETADO");
        loanRepository.saveAndFlush(persistedLoan);

        var revRes = reversePaymentUseCase.execute(payRes.paymentId(), "Error de monto");
        assertEquals(0, new BigDecimal("120000").compareTo(revRes.updatedLoanBalance()));
        assertEquals("ACTIVO", loanRepository.findById(loan.getId()).orElseThrow().getStatus(),
                "Un crédito COMPLETADO debe reabrirse a ACTIVO tras anular su pago");

        // Simular pago marcado REVERTIDO -> no puede volver a reversarse
        var pay = paymentRepository.findById(payRes.paymentId()).orElseThrow();
        pay.setStatus("REVERTIDO");
        paymentRepository.saveAndFlush(pay);
        assertThrows(IllegalStateException.class,
                () -> reversePaymentUseCase.execute(pay.getId(), "Intento duplicado"));
    }

    @Test
    void partialPaymentPolicyIsEnforcedInBackendForCollector() {
        var customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Parcial", "DOC-PAR-" + UUID.randomUUID().toString().substring(0, 6),
                "3001234567", null, "Dir", "Barrio", "Ciudad", null, null, null,
                routeId, collectorId, adminId
        ));
        var loan = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(), routeId, collectorId,
                new BigDecimal("100000"), new BigDecimal("0.20"), new BigDecimal("120000"),
                12, "DIARIO", LocalDate.now(), adminId, new BigDecimal("5000")
        ));

        settingRepository.save(new SystemSettingEntity("route_allow_partial_payments", "false", LocalDateTime.now().toString()));
        UserSessionContext.setSession(new UserSession(collectorId, collectorId, "Cobrador P3", "COBRADOR"));

        // Cuota es de $10.000; abono parcial de $5.000 debe rechazarse para COBRADOR
        assertThrows(IllegalStateException.class, () ->
                recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                        loan.getId(), new BigDecimal("5000"), "EFECTIVO", collectorId, LocalDate.now(), UUID.randomUUID().toString()
                )));

        // Cuota exacta de $10.000 sí debe pasar
        var exact = recordPaymentUseCase.execute(new RecordPaymentUseCase.RecordPaymentCommand(
                loan.getId(), new BigDecimal("10000"), "EFECTIVO", collectorId, LocalDate.now(), UUID.randomUUID().toString()
        ));
        assertEquals(0, new BigDecimal("10000").compareTo(exact.allocatedAmount()));
    }

    @Test
    void customerProfileExtendedFieldsReactivateVisitsMultiCollectorAndAttachmentDelete() throws Exception {
        var customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Completo", "DOC-CMP-" + UUID.randomUUID().toString().substring(0, 6),
                "3001112222", "3009990000", "Calle 5", "Norte", "Barranquilla", "Vendedor", "Local", "Nota 1",
                routeId, collectorId, adminId
        ));

        // Actualizar campos extendidos (WhatsApp, ciudad, notas)
        var updated = lifecycleService.update(new CustomerLifecycleService.Profile(
                customer.getId(), "Cliente Editado", "3001112222", "3112223333",
                "Calle 10", "Sur", "Santa Marta", "Tienda Nueva", "Comercio", "Buena paga", routeId
        ));
        assertEquals("3112223333", updated.getAltPhone());
        assertEquals("Santa Marta", updated.getCity());
        assertEquals("Buena paga", updated.getNotes());

        // Inactivar y reactivar cliente
        lifecycleService.deactivate(customer.getId(), "Pausa temporal");
        assertEquals("INACTIVO", customerRepository.findById(customer.getId()).orElseThrow().getStatus());
        lifecycleService.reactivate(customer.getId(), "Regresa a cartera");
        assertEquals("ACTIVO", customerRepository.findById(customer.getId()).orElseThrow().getStatus());

        // Dos préstamos con distintos cobradores -> visits() no debe lanzar SecurityException al cobrador
        var loanOwn = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(), routeId, collectorId,
                new BigDecimal("100000"), new BigDecimal("0.20"), new BigDecimal("120000"),
                10, "DIARIO", LocalDate.now(), adminId, new BigDecimal("5000")
        ));
        var loanOther = createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(), routeId, adminId,
                new BigDecimal("100000"), new BigDecimal("0.20"), new BigDecimal("120000"),
                10, "DIARIO", LocalDate.now(), adminId, new BigDecimal("5000")
        ));
        followUpService.visit(UUID.randomUUID().toString(), loanOwn.getId(), "Visita propia");
        followUpService.visit(UUID.randomUUID().toString(), loanOther.getId(), "Visita admin");

        UserSessionContext.setSession(new UserSession(collectorId, collectorId, "Cobrador P3", "COBRADOR"));
        var collectorVisits = followUpService.visits(customer.getId());
        assertEquals(1, collectorVisits.size(), "El cobrador debe ver solo sus visitas sin lanzar SecurityException");

        // Adjuntar y eliminar archivo auditado
        UserSessionContext.setSession(new UserSession(adminId, adminId, "Admin P3", "ADMIN"));
        Path sample = Files.writeString(tempDir.resolve("cartulina.pdf"), "%PDF-1.4 demo");
        String attId = UUID.randomUUID().toString();
        attachmentService.attach(attId, customer.getId(), sample);
        Path storedPath = attachmentService.openPath(attId);
        assertTrue(Files.isRegularFile(storedPath));

        attachmentService.delete(attId, "Archivo duplicado");
        assertTrue(attachmentRepository.findById(attId).isEmpty());
        assertFalse(Files.exists(storedPath));
    }

    @Test
    void mobileExportPoliciesFixedDateDbOnlyRecoveryAndNullCollectorPairing() throws Exception {
        var customer = createCustomerUseCase.execute(new CreateCustomerUseCase.CreateCustomerCommand(
                "Cliente Sync", "DOC-SYN-" + UUID.randomUUID().toString().substring(0, 6),
                "3002223333", null, "Dir", "Barrio", "Ciudad", null, null, null,
                routeId, collectorId, adminId
        ));
        // Crédito FECHA FIJA (con espacio) no debe romper exportRoutePackage
        createLoanUseCase.execute(new CreateLoanUseCase.CreateLoanCommand(
                customer.getId(), routeId, collectorId,
                new BigDecimal("100000"), new BigDecimal("0.20"), new BigDecimal("120000"),
                1, "FECHA FIJA", LocalDate.now(), adminId, new BigDecimal("5000")
        ));

        String json = mobileSyncProcessorService.exportRoutePackage(routeId, LocalDate.now());
        var root = new ObjectMapper().readTree(json);
        assertEquals("20", root.path("settings").path("default_interest_rate").asText());
        assertEquals("20", root.path("settings").path("default_interest_percent").asText());
        assertTrue(root.path("settings").has("route_allow_partial_payments"));
        assertTrue(root.path("loans").toString().contains("FIXED_DATE"));

        // Respaldo .db solo con adjunto registrado -> debe recuperarse con advertencia y marcar recovery.read_only_mode=true
        Path sample = Files.writeString(tempDir.resolve("doc.pdf"), "%PDF-1.4 backup test");
        attachmentService.attach(UUID.randomUUID().toString(), customer.getId(), sample);
        Path dbBackup = backupService.createBackup("test-p3-db-only");
        Path recoveredDir = recoveryService.recover(dbBackup, tempDir, "Recuperación solo DB");
        assertNotNull(recoveryService.getLastRecoveryWarning(),
                "Debe advertir sobre adjuntos no incluidos en respaldo .db");
        try (var conn = DriverManager.getConnection("jdbc:sqlite:" + recoveredDir.resolve("cartera.db"));
             var ps = conn.prepareStatement("SELECT setting_value FROM system_setting WHERE setting_key = ?")) {
            ps.setString(1, OfficeLicensingService.KEY_RECOVERY_READ_ONLY);
            try (var rs = ps.executeQuery()) {
                assertTrue(rs.next());
                assertEquals("true", rs.getString(1),
                        "La oficina recuperada debe quedar en modo solo lectura de nube");
            }
        }

        // Ruta con collectorId == null no debe provocar NullPointerException en LAN POST /enlace/<token>/api/sync/push
        String nullColRoute = "route-nullcol-" + UUID.randomUUID().toString().substring(0, 6);
        routeRepository.saveAndFlush(new RouteEntity(nullColRoute, "Ruta Sin Cobrador", null, 1, LocalDateTime.now().toString()));
        String link = lanSyncServerService.createPairingLink(nullColRoute);
        Thread.sleep(100);
        HttpResponse<String> resp = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create(link + "/api/sync/push"))
                        .timeout(Duration.ofSeconds(10))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString("{\"routeId\":\"" + nullColRoute + "\",\"operatingDate\":\"" + LocalDate.now() + "\"}"))
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );
        // Debe responder 400 (collectorId faltante), nunca 500/NPE
        assertNotEquals(500, resp.statusCode());
        assertFalse(resp.body().contains("NullPointerException"));
    }
}
