package com.cartera.sync.application;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.OfficeLicensingService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient.RemoteOffice;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.AuthService;
import com.cartera.infrastructure.security.PasswordHasher;
import com.cartera.infrastructure.security.UserSession;
import com.cartera.infrastructure.security.UserSessionContext;
import com.cartera.ledger.application.ImmutableLedgerService;
import com.cartera.ledger.application.ImmutableLedgerService.AppendEventCommand;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Servicio invisible y automático de autenticación y sincronización entre el Escritorio JavaFX
 * y la nube multi-oficina (Supabase + Libro Mayor Inmutable).
 * Diseñado para operar 100% en segundo plano sin exponer tecnicismos al usuario final.
 */
@Service
public class DesktopCloudSyncService {

    private static final Logger LOG = LoggerFactory.getLogger(DesktopCloudSyncService.class);

    public record AuthResult(boolean ok, UserSession session, String message) {
        public static AuthResult success(UserSession session) { return new AuthResult(true, session, ""); }
        public static AuthResult failure(String message) { return new AuthResult(false, null, message); }
    }

    private final AuthService authService;
    private final OfficeLicensingService licensingService;
    private final SupabaseRegistryClient registryClient;
    private final DatabaseBackupService backupService;
    private final ImmutableLedgerService ledgerService;
    private final TransactionTemplate txTemplate;
    private final JdbcTemplate jdbcTemplate;

    private final AppUserRepository userRepository;
    private final RouteRepository routeRepository;
    private final CustomerRepository customerRepository;
    private final LoanRepository loanRepository;
    private final InstallmentRepository installmentRepository;
    private final PaymentRepository paymentRepository;
    private final PaymentAllocationRepository allocationRepository;
    private final RenewalRepository renewalRepository;
    private final CashMovementRepository cashMovementRepository;
    private final SystemSettingRepository settingRepository;
    private final AuditLogRepository auditLogRepository;

    private final AtomicBoolean syncing = new AtomicBoolean(false);

    public DesktopCloudSyncService(
            AuthService authService,
            OfficeLicensingService licensingService,
            SupabaseRegistryClient registryClient,
            DatabaseBackupService backupService,
            ImmutableLedgerService ledgerService,
            PlatformTransactionManager txManager,
            JdbcTemplate jdbcTemplate,
            AppUserRepository userRepository,
            RouteRepository routeRepository,
            CustomerRepository customerRepository,
            LoanRepository loanRepository,
            InstallmentRepository installmentRepository,
            PaymentRepository paymentRepository,
            PaymentAllocationRepository allocationRepository,
            RenewalRepository renewalRepository,
            CashMovementRepository cashMovementRepository,
            SystemSettingRepository settingRepository,
            AuditLogRepository auditLogRepository
    ) {
        this.authService = authService;
        this.licensingService = licensingService;
        this.registryClient = registryClient;
        this.backupService = backupService;
        this.ledgerService = ledgerService;
        this.txTemplate = new TransactionTemplate(txManager);
        this.jdbcTemplate = jdbcTemplate;
        this.userRepository = userRepository;
        this.routeRepository = routeRepository;
        this.customerRepository = customerRepository;
        this.loanRepository = loanRepository;
        this.installmentRepository = installmentRepository;
        this.paymentRepository = paymentRepository;
        this.allocationRepository = allocationRepository;
        this.renewalRepository = renewalRepository;
        this.cashMovementRepository = cashMovementRepository;
        this.settingRepository = settingRepository;
        this.auditLogRepository = auditLogRepository;
    }

    /**
     * Autentica al usuario contra el registro central de oficinas (con respaldo offline si ya estaba vinculado)
     * e hidrata automáticamente la cartera de su oficina sin intervención técnica del usuario.
     */
    public AuthResult authenticateAndSync(String username, String rawPassword) {
        if (username == null || username.isBlank() || rawPassword == null || rawPassword.isBlank()) {
            return AuthResult.failure("Ingresa tu usuario y contraseña.");
        }

        String cleanUser = username.trim().toLowerCase();
        String url = licensingService.getSupabaseUrl();
        String key = licensingService.getSupabaseKey();

        if (!url.isBlank() && !key.isBlank()) {
            try {
                SupabaseRegistryClient.CloudAuthResponse authResp =
                        registryClient.authenticateUser(url, key, cleanUser, rawPassword);
                if (!authResp.ok() || authResp.office() == null || authResp.userNode() == null) {
                    return AuthResult.failure(
                            authResp.error() == null || authResp.error().isBlank()
                                    ? "Usuario o contraseña incorrectos."
                                    : authResp.error()
                    );
                }

                RemoteOffice office = authResp.office();
                JsonNode matchedUser = authResp.userNode();
                licensingService.saveCloudSessionToken(authResp.sessionToken());

                String currentLocalOfficeId = licensingService.getLinkedOfficeId().orElse("");
                boolean switchingOffice = !office.id().equals(currentLocalOfficeId);
                if (switchingOffice && customerRepository.count() > 0 && backupService != null) {
                    try {
                        backupService.createBackup("SWITCH_OFFICE_" + office.id());
                    } catch (Exception ignored) {}
                }

                // Descargar cartera completa de esa oficina e hidratar SQLite local
                hydrateOfficeFromCloud(url, key, office, switchingOffice, matchedUser, rawPassword);

                String role = normalizeRole(matchedUser.path("role").asText("COBRADOR"));
                String userId = matchedUser.path("id").asText();
                String fullName = matchedUser.path("name").asText(cleanUser);
                UserSession session = new UserSession(userId, cleanUser, fullName, role);
                UserSessionContext.setSession(session);
                recordLoginAudit(userId, role);

                return AuthResult.success(session);
            } catch (Exception networkOrApiEx) {
                LOG.warn("Validación en línea no disponible, intentando modo sin conexión: {}", networkOrApiEx.getMessage());
                // Caer a modo offline solo si el equipo ya estaba vinculado y activo
                if (licensingService.getLinkedOfficeId().isPresent()
                        && "ACTIVE".equalsIgnoreCase(licensingService.getLinkedLicenseStatus())) {
                    return authService.authenticate(username, rawPassword)
                            .map(AuthResult::success)
                            .orElseGet(() -> AuthResult.failure("Usuario o contraseña incorrectos."));
                }
                return AuthResult.failure("No se pudo conectar para validar tus credenciales. Verifica tu conexión a internet.");
            }
        }

        return authService.authenticate(username, rawPassword)
                .map(AuthResult::success)
                .orElseGet(() -> AuthResult.failure("Usuario o contraseña incorrectos."));
    }

    /**
     * Sincronización automática y silenciosa en segundo plano (Escritorio <-> Nube).
     * Retorna true si se incorporaron datos nuevos desde otros dispositivos.
     */
    public boolean syncSilentlyInBackground() {
        Optional<String> optOfficeId = licensingService.getLinkedOfficeId();
        if (optOfficeId.isEmpty()) return false;
        String url = licensingService.getSupabaseUrl();
        String key = licensingService.getSupabaseKey();
        if (url.isBlank() || key.isBlank()) return false;
        if (!syncing.compareAndSet(false, true)) return false;

        try {
            if (registryClient.getActiveSessionToken().isBlank()) {
                String savedToken = licensingService.getSavedCloudSessionToken();
                if (savedToken.isBlank()) return false;
                registryClient.setActiveSessionToken(savedToken);
            }
            String officeId = optOfficeId.get();
            Optional<RemoteOffice> optOffice = registryClient.findOfficeById(url, key, officeId);
            if (optOffice.isEmpty()
                    || !OfficeLicensingService.isLicenseCurrentlyActive(optOffice.get().licenseStatus(), optOffice.get().licenseExpiresAt())) {
                return false;
            }

            // 1. Subir operaciones locales del escritorio hacia la nube (+ hechos inmutables)
            pushLocalChangesToCloud(url, key, officeId);

            // 2. Descargar novedades de cobradores/web hacia el escritorio
            long beforePayments = paymentRepository.count();
            long beforeLoans = loanRepository.count();
            long beforeCustomers = customerRepository.count();

            hydrateOfficeFromCloud(url, key, optOffice.get(), false, null, null);

            return paymentRepository.count() != beforePayments
                    || loanRepository.count() != beforeLoans
                    || customerRepository.count() != beforeCustomers;
        } catch (Exception ex) {
            LOG.debug("Sincronización silenciosa pospuesta: {}", ex.getMessage());
            return false;
        } finally {
            syncing.set(false);
        }
    }

    private void hydrateOfficeFromCloud(
            String url,
            String key,
            RemoteOffice office,
            boolean resetLocalOperationalData,
            JsonNode loggedInRemoteUser,
            String rawPasswordForUpgrade
    ) throws Exception {
        String officeId = office.id();
        List<JsonNode> remoteUsers = registryClient.fetchOfficeRows(url, key, "users", officeId);
        List<JsonNode> remoteRoutes = registryClient.fetchOfficeRows(url, key, "routes", officeId);
        List<JsonNode> remoteCustomers = registryClient.fetchOfficeRows(url, key, "customers", officeId);
        List<JsonNode> remoteLoans = registryClient.fetchOfficeRows(url, key, "loans", officeId);
        List<JsonNode> remoteInstallments = registryClient.fetchOfficeRows(url, key, "installments", officeId);
        List<JsonNode> remotePayments = registryClient.fetchOfficeRows(url, key, "payments", officeId);
        List<JsonNode> remoteRenewals = registryClient.fetchOfficeRows(url, key, "renewals", officeId);
        List<JsonNode> remoteCash = registryClient.fetchOfficeRows(url, key, "cash_movements", officeId);
        List<JsonNode> remoteEvents = registryClient.fetchOfficeRows(url, key, "financial_events", officeId);

        txTemplate.executeWithoutResult(status -> {
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            if (resetLocalOperationalData) {
                clearMutableOperationalTables();
            }

            // 1. Usuarios
            String fallbackUserId = loggedInRemoteUser != null ? loggedInRemoteUser.path("id").asText() : null;
            Set<String> validUserIds = new HashSet<>();
            for (JsonNode u : remoteUsers) {
                String uid = u.path("id").asText();
                String uname = u.path("username").asText("").trim().toLowerCase();
                if (uid.isBlank() || uname.isBlank()) continue;
                validUserIds.add(uid);
                if (fallbackUserId == null) fallbackUserId = uid;

                String hash = u.path("password_hash").asText("");
                if (loggedInRemoteUser != null && uid.equals(loggedInRemoteUser.path("id").asText())
                        && rawPasswordForUpgrade != null && !rawPasswordForUpgrade.isBlank()) {
                    // Guardar localmente siempre con PBKDF2-HMAC-SHA256
                    hash = PasswordHasher.hash(rawPasswordForUpgrade);
                } else if (hash.isBlank()) {
                    hash = PasswordHasher.hash(UUID.randomUUID().toString());
                }

                // Evitar choque por UNIQUE(username) con registros viejos de otro id
                userRepository.findByUsername(uname).ifPresent(existing -> {
                    if (!existing.getId().equals(uid)) {
                        existing.setUsername(uname + "_legacy_" + existing.getId().substring(0, Math.min(4, existing.getId().length())));
                        existing.setActive(0);
                        userRepository.saveAndFlush(existing);
                    }
                });

                AppUserEntity entity = userRepository.findById(uid).orElse(new AppUserEntity(
                        uid, uname, hash, u.path("name").asText(uname), u.path("is_active").asBoolean(true) ? 1 : 0,
                        u.path("created_at").asText(now)
                ));
                entity.setUsername(uname);
                entity.setPasswordHash(hash);
                entity.setFullName(u.path("name").asText(uname));
                entity.setActive(u.path("is_active").asBoolean(true) ? 1 : 0);
                userRepository.save(entity);
            }
            userRepository.flush();

            // 2. Rutas
            Set<String> validRouteIds = new HashSet<>();
            for (JsonNode r : remoteRoutes) {
                String rid = r.path("id").asText();
                if (rid.isBlank()) continue;
                validRouteIds.add(rid);
                String colId = r.path("collector_id").isNull() ? null : r.path("collector_id").asText(null);
                if (colId != null && !validUserIds.contains(colId)) colId = null;

                RouteEntity route = routeRepository.findById(rid).orElse(new RouteEntity(
                        rid, r.path("name").asText("Ruta"), colId, r.path("is_active").asBoolean(true) ? 1 : 0,
                        r.path("created_at").asText(now)
                ));
                route.setName(r.path("name").asText("Ruta"));
                route.setCollectorId(colId);
                route.setActive(r.path("is_active").asBoolean(true) ? 1 : 0);
                routeRepository.save(route);
            }
            routeRepository.flush();

            // 3. Clientes
            Set<String> validCustomerIds = new HashSet<>();
            Set<String> usedDocs = new HashSet<>();
            customerRepository.findAll().forEach(c -> usedDocs.add(c.getDocumentNumber()));
            for (JsonNode c : remoteCustomers) {
                String cid = c.path("id").asText();
                if (cid.isBlank()) continue;
                validCustomerIds.add(cid);

                String rawDoc = c.path("document_number").asText("").trim();
                String doc = rawDoc.isBlank() ? cid : rawDoc;
                Optional<CustomerEntity> existingById = customerRepository.findById(cid);
                if (existingById.isEmpty() && usedDocs.contains(doc)) {
                    doc = doc + "-" + cid.substring(Math.max(0, cid.length() - 4));
                }
                usedDocs.add(doc);

                String rid = nullIfInvalid(c.path("route_id").asText(null), validRouteIds);
                String colId = nullIfInvalid(c.path("assigned_collector_id").asText(null), validUserIds);

                CustomerEntity cust = existingById.orElse(new CustomerEntity(
                        cid,
                        c.path("full_name").asText("Cliente"),
                        doc,
                        c.path("phone").asText(""),
                        c.path("whatsapp_phone").asText(""),
                        c.path("address").asText(""),
                        c.path("neighborhood").asText(""),
                        c.path("city").asText(""),
                        c.path("occupation").asText(""),
                        c.path("business_name").asText(""),
                        c.path("notes").asText(""),
                        mapCustomerStatusToDesktop(c.path("status").asText("ACTIVE")),
                        rid,
                        colId,
                        c.path("created_at").asText(now)
                ));
                cust.setFullName(c.path("full_name").asText("Cliente"));
                cust.setPhone(c.path("phone").asText(""));
                cust.setAltPhone(c.path("whatsapp_phone").asText(""));
                cust.setAddress(c.path("address").asText(""));
                cust.setNeighborhood(c.path("neighborhood").asText(""));
                cust.setCity(c.path("city").asText(""));
                cust.setOccupation(c.path("occupation").asText(""));
                cust.setBusinessName(c.path("business_name").asText(""));
                cust.setNotes(c.path("notes").asText(""));
                cust.setStatus(mapCustomerStatusToDesktop(c.path("status").asText("ACTIVE")));
                cust.setRouteId(rid);
                cust.setCollectorId(colId);
                customerRepository.save(cust);
            }
            customerRepository.flush();

            // 4. Préstamos (primero originales sin previous_loan_id, luego renovaciones para respetar FK)
            List<JsonNode> sortedLoans = new ArrayList<>(remoteLoans);
            sortedLoans.sort(Comparator.comparingInt(l -> l.path("previous_loan_id").isNull() || l.path("previous_loan_id").asText("").isBlank() ? 0 : 1));
            Set<String> validLoanIds = new HashSet<>();
            for (JsonNode l : sortedLoans) {
                String lid = l.path("id").asText();
                String cid = l.path("customer_id").asText();
                if (lid.isBlank() || !validCustomerIds.contains(cid)) continue;
                validLoanIds.add(lid);

                String prevId = nullIfInvalid(l.path("previous_loan_id").asText(null), validLoanIds);
                String rid = nullIfInvalid(l.path("route_id").asText(null), validRouteIds);
                String colId = nullIfInvalid(l.path("collector_id").asText(null), validUserIds);
                String opType = prevId != null ? "RENOVACION" : "NUEVO";

                LoanEntity loan = loanRepository.findById(lid).orElse(new LoanEntity(
                        lid, cid, rid, colId, prevId, opType,
                        bd(l.path("principal")), bd(l.path("interest_rate")), bd(l.path("interest_amount")),
                        bd(l.path("total_agreed")), l.path("installment_count").asInt(30),
                        mapFrequencyToDesktop(l.path("frequency").asText("DAILY")),
                        l.path("start_date").asText(LocalDate.now().toString()),
                        l.path("end_date").isNull() ? null : l.path("end_date").asText(null),
                        mapLoanStatusToDesktop(l.path("status").asText("ACTIVE")),
                        l.path("created_at").asText(now)
                ));
                loan.setRouteId(rid);
                loan.setCollectorId(colId);
                loan.setStatus(mapLoanStatusToDesktop(l.path("status").asText("ACTIVE")));
                loanRepository.save(loan);
            }
            loanRepository.flush();

            // 5. Cuotas
            Set<String> validInstIds = new HashSet<>();
            for (JsonNode i : remoteInstallments) {
                String iid = i.path("id").asText();
                String lid = i.path("loan_id").asText();
                if (iid.isBlank() || !validLoanIds.contains(lid)) continue;
                validInstIds.add(iid);

                InstallmentEntity inst = installmentRepository.findById(iid).orElse(new InstallmentEntity(
                        iid, lid, i.path("installment_number").asInt(1),
                        i.path("due_date").asText(LocalDate.now().toString()),
                        bd(i.path("amount")), bd(i.path("paid_amount")),
                        mapInstallmentStatusToDesktop(i.path("status").asText("PENDIENTE"))
                ));
                inst.setAmount(bd(i.path("amount")));
                inst.setPaidAmount(bd(i.path("paid_amount")));
                inst.setStatus(mapInstallmentStatusToDesktop(i.path("status").asText("PENDIENTE")));
                installmentRepository.save(inst);
            }
            installmentRepository.flush();

            // 6. Pagos y Asignaciones
            Set<String> validPaymentIds = new HashSet<>();
            for (JsonNode p : remotePayments) {
                String pid = p.path("id").asText();
                String lid = p.path("loan_id").asText();
                String cid = p.path("customer_id").asText();
                if (pid.isBlank() || !validLoanIds.contains(lid) || !validCustomerIds.contains(cid)) continue;

                String colId = nullIfInvalid(p.path("collector_id").asText(null), validUserIds);
                if (colId == null) colId = fallbackUserId;
                if (colId == null) continue;

                String idemKey = p.path("idempotency_key").asText("").isBlank() ? pid : p.path("idempotency_key").asText();
                String createdAt = p.path("local_created_at").asText("").isBlank()
                        ? p.path("created_at").asText(now)
                        : p.path("local_created_at").asText();

                validPaymentIds.add(pid);
                if (paymentRepository.findById(pid).isEmpty() && paymentRepository.findByIdempotencyKey(idemKey).isEmpty()) {
                    PaymentEntity pay = new PaymentEntity(
                            pid, idemKey, lid, cid, colId, null,
                            bd(p.path("amount_received")),
                            mapMethodToDesktop(p.path("payment_method").asText("CASH")),
                            mapPaymentStatusToDesktop(p.path("status").asText("COMPLETED")),
                            createdAt,
                            null
                    );
                    paymentRepository.save(pay);

                    JsonNode breakdown = p.path("installments_breakdown");
                    if (breakdown.isArray()) {
                        int idx = 0;
                        for (JsonNode item : breakdown) {
                            String instId = item.path("installmentId").asText("");
                            BigDecimal applied = bd(item.path("amountApplied"));
                            if (validInstIds.contains(instId) && applied.compareTo(BigDecimal.ZERO) > 0) {
                                String allocId = pid + "-al-" + (++idx);
                                if (allocationRepository.findById(allocId).isEmpty()) {
                                    allocationRepository.save(new PaymentAllocationEntity(allocId, pid, instId, applied));
                                }
                            }
                        }
                    }
                }
            }
            paymentRepository.flush();
            allocationRepository.flush();

            // 7. Renovaciones
            for (JsonNode r : remoteRenewals) {
                String rid = r.path("id").asText();
                String prevId = r.path("previous_loan_id").asText();
                String newId = r.path("new_loan_id").asText();
                if (rid.isBlank() || !validLoanIds.contains(prevId) || !validLoanIds.contains(newId)) continue;
                if (renewalRepository.findById(rid).isEmpty()) {
                    String createdAt = r.path("local_created_at").asText("").isBlank()
                            ? r.path("created_at").asText(now) : r.path("local_created_at").asText();
                    renewalRepository.save(new RenewalEntity(
                            rid, prevId, newId,
                            bd(r.path("new_principal")),
                            bd(r.path("previous_balance_deducted")),
                            bd(r.path("paperwork_deducted")),
                            bd(r.path("actual_cash_disbursed")),
                            createdAt
                    ));
                }
            }

            // 8. Movimientos de Caja
            for (JsonNode cm : remoteCash) {
                String cmId = cm.path("id").asText();
                if (cmId.isBlank() || cashMovementRepository.findById(cmId).isPresent()) continue;
                String rid = nullIfInvalid(cm.path("route_id").asText(null), validRouteIds);
                String colId = nullIfInvalid(cm.path("collector_id").asText(null), validUserIds);
                String refId = cm.path("reference_id").isNull() ? null : cm.path("reference_id").asText(null);
                String rawCat = cm.path("category").asText("ADJUSTMENT");
                String mappedCat = mapCashCategoryToDesktop(rawCat, refId, validPaymentIds);
                String createdAt = cm.path("local_created_at").asText("").isBlank()
                        ? cm.path("created_at").asText(now) : cm.path("local_created_at").asText();

                cashMovementRepository.save(new CashMovementEntity(
                        cmId, rid, colId, null,
                        mapMovementTypeToDesktop(cm.path("type").asText("INCOME")),
                        mappedCat,
                        bd(cm.path("amount")),
                        refId,
                        cm.path("description").asText("Movimiento"),
                        createdAt
                ));
            }

            // 9. Hechos Inmutables del Libro Mayor (append-only, idempotente)
            for (JsonNode ev : remoteEvents) {
                String idem = ev.path("idempotency_key").asText("");
                if (idem.isBlank()) continue;
                ledgerService.appendIdempotent(new AppendEventCommand(
                        officeId,
                        idem,
                        ev.path("event_type").asText("ADJUSTMENT_ENTRY"),
                        ev.path("entity_type").asText("UNKNOWN"),
                        ev.path("entity_id").asText(""),
                        ev.path("route_id").isNull() ? null : ev.path("route_id").asText(null),
                        ev.path("customer_id").isNull() ? null : ev.path("customer_id").asText(null),
                        ev.path("actor_user_id").isNull() ? null : ev.path("actor_user_id").asText(null),
                        bd(ev.path("amount")),
                        bd(ev.path("cash_delta")),
                        bd(ev.path("digital_delta")),
                        bd(ev.path("portfolio_delta")),
                        ev.path("payload").toString(),
                        ev.path("occurred_at").asText(Instant.now().toString())
                ));
            }

            // 10. Guardar metadatos de la oficina vinculada
            saveSetting(OfficeLicensingService.KEY_OFFICE_ID, office.id(), now);
            saveSetting(OfficeLicensingService.KEY_ACTIVATION_CODE, office.activationCode() == null ? "" : office.activationCode(), now);
            saveSetting(OfficeLicensingService.KEY_LICENSE_STATUS, office.licenseStatus(), now);
            saveSetting(OfficeLicensingService.KEY_LICENSE_PLAN, office.licensePlan(), now);
            saveSetting("company_name", office.companyName(), now);
            saveSetting("office.company_name", office.companyName(), now);
            saveSetting("office_setup_completed", "true", now);
        });
    }

    private void pushLocalChangesToCloud(String url, String key, String officeId) throws Exception {
        String nowIso = Instant.now().toString();
        List<ObjectNode> eventRows = new ArrayList<>();

        // 1. Usuarios / Cobradores creados o actualizados desde Configuración del escritorio
        List<RouteEntity> allRoutes = routeRepository.findAll();
        Map<String, List<String>> routesByCollector = new HashMap<>();
        for (RouteEntity r : allRoutes) {
            if (r.getCollectorId() != null && !r.getCollectorId().isBlank()) {
                routesByCollector.computeIfAbsent(r.getCollectorId(), k -> new ArrayList<>()).add(r.getId());
            }
        }
        for (AppUserEntity u : userRepository.findAll()) {
            String uname = u.getUsername() == null ? "" : u.getUsername().trim().toLowerCase();
            if (uname.isBlank() || uname.contains("_legacy_")) continue;
            String role = deriveUserRoleForCloud(u);
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", u.getId());
            n.put("office_id", officeId);
            n.put("name", u.getFullName() == null || u.getFullName().isBlank() ? uname : u.getFullName());
            n.put("username", uname);
            n.put("password_hash", u.getPasswordHash() == null ? "" : u.getPasswordHash());
            n.put("role", role);
            n.put("phone", "");
            n.put("is_active", u.getActive() == null || u.getActive() == 1);
            var arr = n.putArray("assigned_route_ids");
            if ("ADMIN".equals(role) || "SUPERVISOR".equals(role)) {
                arr.add("ALL");
            } else {
                for (String rid : routesByCollector.getOrDefault(u.getId(), List.of())) {
                    arr.add(rid);
                }
            }
            n.put("updated_at", nowIso);
            try {
                // Upsert individual para que un conflicto de usuario duplicado en otra oficina no frene los demás
                registryClient.upsertRowsBatch(url, key, "users", List.of(n), false);
            } catch (Exception userSyncEx) {
                LOG.warn("No se pudo sincronizar usuario '{}': {}", uname, userSyncEx.getMessage());
            }
        }

        // 2. Rutas
        List<ObjectNode> routeRows = new ArrayList<>();
        for (RouteEntity r : allRoutes) {
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", r.getId());
            n.put("office_id", officeId);
            n.put("name", r.getName());
            n.put("code", r.getName().length() >= 4 ? r.getName().substring(0, 4).toUpperCase() : r.getName().toUpperCase());
            if (r.getCollectorId() != null) n.put("collector_id", r.getCollectorId()); else n.putNull("collector_id");
            n.put("is_active", r.getActive() == null || r.getActive() == 1);
            n.put("updated_at", nowIso);
            routeRows.add(n);
        }
        registryClient.upsertRowsBatch(url, key, "routes", routeRows, false);

        // 3. Clientes
        List<ObjectNode> custRows = new ArrayList<>();
        for (CustomerEntity c : customerRepository.findAll()) {
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", c.getId());
            n.put("office_id", officeId);
            if (c.getRouteId() != null) n.put("route_id", c.getRouteId()); else n.putNull("route_id");
            if (c.getCollectorId() != null) n.put("assigned_collector_id", c.getCollectorId()); else n.putNull("assigned_collector_id");
            n.put("full_name", c.getFullName());
            n.put("document_number", c.getDocumentNumber());
            n.put("phone", c.getPhone() == null ? "" : c.getPhone());
            n.put("whatsapp_phone", c.getAltPhone() == null ? "" : c.getAltPhone());
            n.put("address", c.getAddress() == null ? "" : c.getAddress());
            n.put("neighborhood", c.getNeighborhood() == null ? "" : c.getNeighborhood());
            n.put("city", c.getCity() == null ? "" : c.getCity());
            n.put("occupation", c.getOccupation() == null ? "" : c.getOccupation());
            n.put("business_name", c.getBusinessName() == null ? "" : c.getBusinessName());
            n.put("status", mapCustomerStatusToCloud(c.getStatus()));
            n.put("notes", c.getNotes() == null ? "" : c.getNotes());
            n.put("updated_at", nowIso);
            custRows.add(n);
        }
        registryClient.upsertRowsBatch(url, key, "customers", custRows, false);

        // 4. Préstamos + Hechos inmutables LOAN_DISBURSED (no renovaciones)
        List<ObjectNode> loanRows = new ArrayList<>();
        Map<String, LoanEntity> loanMap = new HashMap<>();
        for (LoanEntity l : loanRepository.findAll()) {
            loanMap.put(l.getId(), l);
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", l.getId());
            n.put("office_id", officeId);
            if (l.getRouteId() != null) n.put("route_id", l.getRouteId()); else n.putNull("route_id");
            n.put("customer_id", l.getCustomerId());
            if (l.getCollectorId() != null) n.put("collector_id", l.getCollectorId()); else n.putNull("collector_id");
            n.put("loan_number", "#" + l.getId().substring(Math.max(0, l.getId().length() - 5)));
            n.put("principal", l.getPrincipal());
            n.put("interest_rate", l.getInterestRate());
            n.put("interest_amount", l.getInterestAmount());
            n.put("total_agreed", l.getTotalAgreed());
            n.put("installment_count", l.getInstallmentCount());
            BigDecimal instAmt = l.getInstallmentCount() > 0
                    ? l.getTotalAgreed().divide(BigDecimal.valueOf(l.getInstallmentCount()), 2, RoundingMode.HALF_UP)
                    : l.getTotalAgreed();
            n.put("installment_amount", instAmt);
            n.put("frequency", mapFrequencyToCloud(l.getFrequency()));
            n.put("start_date", l.getStartDate());
            if (l.getEndDate() != null) n.put("end_date", l.getEndDate()); else n.putNull("end_date");
            n.put("status", mapLoanStatusToCloud(l.getStatus()));
            if (l.getPreviousLoanId() != null) n.put("previous_loan_id", l.getPreviousLoanId()); else n.putNull("previous_loan_id");
            n.put("updated_at", nowIso);
            loanRows.add(n);

            if (l.getPreviousLoanId() == null && !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus())) {
                ObjectNode ev = registryClient.createObjectNode();
                ev.put("id", "evt-loan-" + l.getId());
                ev.put("office_id", officeId);
                ev.put("idempotency_key", "loan:" + l.getId());
                ev.put("event_type", "LOAN_DISBURSED");
                ev.put("entity_type", "LOAN");
                ev.put("entity_id", l.getId());
                if (l.getRouteId() != null) ev.put("route_id", l.getRouteId()); else ev.putNull("route_id");
                ev.put("customer_id", l.getCustomerId());
                if (l.getCollectorId() != null) ev.put("actor_user_id", l.getCollectorId()); else ev.putNull("actor_user_id");
                ev.put("amount", l.getPrincipal());
                ev.put("cash_delta", l.getPrincipal().negate());
                ev.put("digital_delta", BigDecimal.ZERO);
                ev.put("portfolio_delta", l.getTotalAgreed());
                eventRows.add(ev);
            }
        }
        registryClient.upsertRowsBatch(url, key, "loans", loanRows, false);

        // 5. Cuotas
        List<ObjectNode> instRows = new ArrayList<>();
        for (InstallmentEntity i : installmentRepository.findAll()) {
            BigDecimal pending = i.getAmount().subtract(i.getPaidAmount()).max(BigDecimal.ZERO);
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", i.getId());
            n.put("office_id", officeId);
            n.put("loan_id", i.getLoanId());
            n.put("installment_number", i.getInstallmentNumber());
            n.put("due_date", i.getDueDate());
            n.put("amount", i.getAmount());
            n.put("paid_amount", i.getPaidAmount());
            n.put("pending_amount", pending);
            n.put("status", i.getStatus());
            n.put("updated_at", nowIso);
            instRows.add(n);
        }
        registryClient.upsertRowsBatch(url, key, "installments", instRows, false);

        // 6. Renovaciones hechas en el escritorio + Hechos inmutables RENEWAL_EXECUTED
        List<ObjectNode> renewalRows = new ArrayList<>();
        for (RenewalEntity ren : renewalRepository.findAll()) {
            LoanEntity newLoan = loanMap.get(ren.getNewLoanId());
            if (newLoan == null) continue;
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", ren.getId());
            n.put("office_id", officeId);
            n.put("customer_id", newLoan.getCustomerId());
            n.put("previous_loan_id", ren.getPreviousLoanId());
            n.put("new_loan_id", ren.getNewLoanId());
            if (newLoan.getCollectorId() != null) n.put("collector_id", newLoan.getCollectorId()); else n.putNull("collector_id");
            n.put("new_principal", ren.getNewPrincipal());
            n.put("previous_balance_deducted", ren.getPreviousBalanceDeducted());
            n.put("paperwork_deducted", ren.getPaperworkDeducted());
            n.put("actual_cash_disbursed", ren.getActualCashDisbursed());
            n.put("local_created_at", ren.getCreatedAt());
            renewalRows.add(n);

            ObjectNode ev = registryClient.createObjectNode();
            ev.put("id", "evt-ren-" + ren.getId());
            ev.put("office_id", officeId);
            ev.put("idempotency_key", "renewal:" + ren.getId());
            ev.put("event_type", "RENEWAL_EXECUTED");
            ev.put("entity_type", "RENEWAL");
            ev.put("entity_id", ren.getId());
            if (newLoan.getRouteId() != null) ev.put("route_id", newLoan.getRouteId()); else ev.putNull("route_id");
            ev.put("customer_id", newLoan.getCustomerId());
            if (newLoan.getCollectorId() != null) ev.put("actor_user_id", newLoan.getCollectorId()); else ev.putNull("actor_user_id");
            ev.put("amount", ren.getActualCashDisbursed());
            ev.put("cash_delta", ren.getActualCashDisbursed().negate());
            ev.put("digital_delta", BigDecimal.ZERO);
            ev.put("portfolio_delta", newLoan.getTotalAgreed().subtract(ren.getPreviousBalanceDeducted()));
            eventRows.add(ev);
        }
        registryClient.upsertRowsBatch(url, key, "renewals", renewalRows, false);

        // 7. Pagos + Hechos inmutables de pagos y reversos
        List<ObjectNode> payRows = new ArrayList<>();
        for (PaymentEntity p : paymentRepository.findAll()) {
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", p.getId());
            n.put("office_id", officeId);
            n.put("idempotency_key", p.getIdempotencyKey());
            n.put("loan_id", p.getLoanId());
            n.put("customer_id", p.getCustomerId());
            n.put("collector_id", p.getCollectorId());
            n.put("amount_received", p.getAmount());
            n.put("payment_method", mapMethodToCloud(p.getMethod()));
            n.put("status", mapPaymentStatusToCloud(p.getStatus()));
            n.put("local_created_at", p.getCreatedAt());
            payRows.add(n);

            LoanEntity loan = loanMap.get(p.getLoanId());
            boolean digital = !"CASH".equals(mapMethodToCloud(p.getMethod()));
            ObjectNode ev = registryClient.createObjectNode();
            ev.put("id", "evt-pay-" + p.getId());
            ev.put("office_id", officeId);
            ev.put("idempotency_key", "payment:" + p.getIdempotencyKey());
            ev.put("event_type", "PAYMENT_RECEIVED");
            ev.put("entity_type", "PAYMENT");
            ev.put("entity_id", p.getId());
            if (loan != null && loan.getRouteId() != null) ev.put("route_id", loan.getRouteId()); else ev.putNull("route_id");
            ev.put("customer_id", p.getCustomerId());
            ev.put("actor_user_id", p.getCollectorId());
            ev.put("amount", p.getAmount());
            ev.put("cash_delta", digital ? BigDecimal.ZERO : p.getAmount());
            ev.put("digital_delta", digital ? p.getAmount() : BigDecimal.ZERO);
            ev.put("portfolio_delta", p.getAmount().negate());
            eventRows.add(ev);

            if ("REVERSED".equals(mapPaymentStatusToCloud(p.getStatus()))) {
                ObjectNode rev = registryClient.createObjectNode();
                rev.put("id", "evt-rev-" + p.getId());
                rev.put("office_id", officeId);
                rev.put("idempotency_key", "payment-reversal:" + p.getId());
                rev.put("event_type", "PAYMENT_REVERSED");
                rev.put("entity_type", "PAYMENT");
                rev.put("entity_id", p.getId());
                if (loan != null && loan.getRouteId() != null) rev.put("route_id", loan.getRouteId()); else rev.putNull("route_id");
                rev.put("customer_id", p.getCustomerId());
                rev.put("actor_user_id", p.getCollectorId());
                rev.put("amount", p.getAmount());
                rev.put("cash_delta", digital ? BigDecimal.ZERO : p.getAmount().negate());
                rev.put("digital_delta", digital ? p.getAmount().negate() : BigDecimal.ZERO);
                rev.put("portfolio_delta", p.getAmount());
                eventRows.add(rev);
            }
        }
        registryClient.upsertRowsBatch(url, key, "payments", payRows, false);

        // 8. Movimientos de caja hechos en el escritorio (gastos, inyecciones, retiros, ajustes) + Hechos inmutables
        List<ObjectNode> cashRows = new ArrayList<>();
        for (CashMovementEntity cm : cashMovementRepository.findAll()) {
            String cloudType = mapMovementTypeToCloud(cm.getMovementType());
            String cloudCat = mapCashCategoryToCloud(cm.getCategory());
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", cm.getId());
            n.put("office_id", officeId);
            if (cm.getRouteId() != null) n.put("route_id", cm.getRouteId()); else n.putNull("route_id");
            if (cm.getCollectorId() != null) n.put("collector_id", cm.getCollectorId()); else n.putNull("collector_id");
            if (cm.getSessionId() != null) n.put("session_id", cm.getSessionId()); else n.putNull("session_id");
            n.put("type", cloudType);
            n.put("category", cloudCat);
            n.put("amount", cm.getAmount());
            if (cm.getReferenceId() != null) n.put("reference_id", cm.getReferenceId()); else n.putNull("reference_id");
            n.put("description", cm.getDescription() == null ? "" : cm.getDescription());
            n.put("local_created_at", cm.getCreatedAt());
            cashRows.add(n);

            if (!List.of("COLLECTION", "LOAN_DISBURSEMENT", "RENEWAL_DISBURSEMENT", "PAYMENT_REVERSAL").contains(cloudCat)) {
                String evType = switch (cloudCat) {
                    case "CAPITAL_INJECTION" -> "CAPITAL_INJECTED";
                    case "EXPENSE" -> "EXPENSE_RECORDED";
                    case "RECAUDO_OFICINA" -> "OFFICE_WITHDRAWAL";
                    case "RETIRO_PAPELERIA" -> "PAPERWORK_WITHDRAWAL";
                    case "LOAN_CANCELLATION" -> "LOAN_CANCELLED";
                    default -> "ADJUSTMENT_ENTRY";
                };
                BigDecimal signedCash = "INCOME".equals(cloudType) ? cm.getAmount() : cm.getAmount().negate();
                ObjectNode ev = registryClient.createObjectNode();
                ev.put("id", "evt-cm-" + cm.getId());
                ev.put("office_id", officeId);
                ev.put("idempotency_key", "cash:" + cm.getId());
                ev.put("event_type", evType);
                ev.put("entity_type", "CASH_MOVEMENT");
                ev.put("entity_id", cm.getId());
                if (cm.getRouteId() != null) ev.put("route_id", cm.getRouteId()); else ev.putNull("route_id");
                ev.putNull("customer_id");
                if (cm.getCollectorId() != null) ev.put("actor_user_id", cm.getCollectorId()); else ev.putNull("actor_user_id");
                ev.put("amount", cm.getAmount());
                ev.put("cash_delta", signedCash);
                ev.put("digital_delta", BigDecimal.ZERO);
                ev.put("portfolio_delta", BigDecimal.ZERO);
                eventRows.add(ev);
            }
        }
        registryClient.upsertRowsBatch(url, key, "cash_movements", cashRows, false);

        // 9. Publicar hechos financieros inmutables (append-only, idempotente)
        registryClient.upsertRowsBatch(url, key, "financial_events", eventRows, true);
    }

    private void clearMutableOperationalTables() {
        jdbcTemplate.execute("DELETE FROM payment_allocation");
        jdbcTemplate.execute("DELETE FROM payment");
        jdbcTemplate.execute("DELETE FROM renewal");
        jdbcTemplate.execute("DELETE FROM cash_movement");
        jdbcTemplate.execute("DELETE FROM daily_settlement");
        jdbcTemplate.execute("DELETE FROM collection_session");
        jdbcTemplate.execute("DELETE FROM payment_promise");
        jdbcTemplate.execute("DELETE FROM delinquency_record");
        jdbcTemplate.execute("DELETE FROM installment");
        jdbcTemplate.execute("DELETE FROM loan");
        jdbcTemplate.execute("DELETE FROM customer_reference");
        jdbcTemplate.execute("DELETE FROM customer");
        jdbcTemplate.execute("DELETE FROM route");
    }

    private void saveSetting(String key, String value, String now) {
        SystemSettingEntity e = settingRepository.findById(key).orElse(new SystemSettingEntity(key, value, now));
        e.setSettingValue(value);
        e.setUpdatedAt(now);
        settingRepository.save(e);
    }

    private void recordLoginAudit(String userId, String role) {
        try {
            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    userId,
                    "APP_USER",
                    userId,
                    "LOGIN",
                    null,
                    "Acceso autenticado con rol " + role,
                    "Inicio de sesión en aplicación de escritorio",
                    LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            ));
        } catch (Exception ignored) {}
    }

    private static BigDecimal bd(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(n.asText("0")).setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private static String nullIfInvalid(String val, Set<String> allowed) {
        return (val == null || val.isBlank() || !allowed.contains(val)) ? null : val;
    }

    static String normalizeRole(String role) {
        if (role == null) return "COBRADOR";
        String u = role.trim().toUpperCase();
        if ("ADMIN".equals(u) || "SUPER_ADMIN".equals(u)) return "ADMIN";
        if ("SUPERVISOR".equals(u)) return "SUPERVISOR";
        return "COBRADOR";
    }

    static String mapCustomerStatusToDesktop(String s) {
        return "INACTIVE".equalsIgnoreCase(s) || "INACTIVO".equalsIgnoreCase(s) ? "INACTIVO" : "ACTIVO";
    }

    static String mapCustomerStatusToCloud(String s) {
        return "INACTIVO".equalsIgnoreCase(s) || "INACTIVE".equalsIgnoreCase(s) ? "INACTIVE" : "ACTIVE";
    }

    static String mapLoanStatusToDesktop(String s) {
        if (s == null) return "ACTIVO";
        return switch (s.trim().toUpperCase()) {
            case "ACTIVE", "ACTIVO" -> "ACTIVO";
            case "RENEWED", "RENOVADO" -> "RENOVADO";
            case "PAID", "PAGADO", "CANCELADO" -> "PAGADO";
            case "CANCELLED", "ANULADO" -> "ANULADO";
            case "DEFAULTED", "MORA" -> "ACTIVO";
            default -> "ACTIVO";
        };
    }

    static String mapLoanStatusToCloud(String s) {
        if (s == null) return "ACTIVE";
        return switch (s.trim().toUpperCase()) {
            case "ACTIVO", "ACTIVE" -> "ACTIVE";
            case "RENOVADO", "RENEWED" -> "RENEWED";
            case "PAGADO", "CANCELADO", "PAID" -> "PAID";
            case "ANULADO", "CANCELLED" -> "CANCELLED";
            default -> "ACTIVE";
        };
    }

    static String mapFrequencyToDesktop(String f) {
        if (f == null) return "DIARIO";
        return switch (f.trim().toUpperCase()) {
            case "WEEKLY", "SEMANAL" -> "SEMANAL";
            case "BIWEEKLY", "QUINCENAL" -> "QUINCENAL";
            case "MONTHLY", "MENSUAL" -> "MENSUAL";
            default -> "DIARIO";
        };
    }

    static String mapFrequencyToCloud(String f) {
        if (f == null) return "DAILY";
        return switch (f.trim().toUpperCase()) {
            case "SEMANAL", "WEEKLY" -> "WEEKLY";
            case "QUINCENAL", "BIWEEKLY" -> "BIWEEKLY";
            case "MENSUAL", "MONTHLY" -> "MONTHLY";
            default -> "DAILY";
        };
    }

    static String mapInstallmentStatusToDesktop(String s) {
        if (s == null) return "PENDIENTE";
        return switch (s.trim().toUpperCase()) {
            case "PAGADA", "PAID", "ADELANTADA" -> "PAGADA";
            case "PARTIAL", "PARCIAL" -> "PARCIAL";
            case "OVERDUE", "VENCIDA" -> "VENCIDA";
            default -> "PENDIENTE";
        };
    }

    static String mapMethodToDesktop(String m) {
        if (m == null) return "EFECTIVO";
        return switch (m.trim().toUpperCase()) {
            case "CASH", "EFECTIVO" -> "EFECTIVO";
            case "NEQUI" -> "NEQUI";
            case "TRANSFER", "TRANSFERENCIA" -> "TRANSFERENCIA";
            default -> "OTRO";
        };
    }

    static String mapMethodToCloud(String m) {
        if (m == null) return "CASH";
        return switch (m.trim().toUpperCase()) {
            case "EFECTIVO", "CASH" -> "CASH";
            case "NEQUI" -> "NEQUI";
            case "TRANSFERENCIA", "TRANSFER" -> "TRANSFER";
            default -> "OTHER";
        };
    }

    static String mapPaymentStatusToDesktop(String s) {
        if (s == null) return "APLICADO";
        return switch (s.trim().toUpperCase()) {
            case "REVERSED", "REVERTIDO", "ANULADO" -> "REVERTIDO";
            default -> "APLICADO";
        };
    }

    static String mapPaymentStatusToCloud(String s) {
        if (s == null) return "COMPLETED";
        return switch (s.trim().toUpperCase()) {
            case "REVERTIDO", "ANULADO", "REVERSED" -> "REVERSED";
            default -> "COMPLETED";
        };
    }

    static String mapMovementTypeToDesktop(String t) {
        return "EXPENSE".equalsIgnoreCase(t) || "SALIDA".equalsIgnoreCase(t) || "EGRESO".equalsIgnoreCase(t)
                ? "SALIDA" : "ENTRADA";
    }

    static String mapMovementTypeToCloud(String t) {
        return "SALIDA".equalsIgnoreCase(t) || "EGRESO".equalsIgnoreCase(t) || "EXPENSE".equalsIgnoreCase(t)
                ? "EXPENSE" : "INCOME";
    }

    static String deriveUserRoleForCloud(AppUserEntity u) {
        String id = u.getId() == null ? "" : u.getId().toLowerCase();
        String un = u.getUsername() == null ? "" : u.getUsername().toLowerCase();
        if (id.startsWith("usr-adm") || un.startsWith("admin") || "administrador".equals(un)) return "ADMIN";
        if (id.startsWith("usr-sup") || un.contains("superv")) return "SUPERVISOR";
        return "COBRADOR";
    }

    static String mapCashCategoryToCloud(String cat) {
        if (cat == null) return "ADJUSTMENT";
        return switch (cat.trim().toUpperCase()) {
            case "PAGO_CUOTA", "COBRO_CUOTA", "COBRO_HISTORICO", "COLLECTION" -> "COLLECTION";
            case "ANULACION_PAGO", "REVERSO_PAGO", "REVERSO_HISTORICO", "PAYMENT_REVERSAL" -> "PAYMENT_REVERSAL";
            case "INYECCION_CAPITAL", "BASE_INICIAL", "CAPITAL_INJECTION" -> "CAPITAL_INJECTION";
            case "DESEMBOLSO", "DESEMBOLSO_PRESTAMO", "LOAN_DISBURSEMENT" -> "LOAN_DISBURSEMENT";
            case "DESEMBOLSO_RENOVACION", "RENEWAL_DISBURSEMENT" -> "RENEWAL_DISBURSEMENT";
            case "GASTO_RUTA", "GASTO", "EXPENSE" -> "EXPENSE";
            case "RETIRO_OFICINA", "RECAUDO_OFICINA" -> "RECAUDO_OFICINA";
            case "RETIRO_PAPELERIA" -> "RETIRO_PAPELERIA";
            case "ANULACION_CREDITO", "LOAN_CANCELLATION" -> "LOAN_CANCELLATION";
            default -> "ADJUSTMENT";
        };
    }

    static String mapCashCategoryToDesktop(String cat, String refId, Set<String> validPaymentIds) {
        if (cat == null) return "AJUSTE";
        return switch (cat.trim().toUpperCase()) {
            case "COLLECTION", "PAGO_CUOTA" -> (refId != null && validPaymentIds.contains(refId)) ? "PAGO_CUOTA" : "COBRO_HISTORICO";
            case "PAYMENT_REVERSAL", "ANULACION_PAGO" -> (refId != null && validPaymentIds.contains(refId)) ? "ANULACION_PAGO" : "REVERSO_HISTORICO";
            case "CAPITAL_INJECTION", "BASE_INICIAL" -> "INYECCION_CAPITAL";
            case "LOAN_DISBURSEMENT", "DESEMBOLSO" -> "DESEMBOLSO";
            case "RENEWAL_DISBURSEMENT", "DESEMBOLSO_RENOVACION" -> "DESEMBOLSO_RENOVACION";
            case "EXPENSE", "GASTO_RUTA" -> "GASTO_RUTA";
            case "RECAUDO_OFICINA", "RETIRO_OFICINA" -> "RETIRO_OFICINA";
            default -> cat.trim().toUpperCase();
        };
    }
}
