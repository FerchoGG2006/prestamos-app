# Feature Specification: Sistema de Cartera y Cobros (Windows Desktop & Sincronización Multi-Ruta)

**Feature Branch**: `001-sistema-cartera-cobros`

**Created**: 2026-11-16

**Status**: Implemented & Verified

**Input**: User description: "Aplicación nativa de escritorio para administración de cartera, otorgamiento de microcréditos, control de cobradores, liquidación diaria multi-ruta y sincronización LAN con terminales móviles."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cobros Diarios e Imputación Exacta de Pagos (Priority: P1)

El administrador de oficina o cobrador registra pagos recibidos de clientes sobre sus créditos activos. Un pago puede cubrir parcialmente una cuota, completar la cuota del día, o cubrir múltiples cuotas futuras (marcándolas como adelantadas), generando asignaciones explícitas e inmutables sin duplicarse ante reintentos.

**Why this priority**: Es la operación financiera central del negocio; garantiza que el dinero recaudado impacte con precisión el saldo del crédito, el estado de cada cuota y la caja operativa.

**Independent Test**: Se puede probar registrando un abono parcial, un pago exacto y un pago multimonto sobre un crédito activo, verificando las asignaciones creadas, la actualización de estados de cuota y el rechazo idempotente ante el envío repetido de la misma clave de operación.

**Acceptance Scenarios**:

1. **Given** un crédito activo con cuotas en estado `PENDIENTE`, **When** se registra un pago menor al valor de la primera cuota pendiente, **Then** la cuota actualiza su monto abonado y pendiente y pasa a estado `PARCIAL` sin crear ni eliminar cuotas.
2. **Given** un crédito activo con varias cuotas pendientes, **When** se registra un pago cuyo monto cubre la cuota actual y una cuota futura, **Then** se crean registros separados de asignación para cada cuota cubierta, la cuota actual pasa a `PAGADA` y la cuota futura pasa a `ADELANTADA`.
3. **Given** un pago previamente procesado con una clave única de idempotencia, **When** el sistema recibe nuevamente la misma solicitud de pago (por reintento o sincronización móvil), **Then** el sistema no duplica el pago ni altera dos veces el saldo o la caja.

---

### User Story 2 - Otorgamiento de Créditos Nuevos y Renovaciones con Papelería (Priority: P2)

El operador otorga microcréditos nuevos calculando el interés plano sobre el capital inicial y generando el calendario numerado de cuotas, o renueva créditos vigentes descontando el saldo pendiente anterior y el cargo configurable de papelería para determinar el efectivo neto a entregar.

**Why this priority**: Permite la colocación de capital y la continuidad comercial con clientes recurrentes separando contablemente el capital pactado del desembolso físico de efectivo.

**Independent Test**: Se puede probar creando un crédito nuevo de $100.000 al 20% y posteriormente renovándolo cuando aún tiene saldo pendiente, comprobando que el capital nuevo, el saldo anterior deducido, la papelería y el efectivo neto entregado quedan registrados por separado.

**Acceptance Scenarios**:

1. **Given** un cliente registrado en una ruta activa, **When** se aprueba un crédito nuevo indicando capital inicial, tasa de interés comercial y número de cuotas, **Then** el sistema calcula `interés = capital inicial × tasa`, `total pactado = capital inicial + interés`, genera todas las cuotas numeradas y registra la salida de efectivo en caja.
2. **Given** un cliente con un crédito activo con saldo pendiente, **When** se ejecuta una renovación por un nuevo capital solicitado, **Then** el sistema liquida el saldo anterior, calcula la papelería configurada ($5.000 por cada $100.000 por defecto) y registra `efectivo entregado = capital nuevo − saldo anterior − papelería`.

---

### User Story 3 - Gestión de Rutas, Jornadas, Caja, Arqueo y Liquidación Diaria Inmutable (Priority: P3)

La oficina administra múltiples rutas de cobro, abre y cierra jornadas diarias por ruta/cobrador, registra movimientos de caja (entradas, salidas, gastos de ruta y ajustes), compara la liquidación esperada contra el arqueo físico de efectivo y bloquea cualquier edición libre sobre una liquidación cerrada.

**Why this priority**: Asegura el control interno diario de cada ruta, separando el movimiento contable de la ruta respecto del efectivo físico contado en oficina.

**Independent Test**: Se puede probar abriendo una jornada de ruta, registrando cobros y gastos, ejecutando el cierre con un monto de efectivo físico distinto al esperado (exigiendo justificación escrita) y verificando que la liquidación cerrada es inmutable.

**Acceptance Scenarios**:

1. **Given** una jornada diaria abierta con cobros y desembolsos registrados, **When** el administrador realiza el cierre e ingresa un arqueo físico que difiere del efectivo esperado, **Then** el sistema exige una explicación obligatoria antes de permitir el cierre de la liquidación.
2. **Given** una liquidación diaria en estado cerrada, **When** un usuario intenta modificar o eliminar directamente sus montos, **Then** el sistema rechaza la edición directa y exige que cualquier ajuste posterior quede trazado como movimiento correctivo auditado.

---

### User Story 4 - Seguridad por Rol, Sincronización LAN Offline-First, Respaldos y Reportes (Priority: P4)

El sistema autentica usuarios mediante credenciales cifradas por oficina y ruta, opera 100% fuera de línea sobre base de datos transaccional local, sincroniza paquetes de cobradores móviles en red local (LAN), genera respaldos íntegros de base de datos y exporta reportes compatibles con hojas de cálculo.

**Why this priority**: Garantiza la operación autónoma en oficinas sin dependencia de internet ni servidores externos, protegiendo el acceso y facilitando la auditoría contable.

**Independent Test**: Se puede probar iniciando sesión con credenciales de administrador, sincronizando un lote móvil por LAN con PIN de oficina, exportando un respaldo de base de datos y generando un reporte de cartera en formato compatible con Excel.

**Acceptance Scenarios**:

1. **Given** una oficina recién instalada o en operación, **When** un usuario inicia sesión o cambia contraseñas de administrador/ruta, **Then** las credenciales se verifican utilizando derivación criptográfica segura con sal aleatoria y nunca en texto plano.
2. **Given** cobros realizados en un dispositivo móvil de ruta, **When** se transmite el paquete de sincronización en red local con el PIN de la oficina, **Then** el servidor local valida tamaño, frecuencia e idempotencia e incorpora los cobros y renovaciones dentro de una transacción auditable.

---

### Edge Cases

- **Pago superior al saldo total del crédito**: El sistema impide asignar más dinero del saldo pendiente total de las cuotas del crédito.
- **Reintentos duplicados de sincronización LAN**: Si un dispositivo móvil reenvía un lote ya procesado tras un corte de red Wi-Fi, las claves de idempotencia descartan duplicados sin arrojar inconsistencias contables.
- **Diferencia de arqueo sin justificación**: El cierre de liquidación diaria se bloquea si existe descuadre entre efectivo esperado y contado y el campo de observación/motivo está vacío.
- **Cambio de ruta de un cliente**: Reasignar un cliente a otra ruta conserva intacto todo su historial de créditos y pagos previos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ejecutarse como una aplicación nativa de escritorio para Windows con su propio entorno de ejecución integrado, sin depender de navegadores web, servidores externos ni instalación manual de dependencias por parte de la oficina.
- **FR-002**: El sistema DEBE representar y calcular todos los valores monetarios con aritmética decimal exacta y redondeo definido, prohibiendo el uso de tipos de punto flotante binario.
- **FR-003**: El sistema DEBE calcular el interés de cada crédito sobre el capital inicial usando una tasa comercial configurable (20% por defecto) y generar cuotas numeradas con fecha, valor, abonado, pendiente y estado (`PENDIENTE`, `PARCIAL`, `PAGADA`, `ADELANTADA`, `VENCIDA`).
- **FR-004**: El sistema DEBE persistir cada pago (`Payment`) de forma separada de sus registros de aplicación por cuota (`PaymentAllocation`), garantizando que la suma de asignaciones coincida exactamente con el monto del pago.
- **FR-005**: El sistema DEBE garantizar idempotencia en el registro de pagos y operaciones sincronizadas mediante claves únicas de operación.
- **FR-006**: El sistema DEBE soportar renovaciones de créditos registrando por separado el capital nuevo solicitado, el saldo anterior deducido, el cargo configurable de papelería ($5.000 por cada $100.000 por defecto) y el efectivo neto entregado.
- **FR-007**: El sistema DEBE gestionar rutas de cobro, jornadas diarias (`ABIERTA`, `CERRADA`), movimientos de caja (`ENTRADA`, `SALIDA`, `AJUSTE`), arqueo físico de efectivo y liquidaciones diarias inmutables.
- **FR-008**: El sistema DEBE registrar trazabilidad en bitácora de auditoría (`AuditLog`) para toda operación financiera (usuario, fecha, entidad, acción, valores y motivo) y prohibir borrados silenciosos.
- **FR-009**: El sistema DEBE proteger las credenciales mediante derivación criptográfica con sal aleatoria y controlar el acceso de sincronización en red local (LAN) con límites de trama, control de frecuencia por IP y PIN de oficina opcional.
- **FR-010**: El sistema DEBE permitir crear e importar copias de seguridad locales de la base de datos y exportar informes de cartera, cuotas, pagos y clientes en formato compatible con hojas de cálculo.

### Key Entities

- **AppUser & Route**: Usuarios operadores (Administrador / Cobrador) y rutas de recaudo con credenciales y asignación operativa.
- **Customer**: Cliente de microcrédito con documento, teléfono, dirección, referencias y ruta asignada.
- **Loan & Installment**: Crédito otorgado (`NUEVO` o `RENOVACIÓN`) y su plan de cuotas numeradas con saldos individuales.
- **Payment & PaymentAllocation**: Evento de cobro recibido e imputaciones individuales a cada cuota cubierta.
- **Renewal**: Registro formal de renovación que vincula el crédito anterior liquidado con el nuevo crédito y desglosa capital, saldo descontado, papelería y desembolso neto.
- **CollectionSession, CashMovement & DailySettlement**: Jornada operativa de la ruta, movimientos detallados de efectivo en caja y liquidación/arqueo inmutable de cierre.
- **AuditLog & SystemSetting**: Bitácora de auditoría inalterable y parámetros comerciales configurables de la oficina.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los cálculos de préstamos, abonos parciales, pagos adelantados, renovaciones y cierres de caja mantienen precisión decimal exacta con cero discrepancias de redondeo.
- **SC-002**: Un operador de oficina puede registrar un cobro en ventanilla o ruta en menos de 10 segundos mediante el flujo de cobro rápido de 1-clic.
- **SC-003**: El 100% de los paquetes de sincronización reenviados con la misma clave de idempotencia producen cero pagos o movimientos de caja duplicados.
- **SC-004**: Cualquier equipo Windows de 64 bits puede instalar y abrir el sistema mediante el instalador oficial o paquete portable sin requerir conexión a internet ni configuraciones técnicas adicionales.

## Assumptions

- Las fórmulas de recargo automático por mora permanecen desactivadas/abstractas hasta que la gerencia comercial defina una política única de cálculo; el seguimiento de vencimiento es factual (`VENCIDA`).
- La operación principal reside localmente en cada oficina con respaldos locales y sincronización LAN con los dispositivos móviles de los cobradores.
