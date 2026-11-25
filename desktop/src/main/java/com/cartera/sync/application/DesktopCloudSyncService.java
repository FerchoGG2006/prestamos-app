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
import com.cartera.settlement.application.SettlementUseCase;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.beans.factory.annotation.Autowired;

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

    public record SyncStatus(boolean synced, LocalDateTime lastSyncAt, String message, boolean hasError) {
        public static SyncStatus initial() { return new SyncStatus(false, null, "Conectando con la nube...", false); }
    }

    private static final ZoneId BOGOTA_ZONE = ZoneId.of("America/Bogota");
    public static final String KEY_SETTINGS_LOCAL_DIRTY = "sync.settings_local_dirty";
    public static final String KEY_CUSTOMER_ORDER_DIRTY = "sync.customer_order_dirty";

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
    private final CollectionSessionRepository collectionSessionRepository;
    private final DailySettlementRepository dailySettlementRepository;
    private final PaymentPromiseRepository paymentPromiseRepository;

    private final AtomicBoolean syncing = new AtomicBoolean(false);
    private final AtomicReference<SyncStatus> lastSyncStatus = new AtomicReference<>(SyncStatus.initial());
    private final AtomicReference<String> lastSyncedDigest = new AtomicReference<>(null);

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
        this(authService, licensingService, registryClient, backupService, ledgerService, txManager, jdbcTemplate,
                userRepository, routeRepository, customerRepository, loanRepository, installmentRepository,
                paymentRepository, allocationRepository, renewalRepository, cashMovementRepository,
                settingRepository, auditLogRepository, null, null, null);
    }

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
            AuditLogRepository auditLogRepository,
            CollectionSessionRepository collectionSessionRepository,
            DailySettlementRepository dailySettlementRepository
    ) {
        this(authService, licensingService, registryClient, backupService, ledgerService, txManager, jdbcTemplate,
                userRepository, routeRepository, customerRepository, loanRepository, installmentRepository,
                paymentRepository, allocationRepository, renewalRepository, cashMovementRepository,
                settingRepository, auditLogRepository, collectionSessionRepository, dailySettlementRepository, null);
    }

    @Autowired
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
            AuditLogRepository auditLogRepository,
            CollectionSessionRepository collectionSessionRepository,
            DailySettlementRepository dailySettlementRepository,
            @Autowired(required = false) PaymentPromiseRepository paymentPromiseRepository
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
        this.collectionSessionRepository = collectionSessionRepository;
        this.dailySettlementRepository = dailySettlementRepository;
        this.paymentPromiseRepository = paymentPromiseRepository;
    }

    public SyncStatus getLastSyncStatus() {
        return lastSyncStatus.get();
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
            SupabaseRegistryClient.CloudAuthResponse authResp;
            try {
                authResp = registryClient.authenticateUser(url, key, cleanUser, rawPassword);
            } catch (Exception networkOrApiEx) {
                LOG.warn("Validación en línea no disponible, intentando modo sin conexión: {}", networkOrApiEx.getMessage(), networkOrApiEx);
                // Caer a modo offline solo si el equipo ya estaba vinculado, activo y no vencido
                if (licensingService.isLinkedLicenseValidOffline()) {
                    return authService.authenticate(username, rawPassword)
                            .map(AuthResult::success)
                            .orElseGet(() -> AuthResult.failure("Usuario o contraseña incorrectos."));
                }
                if (licensingService.getLinkedOfficeId().isPresent()) {
                    return AuthResult.failure("La licencia local está suspendida o vencida. Conéctate a internet para renovarla.");
                }
                return AuthResult.failure("No se pudo conectar para validar tus credenciales. Verifica tu conexión a internet.");
            }

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
            boolean switchingFromExistingOffice = !currentLocalOfficeId.isBlank() && !office.id().equals(currentLocalOfficeId);
            boolean switchingOffice = !office.id().equals(currentLocalOfficeId);
            if (switchingOffice && customerRepository.count() > 0 && backupService != null) {
                try {
                    backupService.createBackup("SWITCH_OFFICE_" + office.id());
                } catch (Exception ignored) {}
            }

            // Descargar cartera completa de esa oficina e hidratar SQLite local.
            // Si estamos CAMBIANDO desde otra oficina existente y falla la limpieza/hidratación,
            // ABORTAR el cambio para impedir fuga multi-tenant de Oficina A hacia Oficina B.
            // Si es primera vinculación o misma oficina, permitir fallback transitorio para no rechazar login válido.
            try {
                hydrateOfficeFromCloud(url, key, office, switchingOffice, matchedUser, rawPassword);
                lastSyncedDigest.set(computeLocalChangeDigest());
                lastSyncStatus.set(new SyncStatus(true, LocalDateTime.now(), "Sincronizado con la nube", false));
            } catch (Exception hydrateEx) {
                LOG.error("Autenticación en nube exitosa para '{}' ({}), pero la hidratación inicial falló: {}",
                        cleanUser, office.id(), hydrateEx.getMessage(), hydrateEx);
                lastSyncStatus.set(new SyncStatus(false, null, "Error de hidratación: " + hydrateEx.getMessage(), true));
                if (switchingFromExistingOffice) {
                    return AuthResult.failure(
                            "No se pudo completar el cambio seguro a la oficina " + office.companyName()
                                    + ". Verifica tu conexión e intenta de nuevo (datos previos protegidos)."
                    );
                }
                persistAuthenticatedUserLocally(office, matchedUser, cleanUser, rawPassword);
            }

            String role = normalizeRole(matchedUser.path("role").asText("COBRADOR"));
            String userId = matchedUser.path("id").asText();
            String fullName = matchedUser.path("name").asText(cleanUser);
            UserSession session = new UserSession(userId, cleanUser, fullName, role);
            UserSessionContext.setSession(session);
            recordLoginAudit(userId, role);

            return AuthResult.success(session);
        }

        return authService.authenticate(username, rawPassword)
                .map(AuthResult::success)
                .orElseGet(() -> AuthResult.failure("Usuario o contraseña incorrectos."));
    }

    /**
     * Sincronización automática y silenciosa en segundo plano (Escritorio <-> Nube).
     * Ejecuta PULL + MERGE antes de PUSH para no sobrescribir pagos/cuotas recientes de móvil/web.
     * Retorna true si se incorporaron novedades desde otros dispositivos.
     */
    public boolean syncSilentlyInBackground() {
        if (licensingService.isRecoveryReadOnlyMode()) {
            LOG.info("Sincronización automática deshabilitada: base abierta en modo respaldo/recuperación.");
            return false;
        }
        Optional<String> optOfficeId = licensingService.getLinkedOfficeId();
        if (optOfficeId.isEmpty()) return false;
        String url = licensingService.getSupabaseUrl();
        String key = licensingService.getSupabaseKey();
        if (url.isBlank() || key.isBlank()) return false;
        if (!syncing.compareAndSet(false, true)) return false;

        try {
            if (registryClient.getActiveSessionToken().isBlank()) {
                String savedToken = licensingService.getSavedCloudSessionToken();
                if (savedToken.isBlank()) {
                    lastSyncStatus.set(new SyncStatus(false, lastSyncStatus.get().lastSyncAt(), "Sin token de sesión en la nube", true));
                    return false;
                }
                registryClient.setActiveSessionToken(savedToken);
            }
            String officeId = optOfficeId.get();
            Optional<RemoteOffice> optOffice = registryClient.findOfficeById(url, key, officeId);
            if (optOffice.isEmpty()) {
                lastSyncStatus.set(new SyncStatus(false, lastSyncStatus.get().lastSyncAt(), "Sesión de nube vencida — vuelve a iniciar sesión", true));
                return false;
            }
            RemoteOffice remoteOffice = optOffice.get();
            if (!OfficeLicensingService.isLicenseCurrentlyActive(remoteOffice.licenseStatus(), remoteOffice.licenseExpiresAt())) {
                // Invalidar caché local de licencia inmediatamente para impedir uso offline indebido
                licensingService.updateLocalLicenseCache(remoteOffice.licenseStatus(), remoteOffice.licenseExpiresAt());
                lastSyncStatus.set(new SyncStatus(false, lastSyncStatus.get().lastSyncAt(), "Licencia no activa en la nube", true));
                return false;
            }

            // 1. PULL primero: descargar novedades de cobradores/web y fusionar de forma segura en SQLite
            String beforeDigest = computeLocalChangeDigest();
            String previousSyncedDigest = lastSyncedDigest.get();
            boolean localChangedSinceLastSync = previousSyncedDigest != null && !beforeDigest.equals(previousSyncedDigest);

            RemotePullContext pullCtx = hydrateOfficeFromCloud(url, key, remoteOffice, false, null, null);
            String afterDigest = computeLocalChangeDigest();

            // 2. PUSH selectivo: SOLO subir si el escritorio produjo cambios locales o tiene registros ausentes/diferentes en la nube.
            // Si el escritorio está en reposo (sin ediciones locales), queda en modo solo-lectura PULL y NUNCA sobrescribe la nube.
            if (localChangedSinceLastSync || hasLocalDivergenceToPush(pullCtx)) {
                pushLocalChangesToCloud(url, key, officeId, pullCtx);
            } else {
                LOG.debug("Sincronización silenciosa en solo-lectura: sin cambios locales pendientes de subir.");
            }

            lastSyncedDigest.set(computeLocalChangeDigest());
            lastSyncStatus.set(new SyncStatus(true, LocalDateTime.now(), "Sincronizado con la nube", false));
            return !beforeDigest.equals(afterDigest);
        } catch (Exception ex) {
            LOG.warn("Sincronización silenciosa pospuesta: {}", ex.getMessage());
            lastSyncStatus.set(new SyncStatus(false, lastSyncStatus.get().lastSyncAt(), "Sin conexión nube (" + ex.getMessage() + ")", true));
            return false;
        } finally {
            syncing.set(false);
        }
    }

    private record RemotePullContext(
            Map<String, String> userPhonesById,
            Map<String, String> routeCodesById,
            Map<String, String> paymentIdByIdempotencyKey,
            Set<String> remoteRouteIds,
            Set<String> remoteCustomerIds,
            Map<String, String> remoteCustomerFingerprints,
            Map<String, String> remoteLoanFingerprints,
            Map<String, String> remoteLoanNotesById,
            Map<String, String> remoteInstallmentFingerprints,
            Set<String> remotePaymentIds,
            Set<String> remoteReversedPaymentIds,
            Set<String> remoteRenewalIds,
            Set<String> remoteCashIds,
            Set<String> remoteSettlementIds,
            JsonNode remoteSettingsNode
    ) {
        static RemotePullContext empty() {
            return new RemotePullContext(
                    Map.of(), Map.of(), Map.of(),
                    Set.of(), Set.of(), Map.of(), Map.of(), Map.of(), Map.of(),
                    Set.of(), Set.of(), Set.of(), Set.of(), Set.of(), null
            );
        }
    }

    private boolean isSettingFlagTrue(String key) {
        return settingRepository.findById(key)
                .map(s -> "true".equalsIgnoreCase(s.getSettingValue()))
                .orElse(false);
    }

    private void clearSettingKey(String key) {
        settingRepository.findById(key).ifPresent(settingRepository::delete);
    }

    private String computeLocalChangeDigest() {
        List<PaymentEntity> payments = paymentRepository.findAll();
        long payCount = payments.size();
        long payAnnulled = payments.stream()
                .filter(p -> "ANULADO".equalsIgnoreCase(p.getStatus()) || "REVERTIDO".equalsIgnoreCase(p.getStatus()))
                .count();
        List<LoanEntity> loans = loanRepository.findAll();
        long loanHash = 0L;
        for (LoanEntity l : loans) {
            loanHash += Objects.hash(l.getId(), l.getStatus(), l.getRouteId(), l.getLoanNumber(), l.getStartDate(), l.getEndDate(), l.getFrequency());
        }
        List<CustomerEntity> customers = customerRepository.findAll();
        long custHash = 0L;
        for (CustomerEntity c : customers) {
            custHash += Objects.hash(c.getId(), c.getFullName(), c.getPhone(), c.getRouteId(), c.getStatus(), c.getOrderIndex());
        }
        List<RouteEntity> routes = routeRepository.findAll();
        long routeHash = 0L;
        for (RouteEntity r : routes) {
            BigDecimal base = r.getInitialCashBase() != null ? r.getInitialCashBase().setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            routeHash += Objects.hash(r.getId(), r.getName(), r.getCollectorId(), r.getActive(), base.toPlainString());
        }
        List<CashMovementEntity> cashList = cashMovementRepository.findAll();
        long cashCount = 0L;
        BigDecimal cashSum = BigDecimal.ZERO;
        for (CashMovementEntity cm : cashList) {
            if ("COBRO_CARTULINA_MIGRADA".equalsIgnoreCase(cm.getCategory())
                    || (cm.getId() != null && cm.getId().startsWith("cm-mig-paper-"))) {
                continue;
            }
            cashCount++;
            if (cm.getAmount() != null) cashSum = cashSum.add(cm.getAmount());
        }
        long renewalCount = renewalRepository.count();
        long settlementCount = dailySettlementRepository != null ? dailySettlementRepository.count() : 0L;
        long instHash = 0L;
        BigDecimal totalPaidInst = BigDecimal.ZERO;
        for (InstallmentEntity i : installmentRepository.findAll()) {
            BigDecimal paid = i.getPaidAmount() != null ? i.getPaidAmount().setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            totalPaidInst = totalPaidInst.add(paid);
            instHash += Objects.hash(i.getId(), i.getStatus(), i.getDueDate(), paid.toPlainString());
        }
        long settingsHash = computeLocalSettingsHash();
        long promiseHash = computeLocalPromisesHash();
        return payCount + ":" + payAnnulled + ":" + loans.size() + ":" + loanHash
                + ":" + customers.size() + ":" + custHash
                + ":" + routes.size() + ":" + routeHash
                + ":" + cashCount + ":" + cashSum.setScale(2, RoundingMode.HALF_UP).toPlainString()
                + ":" + renewalCount + ":" + settlementCount
                + ":" + totalPaidInst.toPlainString() + ":" + instHash
                + ":" + settingsHash + ":" + promiseHash;
    }

    private long computeLocalSettingsHash() {
        long h = 0L;
        for (SystemSettingEntity s : settingRepository.findAll()) {
            String k = s.getSettingKey();
            if (k == null) continue;
            if (k.startsWith(SettlementUseCase.KEY_OPENING_BASE_PREFIX)
                    || k.startsWith(SettlementUseCase.KEY_OPENING_BASE_META_PREFIX)
                    || List.of(
                            "paperwork_enabled", "paperwork_fee", "default_interest_percent",
                            "default_installments_count", "exclude_sundays",
                            "route_allow_new_loans", "route_allow_expenses",
                            "route_allow_reorder", "route_allow_partial_payments",
                            "max_new_loan_amount", KEY_SETTINGS_LOCAL_DIRTY, KEY_CUSTOMER_ORDER_DIRTY
                    ).contains(k)) {
                h += Objects.hash(k, s.getSettingValue());
            }
        }
        return h;
    }

    private long computeLocalPromisesHash() {
        if (paymentPromiseRepository == null) return 0L;
        long h = 0L;
        for (PaymentPromiseEntity pr : paymentPromiseRepository.findAll()) {
            BigDecimal amt = pr.getAmount() != null ? pr.getAmount().setScale(0, RoundingMode.HALF_UP) : BigDecimal.ZERO;
            h += Objects.hash(pr.getId(), pr.getLoanId(), pr.getPromisedDate(), pr.getStatus(), amt.toPlainString(), pr.getNotes());
        }
        return h;
    }

    private static String customerFingerprint(CustomerEntity c) {
        return customerFingerprintParts(
                c.getFullName(), c.getPhone(), c.getAltPhone(), c.getAddress(),
                c.getNeighborhood(), c.getCity(), c.getOccupation(), c.getBusinessName(),
                mapCustomerStatusToCloud(c.getStatus()), c.getRouteId(), c.getCollectorId(),
                c.getOrderIndex(), c.getNotes()
        );
    }

    private static String customerFingerprintParts(
            String fullName, String phone, String altPhone, String address,
            String neighborhood, String city, String occupation, String businessName,
            String cloudStatus, String routeId, String collectorId, Integer orderIndex, String notes
    ) {
        return String.join("|",
                fullName == null ? "" : fullName,
                phone == null ? "" : phone,
                altPhone == null ? "" : altPhone,
                address == null ? "" : address,
                neighborhood == null ? "" : neighborhood,
                city == null ? "" : city,
                occupation == null ? "" : occupation,
                businessName == null ? "" : businessName,
                cloudStatus == null ? "" : cloudStatus,
                routeId == null ? "" : routeId,
                collectorId == null ? "" : collectorId,
                String.valueOf(orderIndex != null ? orderIndex : 0),
                notes == null ? "" : notes
        );
    }

    private boolean hasLocalDivergenceToPush(RemotePullContext pullCtx) {
        if (isSettingFlagTrue(KEY_SETTINGS_LOCAL_DIRTY) || isSettingFlagTrue(KEY_CUSTOMER_ORDER_DIRTY)) {
            return true;
        }
        for (RouteEntity r : routeRepository.findAll()) {
            if (!pullCtx.remoteRouteIds().contains(r.getId())) return true;
        }
        for (CustomerEntity c : customerRepository.findAll()) {
            if (!pullCtx.remoteCustomerIds().contains(c.getId())) return true;
            String remoteFp = pullCtx.remoteCustomerFingerprints().get(c.getId());
            if (remoteFp != null && !remoteFp.equals(customerFingerprint(c))) return true;
        }
        for (LoanEntity l : loanRepository.findAll()) {
            String remoteFp = pullCtx.remoteLoanFingerprints().get(l.getId());
            if (remoteFp == null || !remoteFp.equals(loanFingerprint(l))) return true;
        }
        for (InstallmentEntity i : installmentRepository.findAll()) {
            String remoteFp = pullCtx.remoteInstallmentFingerprints().get(i.getId());
            if (remoteFp == null || !remoteFp.equals(installmentFingerprint(i))) return true;
        }
        for (RenewalEntity ren : renewalRepository.findAll()) {
            if (!pullCtx.remoteRenewalIds().contains(ren.getId())) return true;
        }
        for (PaymentEntity p : paymentRepository.findAll()) {
            String idemKey = p.getIdempotencyKey() != null && !p.getIdempotencyKey().isBlank() ? p.getIdempotencyKey() : p.getId();
            String effectiveCloudId = pullCtx.paymentIdByIdempotencyKey().getOrDefault(idemKey, p.getId());
            if (!pullCtx.remotePaymentIds().contains(effectiveCloudId)) return true;
            if ("REVERSED".equals(mapPaymentStatusToCloud(p.getStatus()))
                    && !pullCtx.remoteReversedPaymentIds().contains(effectiveCloudId)) {
                return true;
            }
        }
        for (CashMovementEntity cm : cashMovementRepository.findAll()) {
            if ("COBRO_CARTULINA_MIGRADA".equalsIgnoreCase(cm.getCategory())
                    || (cm.getId() != null && cm.getId().startsWith("cm-mig-paper-"))) {
                continue;
            }
            if (!pullCtx.remoteCashIds().contains(cm.getId())) return true;
        }
        if (dailySettlementRepository != null) {
            for (DailySettlementEntity ds : dailySettlementRepository.findAll()) {
                if (!pullCtx.remoteSettlementIds().contains(ds.getId())) return true;
            }
        }
        if (hasSettingsDivergenceToPush(pullCtx.remoteSettingsNode())) {
            return true;
        }
        return false;
    }

    private static String loanFingerprint(LoanEntity l) {
        return loanFingerprintParts(
                mapLoanStatusToCloud(l.getStatus()),
                mapFrequencyToCloud(l.getFrequency()),
                l.getRouteId(),
                l.getCollectorId(),
                l.getStartDate(),
                l.getEndDate(),
                l.getLoanNumber(),
                l.getTotalAgreed()
        );
    }

    private static String loanFingerprintParts(
            String cloudStatus,
            String cloudFrequency,
            String routeId,
            String collectorId,
            String startDate,
            String endDate,
            String loanNumber,
            BigDecimal totalAgreed
    ) {
        String amt = totalAgreed != null ? totalAgreed.setScale(2, RoundingMode.HALF_UP).toPlainString() : "0.00";
        return String.join("|",
                cloudStatus == null ? "" : cloudStatus,
                cloudFrequency == null ? "" : cloudFrequency,
                routeId == null ? "" : routeId,
                collectorId == null ? "" : collectorId,
                startDate == null ? "" : startDate,
                endDate == null ? "" : endDate,
                loanNumber == null ? "" : loanNumber.trim(),
                amt
        );
    }

    private static String installmentFingerprint(InstallmentEntity i) {
        return installmentFingerprintParts(
                i.getDueDate(),
                i.getAmount(),
                i.getPaidAmount(),
                mapInstallmentStatusToCloud(i.getStatus())
        );
    }

    private static String installmentFingerprintParts(
            String dueDate,
            BigDecimal amount,
            BigDecimal paidAmount,
            String cloudStatus
    ) {
        String a = amount != null ? amount.setScale(2, RoundingMode.HALF_UP).toPlainString() : "0.00";
        String p = paidAmount != null ? paidAmount.setScale(2, RoundingMode.HALF_UP).toPlainString() : "0.00";
        return String.join("|",
                dueDate == null ? "" : dueDate,
                a,
                p,
                cloudStatus == null ? "" : cloudStatus
        );
    }

    private void persistAuthenticatedUserLocally(
            RemoteOffice office,
            JsonNode matchedUser,
            String cleanUser,
            String rawPassword
    ) {
        try {
            txTemplate.executeWithoutResult(status -> {
                String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                String uid = matchedUser.path("id").asText();
                if (!uid.isBlank()) {
                    userRepository.findByUsername(cleanUser).ifPresent(existing -> {
                        if (!existing.getId().equals(uid)) {
                            existing.setUsername(cleanUser + "_legacy_" + existing.getId().substring(0, Math.min(4, existing.getId().length())));
                            existing.setActive(0);
                            userRepository.saveAndFlush(existing);
                        }
                    });
                    AppUserEntity entity = userRepository.findById(uid).orElse(new AppUserEntity(
                            uid, cleanUser, PasswordHasher.hash(rawPassword),
                            matchedUser.path("name").asText(cleanUser), 1, now
                    ));
                    entity.setUsername(cleanUser);
                    entity.setPasswordHash(PasswordHasher.hash(rawPassword));
                    entity.setFullName(matchedUser.path("name").asText(cleanUser));
                    entity.setActive(1);
                    userRepository.saveAndFlush(entity);
                    authService.assignRole(uid, normalizeRole(matchedUser.path("role").asText("COBRADOR")));
                }
                saveSetting(OfficeLicensingService.KEY_OFFICE_ID, office.id(), now);
                saveSetting(OfficeLicensingService.KEY_ACTIVATION_CODE, office.activationCode() == null ? "" : office.activationCode(), now);
                saveSetting(OfficeLicensingService.KEY_LICENSE_STATUS, office.licenseStatus(), now);
                saveSetting(OfficeLicensingService.KEY_LICENSE_PLAN, office.licensePlan(), now);
                saveSetting(OfficeLicensingService.KEY_LICENSE_EXPIRES_AT, office.licenseExpiresAt() == null ? "" : office.licenseExpiresAt(), now);
                saveSetting("company_name", office.companyName(), now);
                saveSetting("office.company_name", office.companyName(), now);
                if (office.city() != null && !office.city().isBlank()) {
                    saveSetting("company_city", office.city(), now);
                }
                if (office.supportPhone() != null && !office.supportPhone().isBlank()) {
                    saveSetting("company_phone", office.supportPhone(), now);
                }
                saveSetting("office_setup_completed", "true", now);
            });
        } catch (Exception ex) {
            LOG.warn("No se pudo guardar usuario local tras fallback de hidratación: {}", ex.getMessage());
        }
    }

    private RemotePullContext hydrateOfficeFromCloud(
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
        List<JsonNode> remoteSettlements = List.of();
        try {
            remoteSettlements = registryClient.fetchOfficeRows(url, key, "daily_settlements", officeId);
        } catch (Exception ignored) {}
        Optional<JsonNode> remoteSettings = Optional.empty();
        try {
            remoteSettings = registryClient.fetchOfficeSettings(url, key, officeId);
        } catch (Exception ignored) {}

        Map<String, String> remoteUserPhones = new HashMap<>();
        for (JsonNode u : remoteUsers) {
            String uid = u.path("id").asText("");
            if (!uid.isBlank()) {
                remoteUserPhones.put(uid, u.path("phone").asText(""));
            }
        }
        Map<String, String> remoteRouteCodes = new HashMap<>();
        Set<String> remoteRouteIds = new HashSet<>();
        for (JsonNode r : remoteRoutes) {
            String rid = r.path("id").asText("");
            if (!rid.isBlank()) {
                remoteRouteCodes.put(rid, r.path("code").asText(""));
                remoteRouteIds.add(rid);
            }
        }
        Set<String> remoteCustomerIds = new HashSet<>();
        Map<String, String> remoteCustomerFingerprints = new HashMap<>();
        for (JsonNode c : remoteCustomers) {
            String cid = c.path("id").asText("");
            if (!cid.isBlank()) remoteCustomerIds.add(cid);
        }
        Map<String, String> remotePayIdByIdem = new HashMap<>();
        Set<String> remotePaymentIds = new HashSet<>();
        Set<String> remoteReversedPaymentIds = new HashSet<>();
        Set<String> loansWithRemoteReversal = new HashSet<>();
        for (JsonNode p : remotePayments) {
            String pid = p.path("id").asText("");
            String idem = p.path("idempotency_key").asText("");
            if (!pid.isBlank()) remotePaymentIds.add(pid);
            if (!pid.isBlank() && !idem.isBlank()) {
                remotePayIdByIdem.put(idem, pid);
            }
            if ("REVERSED".equalsIgnoreCase(p.path("status").asText(""))) {
                if (!pid.isBlank()) remoteReversedPaymentIds.add(pid);
                String lid = p.path("loan_id").asText("");
                if (!lid.isBlank()) loansWithRemoteReversal.add(lid);
            }
        }
        Set<String> remoteRenewalIds = new HashSet<>();
        Set<String> renewedPreviousLoanIds = new HashSet<>();
        for (JsonNode r : remoteRenewals) {
            String rid = r.path("id").asText("");
            if (!rid.isBlank()) remoteRenewalIds.add(rid);
            String prevId = r.path("previous_loan_id").asText("");
            if (!prevId.isBlank()) renewedPreviousLoanIds.add(prevId);
        }
        Set<String> remoteCashIds = new HashSet<>();
        for (JsonNode cm : remoteCash) {
            String cmId = cm.path("id").asText("");
            if (!cmId.isBlank()) remoteCashIds.add(cmId);
        }
        Set<String> remoteSettlementIds = new HashSet<>();
        for (JsonNode s : remoteSettlements) {
            String sid = s.path("id").asText("");
            if (!sid.isBlank()) remoteSettlementIds.add(sid);
        }

        Map<String, String> remoteLoanFingerprints = new HashMap<>();
        Map<String, String> remoteLoanNotesById = new HashMap<>();
        Map<String, String> remoteInstallmentFingerprints = new HashMap<>();

        final Optional<JsonNode> officeSettingsOpt = remoteSettings;
        final List<JsonNode> remoteSettlementRows = remoteSettlements;
        txTemplate.executeWithoutResult(status -> {
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            if (resetLocalOperationalData) {
                clearMutableOperationalTables();
            } else {
                for (RenewalEntity localRen : renewalRepository.findAll()) {
                    if (localRen.getPreviousLoanId() != null && !localRen.getPreviousLoanId().isBlank()) {
                        renewedPreviousLoanIds.add(localRen.getPreviousLoanId());
                    }
                }
            }

            // 1. Usuarios + Roles reales en user_role
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
                userRepository.saveAndFlush(entity);
                authService.assignRole(uid, normalizeRole(u.path("role").asText("COBRADOR")));
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
                if (r.has("initial_cash_base") && !r.path("initial_cash_base").isNull()) {
                    route.setInitialCashBase(bd(r.path("initial_cash_base")));
                }
                routeRepository.save(route);
            }
            routeRepository.flush();

            // 3. Clientes (incluyendo orden de visita order_index)
            boolean preserveLocalCustomerOrder = !resetLocalOperationalData && isSettingFlagTrue(KEY_CUSTOMER_ORDER_DIRTY);
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
                int remoteOrderIndex = c.has("order_index") && !c.path("order_index").isNull()
                        ? c.path("order_index").asInt(0) : 0;

                String rName = c.path("full_name").asText("Cliente");
                String rPhone = c.path("phone").asText("");
                String rAltPhone = c.path("whatsapp_phone").asText("");
                String rAddr = c.path("address").asText("");
                String rNeigh = c.path("neighborhood").asText("");
                String rCity = c.path("city").asText("");
                String rOcc = c.path("occupation").asText("");
                String rBiz = c.path("business_name").asText("");
                String rNotes = c.path("notes").asText("");
                String rStatusDesktop = mapCustomerStatusToDesktop(c.path("status").asText("ACTIVE"));

                remoteCustomerFingerprints.put(cid, customerFingerprintParts(
                        rName, rPhone, rAltPhone, rAddr, rNeigh, rCity, rOcc, rBiz,
                        mapCustomerStatusToCloud(rStatusDesktop), rid, colId, remoteOrderIndex, rNotes
                ));

                CustomerEntity cust = existingById.orElse(new CustomerEntity(
                        cid, rName, doc, rPhone, rAltPhone, rAddr, rNeigh, rCity, rOcc, rBiz,
                        rNotes, rStatusDesktop, rid, colId, c.path("created_at").asText(now)
                ));
                cust.setFullName(rName);
                cust.setPhone(rPhone);
                cust.setAltPhone(rAltPhone);
                cust.setAddress(rAddr);
                cust.setNeighborhood(rNeigh);
                cust.setCity(rCity);
                cust.setOccupation(rOcc);
                cust.setBusinessName(rBiz);
                cust.setNotes(rNotes);
                cust.setStatus(rStatusDesktop);
                cust.setRouteId(rid);
                cust.setCollectorId(colId);
                if (!preserveLocalCustomerOrder || existingById.isEmpty()) {
                    cust.setOrderIndex(remoteOrderIndex);
                }
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
                String rawRemoteStatus = mapLoanStatusToDesktop(l.path("status").asText("ACTIVE"));
                String remoteStatus = renewedPreviousLoanIds.contains(lid) ? "RENOVADO" : rawRemoteStatus;
                String remoteFreq = mapFrequencyToDesktop(l.path("frequency").asText("DAILY"));
                String remoteStartDate = l.path("start_date").asText(LocalDate.now().toString());
                String remoteEndDate = l.path("end_date").isNull() ? null : l.path("end_date").asText(null);
                String remoteLoanNumber = l.path("loan_number").asText("").trim();
                String remoteNotes = l.path("notes").asText("");
                if (!remoteNotes.isBlank()) {
                    remoteLoanNotesById.put(lid, remoteNotes);
                }
                remoteLoanFingerprints.put(lid, loanFingerprintParts(
                        mapLoanStatusToCloud(rawRemoteStatus),
                        mapFrequencyToCloud(remoteFreq),
                        rid,
                        colId,
                        remoteStartDate,
                        remoteEndDate,
                        remoteLoanNumber,
                        bd(l.path("total_agreed"))
                ));

                Optional<LoanEntity> existingLoan = loanRepository.findById(lid);
                boolean remoteMigrated = isMigratedNotes(remoteNotes);
                String opType = remoteMigrated
                        ? "MIGRACION"
                        : existingLoan.map(LoanEntity::getOperationType)
                                .filter(t -> t != null && !t.isBlank())
                                .orElse(prevId != null ? "RENOVACION" : "NUEVO");

                LoanEntity loan = existingLoan.orElse(new LoanEntity(
                        lid, cid, rid, colId, prevId, opType,
                        bd(l.path("principal")), bd(l.path("interest_rate")), bd(l.path("interest_amount")),
                        bd(l.path("total_agreed")), l.path("installment_count").asInt(30),
                        remoteFreq,
                        remoteStartDate,
                        remoteEndDate,
                        remoteStatus,
                        l.path("created_at").asText(now)
                ));
                loan.setRouteId(rid);
                loan.setCollectorId(colId);
                if (remoteMigrated) {
                    loan.setOperationType("MIGRACION");
                }
                if (!remoteLoanNumber.isBlank()) {
                    loan.setLoanNumber(remoteLoanNumber);
                }
                // Fusión segura: no degradar localmente un crédito ya cerrado/anulado/renovado a ACTIVO por un remote viejo
                if (renewedPreviousLoanIds.contains(lid)) {
                    loan.setStatus("RENOVADO");
                } else if (resetLocalOperationalData || !isTerminalLoanStatus(loan.getStatus()) || isTerminalLoanStatus(remoteStatus)) {
                    loan.setStatus(remoteStatus);
                }
                loanRepository.save(loan);
            }
            loanRepository.flush();

            // 5. Cuotas (fusión monotónica segura salvo cuando hubo reverso remoto en el préstamo)
            Set<String> validInstIds = new HashSet<>();
            for (JsonNode i : remoteInstallments) {
                String iid = i.path("id").asText();
                String lid = i.path("loan_id").asText();
                if (iid.isBlank() || !validLoanIds.contains(lid)) continue;
                validInstIds.add(iid);

                BigDecimal remoteAmt = bd(i.path("amount"));
                BigDecimal remotePaid = bd(i.path("paid_amount"));
                String remoteInstStatus = mapInstallmentStatusToDesktop(i.path("status").asText("PENDIENTE"));
                String remoteDueDate = i.path("due_date").asText(LocalDate.now().toString());
                remoteInstallmentFingerprints.put(iid, installmentFingerprintParts(
                        remoteDueDate,
                        remoteAmt,
                        remotePaid,
                        mapInstallmentStatusToCloud(remoteInstStatus)
                ));

                Optional<InstallmentEntity> existingInst = installmentRepository.findById(iid);
                InstallmentEntity inst = existingInst.orElse(new InstallmentEntity(
                        iid, lid, i.path("installment_number").asInt(1),
                        remoteDueDate,
                        remoteAmt, remotePaid, remoteInstStatus
                ));

                if (renewedPreviousLoanIds.contains(lid)) {
                    // Invariante relacional: si existe una renovación que liquida este préstamo, sus cuotas siempre quedan PAGADAS
                    inst.setAmount(remoteAmt);
                    inst.setPaidAmount(remoteAmt);
                    inst.setStatus("PAGADA");
                } else if (resetLocalOperationalData || existingInst.isEmpty()) {
                    inst.setAmount(remoteAmt);
                    inst.setPaidAmount(remotePaid);
                    inst.setStatus(remoteInstStatus);
                } else {
                    // Si el préstamo local fue ANULADO, preservar el estado local ANULADA
                    boolean localCancelled = "ANULADA".equalsIgnoreCase(inst.getStatus());
                    if (!localCancelled) {
                        BigDecimal localPaid = inst.getPaidAmount() != null ? inst.getPaidAmount() : BigDecimal.ZERO;
                        if (loansWithRemoteReversal.contains(lid) || remotePaid.compareTo(localPaid) >= 0) {
                            inst.setAmount(remoteAmt);
                            inst.setPaidAmount(remotePaid);
                            inst.setStatus(remoteInstStatus);
                        }
                    }
                }
                installmentRepository.save(inst);
            }
            installmentRepository.flush();

            // 6. Pagos y Asignaciones (incluye propagación de anulaciones remotas)
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
                String createdAt = normalizeCloudTimestampToBogota(
                        p.path("local_created_at").asText(""),
                        p.path("created_at").asText(""),
                        now
                );
                String mappedStatus = mapPaymentStatusToDesktop(p.path("status").asText("COMPLETED"));

                validPaymentIds.add(pid);
                Optional<PaymentEntity> existingPay = paymentRepository.findById(pid)
                        .or(() -> paymentRepository.findByIdempotencyKey(idemKey));
                if (existingPay.isEmpty()) {
                    PaymentEntity pay = new PaymentEntity(
                            pid, idemKey, lid, cid, colId, null,
                            bd(p.path("amount_received")),
                            mapMethodToDesktop(p.path("payment_method").asText("CASH")),
                            mappedStatus,
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
                } else if ("ANULADO".equalsIgnoreCase(mappedStatus) && !"ANULADO".equalsIgnoreCase(existingPay.get().getStatus())) {
                    // Propagar anulación remota sobre un pago existente localmente
                    PaymentEntity existing = existingPay.get();
                    existing.setStatus("ANULADO");
                    paymentRepository.save(existing);
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
                    String createdAt = normalizeCloudTimestampToBogota(
                            r.path("local_created_at").asText(""),
                            r.path("created_at").asText(""),
                            now
                    );
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
                String createdAt = normalizeCloudTimestampToBogota(
                        cm.path("local_created_at").asText(""),
                        cm.path("created_at").asText(""),
                        now
                );

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

            // 8a. Conciliación idempotente de abonos previos en papel de cartulinas físicas migradas (Móvil -> Escritorio)
            // Móvil suma los abonos previos en papel de cada cartulina MIGRACION directamente dentro de Base en Caja
            // sin crear cash_movement en Supabase. Materializamos una fila local determinista `cm-mig-paper-<loanId>`
            // (nunca se reenvía a Supabase) para que Panel, Patrimonio & Caja y Liquidación coincidan al peso exacto.
            Map<String, BigDecimal> remotePrevBalByLoan = new HashMap<>();
            for (JsonNode r : remoteRenewals) {
                String prevId = r.path("previous_loan_id").asText("");
                if (!prevId.isBlank()) {
                    remotePrevBalByLoan.putIfAbsent(prevId, bd(r.path("previous_balance_deducted")));
                }
            }
            Map<String, BigDecimal> remotePendingByLoan = new HashMap<>();
            for (JsonNode i : remoteInstallments) {
                String lid = i.path("loan_id").asText("");
                if (!lid.isBlank()) {
                    BigDecimal remPend = bd(i.path("amount")).subtract(bd(i.path("paid_amount"))).max(BigDecimal.ZERO);
                    remotePendingByLoan.merge(lid, remPend, BigDecimal::add);
                }
            }
            Map<String, BigDecimal> remoteCompletedPayByLoan = new HashMap<>();
            for (JsonNode p : remotePayments) {
                if (!"REVERSED".equalsIgnoreCase(p.path("status").asText("COMPLETED"))) {
                    String lid = p.path("loan_id").asText("");
                    if (!lid.isBlank()) {
                        remoteCompletedPayByLoan.merge(lid, bd(p.path("amount_received")), BigDecimal::add);
                    }
                }
            }
            for (JsonNode l : sortedLoans) {
                String lid = l.path("id").asText("");
                if (lid.isBlank() || !validLoanIds.contains(lid)) continue;
                if (!isMigratedNotes(l.path("notes").asText(""))) continue;
                String st = renewedPreviousLoanIds.contains(lid)
                        ? "RENEWED"
                        : l.path("status").asText("ACTIVE").toUpperCase(Locale.ROOT);
                if ("CANCELLED".equals(st) || "ANULADO".equals(st)) continue;

                BigDecimal totalAgreed = bd(l.path("total_agreed"));
                BigDecimal totalCollected;
                if ("RENEWED".equals(st) || "RENOVADO".equals(st)) {
                    totalCollected = totalAgreed.subtract(remotePrevBalByLoan.getOrDefault(lid, BigDecimal.ZERO)).max(BigDecimal.ZERO);
                } else if ("PAID".equals(st) || "PAGADO".equals(st) || "FINALIZADO".equals(st)) {
                    totalCollected = totalAgreed;
                } else {
                    totalCollected = totalAgreed.subtract(remotePendingByLoan.getOrDefault(lid, BigDecimal.ZERO)).max(BigDecimal.ZERO);
                }
                BigDecimal inApp = remoteCompletedPayByLoan.getOrDefault(lid, BigDecimal.ZERO);
                BigDecimal preAppPaper = totalCollected.subtract(inApp).max(BigDecimal.ZERO);
                String migCmId = "cm-mig-paper-" + lid;
                Optional<CashMovementEntity> existingMigCm = cashMovementRepository.findById(migCmId);
                if (preAppPaper.signum() > 0) {
                    String rid = nullIfInvalid(l.path("route_id").asText(null), validRouteIds);
                    String colId = nullIfInvalid(l.path("collector_id").asText(null), validUserIds);
                    String startTs = l.path("start_date").asText(LocalDate.now().toString()) + "T00:00:00";
                    if (existingMigCm.isPresent()) {
                        CashMovementEntity cmEnt = existingMigCm.get();
                        cmEnt.setAmount(preAppPaper);
                        cmEnt.setRouteId(rid);
                        cashMovementRepository.save(cmEnt);
                    } else {
                        cashMovementRepository.save(new CashMovementEntity(
                                migCmId, rid, colId, null,
                                "ENTRADA", "COBRO_CARTULINA_MIGRADA", preAppPaper, lid,
                                "Abonos previos en cartulina física migrada (" + l.path("loan_number").asText(lid) + ")",
                                startTs
                        ));
                    }
                } else if (existingMigCm.isPresent()) {
                    cashMovementRepository.delete(existingMigCm.get());
                }
            }

            // 8b. Liquidaciones Diarias Selladas desde la nube (inmutables, idempotentes)
            if (dailySettlementRepository != null && collectionSessionRepository != null && !remoteSettlementRows.isEmpty()) {
                for (JsonNode s : remoteSettlementRows) {
                    String sid = s.path("id").asText("");
                    if (sid.isBlank() || dailySettlementRepository.findById(sid).isPresent()) continue;
                    JsonNode payload = s.path("payload");
                    String rid = nullIfInvalid(s.path("route_id").asText(null), validRouteIds);
                    if (rid == null && !validRouteIds.isEmpty()) {
                        rid = validRouteIds.iterator().next();
                    }
                    String colId = nullIfInvalid(s.path("collector_id").asText(null), validUserIds);
                    if (colId == null) colId = fallbackUserId;
                    if (rid == null || colId == null) continue;

                    String settleDate = s.path("settlement_date").asText(payload.path("date").asText(LocalDate.now().toString()));
                    String rawSesId = s.path("session_id").asText(payload.path("sessionId").asText(""));
                    String sessionId = rawSesId.isBlank() ? ("ses-cloud-" + sid) : rawSesId;
                    if (dailySettlementRepository.findBySessionId(sessionId).isPresent()) continue;

                    BigDecimal expectedCol = bd(payload.path("expectedCollection"));
                    BigDecimal actualCol = bd(payload.path("actualCollection"));
                    BigDecimal cashDiff = bd(payload.path("cashDifference"));
                    String settledAt = normalizeCloudTimestampToBogota("", s.path("settled_at").asText(""), now);
                    String statusLabel = "SETTLED".equalsIgnoreCase(s.path("status").asText("SETTLED"))
                            ? "LIQUIDADA" : s.path("status").asText("LIQUIDADA");

                    if (collectionSessionRepository.findById(sessionId).isEmpty()) {
                        collectionSessionRepository.saveAndFlush(new CollectionSessionEntity(
                                sessionId, rid, colId, settleDate, settledAt, settledAt,
                                "CERRADA", expectedCol, actualCol,
                                "Liquidación sincronizada desde la nube"
                        ));
                    }
                    dailySettlementRepository.save(new DailySettlementEntity(
                            sid, sessionId, expectedCol, actualCol, cashDiff,
                            "Sincronizada desde la nube (" + settleDate + ")",
                            statusLabel, settledAt
                    ));
                }
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

            // 10. Guardar metadatos, políticas, base diaria y promesas de la oficina vinculada
            saveSetting(OfficeLicensingService.KEY_OFFICE_ID, office.id(), now);
            saveSetting(OfficeLicensingService.KEY_ACTIVATION_CODE, office.activationCode() == null ? "" : office.activationCode(), now);
            saveSetting(OfficeLicensingService.KEY_LICENSE_STATUS, office.licenseStatus(), now);
            saveSetting(OfficeLicensingService.KEY_LICENSE_PLAN, office.licensePlan(), now);
            saveSetting(OfficeLicensingService.KEY_LICENSE_EXPIRES_AT, office.licenseExpiresAt() == null ? "" : office.licenseExpiresAt(), now);
            saveSetting("company_name", office.companyName(), now);
            saveSetting("office.company_name", office.companyName(), now);
            if (office.city() != null && !office.city().isBlank()) {
                saveSetting("company_city", office.city(), now);
            }
            if (office.supportPhone() != null && !office.supportPhone().isBlank()) {
                saveSetting("company_phone", office.supportPhone(), now);
            }
            if (officeSettingsOpt.isPresent()) {
                boolean preserveLocalPolicies = !resetLocalOperationalData && isSettingFlagTrue(KEY_SETTINGS_LOCAL_DIRTY);
                mergeRemoteOfficeSettingsIntoLocal(officeSettingsOpt.get(), preserveLocalPolicies, validCustomerIds, validLoanIds, now);
            }
            saveSetting("office_setup_completed", "true", now);
        });

        return new RemotePullContext(
                remoteUserPhones,
                remoteRouteCodes,
                remotePayIdByIdem,
                remoteRouteIds,
                remoteCustomerIds,
                remoteCustomerFingerprints,
                remoteLoanFingerprints,
                remoteLoanNotesById,
                remoteInstallmentFingerprints,
                remotePaymentIds,
                remoteReversedPaymentIds,
                remoteRenewalIds,
                remoteCashIds,
                remoteSettlementIds,
                officeSettingsOpt.orElse(null)
        );
    }

    private void pushLocalChangesToCloud(String url, String key, String officeId, RemotePullContext pullCtx) throws Exception {
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
            if (uname.isBlank() || uname.contains("_legacy_") || uname.contains("_old_")) continue;
            String role = authService != null ? authService.resolveRole(u) : deriveUserRoleForCloud(u);
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", u.getId());
            n.put("office_id", officeId);
            n.put("name", u.getFullName() == null || u.getFullName().isBlank() ? uname : u.getFullName());
            n.put("username", uname);
            n.put("password_hash", u.getPasswordHash() == null ? "" : u.getPasswordHash());
            n.put("role", role);
            n.put("phone", pullCtx.userPhonesById().getOrDefault(u.getId(), ""));
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

        // 2. Rutas (preservando el código remoto existente cuando existe)
        List<ObjectNode> routeRows = new ArrayList<>();
        for (RouteEntity r : allRoutes) {
            ObjectNode n = registryClient.createObjectNode();
            n.put("id", r.getId());
            n.put("office_id", officeId);
            n.put("name", r.getName());
            String existingCode = pullCtx.routeCodesById().getOrDefault(r.getId(), "");
            String fallbackCode = r.getName().length() >= 4 ? r.getName().substring(0, 4).toUpperCase() : r.getName().toUpperCase();
            n.put("code", existingCode.isBlank() ? fallbackCode : existingCode);
            if (r.getCollectorId() != null) n.put("collector_id", r.getCollectorId()); else n.putNull("collector_id");
            n.put("initial_cash_base", r.getInitialCashBase());
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
            n.put("order_index", c.getOrderIndex() != null ? c.getOrderIndex() : 0);
            n.put("status", mapCustomerStatusToCloud(c.getStatus()));
            n.put("notes", c.getNotes() == null ? "" : c.getNotes());
            n.put("updated_at", nowIso);
            custRows.add(n);
        }
        registryClient.upsertRowsBatch(url, key, "customers", custRows, false);
        clearSettingKey(KEY_CUSTOMER_ORDER_DIRTY);

        // 4. Préstamos + Hechos inmutables LOAN_DISBURSED (push selectivo: solo nuevos o modificados localmente)
        List<ObjectNode> loanRows = new ArrayList<>();
        Map<String, LoanEntity> loanMap = new HashMap<>();
        for (LoanEntity l : loanRepository.findAll()) {
            loanMap.put(l.getId(), l);
            String remoteFp = pullCtx.remoteLoanFingerprints().get(l.getId());
            boolean loanDirty = remoteFp == null || !remoteFp.equals(loanFingerprint(l));
            if (loanDirty) {
                ObjectNode n = registryClient.createObjectNode();
                n.put("id", l.getId());
                n.put("office_id", officeId);
                if (l.getRouteId() != null) n.put("route_id", l.getRouteId()); else n.putNull("route_id");
                n.put("customer_id", l.getCustomerId());
                if (l.getCollectorId() != null) n.put("collector_id", l.getCollectorId()); else n.putNull("collector_id");
                String cloudLoanNumber = (l.getLoanNumber() != null && !l.getLoanNumber().isBlank())
                        ? l.getLoanNumber()
                        : "#" + l.getId().substring(Math.max(0, l.getId().length() - 5));
                n.put("loan_number", cloudLoanNumber);
                n.put("principal", l.getPrincipal());
                n.put("interest_rate", l.getInterestRate());
                n.put("interest_amount", l.getInterestAmount());
                n.put("total_agreed", l.getTotalAgreed());
                n.put("installment_count", l.getInstallmentCount());
                BigDecimal instAmt = l.getInstallmentCount() > 0
                        ? l.getTotalAgreed().divide(BigDecimal.valueOf(l.getInstallmentCount()), 0, RoundingMode.HALF_UP)
                        : l.getTotalAgreed();
                n.put("installment_amount", instAmt);
                String cloudFreq = mapFrequencyToCloud(l.getFrequency());
                n.put("frequency", cloudFreq);
                if ("FIXED_DATE".equals(cloudFreq)) {
                    String fixedDate = (l.getEndDate() != null && !l.getEndDate().isBlank()) ? l.getEndDate() : l.getStartDate();
                    if (fixedDate != null && !fixedDate.isBlank()) {
                        n.put("fixed_due_date", fixedDate);
                    }
                }
                n.put("start_date", l.getStartDate());
                if (l.getEndDate() != null) n.put("end_date", l.getEndDate()); else n.putNull("end_date");
                n.put("status", mapLoanStatusToCloud(l.getStatus()));
                if (l.getPreviousLoanId() != null) n.put("previous_loan_id", l.getPreviousLoanId()); else n.putNull("previous_loan_id");
                String existingNotes = pullCtx.remoteLoanNotesById().getOrDefault(l.getId(), "");
                if (!existingNotes.isBlank()) {
                    n.put("notes", existingNotes);
                } else if ("MIGRACION".equalsIgnoreCase(l.getOperationType())) {
                    n.put("notes", "Migrado de cartulina física a digital");
                }
                n.put("updated_at", nowIso);
                loanRows.add(n);
            }

            boolean isMigration = "MIGRACION".equalsIgnoreCase(l.getOperationType());
            if (l.getPreviousLoanId() == null && !isMigration
                    && !"ANULADO".equalsIgnoreCase(l.getStatus()) && !"CANCELLED".equalsIgnoreCase(l.getStatus())) {
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
        if (!loanRows.isEmpty()) {
            registryClient.upsertRowsBatch(url, key, "loans", loanRows, false);
        }

        // 5. Cuotas (push selectivo: solo nuevas o modificadas localmente; estados admitidos por chk_installments_status)
        List<ObjectNode> instRows = new ArrayList<>();
        for (InstallmentEntity i : installmentRepository.findAll()) {
            String remoteFp = pullCtx.remoteInstallmentFingerprints().get(i.getId());
            if (remoteFp != null && remoteFp.equals(installmentFingerprint(i))) {
                continue;
            }
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
            n.put("status", mapInstallmentStatusToCloud(i.getStatus()));
            n.put("updated_at", nowIso);
            instRows.add(n);
        }
        if (!instRows.isEmpty()) {
            registryClient.upsertRowsBatch(url, key, "installments", instRows, false);
        }

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

        // 7. Pagos + installments_breakdown (PaymentAllocation) + prevención de conflicto 409 por idempotency_key
        Map<String, List<PaymentAllocationEntity>> allocsByPayment = new HashMap<>();
        for (PaymentAllocationEntity alloc : allocationRepository.findAll()) {
            allocsByPayment.computeIfAbsent(alloc.getPaymentId(), k -> new ArrayList<>()).add(alloc);
        }

        List<ObjectNode> payRows = new ArrayList<>();
        for (PaymentEntity p : paymentRepository.findAll()) {
            String idemKey = p.getIdempotencyKey() != null && !p.getIdempotencyKey().isBlank() ? p.getIdempotencyKey() : p.getId();
            String remoteIdForIdem = pullCtx.paymentIdByIdempotencyKey().get(idemKey);
            // Si la nube ya tiene este pago bajo otro UUID (ej. importado por LAN), reutilizar el ID remoto para evitar HTTP 409
            String effectiveCloudId = (remoteIdForIdem != null && !remoteIdForIdem.isBlank()) ? remoteIdForIdem : p.getId();

            ObjectNode n = registryClient.createObjectNode();
            n.put("id", effectiveCloudId);
            n.put("office_id", officeId);
            n.put("idempotency_key", idemKey);
            n.put("loan_id", p.getLoanId());
            n.put("customer_id", p.getCustomerId());
            n.put("collector_id", p.getCollectorId());
            n.put("amount_received", p.getAmount());
            n.put("payment_method", mapMethodToCloud(p.getMethod()));
            n.put("status", mapPaymentStatusToCloud(p.getStatus()));
            n.put("local_created_at", p.getCreatedAt());
            var breakdownArr = n.putArray("installments_breakdown");
            for (PaymentAllocationEntity a : allocsByPayment.getOrDefault(p.getId(), List.of())) {
                ObjectNode item = breakdownArr.addObject();
                item.put("installmentId", a.getInstallmentId());
                item.put("amountApplied", a.getAmount());
            }
            payRows.add(n);

            LoanEntity loan = loanMap.get(p.getLoanId());
            boolean digital = !"CASH".equals(mapMethodToCloud(p.getMethod()));
            ObjectNode ev = registryClient.createObjectNode();
            ev.put("id", "evt-pay-" + effectiveCloudId);
            ev.put("office_id", officeId);
            ev.put("idempotency_key", "payment:" + idemKey);
            ev.put("event_type", "PAYMENT_RECEIVED");
            ev.put("entity_type", "PAYMENT");
            ev.put("entity_id", effectiveCloudId);
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
                rev.put("id", "evt-rev-" + effectiveCloudId);
                rev.put("office_id", officeId);
                rev.put("idempotency_key", "payment-reversal:" + effectiveCloudId);
                rev.put("event_type", "PAYMENT_REVERSED");
                rev.put("entity_type", "PAYMENT");
                rev.put("entity_id", effectiveCloudId);
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
        try {
            registryClient.upsertRowsBatch(url, key, "payments", payRows, false);
        } catch (Exception payBatchEx) {
            if (payBatchEx.getMessage() != null && payBatchEx.getMessage().contains("(409)")) {
                LOG.warn("Conflicto 409 en lote de pagos (probable pago LAN duplicado); aplicando upsert individual tolerante.");
                for (ObjectNode row : payRows) {
                    try {
                        registryClient.upsertRowsBatch(url, key, "payments", List.of(row), true);
                    } catch (Exception rowEx) {
                        LOG.warn("Pago omitido por conflicto remoto ({}): {}", row.path("id").asText(), rowEx.getMessage());
                    }
                }
            } else {
                throw payBatchEx;
            }
        }

        // 8. Movimientos de caja hechos en el escritorio (gastos, inyecciones, retiros, ajustes) + Hechos inmutables
        List<ObjectNode> cashRows = new ArrayList<>();
        for (CashMovementEntity cm : cashMovementRepository.findAll()) {
            if ("COBRO_CARTULINA_MIGRADA".equalsIgnoreCase(cm.getCategory())
                    || (cm.getId() != null && cm.getId().startsWith("cm-mig-paper-"))) {
                // Reconciliación local derivada de cartulinas migradas; no duplicar en Supabase
                continue;
            }
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

            boolean isNonPhysicalPayroll = "DESCUENTO_NOMINA_DESCUADRE".equalsIgnoreCase(cm.getCategory());
            if (!List.of("COLLECTION", "LOAN_DISBURSEMENT", "RENEWAL_DISBURSEMENT", "PAYMENT_REVERSAL").contains(cloudCat)) {
                String evType = switch (cloudCat) {
                    case "CAPITAL_INJECTION" -> "CAPITAL_INJECTED";
                    case "EXPENSE" -> "EXPENSE_RECORDED";
                    case "RECAUDO_OFICINA" -> "OFFICE_WITHDRAWAL";
                    case "RETIRO_PAPELERIA" -> "PAPERWORK_WITHDRAWAL";
                    case "LOAN_CANCELLATION" -> "LOAN_CANCELLED";
                    default -> "ADJUSTMENT_ENTRY";
                };
                BigDecimal signedCash = isNonPhysicalPayroll
                        ? BigDecimal.ZERO
                        : ("INCOME".equals(cloudType) ? cm.getAmount() : cm.getAmount().negate());
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

        // 8b. Liquidaciones diarias selladas localmente -> Supabase daily_settlements
        if (dailySettlementRepository != null && collectionSessionRepository != null) {
            List<DailySettlementEntity> localSettlements = dailySettlementRepository.findAll();
            if (!localSettlements.isEmpty()) {
                Map<String, CollectionSessionEntity> sessionById = new HashMap<>();
                for (CollectionSessionEntity ses : collectionSessionRepository.findAll()) {
                    sessionById.put(ses.getId(), ses);
                }
                List<ObjectNode> setRows = new ArrayList<>();
                for (DailySettlementEntity ds : localSettlements) {
                    CollectionSessionEntity ses = sessionById.get(ds.getSessionId());
                    ObjectNode n = registryClient.createObjectNode();
                    n.put("id", ds.getId());
                    n.put("office_id", officeId);
                    n.put("session_id", ds.getSessionId());
                    if (ses != null && ses.getRouteId() != null) n.put("route_id", ses.getRouteId()); else n.putNull("route_id");
                    if (ses != null && ses.getCollectorId() != null) n.put("collector_id", ses.getCollectorId()); else n.putNull("collector_id");
                    String settleDate = (ses != null && ses.getSessionDate() != null)
                            ? ses.getSessionDate()
                            : (ds.getSettledAt() != null && ds.getSettledAt().length() >= 10 ? ds.getSettledAt().substring(0, 10) : LocalDate.now().toString());
                    n.put("settlement_date", settleDate);
                    n.put("status", "SETTLED");
                    ObjectNode payload = n.putObject("payload");
                    payload.put("id", ds.getId());
                    payload.put("sessionId", ds.getSessionId());
                    payload.put("date", settleDate);
                    if (ses != null && ses.getRouteId() != null) payload.put("routeId", ses.getRouteId());
                    if (ses != null && ses.getCollectorId() != null) payload.put("collectorId", ses.getCollectorId());
                    payload.put("expectedCollection", ds.getExpectedCollection());
                    payload.put("actualCollection", ds.getActualCollection());
                    payload.put("cashDifference", ds.getCashDifference());
                    payload.put("status", "SETTLED");
                    payload.put("settledAt", ds.getSettledAt());
                    setRows.add(n);
                }
                try {
                    registryClient.upsertRowsBatch(url, key, "daily_settlements", setRows, true);
                } catch (Exception setEx) {
                    LOG.warn("No se pudieron subir liquidaciones locales a daily_settlements: {}", setEx.getMessage());
                }
            }
        }

        // 9. Publicar hechos financieros inmutables (append-only, idempotente)
        registryClient.upsertRowsBatch(url, key, "financial_events", eventRows, true);

        // 10. Sincronizar políticas, base diaria por ruta/fecha y promesas hacia offices.settings (preservando llaves remotas)
        if (isSettingFlagTrue(KEY_SETTINGS_LOCAL_DIRTY) || hasSettingsDivergenceToPush(pullCtx.remoteSettingsNode())) {
            try {
                ObjectNode mergedSettings = buildMergedOfficeSettings(pullCtx.remoteSettingsNode());
                registryClient.patchOfficeSettings(url, key, officeId, mergedSettings);
                clearSettingKey(KEY_SETTINGS_LOCAL_DIRTY);
            } catch (Exception settingsEx) {
                LOG.warn("No se pudo sincronizar offices.settings: {}", settingsEx.getMessage());
            }
        }
    }

    private void mergeRemoteOfficeSettingsIntoLocal(
            JsonNode s,
            boolean preserveLocalPolicies,
            Set<String> validCustomerIds,
            Set<String> validLoanIds,
            String now
    ) {
        if (s == null || !s.isObject()) return;

        if (!preserveLocalPolicies) {
            if (s.has("paperworkFeeEnabled") && s.path("paperworkFeeEnabled").isBoolean()) {
                saveSetting("paperwork_enabled", String.valueOf(s.path("paperworkFeeEnabled").asBoolean()), now);
            }
            if (s.has("paperworkRate") && s.path("paperworkRate").isNumber()) {
                BigDecimal rate = new BigDecimal(s.path("paperworkRate").asText("5000"));
                BigDecimal feePer100k = rate.compareTo(BigDecimal.ONE) <= 0
                        ? rate.multiply(new BigDecimal("100000")).setScale(0, RoundingMode.HALF_UP)
                        : rate.setScale(0, RoundingMode.HALF_UP);
                saveSetting("paperwork_fee", feePer100k.toPlainString(), now);
            }
            if (s.has("defaultInterestRate") && s.path("defaultInterestRate").isNumber()) {
                BigDecimal rate = new BigDecimal(s.path("defaultInterestRate").asText("0.20"));
                BigDecimal pct = rate.compareTo(BigDecimal.ONE) <= 0
                        ? rate.multiply(new BigDecimal("100")).stripTrailingZeros()
                        : rate.stripTrailingZeros();
                saveSetting("default_interest_percent", pct.toPlainString(), now);
            }
            if (s.has("defaultInstallmentsCount") && s.path("defaultInstallmentsCount").isNumber()) {
                saveSetting("default_installments_count", String.valueOf(s.path("defaultInstallmentsCount").asInt(30)), now);
            }
            if (s.has("excludeSundays") && s.path("excludeSundays").isBoolean()) {
                saveSetting("exclude_sundays", String.valueOf(s.path("excludeSundays").asBoolean()), now);
            }
            if (s.has("allowRouteNewLoans") && s.path("allowRouteNewLoans").isBoolean()) {
                saveSetting("route_allow_new_loans", String.valueOf(s.path("allowRouteNewLoans").asBoolean()), now);
            }
            if (s.has("allowCollectorExpenses") && s.path("allowCollectorExpenses").isBoolean()) {
                saveSetting("route_allow_expenses", String.valueOf(s.path("allowCollectorExpenses").asBoolean()), now);
            }
            if (s.has("allowRouteReorder") && s.path("allowRouteReorder").isBoolean()) {
                saveSetting("route_allow_reorder", String.valueOf(s.path("allowRouteReorder").asBoolean()), now);
            }
            if (s.has("allowPartialPayments") && s.path("allowPartialPayments").isBoolean()) {
                saveSetting("route_allow_partial_payments", String.valueOf(s.path("allowPartialPayments").asBoolean()), now);
            }
            if (s.has("maxNewLoanLimit") && s.path("maxNewLoanLimit").isNumber()) {
                BigDecimal limit = new BigDecimal(s.path("maxNewLoanLimit").asText("2000000")).setScale(0, RoundingMode.HALF_UP);
                saveSetting("max_new_loan_amount", limit.toPlainString(), now);
            }
        }

        // Base de inicio diaria por ruta/fecha (<routeId>::<YYYY-MM-DD>) con fusión por timestamp más reciente
        JsonNode remoteBaseMap = s.path("dailyOpeningBaseByRouteDate");
        JsonNode remoteMetaMap = s.path("dailyOpeningBaseMeta");
        if (remoteBaseMap.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = remoteBaseMap.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> entry = fields.next();
                String routeDateKey = entry.getKey();
                if (routeDateKey == null || !routeDateKey.contains("::") || !entry.getValue().isNumber()) {
                    continue;
                }
                BigDecimal remoteVal = new BigDecimal(entry.getValue().asText("0")).setScale(0, RoundingMode.HALF_UP).max(BigDecimal.ZERO);
                String remoteUpdatedAt = "";
                if (remoteMetaMap.isObject() && remoteMetaMap.has(routeDateKey)) {
                    JsonNode metaItem = remoteMetaMap.path(routeDateKey);
                    if (metaItem.isObject()) {
                        remoteUpdatedAt = metaItem.path("updatedAt").asText("");
                    }
                }
                String localValKey = SettlementUseCase.KEY_OPENING_BASE_PREFIX + routeDateKey;
                String localMetaKey = SettlementUseCase.KEY_OPENING_BASE_META_PREFIX + routeDateKey;
                String localUpdatedAt = settingRepository.findById(localMetaKey)
                        .map(SystemSettingEntity::getSettingValue).orElse("");
                boolean localExists = settingRepository.findById(localValKey).isPresent();

                if (!localExists || compareIsoTimestamps(remoteUpdatedAt, localUpdatedAt) >= 0) {
                    saveSetting(localValKey, remoteVal.toPlainString(), now);
                    if (!remoteUpdatedAt.isBlank()) {
                        saveSetting(localMetaKey, remoteUpdatedAt, now);
                    }
                }
            }
        }

        // Promesas de pago sincronizadas de forma compacta en offices.settings.desktopPromises
        JsonNode remotePromises = s.path("desktopPromises");
        if (paymentPromiseRepository != null && remotePromises.isArray()) {
            for (JsonNode pr : remotePromises) {
                String id = pr.path("id").asText("").trim();
                String cid = pr.path("customerId").asText("").trim();
                String lid = pr.path("loanId").asText("").trim();
                String promisedDate = pr.path("promisedDate").asText("").trim();
                if (id.isBlank() || cid.isBlank() || promisedDate.isBlank()) continue;
                if (!validCustomerIds.contains(cid)) continue;
                if (!lid.isBlank() && !validLoanIds.contains(lid)) continue;

                BigDecimal amt = bd(pr.path("amount"));
                String status = pr.path("status").asText("PENDIENTE").trim().toUpperCase(Locale.ROOT);
                String notes = pr.path("notes").asText("");
                String createdAt = pr.path("createdAt").asText(now);

                Optional<PaymentPromiseEntity> existing = paymentPromiseRepository.findById(id);
                if (existing.isEmpty()) {
                    paymentPromiseRepository.save(new PaymentPromiseEntity(
                            id, cid, lid.isBlank() ? null : lid, amt, promisedDate, status, notes, createdAt
                    ));
                } else if ("PENDIENTE".equalsIgnoreCase(existing.get().getStatus())
                        && ("CUMPLIDA".equalsIgnoreCase(status) || "CANCELADA".equalsIgnoreCase(status))) {
                    PaymentPromiseEntity ent = existing.get();
                    ent.setStatus(status);
                    paymentPromiseRepository.save(ent);
                }
            }
        }
    }

    private boolean hasSettingsDivergenceToPush(JsonNode remoteSettings) {
        ObjectNode merged = buildMergedOfficeSettings(remoteSettings);
        ObjectNode baseline = (remoteSettings != null && remoteSettings.isObject())
                ? (ObjectNode) remoteSettings.deepCopy()
                : registryClient.createObjectNode();
        return !jsonSemanticallyEqual(merged, baseline);
    }

    private static boolean jsonSemanticallyEqual(JsonNode a, JsonNode b) {
        if (a == b) return true;
        if (a == null || b == null) return false;
        if (a.isNumber() && b.isNumber()) {
            try {
                return a.decimalValue().compareTo(b.decimalValue()) == 0;
            } catch (Exception ex) {
                return a.asText().equals(b.asText());
            }
        }
        if (a.isObject() && b.isObject()) {
            if (a.size() != b.size()) return false;
            Iterator<Map.Entry<String, JsonNode>> it = a.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!b.has(e.getKey()) || !jsonSemanticallyEqual(e.getValue(), b.get(e.getKey()))) {
                    return false;
                }
            }
            return true;
        }
        if (a.isArray() && b.isArray()) {
            if (a.size() != b.size()) return false;
            for (int i = 0; i < a.size(); i++) {
                if (!jsonSemanticallyEqual(a.get(i), b.get(i))) return false;
            }
            return true;
        }
        return a.equals(b);
    }

    ObjectNode buildMergedOfficeSettings(JsonNode remoteSettings) {
        ObjectNode out = (remoteSettings != null && remoteSettings.isObject())
                ? (ObjectNode) remoteSettings.deepCopy()
                : registryClient.createObjectNode();

        Map<String, String> localSettings = new HashMap<>();
        for (SystemSettingEntity s : settingRepository.findAll()) {
            if (s.getSettingKey() != null && s.getSettingValue() != null) {
                localSettings.put(s.getSettingKey(), s.getSettingValue());
            }
        }

        if (localSettings.containsKey("paperwork_enabled")) {
            out.put("paperworkFeeEnabled", "true".equalsIgnoreCase(localSettings.get("paperwork_enabled")));
        }
        if (localSettings.containsKey("paperwork_fee")) {
            try {
                BigDecimal fee = new BigDecimal(localSettings.get("paperwork_fee").trim()).setScale(0, RoundingMode.HALF_UP);
                out.put("paperworkRate", fee.longValue());
            } catch (Exception ignored) {}
        }
        if (localSettings.containsKey("default_interest_percent")) {
            try {
                BigDecimal pct = new BigDecimal(localSettings.get("default_interest_percent").trim());
                BigDecimal decimal = pct.compareTo(BigDecimal.ONE) > 0
                        ? pct.divide(new BigDecimal("100"), 4, RoundingMode.HALF_UP).stripTrailingZeros()
                        : pct.stripTrailingZeros();
                out.put("defaultInterestRate", decimal.doubleValue());
            } catch (Exception ignored) {}
        }
        if (localSettings.containsKey("default_installments_count")) {
            try {
                out.put("defaultInstallmentsCount", Integer.parseInt(localSettings.get("default_installments_count").trim()));
            } catch (Exception ignored) {}
        }
        if (localSettings.containsKey("exclude_sundays")) {
            out.put("excludeSundays", !"false".equalsIgnoreCase(localSettings.get("exclude_sundays")));
        }
        if (localSettings.containsKey("route_allow_new_loans")) {
            out.put("allowRouteNewLoans", !"false".equalsIgnoreCase(localSettings.get("route_allow_new_loans")));
        }
        if (localSettings.containsKey("route_allow_expenses")) {
            out.put("allowCollectorExpenses", !"false".equalsIgnoreCase(localSettings.get("route_allow_expenses")));
        }
        if (localSettings.containsKey("route_allow_reorder")) {
            out.put("allowRouteReorder", "true".equalsIgnoreCase(localSettings.get("route_allow_reorder")));
        }
        if (localSettings.containsKey("route_allow_partial_payments")) {
            out.put("allowPartialPayments", !"false".equalsIgnoreCase(localSettings.get("route_allow_partial_payments")));
        }
        if (localSettings.containsKey("max_new_loan_amount")) {
            try {
                BigDecimal limit = new BigDecimal(localSettings.get("max_new_loan_amount").trim()).setScale(0, RoundingMode.HALF_UP);
                out.put("maxNewLoanLimit", limit.longValue());
            } catch (Exception ignored) {}
        }

        // Fusionar bases de inicio diarias (<routeId>::<YYYY-MM-DD>) con resolución por timestamp
        boolean hasLocalOpeningBases = localSettings.keySet().stream()
                .anyMatch(k -> k.startsWith(SettlementUseCase.KEY_OPENING_BASE_PREFIX));
        if (hasLocalOpeningBases) {
            ObjectNode baseMap = out.has("dailyOpeningBaseByRouteDate") && out.path("dailyOpeningBaseByRouteDate").isObject()
                    ? (ObjectNode) out.path("dailyOpeningBaseByRouteDate")
                    : out.putObject("dailyOpeningBaseByRouteDate");
            ObjectNode metaMap = out.has("dailyOpeningBaseMeta") && out.path("dailyOpeningBaseMeta").isObject()
                    ? (ObjectNode) out.path("dailyOpeningBaseMeta")
                    : out.putObject("dailyOpeningBaseMeta");

            for (Map.Entry<String, String> e : localSettings.entrySet()) {
                if (!e.getKey().startsWith(SettlementUseCase.KEY_OPENING_BASE_PREFIX)) continue;
                String suffix = e.getKey().substring(SettlementUseCase.KEY_OPENING_BASE_PREFIX.length());
                if (!suffix.contains("::")) continue;
                BigDecimal localAmt;
                try {
                    localAmt = new BigDecimal(e.getValue().trim()).setScale(0, RoundingMode.HALF_UP).max(BigDecimal.ZERO);
                } catch (Exception ex) {
                    continue;
                }
                String localTs = localSettings.getOrDefault(SettlementUseCase.KEY_OPENING_BASE_META_PREFIX + suffix, "");
                String remoteTs = metaMap.has(suffix) && metaMap.path(suffix).isObject()
                        ? metaMap.path(suffix).path("updatedAt").asText("") : "";
                if (!baseMap.has(suffix) || compareIsoTimestamps(localTs, remoteTs) > 0) {
                    baseMap.put(suffix, localAmt.longValue());
                    if (!localTs.isBlank()) {
                        ObjectNode metaNode = metaMap.putObject(suffix);
                        metaNode.put("amount", localAmt.longValue());
                        metaNode.put("updatedAt", localTs);
                    }
                }
            }
        }

        // Sincronizar promesas locales en desktopPromises solo si existen promesas locales o remotas
        if (paymentPromiseRepository != null) {
            List<PaymentPromiseEntity> localPromises = paymentPromiseRepository.findAll();
            boolean remoteHadPromises = out.has("desktopPromises") && out.path("desktopPromises").isArray() && !out.path("desktopPromises").isEmpty();
            if (!localPromises.isEmpty() || remoteHadPromises) {
                localPromises.sort(Comparator.comparing(PaymentPromiseEntity::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())));
                int cap = Math.min(localPromises.size(), 500);
                ArrayNode arr = out.putArray("desktopPromises");
                for (int i = 0; i < cap; i++) {
                    PaymentPromiseEntity pr = localPromises.get(i);
                    ObjectNode node = arr.addObject();
                    node.put("id", pr.getId());
                    node.put("customerId", pr.getCustomerId());
                    if (pr.getLoanId() != null) node.put("loanId", pr.getLoanId()); else node.putNull("loanId");
                    node.put("amount", pr.getAmount() != null ? pr.getAmount().setScale(0, RoundingMode.HALF_UP).longValue() : 0L);
                    node.put("promisedDate", pr.getPromisedDate() == null ? "" : pr.getPromisedDate());
                    node.put("status", pr.getStatus() == null ? "PENDIENTE" : pr.getStatus());
                    node.put("notes", pr.getNotes() == null ? "" : pr.getNotes());
                    node.put("createdAt", pr.getCreatedAt() == null ? "" : pr.getCreatedAt());
                }
            }
        }

        return out;
    }

    private static int compareIsoTimestamps(String a, String b) {
        boolean aEmpty = a == null || a.isBlank();
        boolean bEmpty = b == null || b.isBlank();
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return -1;
        if (bEmpty) return 1;
        try {
            return Instant.parse(a.trim()).compareTo(Instant.parse(b.trim()));
        } catch (Exception ignored) {
            return a.trim().compareTo(b.trim());
        }
    }

    private void clearMutableOperationalTables() {
        // Borrado en orden topológico estricto respetando PRAGMA foreign_keys = ON para aislamiento multi-tenant
        jdbcTemplate.execute("DELETE FROM customer_attachment");
        jdbcTemplate.execute("DELETE FROM payment_allocation");
        jdbcTemplate.execute("DELETE FROM payment");
        jdbcTemplate.execute("DELETE FROM renewal");
        jdbcTemplate.execute("DELETE FROM cash_movement");
        jdbcTemplate.execute("DELETE FROM daily_settlement");
        jdbcTemplate.execute("DELETE FROM weekly_settlement");
        jdbcTemplate.execute("DELETE FROM collection_session");
        jdbcTemplate.execute("DELETE FROM payment_promise");
        jdbcTemplate.execute("DELETE FROM delinquency_record");
        jdbcTemplate.execute("DELETE FROM installment");
        jdbcTemplate.execute("DELETE FROM loan");
        jdbcTemplate.execute("DELETE FROM customer_reference");
        jdbcTemplate.execute("DELETE FROM customer");
        jdbcTemplate.execute("DELETE FROM route");
        jdbcTemplate.execute("DELETE FROM user_role");
        jdbcTemplate.execute("DELETE FROM audit_log");
        jdbcTemplate.execute("DELETE FROM app_user");
        jdbcTemplate.execute(
                "DELETE FROM system_setting WHERE setting_key IN ("
                        + "'company_name','company_city','company_phone','office.company_name',"
                        + "'default_interest_percent','default_installments_count','paperwork_enabled','paperwork_fee','max_new_loan_amount',"
                        + "'exclude_sundays','route_allow_new_loans','route_allow_expenses','route_allow_reorder',"
                        + "'route_allow_partial_payments','sync.settings_local_dirty','sync.customer_order_dirty') "
                        + "OR setting_key LIKE 'opening_base::%' OR setting_key LIKE 'opening_base_meta::%'"
        );
    }

    private static boolean isTerminalLoanStatus(String status) {
        if (status == null) return false;
        String s = status.trim().toUpperCase();
        return "RENOVADO".equals(s) || "RENEWED".equals(s)
                || "PAGADO".equals(s) || "FINALIZADO".equals(s) || "COMPLETADO".equals(s) || "PAID".equals(s)
                || "ANULADO".equals(s) || "CANCELLED".equals(s);
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

    static boolean isMigratedNotes(String notes) {
        if (notes == null || notes.isBlank()) return false;
        String normalized = Normalizer.normalize(notes.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT);
        return normalized.startsWith("migrado de cartulina");
    }

    static String normalizeCloudTimestampToBogota(String localCreatedAt, String createdAt, String fallback) {
        String candidate = (localCreatedAt != null && !localCreatedAt.isBlank())
                ? localCreatedAt.trim()
                : (createdAt != null && !createdAt.isBlank() ? createdAt.trim() : "");
        if (candidate.isBlank()) return fallback;
        // Si tiene indicador de zona horaria (ej. +00:00 o Z), convertir a hora local America/Bogota
        if (candidate.endsWith("Z") || candidate.matches(".*[+-]\\d{2}:?\\d{2}$")) {
            try {
                OffsetDateTime odt = OffsetDateTime.parse(candidate);
                return odt.atZoneSameInstant(BOGOTA_ZONE).toLocalDateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            } catch (Exception ignored) {
                try {
                    Instant inst = Instant.parse(candidate);
                    return inst.atZone(BOGOTA_ZONE).toLocalDateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
                } catch (Exception ignored2) {}
            }
        }
        return candidate;
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
        if (s == null) return "ACTIVO";
        String u = s.trim().toUpperCase();
        if ("INACTIVE".equals(u) || "INACTIVO".equals(u)) return "INACTIVO";
        if ("BLOCKED".equals(u) || "BLOQUEADO".equals(u)) return "BLOQUEADO";
        return "ACTIVO";
    }

    static String mapCustomerStatusToCloud(String s) {
        if (s == null) return "ACTIVE";
        String u = s.trim().toUpperCase();
        if ("INACTIVO".equals(u) || "INACTIVE".equals(u)) return "INACTIVE";
        if ("BLOQUEADO".equals(u) || "BLOCKED".equals(u)) return "BLOCKED";
        return "ACTIVE";
    }

    static String mapLoanStatusToDesktop(String s) {
        if (s == null) return "ACTIVO";
        return switch (s.trim().toUpperCase()) {
            case "ACTIVE", "ACTIVO" -> "ACTIVO";
            case "RENEWED", "RENOVADO" -> "RENOVADO";
            case "PAID", "PAGADO", "CANCELADO", "FINALIZADO", "COMPLETADO" -> "FINALIZADO";
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
            case "PAGADO", "CANCELADO", "FINALIZADO", "COMPLETADO", "PAID" -> "PAID";
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
            case "FIXED_DATE", "FECHA_FIJA", "FECHA FIJA" -> "FECHA FIJA";
            default -> "DIARIO";
        };
    }

    static String mapFrequencyToCloud(String f) {
        if (f == null) return "DAILY";
        return switch (f.trim().toUpperCase()) {
            case "SEMANAL", "WEEKLY" -> "WEEKLY";
            case "QUINCENAL", "BIWEEKLY" -> "BIWEEKLY";
            case "MENSUAL", "MONTHLY" -> "MONTHLY";
            case "FECHA FIJA", "FECHA_FIJA", "FIXED_DATE" -> "FIXED_DATE";
            default -> "DAILY";
        };
    }

    static String mapInstallmentStatusToDesktop(String s) {
        if (s == null) return "PENDIENTE";
        return switch (s.trim().toUpperCase()) {
            case "ADELANTADA" -> "ADELANTADA";
            case "PAGADA", "PAID" -> "PAGADA";
            case "PARTIAL", "PARCIAL" -> "PARCIAL";
            case "OVERDUE", "VENCIDA" -> "VENCIDA";
            case "ANULADA" -> "ANULADA";
            default -> "PENDIENTE";
        };
    }

    static String mapInstallmentStatusToCloud(String s) {
        if (s == null) return "PENDIENTE";
        return switch (s.trim().toUpperCase()) {
            case "PAGADA", "PAID" -> "PAGADA";
            case "ADELANTADA" -> "ADELANTADA";
            case "PARTIAL", "PARCIAL" -> "PARCIAL";
            case "OVERDUE", "VENCIDA" -> "VENCIDA";
            // chk_installments_status en Supabase no admite "ANULADA"; el préstamo padre viaja como CANCELLED
            case "ANULADA" -> "PENDIENTE";
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
            case "REVERSED", "REVERTIDO", "ANULADO" -> "ANULADO";
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
        if (id.startsWith("usr-adm") || "admin".equals(un) || "administrador".equals(un)) return "ADMIN";
        if (id.startsWith("usr-sup") || "supervisor".equals(un)) return "SUPERVISOR";
        return "COBRADOR";
    }

    static String mapCashCategoryToCloud(String cat) {
        if (cat == null) return "ADJUSTMENT";
        String u = cat.trim().toUpperCase();
        if (u.startsWith("GASTO_")) {
            return "EXPENSE";
        }
        return switch (u) {
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
