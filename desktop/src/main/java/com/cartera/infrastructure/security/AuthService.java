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

    public AuthService(AppUserRepository userRepository, AuditLogRepository auditLogRepository) {
        this(userRepository, auditLogRepository, null, null);
    }

    @Autowired
    public AuthService(AppUserRepository userRepository,
                       AuditLogRepository auditLogRepository,
                       RouteRepository routeRepository,
                       SystemSettingRepository settingRepository) {
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.routeRepository = routeRepository;
        this.settingRepository = settingRepository;
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

        if (!PasswordHasher.verify(rawPassword, user.getPasswordHash())) {
            return Optional.empty();
        }

        // Si la contraseña guardada no estaba hasheada con PBKDF2, actualizarla transparentemente
        if (!user.getPasswordHash().contains("$")) {
            user.setPasswordHash(PasswordHasher.hash(rawPassword));
            userRepository.save(user);
        }

        String role = determineRole(user);
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

        // 1. Crear o actualizar usuario Administrador (id con prefijo usr-admin-)
        AppUserEntity adminEntity = userRepository.findById("usr-admin-1")
                .or(() -> userRepository.findByUsername(cleanAdminUser))
                .orElseGet(() -> new AppUserEntity(
                        "usr-admin-1",
                        cleanAdminUser,
                        PasswordHasher.hash(cleanAdminPass),
                        adminFullName == null || adminFullName.isBlank() ? "Administrador General" : adminFullName.trim(),
                        1,
                        now
                ));

        // Si otro usuario tenía ese username pero distinto ID, liberar o reutilizar
        userRepository.findByUsername(cleanAdminUser).ifPresent(other -> {
            if (!other.getId().equals(adminEntity.getId())) {
                other.setUsername(other.getUsername() + "_old_" + UUID.randomUUID().toString().substring(0, 4));
                userRepository.saveAndFlush(other);
            }
        });

        adminEntity.setUsername(cleanAdminUser);
        adminEntity.setPasswordHash(PasswordHasher.hash(cleanAdminPass));
        adminEntity.setFullName(adminFullName == null || adminFullName.isBlank() ? "Administrador General" : adminFullName.trim());
        adminEntity.setActive(1);
        userRepository.saveAndFlush(adminEntity);

        // 2. Configurar las N rutas y sus cobradores
        for (int i = 0; i < routesConfig.size(); i++) {
            RouteSetupItem item = routesConfig.get(i);
            String colId = "usr-col-" + (i + 1);
            String rId = (item.routeId() != null && !item.routeId().isBlank())
                    ? item.routeId().trim()
                    : (i == 0 ? "route-norte" : "route-" + (i + 1));
            String rName = (item.routeName() != null && !item.routeName().isBlank())
                    ? item.routeName().trim()
                    : "Ruta " + (i + 1);
            String colName = (item.collectorName() != null && !item.collectorName().isBlank())
                    ? item.collectorName().trim()
                    : "Cobrador Ruta " + (i + 1);
            String colUser = item.username().trim().toLowerCase();
            String colPass = item.password().trim();

            userRepository.findByUsername(colUser).ifPresent(other -> {
                if (!other.getId().equals(colId)) {
                    other.setUsername(other.getUsername() + "_old_" + UUID.randomUUID().toString().substring(0, 4));
                    userRepository.saveAndFlush(other);
                }
            });

            AppUserEntity collector = userRepository.findById(colId)
                    .orElseGet(() -> new AppUserEntity(colId, colUser, PasswordHasher.hash(colPass), colName, 1, now));
            collector.setUsername(colUser);
            collector.setPasswordHash(PasswordHasher.hash(colPass));
            collector.setFullName(colName);
            collector.setActive(1);
            userRepository.saveAndFlush(collector);

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

    private String determineRole(AppUserEntity user) {
        String id = user.getId() != null ? user.getId().toLowerCase() : "";
        String username = user.getUsername() != null ? user.getUsername().toLowerCase() : "";
        if (id.startsWith("usr-admin") || "admin".equals(username) || "administrador".equals(username)) {
            return "ADMIN";
        }
        if (id.startsWith("usr-sup") || username.contains("superv")) {
            return "SUPERVISOR";
        }
        return "COBRADOR";
    }
}
