package com.cartera.infrastructure.security;

import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Contenedor centralizado para la sesión del usuario actual en la aplicación de escritorio.
 */
public final class UserSessionContext {

    private static final AtomicReference<UserSession> CURRENT = new AtomicReference<>();

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

    public static void clear() {
        CURRENT.set(null);
    }
}
