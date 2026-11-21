# Feature Specification: Zero-Jargon Automatic Desktop Cloud Auth & Background Sync

**Feature Branch**: `006-desktop-silent-cloud-sync`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Hacer que la versión Desktop JavaFX autentique con las mismas credenciales reales creadas para cada oficina y mantenga la cartera 100% sincronizada automáticamente en segundo plano con la web/móvil, sin botones técnicos ('sincronizar nube', URLs, API keys) ni jerga para usuarios no técnicos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inicio de Sesión Único Sin Tecnicismos en Escritorio (Priority: P1)

Como administrador o cobrador de una oficina compradora, al abrir Kredia en Windows debo ver únicamente una pantalla limpia de Usuario y Contraseña; al ingresar las credenciales que me entregó el vendedor, entro directamente a mi oficina y veo mis clientes, préstamos y saldos reales sin configurar URLs, códigos ni botones de nube.

**Acceptance Scenarios**:
1. **Given** un equipo Windows nuevo con Kredia instalado, **When** el administrador ingresa `admin-fbv` y su contraseña, **Then** el sistema valida sus credenciales y licencia automáticamente, descarga los datos reales de su oficina y abre su tablero con los 21 clientes activos y cartera real.
2. **Given** credenciales inexistentes o de una oficina con licencia suspendida, **When** alguien intenta ingresar, **Then** el sistema bloquea el acceso con un mensaje sencillo en español sin tecnicismos.
3. **Given** un equipo ya vinculado cuando se cae el internet de la oficina, **When** el administrador ingresa sus credenciales, **Then** puede trabajar offline normalmente sobre su base local.

### User Story 2 - Sincronización Automática Invisible en Segundo Plano (Priority: P1)

Como administrador en el escritorio mientras mis cobradores cobran desde el celular, necesito que los nuevos pagos, préstamos, renovaciones y gastos se reflejen automáticamente entre escritorio y celulares sin que yo tenga que presionar ningún botón técnico de sincronización.

**Acceptance Scenarios**:
1. **Given** un administrador operando en el escritorio JavaFX, **When** registra un cobro, préstamo o cliente (o un cobrador registra uno en el celular), **Then** el servicio en segundo plano sincroniza automáticamente los cambios y hechos financieros inmutables cada 30 segundos y al cerrar la app.

## Requirements *(mandatory)*

- **FR-001**: El escritorio JavaFX DEBE soportar verificación criptográfica tanto de hashes `PBKDF2-HMAC-SHA256` como `sha256$<salt>$<hash>` creados en móvil/web, manteniendo `PBKDF2` para persistencia local.
- **FR-002**: El escritorio DEBE tener preconfigurada la conexión al registro maestro en la nube para que las oficinas compradoras nunca deban escribir URLs ni API keys.
- **FR-003**: El inicio de sesión del escritorio DEBE validar contra la nube (con respaldo offline si ya estaba vinculado y sin internet), hidratar la cartera de la oficina en `cartera.db` traduciendo correctamente estados/categorías entre esquema nube y escritorio, y respetar el rol real (`ADMIN`, `SUPERVISOR`, `COBRADOR`).
- **FR-004**: El escritorio DEBE ejecutar sincronización bidireccional silenciosa en segundo plano (pull + push + libro mayor inmutable `financial_events`) sin exponer botones ni mensajes técnicos al usuario final.
- **FR-005**: La pantalla de login del escritorio NO debe mostrar botones públicos de auto-registro de oficina ni credenciales demo; el acceso al Panel Comercial del vendedor debe permanecer discreto y protegido por PIN maestro.

## Success Criteria
- **SC-001**: Iniciar sesión en el escritorio con `admin-fbv` / `FBV2026*` autentica en < 5 segundos y muestra los 21 clientes reales de Inversiones FBV.
- **SC-002**: Todos los tests de `.\gradlew.bat compileJava test installDist` pasan al 100%.
