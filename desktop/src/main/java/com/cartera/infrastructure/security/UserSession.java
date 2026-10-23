package com.cartera.infrastructure.security;

/**
 * Representa la sesión inmutable del usuario autenticado en la aplicación.
 */
public record UserSession(
        String userId,
        String username,
        String fullName,
        String roleCode
) {
    public boolean isAdmin() {
        return "ADMIN".equalsIgnoreCase(roleCode) || "ADMINISTRADOR".equalsIgnoreCase(roleCode);
    }

    public boolean isSupervisor() {
        return "SUPERVISOR".equalsIgnoreCase(roleCode);
    }

    public boolean canReverseOrCancel() {
        return isAdmin() || isSupervisor();
    }

    public boolean isCollector() {
        return "COBRADOR".equalsIgnoreCase(roleCode) || "COLLECTOR".equalsIgnoreCase(roleCode);
    }
}
