package com.cartera.infrastructure.security;

import com.cartera.infrastructure.persistence.repository.*;
import org.springframework.stereotype.Component;
import java.time.LocalDate;
import java.util.Objects;

/** Service boundary authorization and immutable collector-day protection. */
@Component
public class FinancialAccess {
    private final AppUserRepository users;
    private final CollectionSessionRepository sessions;
    private final DailySettlementRepository settlements;
    public FinancialAccess(AppUserRepository users, CollectionSessionRepository sessions, DailySettlementRepository settlements) {
        this.users = users; this.sessions = sessions; this.settlements = settlements;
    }
    public UserSession actor() {
        var actor = UserSessionContext.requireSession();
        var user = users.findById(actor.userId()).orElseThrow(() -> new SecurityException("Usuario no registrado."));
        if (!Integer.valueOf(1).equals(user.getActive())) throw new SecurityException("El usuario está inactivo.");
        if (!(actor.isAdmin() || actor.isSupervisor() || actor.isCollector())) throw new SecurityException("Rol sin autorización financiera.");
        return actor;
    }
    public UserSession manager() {
        var actor = actor();
        if (!actor.canReverseOrCancel()) throw new SecurityException("Requiere Administrador o Supervisor.");
        return actor;
    }
    public UserSession collector(String collectorId) {
        var actor = actor();
        if (!actor.canReverseOrCancel() && !Objects.equals(actor.userId(), collectorId))
            throw new SecurityException("No tiene permiso sobre este cobrador.");
        return actor;
    }
    public void requireOpen(String routeId, String collectorId, LocalDate date) {
        boolean closed = sessions.findAll().stream()
            .filter(s -> date.toString().equals(s.getSessionDate()))
            .filter(s -> Objects.equals(collectorId, s.getCollectorId()))
            .anyMatch(s -> "CERRADA".equalsIgnoreCase(s.getStatus()) || "CERRADO".equalsIgnoreCase(s.getStatus())
                || "CLOSED".equalsIgnoreCase(s.getStatus()) || settlements.findBySessionId(s.getId()).isPresent());
        if (closed) throw new IllegalStateException("La jornada está cerrada. Requiere una corrección auditable; no admite cambios retroactivos.");
    }
}
