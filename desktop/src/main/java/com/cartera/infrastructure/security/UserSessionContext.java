package com.cartera.infrastructure.security;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Contenedor centralizado para la sesión del usuario actual y filtro global de ruta activa.
 */
public final class UserSessionContext {

    private static final AtomicReference<UserSession> CURRENT = new AtomicReference<>();
    private static final AtomicReference<String> SELECTED_ROUTE_ID = new AtomicReference<>("ALL");

    private UserSessionContext() {}

    public static void setSession(UserSession session) {
        CURRENT.set(session);
    }

    public static Optional<UserSession> getSession() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static UserSession requireSession() {
        UserSession session = CURRENT.get();
        if (session == null) {
            throw new IllegalStateException("No hay una sesión activa de usuario.");
        }
        return session;
    }

    public static String getSelectedRouteId() {
        String r = SELECTED_ROUTE_ID.get();
        return (r == null || r.isBlank()) ? "ALL" : r;
    }

    public static void setSelectedRouteId(String routeId) {
        SELECTED_ROUTE_ID.set((routeId == null || routeId.isBlank()) ? "ALL" : routeId.trim());
    }

    public static boolean isAllRoutesSelected() {
        return "ALL".equalsIgnoreCase(getSelectedRouteId());
    }

    public static boolean canCurrentUserReverseOrCancel() {
        UserSession s = CURRENT.get();
        return s != null && s.canReverseOrCancel() && !s.isCollector();
    }

    public static boolean isAdmin() {
        UserSession s = CURRENT.get();
        return s == null || s.isAdmin();
    }

    public static void clear() {
        CURRENT.set(null);
        SELECTED_ROUTE_ID.set("ALL");
    }
}
