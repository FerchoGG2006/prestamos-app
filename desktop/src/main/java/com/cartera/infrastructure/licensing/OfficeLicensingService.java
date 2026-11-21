package com.cartera.infrastructure.licensing;

import com.cartera.infrastructure.backup.DatabaseBackupService;
import com.cartera.infrastructure.licensing.SupabaseRegistryClient.RemoteOffice;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import com.cartera.infrastructure.security.PasswordHasher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Servicio comercial de registro de oficinas, códigos de activación, control de licencias
 * y vinculación segura de instalaciones de escritorio.
 */
@Service
public class OfficeLicensingService {

    public static final String KEY_OFFICE_ID = "office.id";
    public static final String KEY_ACTIVATION_CODE = "office.activation_code";
    public static final String KEY_LICENSE_STATUS = "office.license_status";
    public static final String KEY_LICENSE_PLAN = "office.license_plan";
    public static final String KEY_LICENSE_EXPIRES_AT = "office.license_expires_at";
    public static final String KEY_SUPABASE_URL = "cloud.supabase_url";
    public static final String KEY_SUPABASE_KEY = "cloud.supabase_anon_key";
    public static final String KEY_VENDOR_SECRET_KEY = "cloud.vendor_secret_key";
    public static final String KEY_CLOUD_SESSION_TOKEN = "cloud.session_token";
    public static final String KEY_VENDOR_MASTER_PIN_HASH = "vendor.master_pin_hash";

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final SystemSettingRepository settingRepository;
    private final AuditLogRepository auditLogRepository;
    private final SupabaseRegistryClient registryClient;
    private final DatabaseBackupService backupService;
    private final String defaultCloudUrl;
    private final String defaultCloudKey;

    @org.springframework.beans.factory.annotation.Autowired
    public OfficeLicensingService(
            SystemSettingRepository settingRepository,
            AuditLogRepository auditLogRepository,
            SupabaseRegistryClient registryClient,
            DatabaseBackupService backupService,
            @org.springframework.beans.factory.annotation.Value("${cartera.cloud.url:}") String defaultCloudUrl,
            @org.springframework.beans.factory.annotation.Value("${cartera.cloud.anon-key:}") String defaultCloudKey
    ) {
        this.settingRepository = settingRepository;
        this.auditLogRepository = auditLogRepository;
        this.registryClient = registryClient;
        this.backupService = backupService;
        this.defaultCloudUrl = defaultCloudUrl == null ? "" : defaultCloudUrl.trim();
        this.defaultCloudKey = defaultCloudKey == null ? "" : defaultCloudKey.trim();
    }

    public OfficeLicensingService(
            SystemSettingRepository settingRepository,
            AuditLogRepository auditLogRepository,
            SupabaseRegistryClient registryClient,
            DatabaseBackupService backupService
    ) {
        this(settingRepository, auditLogRepository, registryClient, backupService, "", "");
    }

    public String generateImmutableOfficeId() {
        return "off-" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    public String generateActivationCode() {
        return "KRD-" + randomBlock(4) + "-" + randomBlock(4);
    }

    private static String randomBlock(int len) {
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    public String getSupabaseUrl() {
        return settingRepository.findById(KEY_SUPABASE_URL)
                .map(SystemSettingEntity::getSettingValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(defaultCloudUrl);
    }

    public String getSupabaseKey() {
        return settingRepository.findById(KEY_SUPABASE_KEY)
                .map(SystemSettingEntity::getSettingValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(defaultCloudKey);
    }

    public String getVendorSecretKey() {
        return settingRepository.findById(KEY_VENDOR_SECRET_KEY)
                .map(SystemSettingEntity::getSettingValue)
                .orElse("");
    }

    public String getSavedCloudSessionToken() {
        return settingRepository.findById(KEY_CLOUD_SESSION_TOKEN)
                .map(SystemSettingEntity::getSettingValue)
                .orElse("");
    }

    @Transactional
    public void saveCloudSessionToken(String token) {
        saveSetting(KEY_CLOUD_SESSION_TOKEN, token == null ? "" : token.trim());
    }

    @Transactional
    public void saveCloudConnection(String url, String anonKey) {
        saveSetting(KEY_SUPABASE_URL, url == null ? "" : url.trim());
        saveSetting(KEY_SUPABASE_KEY, anonKey == null ? "" : anonKey.trim());
    }

    @Transactional
    public void saveCloudConnection(String url, String anonKey, String vendorSecret) {
        saveCloudConnection(url, anonKey);
        if (vendorSecret != null && !vendorSecret.isBlank()) {
            saveSetting(KEY_VENDOR_SECRET_KEY, vendorSecret.trim());
            registryClient.setVendorSecretKey(vendorSecret.trim());
        }
    }

    private void applyVendorKey() {
        String vk = getVendorSecretKey();
        if (!vk.isBlank()) {
            registryClient.setVendorSecretKey(vk);
        }
    }

    public boolean hasVendorPinConfigured() {
        return settingRepository.findById(KEY_VENDOR_MASTER_PIN_HASH)
                .map(s -> s.getSettingValue() != null && !s.getSettingValue().isBlank())
                .orElse(false);
    }

    @Transactional
    public void configureVendorPin(String rawPin) {
        if (rawPin == null || rawPin.trim().length() < 4) {
            throw new IllegalArgumentException("El PIN de vendedor debe tener al menos 4 caracteres.");
        }
        saveSetting(KEY_VENDOR_MASTER_PIN_HASH, PasswordHasher.hash(rawPin.trim()));
    }

    public boolean verifyVendorPin(String rawPin) {
        if (rawPin == null || rawPin.isBlank()) return false;
        return settingRepository.findById(KEY_VENDOR_MASTER_PIN_HASH)
                .map(s -> PasswordHasher.verify(rawPin.trim(), s.getSettingValue()))
                .orElse(false);
    }

    public Optional<String> getLinkedOfficeId() {
        return settingRepository.findById(KEY_OFFICE_ID)
                .map(SystemSettingEntity::getSettingValue)
                .filter(v -> v != null && !v.isBlank());
    }

    public String getLinkedActivationCode() {
        return settingRepository.findById(KEY_ACTIVATION_CODE)
                .map(SystemSettingEntity::getSettingValue)
                .orElse("");
    }

    public String getLinkedLicenseStatus() {
        return settingRepository.findById(KEY_LICENSE_STATUS)
                .map(SystemSettingEntity::getSettingValue)
                .orElse("ACTIVE");
    }

    @Transactional
    public RemoteOffice registerCommercialOffice(
            String companyName,
            String ownerName,
            String city,
            String phone,
            String adminName,
            String adminUsername,
            String adminRawPassword,
            String licensePlan,
            String licenseExpiresAtIso,
            String recoveryPin
    ) throws Exception {
        if (companyName == null || companyName.isBlank()) {
            throw new IllegalArgumentException("El nombre comercial de la oficina es obligatorio.");
        }
        if (adminUsername == null || adminUsername.isBlank() || adminRawPassword == null || adminRawPassword.length() < 6) {
            throw new IllegalArgumentException("El usuario y contraseña del administrador (mín. 6 caracteres) son obligatorios.");
        }

        String officeId = generateImmutableOfficeId();
        String activationCode = generateActivationCode();
        String plan = (licensePlan == null || licensePlan.isBlank()) ? "LIFETIME" : licensePlan.trim().toUpperCase();

        RemoteOffice office = new RemoteOffice(
                officeId,
                companyName.trim(),
                activationCode,
                "ACTIVE",
                plan,
                licenseExpiresAtIso,
                ownerName == null ? "" : ownerName.trim(),
                phone == null ? "" : phone.trim(),
                city == null ? "" : city.trim()
        );

        applyVendorKey();
        String url = getSupabaseUrl();
        String key = getSupabaseKey();
        String normalizedAdminUser = adminUsername.trim().toLowerCase();
        if (registryClient.usernameExists(url, key, normalizedAdminUser)) {
            throw new IllegalArgumentException(
                    "El usuario '" + normalizedAdminUser + "' ya está registrado en otra oficina. Usa un usuario único (ej. admin.norte)."
            );
        }

        registryClient.upsertOffice(url, key, office, recoveryPin == null ? "" : recoveryPin.trim());

        String adminId = "usr-adm-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String passwordHash = PasswordHasher.hash(adminRawPassword.trim());
        registryClient.upsertAdminUser(
                url,
                key,
                adminId,
                officeId,
                (adminName == null || adminName.isBlank()) ? "Administrador " + companyName.trim() : adminName.trim(),
                normalizedAdminUser,
                passwordHash,
                phone
        );

        logAudit("OFFICE_REGISTERED", officeId, "Oficina registrada: " + companyName + " | Admin: " + normalizedAdminUser);
        return office;
    }

    /**
     * Crea una ruta y su cobrador con usuario único global para una oficina registrada.
     */
    @Transactional
    public void registerCollectorForOffice(
            String officeId,
            String routeName,
            String collectorName,
            String username,
            String rawPassword,
            String phone
    ) throws Exception {
        if (officeId == null || officeId.isBlank()) {
            throw new IllegalArgumentException("Selecciona una oficina válida.");
        }
        if (routeName == null || routeName.isBlank()) {
            throw new IllegalArgumentException("El nombre de la ruta es obligatorio.");
        }
        if (username == null || username.isBlank() || rawPassword == null || rawPassword.length() < 6) {
            throw new IllegalArgumentException("El usuario y contraseña del cobrador (mín. 6 caracteres) son obligatorios.");
        }

        applyVendorKey();
        String url = getSupabaseUrl();
        String key = getSupabaseKey();
        String normalizedUser = username.trim().toLowerCase();
        if (registryClient.usernameExists(url, key, normalizedUser)) {
            throw new IllegalArgumentException(
                    "El usuario '" + normalizedUser + "' ya existe en otra oficina. Usa un usuario único (ej. ruta1.norte)."
            );
        }

        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        String routeId = "rt-" + suffix;
        String collectorId = "usr-col-" + suffix;
        String code = routeName.trim().replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        String routeCode = (code.length() >= 4 ? code.substring(0, 4) : (code.isEmpty() ? "RT" : code)) + "-" + suffix.substring(0, 2).toUpperCase();

        registryClient.upsertRoute(url, key, routeId, officeId, routeName.trim(), routeCode, collectorId);
        registryClient.upsertUser(
                url,
                key,
                collectorId,
                officeId,
                (collectorName == null || collectorName.isBlank()) ? routeName.trim() : collectorName.trim(),
                normalizedUser,
                PasswordHasher.hash(rawPassword.trim()),
                "COBRADOR",
                List.of(routeId),
                phone
        );
        logAudit("COLLECTOR_REGISTERED", officeId, "Cobrador creado: " + normalizedUser + " | Ruta: " + routeName);
    }

    public List<RemoteOffice> listRegisteredOffices() throws Exception {
        applyVendorKey();
        return registryClient.listOffices(getSupabaseUrl(), getSupabaseKey());
    }

    @Transactional
    public void setOfficeLicenseStatus(String officeId, String status) throws Exception {
        applyVendorKey();
        String normalized = status.trim().toUpperCase();
        if (!List.of("ACTIVE", "SUSPENDED", "EXPIRED").contains(normalized)) {
            throw new IllegalArgumentException("Estado de licencia inválido: " + status);
        }
        registryClient.updateLicenseStatus(getSupabaseUrl(), getSupabaseKey(), officeId, normalized);
        if (getLinkedOfficeId().map(id -> id.equals(officeId)).orElse(false)) {
            saveSetting(KEY_LICENSE_STATUS, normalized);
        }
        logAudit("LICENSE_STATUS_CHANGED", officeId, "Nuevo estado de licencia: " + normalized);
    }

    @Transactional
    public String regenerateActivationCode(String officeId) throws Exception {
        applyVendorKey();
        String newCode = generateActivationCode();
        registryClient.updateActivationCode(getSupabaseUrl(), getSupabaseKey(), officeId, newCode);
        if (getLinkedOfficeId().map(id -> id.equals(officeId)).orElse(false)) {
            saveSetting(KEY_ACTIVATION_CODE, newCode);
        }
        logAudit("ACTIVATION_CODE_REGENERATED", officeId, "Código regenerado: " + newCode);
        return newCode;
    }

    /**
     * Vincula la instalación local de escritorio a una oficina validando su código y licencia.
     */
    @Transactional
    public RemoteOffice linkLocalDesktopToOffice(String activationCode) throws Exception {
        if (activationCode == null || activationCode.isBlank()) {
            throw new IllegalArgumentException("Ingresa un código de activación válido.");
        }
        Optional<RemoteOffice> opt = registryClient.findByActivationCode(getSupabaseUrl(), getSupabaseKey(), activationCode);
        if (opt.isEmpty()) {
            throw new IllegalArgumentException("Código de activación no encontrado.");
        }
        RemoteOffice office = opt.get();
        if (!isLicenseCurrentlyActive(office.licenseStatus(), office.licenseExpiresAt())) {
            throw new IllegalStateException("La licencia de esta oficina está " + office.licenseStatus() + ".");
        }

        saveSetting(KEY_OFFICE_ID, office.id());
        saveSetting(KEY_ACTIVATION_CODE, office.activationCode());
        saveSetting(KEY_LICENSE_STATUS, office.licenseStatus());
        saveSetting(KEY_LICENSE_PLAN, office.licensePlan());
        saveSetting(KEY_LICENSE_EXPIRES_AT, office.licenseExpiresAt() == null ? "" : office.licenseExpiresAt());
        saveSetting("office.company_name", office.companyName());

        logAudit("DESKTOP_LINKED", office.id(), "Equipo vinculado a " + office.companyName());
        return office;
    }

    /**
     * Respalda la base SQLite actual y registra formalmente la oficina local (ej. Inversiones FBV)
     * sin perder datos existentes.
     */
    @Transactional
    public RemoteOffice backupAndLinkExistingLocalOffice(String companyName, String ownerName) throws Exception {
        if (backupService != null) {
            backupService.createAfterCommit("LEGACY_OFFICE_LINK");
        }
        String officeId = getLinkedOfficeId().orElseGet(this::generateImmutableOfficeId);
        String code = getLinkedActivationCode().isBlank() ? generateActivationCode() : getLinkedActivationCode();
        RemoteOffice office = new RemoteOffice(
                officeId,
                companyName == null || companyName.isBlank() ? "Inversiones FBV" : companyName.trim(),
                code,
                "ACTIVE",
                "LIFETIME",
                null,
                ownerName == null ? "" : ownerName.trim(),
                "",
                ""
        );
        applyVendorKey();
        registryClient.upsertOffice(getSupabaseUrl(), getSupabaseKey(), office, "");
        saveSetting(KEY_OFFICE_ID, office.id());
        saveSetting(KEY_ACTIVATION_CODE, office.activationCode());
        saveSetting(KEY_LICENSE_STATUS, "ACTIVE");
        saveSetting(KEY_LICENSE_PLAN, "LIFETIME");
        logAudit("LEGACY_OFFICE_PROTECTED_AND_LINKED", office.id(), "Respaldo + registro formal de " + office.companyName());
        return office;
    }

    public static boolean isLicenseCurrentlyActive(String status, String expiresAtIso) {
        if (!"ACTIVE".equalsIgnoreCase(status)) {
            return false;
        }
        if (expiresAtIso != null && !expiresAtIso.isBlank()) {
            try {
                return Instant.parse(expiresAtIso).isAfter(Instant.now());
            } catch (Exception ignored) {
                return true;
            }
        }
        return true;
    }

    private void saveSetting(String key, String value) {
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        SystemSettingEntity entity = settingRepository.findById(key)
                .orElse(new SystemSettingEntity(key, value, now));
        entity.setSettingValue(value);
        entity.setUpdatedAt(now);
        settingRepository.save(entity);
    }

    private void logAudit(String action, String entityId, String details) {
        if (auditLogRepository == null) return;
        auditLogRepository.save(new AuditLogEntity(
                "aud-" + UUID.randomUUID().toString().substring(0, 8),
                "vendor",
                "OFFICE",
                entityId,
                action,
                null,
                details,
                details,
                LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
        ));
    }
}
