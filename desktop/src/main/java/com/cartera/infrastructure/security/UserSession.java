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
        return "ADMIN".equalsIgnoreCase(roleCode);
    }

    public boolean isCollector() {
        return "COBRADOR".equalsIgnoreCase(roleCode);
    }
}
