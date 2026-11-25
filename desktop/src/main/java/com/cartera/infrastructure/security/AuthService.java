package com.cartera.infrastructure.security;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.entity.RouteEntity;
import com.cartera.infrastructure.persistence.entity.SystemSettingEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import com.cartera.infrastructure.persistence.repository.RouteRepository;
import com.cartera.infrastructure.persistence.repository.SystemSettingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Servicio de autenticación, configuración de credenciales de oficina/rutas y auditoría de sesiones.
 */
@Service
public class AuthService {

    public record RouteSetupItem(
            String routeId,
            String routeName,
            String collectorName,
            String username,
            String password
    ) {}

    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final RouteRepository routeRepository;
    private final SystemSettingRepository settingRepository;
    private JdbcTemplate jdbcTemplate;

    public AuthService(AppUserRepository userRepository, AuditLogRepository auditLogRepository) {
        this(userRepository, auditLogRepository, null, null, null);
    }

    public AuthService(AppUserRepository userRepository,
                       AuditLogRepository auditLogRepository,
                       RouteRepository routeRepository,
                       SystemSettingRepository settingRepository) {
        this(userRepository, auditLogRepository, routeRepository, settingRepository, null);
    }

    @Autowired
    public AuthService(AppUserRepository userRepository,
                       AuditLogRepository auditLogRepository,
                       RouteRepository routeRepository,
                       SystemSettingRepository settingRepository,
                       @Autowired(required = false) JdbcTemplate jdbcTemplate) {
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.routeRepository = routeRepository;
        this.settingRepository = settingRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Autentica un usuario por nombre de usuario y contraseña.
     * Retorna la sesión activa si las credenciales son válidas y el usuario está activo.
     */
    @Transactional
    public Optional<UserSession> authenticate(String username, String rawPassword) {
        if (username == null || rawPassword == null) {
            return Optional.empty();
        }

        Optional<AppUserEntity> optUser = userRepository.findByUsername(username.trim().toLowerCase());
        if (optUser.isEmpty()) {
            optUser = userRepository.findByUsername(username.trim());
        }
        if (optUser.isEmpty()) {
            return Optional.empty();
        }

        AppUserEntity user = optUser.get();
        if (user.getActive() == null || user.getActive() != 1) {
            return Optional.empty();
        }

        boolean validPassword = PasswordHasher.verify(rawPassword, user.getPasswordHash())
                || (!rawPassword.equals(rawPassword.trim()) && PasswordHasher.verify(rawPassword.trim(), user.getPasswordHash()));
        if (!validPassword) {
            recordFailedLogin(user.getId(), username.trim());
            return Optional.empty();
        }

        String role = resolveRole(user);
        UserSession session = new UserSession(user.getId(), user.getUsername(), user.getFullName(), role);
        UserSessionContext.setSession(session);

        // Registro de auditoría
        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                user.getId(),
                "APP_USER",
                user.getId(),
                "LOGIN",
                null,
                "Usuario autenticado exitosamente con rol " + role,
                "Inicio de sesión en aplicación de escritorio",
                now
        ));

        return Optional.of(session);
    }

    /** Cierra la sesión activa y registra el evento. */
    @Transactional
    public void logout() {
        UserSessionContext.getSession().ifPresent(session -> {
            String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
            auditLogRepository.save(new AuditLogEntity(
                    UUID.randomUUID().toString(),
                    session.userId(),
                    "APP_USER",
                    session.userId(),
                    "LOGOUT",
                    null,
                    "Cierre de sesión",
                    "Cierre de sesión manual",
                    now
            ));
        });
        UserSessionContext.clear();
    }

    /**
     * Configura transaccionalmente la oficina, las credenciales del Administrador
     * y las N rutas con sus credenciales y políticas personalizadas.
     */
    @Transactional
    public UserSession setupOfficeAndRoutes(
            String companyName,
            String city,
            String phone,
            String adminFullName,
            String adminUsername,
            String adminPassword,
            String defaultInterestPercent,
            boolean paperworkEnabled,
            String paperworkFee,
            boolean excludeSundays,
            boolean allowRouteNewLoans,
            boolean allowRouteExpenses,
            List<RouteSetupItem> routesConfig
    ) {
        String cleanAdminUser = adminUsername == null ? "" : adminUsername.trim().toLowerCase();
        String cleanAdminPass = adminPassword == null ? "" : adminPassword.trim();
        if (cleanAdminUser.isEmpty() || cleanAdminPass.isEmpty()) {
            throw new IllegalArgumentException("El usuario y contraseña del Administrador son obligatorios.");
        }
        if (routesConfig == null || routesConfig.isEmpty()) {
            throw new IllegalArgumentException("Debe configurar al menos 1 ruta para la oficina.");
        }

        Set<String> usedUsernames = new HashSet<>();
        usedUsernames.add(cleanAdminUser);
        for (int i = 0; i < routesConfig.size(); i++) {
            RouteSetupItem item = routesConfig.get(i);
            String u = item.username() == null ? "" : item.username().trim().toLowerCase();
            String p = item.password() == null ? "" : item.password().trim();
            if (u.isEmpty() || p.isEmpty()) {
                throw new IllegalArgumentException("La Ruta #" + (i + 1) + " requiere usuario y contraseña.");
            }
            if (!usedUsernames.add(u)) {
                throw new IllegalArgumentException("El usuario '" + u + "' está repetido. Cada ruta y el administrador deben tener un usuario único.");
            }
        }

        String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

        // 1. Crear o actualizar usuario Administrador con ID único (sin hardcodes globales)
        String newAdminId = "usr-adm-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        AppUserEntity adminEntity = userRepository.findByUsername(cleanAdminUser)
                .orElseGet(() -> new AppUserEntity(
                        newAdminId,
                        cleanAdminUser,
                        PasswordHasher.hash(cleanAdminPass),
                        adminFullName == null || adminFullName.isBlank() ? "Administrador General" : adminFullName.trim(),
                        1,
                        now
                ));

        // Si otro usuario tenía ese username pero distinto ID, renombrarlo y desactivarlo
        userRepository.findByUsername(cleanAdminUser).ifPresent(other -> {
            if (!other.getId().equals(adminEntity.getId())) {
                other.setUsername(other.getUsername() + "_old_" + UUID.randomUUID().toString().substring(0, 4));
                other.setActive(0);
                userRepository.saveAndFlush(other);
            }
        });

        adminEntity.setUsername(cleanAdminUser);
        adminEntity.setPasswordHash(PasswordHasher.hash(cleanAdminPass));
        adminEntity.setFullName(adminFullName == null || adminFullName.isBlank() ? "Administrador General" : adminFullName.trim());
        adminEntity.setActive(1);
        userRepository.saveAndFlush(adminEntity);
        assignRole(adminEntity.getId(), "ADMIN");

        // 2. Configurar las N rutas y sus cobradores
        for (int i = 0; i < routesConfig.size(); i++) {
            RouteSetupItem item = routesConfig.get(i);
            String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
            String colUser = item.username().trim().toLowerCase();
            String colPass = item.password().trim();
            String rId = (item.routeId() != null && !item.routeId().isBlank())
                    ? item.routeId().trim()
                    : "rt-" + suffix;
            String rName = (item.routeName() != null && !item.routeName().isBlank())
                    ? item.routeName().trim()
                    : "Ruta " + (i + 1);
            String colName = (item.collectorName() != null && !item.collectorName().isBlank())
                    ? item.collectorName().trim()
                    : "Cobrador Ruta " + (i + 1);

            AppUserEntity collector = userRepository.findByUsername(colUser)
                    .orElseGet(() -> new AppUserEntity("usr-col-" + suffix, colUser, PasswordHasher.hash(colPass), colName, 1, now));
            String colId = collector.getId();
            collector.setUsername(colUser);
            collector.setPasswordHash(PasswordHasher.hash(colPass));
            collector.setFullName(colName);
            collector.setActive(1);
            userRepository.saveAndFlush(collector);
            assignRole(colId, "COBRADOR");

            if (routeRepository != null) {
                RouteEntity route = routeRepository.findById(rId)
                        .orElseGet(() -> new RouteEntity(rId, rName, colId, 1, now));
                route.setName(rName);
                route.setCollectorId(colId);
                route.setActive(1);
                routeRepository.saveAndFlush(route);
            }
        }

        // 3. Guardar parámetros de la oficina en SystemSettingRepository
        if (settingRepository != null) {
            if (companyName != null && !companyName.isBlank()) {
                settingRepository.save(new SystemSettingEntity("company_name", companyName.trim(), now));
            }
            if (city != null && !city.isBlank()) {
                settingRepository.save(new SystemSettingEntity("company_city", city.trim(), now));
            }
            if (phone != null && !phone.isBlank()) {
                settingRepository.save(new SystemSettingEntity("company_phone", phone.trim(), now));
            }
            settingRepository.save(new SystemSettingEntity("default_interest_percent",
                    defaultInterestPercent == null || defaultInterestPercent.isBlank() ? "20" : defaultInterestPercent.trim(), now));
            settingRepository.save(new SystemSettingEntity("paperwork_enabled", String.valueOf(paperworkEnabled), now));
            settingRepository.save(new SystemSettingEntity("paperwork_fee",
                    paperworkFee == null || paperworkFee.isBlank() ? "5000" : paperworkFee.trim(), now));
            settingRepository.save(new SystemSettingEntity("exclude_sundays", String.valueOf(excludeSundays), now));
            settingRepository.save(new SystemSettingEntity("route_allow_new_loans", String.valueOf(allowRouteNewLoans), now));
            settingRepository.save(new SystemSettingEntity("route_allow_expenses", String.valueOf(allowRouteExpenses), now));
            settingRepository.save(new SystemSettingEntity("office_setup_completed", "true", now));
        }

        // 4. Registrar auditoría
        auditLogRepository.save(new AuditLogEntity(
                UUID.randomUUID().toString(),
                adminEntity.getId(),
                "OFFICE_SETUP",
                "office-config",
                "CONFIGURAR_OFICINA_Y_RUTAS",
                null,
                "Admin: " + cleanAdminUser + " | Rutas configuradas: " + routesConfig.size(),
                "Configuración de credenciales de oficina y rutas",
                now
        ));

        UserSession session = new UserSession(adminEntity.getId(), adminEntity.getUsername(), adminEntity.getFullName(), "ADMIN");
        UserSessionContext.setSession(session);
        return session;
    }

    public List<RouteEntity> getActiveRoutes() {
        if (routeRepository == null) return List.of();
        return routeRepository.findAll().stream()
                .filter(r -> r.getActive() == null || r.getActive() == 1)
                .toList();
    }

    public List<AppUserEntity> getActiveUsers() {
        return userRepository.findAll().stream()
                .filter(u -> u.getActive() == null || u.getActive() == 1)
                .toList();
    }

    public String getCompanyName() {
        if (settingRepository == null) return "SISTEMA CARTERA";
        return settingRepository.findById("company_name")
                .map(SystemSettingEntity::getSettingValue)
                .filter(s -> !s.isBlank())
                .orElse("SISTEMA CARTERA");
    }

    public boolean isOfficeSetupCompleted() {
        if (settingRepository == null) return false;
        return settingRepository.findById("office_setup_completed")
                .map(s -> "true".equalsIgnoreCase(s.getSettingValue()))
                .orElse(false);
    }

    public boolean isOfficeConfigured() {
        return isOfficeSetupCompleted();
    }

    /**
     * Persiste explícitamente el rol de un usuario en las tablas `role` y `user_role` de SQLite.
     */
    @Transactional
    public void assignRole(String userId, String roleCode) {
        if (jdbcTemplate == null || userId == null || userId.isBlank()) {
            return;
        }
        String normalized = normalizeRoleCode(roleCode);
        String roleId = "role-" + normalized.toLowerCase();
        jdbcTemplate.update("INSERT OR IGNORE INTO role (id, code) VALUES (?, ?)", roleId, normalized);
        String resolvedRoleId = jdbcTemplate.query(
                "SELECT id FROM role WHERE UPPER(code) = ? LIMIT 1",
                rs -> rs.next() ? rs.getString(1) : roleId,
                normalized
        );
        jdbcTemplate.update("DELETE FROM user_role WHERE user_id = ?", userId);
        jdbcTemplate.update("INSERT OR REPLACE INTO user_role (user_id, role_id) VALUES (?, ?)", userId, resolvedRoleId);
    }

    /**
     * Resuelve el rol real del usuario desde `user_role`/`role`; solo cae a heurística si es un registro legado sin rol asignado.
     */
    public String resolveRole(AppUserEntity user) {
        if (user == null) {
            return "COBRADOR";
        }
        if (jdbcTemplate != null && user.getId() != null && !user.getId().isBlank()) {
            try {
                List<String> codes = jdbcTemplate.query(
                        "SELECT r.code FROM user_role ur JOIN role r ON r.id = ur.role_id WHERE ur.user_id = ? LIMIT 1",
                        (rs, rowNum) -> rs.getString(1),
                        user.getId()
                );
                if (!codes.isEmpty() && codes.get(0) != null && !codes.get(0).isBlank()) {
                    return normalizeRoleCode(codes.get(0));
                }
            } catch (Exception ignored) {
                // Fallback seguro solo si la tabla aún no está disponible en un test unitario aislado
            }
        }
        return determineLegacyRole(user);
    }

    public static String normalizeRoleCode(String role) {
        if (role == null) return "COBRADOR";
        String u = role.trim().toUpperCase();
        if ("ADMIN".equals(u) || "SUPER_ADMIN".equals(u) || "ADMINISTRADOR".equals(u)) return "ADMIN";
        if ("SUPERVISOR".equals(u)) return "SUPERVISOR";
        return "COBRADOR";
    }

    private String determineLegacyRole(AppUserEntity user) {
        String id = user.getId() != null ? user.getId().toLowerCase() : "";
        String username = user.getUsername() != null ? user.getUsername().toLowerCase() : "";
        if (id.startsWith("usr-adm") || "admin".equals(username) || "administrador".equals(username)) {
            return "ADMIN";
        }
        if (id.startsWith("usr-sup") || "supervisor".equals(username)) {
            return "SUPERVISOR";
        }
        return "COBRADOR";
    }

    private void recordFailedLogin(String userId, String attemptedUsername) {
        try {
            if (auditLogRepository != null) {
                auditLogRepository.save(new AuditLogEntity(
                        UUID.randomUUID().toString(),
                        userId,
                        "APP_USER",
                        userId != null ? userId : attemptedUsername,
                        "LOGIN_FALLIDO",
                        null,
                        "Intento de inicio de sesión rechazado para " + attemptedUsername,
                        "Credenciales incorrectas",
                        LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                ));
            }
        } catch (Exception ignored) {}
    }
}
