# Feature Specification: Complete Desktop→Cloud Sync & Strict Database-Level Multi-Tenant RLS

**Feature Branch**: `007-strict-rls-and-full-desktop-sync`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "1) Completar la subida silenciosa Escritorio → Nube para renovaciones, movimientos de caja (gastos, inyecciones, retiros) y usuarios/cobradores creados o editados en Configuración del PC; 2) Endurecer RLS en Supabase para garantizar aislamiento real a nivel de base de datos por oficina mediante tokens de sesión firmados y autenticación en servidor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sincronización Total Silenciosa Escritorio → Celular (Priority: P1)

Como administrador de oficina usando Windows, cuando registro una renovación, un gasto de ruta, una inyección de base, un retiro a oficina o creo/edito un cobrador desde Configuración del escritorio, necesito que esos cambios se reflejen automáticamente en la nube y en los celulares de mi oficina sin presionar botones técnicos.

**Acceptance Scenarios**:
1. **Given** un administrador crea una renovación o un gasto en el escritorio, **When** corre la sincronización automática de 30 segundos (o cierra la app), **Then** la renovación, el movimiento de caja y su hecho inmutable en `financial_events` suben a Supabase bajo el `office_id` de su oficina.
2. **Given** un administrador crea un cobrador o cambia su contraseña en Configuración del escritorio, **When** corre la sincronización automática, **Then** el cobrador queda habilitado en la nube y puede iniciar sesión inmediatamente en `cartera-movil.expo.app`.

### User Story 2 - Aislamiento Estricto por Oficina con RLS en Supabase (Priority: P1)

Como dueño del SaaS multi-oficina, necesito que PostgreSQL (Supabase) imponga el aislamiento de datos por `office_id` a nivel de base de datos mediante tokens de sesión validados en servidor (`x-kredia-session`), de modo que ninguna consulta sin sesión válida ni ningún usuario de una oficina pueda leer, modificar o inyectar datos en otra oficina.

**Acceptance Scenarios**:
1. **Given** una consulta anónima a Supabase usando solo la `anon key` sin token de sesión, **When** intenta consultar `offices`, `users`, `customers`, `loans`, `payments` o `financial_events`, **Then** Supabase devuelve `0` filas y rechaza cualquier escritura (`403 / 42501`).
2. **Given** un usuario autenticado vía `authenticate_kredia_user(username, password)` en Oficina A, **When** envía su `x-kredia-session`, **Then** solo puede leer y escribir registros con `office_id = Oficina A` y sus lecturas/escrituras hacia Oficina B son rechazadas por RLS.
3. **Given** una oficina cuya licencia es cambiada a `SUSPENDED` por el vendedor, **When** cualquiera de sus dispositivos ya conectados intenta sincronizar, **Then** RLS rechaza el acceso de inmediato.

## Requirements *(mandatory)*

- **FR-001**: `DesktopCloudSyncService.pushLocalChangesToCloud` DEBE subir `users` (respetando unicidad global), `renewals`, `cash_movements` y sus hechos financieros inmutables (`LOAN_DISBURSED`, `RENEWAL_EXECUTED`, `CAPITAL_INJECTED`, `EXPENSE_RECORDED`, `OFFICE_WITHDRAWAL`, `PAPERWORK_WITHDRAWAL`, `ADJUSTMENT_ENTRY`) además de rutas, clientes, préstamos, cuotas y pagos.
- **FR-002**: PostgreSQL DEBE autenticar usuarios en servidor (`public.authenticate_kredia_user`) verificando contraseñas `PBKDF2-HMAC-SHA256` y `sha256$` sin exponer `password_hash`, emitir un token criptográfico de 256 bits almacenado hasheado en `private.office_sessions`, y validar licencia activa.
- **FR-003**: Todas las tablas multi-tenant en `public` DEBEN reemplazar políticas abiertas `USING (true)` por políticas RLS estrictas evaluadas con `(SELECT private.current_office_id())`, y `office_ledger_balances` DEBE usar `security_invoker = true`.
- **FR-004**: Las operaciones del Panel Comercial del Vendedor DEBEN ejecutarse mediante RPCs protegidas por secreto comercial (`x-kredia-vendor-key`) verificado contra `private.vendor_config`, nunca con acceso abierto `anon`.

## Success Criteria
- **SC-001**: `curl` sin sesión contra `offices`, `users`, `customers`, `loans`, `financial_events` devuelve `[]` (0 filas filtradas) y rechaza escrituras.
- **SC-002**: Login real con `admin-fbv` / `FBV2026*` vía `authenticate_kredia_user` devuelve token válido y permite leer los 21 clientes reales de `off-fbv-001` mientras bloquea acceso a cualquier otro `office_id`.
- **SC-003**: `.\gradlew.bat compileJava test installDist` y el despliegue web (`https://cartera-movil.expo.app`) pasan al 100%.
