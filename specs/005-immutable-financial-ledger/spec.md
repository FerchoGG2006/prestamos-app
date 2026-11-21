# Feature Specification: Immutable Financial Ledger & Real-Time FBV Cloud Sync

**Feature Branch**: `005-immutable-financial-ledger`

**Created**: 2026-11-21

**Status**: Draft

**Input**: User description: "Sincronizar y restaurar los datos reales de Inversiones FBV (respaldo-fbv-2026-11-20.json) en Supabase para que al ingresar con credenciales válidas se cargue la cartera real (no $0) y aplicar arquitectura de hechos financieros inmutables (patrón Datomic/Nubank append-only) sobre PostgreSQL (Supabase) y SQLite (escritorio JavaFX)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restauración y Sincronización Real de la Cartera de Inversiones FBV (Priority: P1)

Como administrador o cobrador de Inversiones FBV, cuando inicio sesión con mis credenciales reales desde cualquier navegador o celular (incluso en modo incógnito), debo ver inmediatamente los 21 clientes activos, 22 préstamos, 307 cuotas, pagos, renovaciones, liquidaciones y movimientos de caja reales de mi oficina en lugar de `$0`.

**Why this priority**: Sin la cartera real cargada y sincronizada en la nube, iniciar sesión desde un nuevo dispositivo muestra saldos en `$0` y no permite operar en equipo.

**Independent Test**: Iniciar sesión en modo incógnito con `admin-fbv` y contraseña válida; el tablero muestra los 21 clientes activos y la cartera en calle real (`$5.545.000` al momento del respaldo) sin requerir carga manual local.

**Acceptance Scenarios**:

1. **Given** la cartera real de Inversiones FBV cargada en la nube bajo su `office_id` inmutable (`off-fbv-001`), **When** un usuario autorizado inicia sesión desde un dispositivo limpio, **Then** el sistema descarga y muestra clientes, préstamos, cuotas, pagos, renovaciones, liquidaciones y movimientos reales de la oficina.
2. **Given** un cobrador registra un pago o préstamo nuevo en un celular, **When** el administrador o otro celular sincroniza o inicia sesión, **Then** el movimiento aparece reflejado en la nube y en los demás dispositivos de la misma oficina.

---

### User Story 2 - Libro Mayor Financiero Inmutable (Patrón Datomic / Nubank) (Priority: P1)

Como propietario y auditor del sistema financiero, necesito que todo movimiento de dinero (desembolso, pago recibido, reverso de pago, renovación, gasto de ruta, inyección de base, retiro a oficina o liquidación) quede registrado como un hecho atómico inmutable (solo inserción, jamás edición ni borrado), con clave de idempotencia única, para garantizar auditoría exacta, cero duplicados y escalabilidad multi-oficina.

**Why this priority**: Los registros mutables permiten descuadres silenciosos y sobrescrituras entre cobradores; un libro mayor inmutable garantiza trazabilidad bancaria.

**Independent Test**: Se inserta un hecho financiero con `idempotency_key` y luego se intenta modificar (`UPDATE`) o eliminar (`DELETE`) directamente en base de datos; el motor de base de datos rechaza la mutación con error de violación de inmutabilidad. Reenviar el mismo `idempotency_key` no duplica el monto.

**Acceptance Scenarios**:

1. **Given** un evento financiero registrado en el libro mayor inmutable, **When** cualquier proceso intenta ejecutar `UPDATE` o `DELETE` sobre esa fila, **Then** la base de datos aborta la operación garantizando inmutabilidad estricta.
2. **Given** un cobro enviado dos veces por falla de red con el mismo `idempotency_key`, **When** llega al libro mayor, **Then** el sistema acepta la primera inserción e ignora el duplicado sin alterar los saldos.
3. **Given** un conjunto de hechos inmutables de una oficina, **When** se consultan los saldos derivados del libro mayor, **Then** la suma exacta de deltas de cartera, efectivo y digital refleja el patrimonio operativo (`Cartera + Base + Digital`).

---

### User Story 3 - Migración Segura de Dispositivos Existentes y Sincronización Bidireccional (Priority: P2)

Como usuario de un dispositivo que ya tenía datos locales previos de Inversiones FBV antes de activar la nube, necesito poder vincular y sincronizar sin perder datos, y que los cambios nuevos se sincronicen automáticamente entre dispositivos de la misma oficina.

**Why this priority**: Evita que el teléfono principal de operación quede desincronizado respecto a la nube y a otros dispositivos.

**Independent Test**: Al pulsar sincronizar o iniciar sesión, el dispositivo combina los registros más recientes y publica nuevos hechos inmutables sin borrar datos previos.

**Acceptance Scenarios**:

1. **Given** un dispositivo vinculado a `off-fbv-001`, **When** registra un cobro, préstamo, renovación o movimiento de caja, **Then** el sistema genera simultáneamente el hecho inmutable en el libro mayor local y lo sincroniza a la nube con idempotencia.

---

### Edge Cases

- ¿Qué ocurre si un respaldo contiene estados de cuota en español (`PENDIENTE`, `ADELANTADA`, `PAGADA`, `PARCIAL`, `VENCIDA`) y categorías extendidas (`COLLECTION`, `PAYMENT_REVERSAL`, `LOAN_CANCELLATION`)? El esquema en la nube debe aceptarlos explícitamente sin rechazar la sincronización.
- ¿Qué ocurre si se intenta corregir un cobro erróneo en un libro mayor inmutable? No se borra ni edita el cobro original; se inserta un nuevo evento `PAYMENT_REVERSED` con los deltas inversos, preservando el rastro histórico completo.
- ¿Qué ocurre si dos cobradores de la misma oficina cobran al mismo tiempo sin internet y reconectan luego? Cada uno inserta hechos con su `idempotency_key` único; al sincronizar ninguno pisa los hechos del otro.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El esquema en la nube DEBE soportar todos los estados reales de cuotas (`PENDIENTE`, `PARCIAL`, `PAGADA`, `VENCIDA`, `ADELANTADA`, más compatibilidad con variantes en inglés), categorías de movimientos de caja (`COLLECTION`, `PAYMENT_REVERSAL`, `LOAN_CANCELLATION`, etc.), renovaciones (`renewals`) y liquidaciones (`daily_settlements`).
- **FR-002**: El sistema DEBE proveer una tabla de libro mayor financiero inmutable (`financial_events` en la nube y `financial_event` en el escritorio) de solo inserción (*append-only*), con `office_id`, número de secuencia monotónico, `idempotency_key` único por oficina, tipo de evento, deltas financieros (`portfolio_delta`, `cash_delta`, `digital_delta`), actor, fecha del hecho y snapshot JSON inmutable.
- **FR-003**: Tanto la base de datos en la nube como la base de datos local de escritorio DEBEN imponer la inmutabilidad a nivel de motor de base de datos (triggers que bloquean `UPDATE` y `DELETE`).
- **FR-004**: El sistema DEBE calcular proyecciones verificables de saldos (`Cartera`, `Base`, `Digital`, `Administrativo`) a partir del libro mayor inmutable usando aritmética exacta (`BigDecimal` en el escritorio).
- **FR-005**: La cartera real de Inversiones FBV contenida en `respaldo-fbv-2026-11-20.json` DEBE quedar importada con 100% de integridad bajo `off-fbv-001`, incluyendo su registro inicial en el libro mayor inmutable.
- **FR-006**: La aplicación móvil/web DEBE sincronizar renovaciones, liquidaciones y eventos financieros inmutables hacia y desde la nube, preservando las fechas en zona horaria de Colombia (`America/Bogota`).

### Key Entities

- **FinancialEvent (Hecho Financiero Inmutable)**: Registro atómico *append-only* de un suceso de dinero (`LOAN_DISBURSED`, `PAYMENT_RECEIVED`, `PAYMENT_REVERSED`, `RENEWAL_EXECUTED`, `EXPENSE_RECORDED`, `CAPITAL_INJECTED`, `OFFICE_WITHDRAWAL`, `PAPERWORK_WITHDRAWAL`, `SETTLEMENT_CLOSED`, `OFFICE_OPENING_BALANCE`, `ADJUSTMENT_ENTRY`).
- **Renewal (Renovación)**: Vínculo auditable entre crédito anterior liquidado y nuevo crédito desembolsado.
- **DailySettlement (Liquidación Diaria)**: Cierre sellado e inmutable de una jornada de ruta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Iniciar sesión con `admin-fbv` en una pestaña nueva en incógnito muestra el 100% de los 21 clientes activos, 22 préstamos, 307 cuotas, 35 pagos, 1 renovación, 3 liquidaciones y 60 movimientos de caja de Inversiones FBV (cartera activa `$5.545.000`).
- **SC-002**: El 100% de los intentos de `UPDATE` o `DELETE` sobre el libro mayor inmutable son rechazados por el motor de base de datos (tanto en SQLite como en PostgreSQL).
- **SC-003**: Reintentar el mismo evento financiero con idéntico `idempotency_key` produce exactamente 1 registro en el libro mayor (0% duplicación).
- **SC-004**: La suite de pruebas de escritorio (`.\gradlew.bat compileJava test`) y el despliegue web en producción (`https://cartera-movil.expo.app`) pasan al 100%.

## Assumptions

- El archivo `c:\Users\ASUS\Downloads\respaldo-fbv-2026-11-20.json` es la fuente de verdad actual para restaurar la oficina `Inversiones FBV` (`off-fbv-001`).
- El patrón inmutable (estilo Datomic/Nubank) se implementa como un libro mayor *append-only* sobre las bases existentes (PostgreSQL en Supabase y SQLite en escritorio) para mantener operación 100% offline-first y compatibilidad con Windows nativo.
