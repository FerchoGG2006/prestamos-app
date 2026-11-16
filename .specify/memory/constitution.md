# Sistema de Cartera y Cobros (Windows Desktop) Constitution

## Core Principles

### I. Aplicación Nativa de Escritorio en JavaFX 21 (REGLA ABSOLUTA)
Este proyecto ES UNA APLICACIÓN NATIVA DE ESCRITORIO EN JAVAFX 21 + SPRING BOOT 3.4. PROHIBIDO implementar React, Electron, Tauri, PWA, WebView, HTML/CSS como interfaz de usuario, enrutamiento por URL o servidores localhost para la UI de escritorio. El usuario final debe poder instalar y ejecutar la aplicación directamente en Windows (`SistemaCartera.exe` / instalador `.exe`).

### II. Exactitud e Integridad Financiera (Innegociable)
- **Uso exclusivo de `BigDecimal`**: Todo valor monetario DEBE representarse y operarse con `BigDecimal`; NUNCA usar `double` ni `float`.
- **Separación de Pagos y Asignaciones**: Todo pago (`Payment`) DEBE persistirse de forma separada de sus registros de imputación (`PaymentAllocation`).
- **No inventar fórmulas de mora**: Mantener la configuración/calculadora de mora explícita según las reglas definidas por el negocio.

### III. Transaccionalidad, Inmutabilidad y Auditoría
- Toda escritura financiera en SQLite (`%USERPROFILE%\.sistema-cartera\cartera.db`) DEBE ser transaccional, auditable, autorizada e idempotente.
- Las liquidaciones cerradas son **inmutables**: cualquier ajuste posterior DEBE realizarse mediante correcciones auditables y nunca mediante ediciones o borrados silenciosos.
- Las migraciones de esquema DEBEN gestionarse ordenadamente con Flyway.

### IV. Seguridad Criptográfica y Sincronización LAN Protegida
Las credenciales de Administrador y Rutas de Cobro DEBEN almacenarse exclusivamente con derivación criptográfica `PBKDF2-HMAC-SHA256` y sal aleatoria (`PasswordHasher.java`). La sincronización LAN debe validar tamaño de trama, límites de frecuencia por IP y PIN de oficina (`X-Office-Sync-Pin`).

### V. Verificación con Gradle y Pruebas Automatizadas
Todo cambio DEBE compilar y pasar la suite de pruebas (`.\gradlew.bat compileJava test`) antes de empaquetarse con `empaquetar-windows.bat` / `.\gradlew.bat packageZip`.

## Flujo de Desarrollo con Spec Kit (SDD, Bugfix & Assessment)

1. **Nuevas funcionalidades / cambios estructurales**: Seguir `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` → `/speckit-converge`.
2. **Corrección de errores**: Usar `/speckit-bug-assess` → `/speckit-bug-fix` → `/speckit-bug-test` en `.specify/bugs/<slug>/`.
3. **Evaluación de ideas**: Usar `/speckit-assess-intake` → `research` → `define` → `shape` → `decide` en `.specify/assessments/<slug>/`.

## Governance

Esta Constitución tiene supremacía sobre cualquier otra práctica en `prestamos-app-1` y está alineada con `AGENTS.md`. Ningún agente o desarrollador puede violar la regla de UI nativa JavaFX ni las reglas de integridad financiera.

**Version**: 1.0.0 | **Ratified**: 2026-11-16 | **Last Amended**: 2026-11-16
