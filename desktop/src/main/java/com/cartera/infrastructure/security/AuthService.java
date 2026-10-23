package com.cartera.infrastructure.security;

import com.cartera.infrastructure.persistence.entity.AppUserEntity;
import com.cartera.infrastructure.persistence.entity.AuditLogEntity;
import com.cartera.infrastructure.persistence.repository.AppUserRepository;
import com.cartera.infrastructure.persistence.repository.AuditLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.UUID;

/**
 * Servicio de autenticación, control de accesos y auditoría de sesiones.
 */
@Service
public class AuthService {

    private final AppUserRepository userRepository;
    private final AuditLogRepository auditLogRepository;

    public AuthService(AppUserRepository userRepository, AuditLogRepository auditLogRepository) {
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
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

        Optional<AppUserEntity> optUser = userRepository.findByUsername(username.trim());
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

        String role = determineRole(user.getUsername());
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

    private String determineRole(String username) {
        if ("admin".equalsIgnoreCase(username) || "administrador".equalsIgnoreCase(username)) {
            return "ADMIN";
        }
        if (username != null && username.toLowerCase().contains("superv")) {
            return "SUPERVISOR";
        }
        return "COBRADOR";
    }
}
