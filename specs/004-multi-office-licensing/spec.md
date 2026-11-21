# Feature Specification: Multi-Office Registry, Licensing & Device Linking

**Feature Branch**: `004-multi-office-licensing`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Vender el sistema a múltiples oficinas: crear credenciales y oficinas desde un registro real, evitar que los celulares nuevos aparezcan preconfigurados como 'Inversiones FBV' con admin-fbv por defecto, vincular cada celular a su oficina con código de activación y credenciales, aislar datos por oficina con control de licencias, y proteger/respaldar los datos actuales de Inversiones FBV."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Registro Comercial de Oficinas y Licencias (Priority: P1)

Como vendedor/propietario del sistema, necesito un panel de administración comercial para registrar cada nueva oficina cliente, asignarle un identificador único e inmutable, un código de activación, sus credenciales iniciales de administrador y el estado de su licencia (activa, suspendida o con fecha de vencimiento), para poder vender y entregar el sistema de forma controlada a múltiples negocios.

**Why this priority**: Sin un registro formal de oficinas y licencias, no es posible comercializar el sistema a terceros ni controlar qué oficinas tienen acceso habilitado.

**Independent Test**: El vendedor crea una nueva oficina ("Oficina Norte") con licencia activa, obtiene un código de activación único y credenciales de administrador; luego verifica que aparece en el listado de oficinas con su estado de licencia y que puede suspenderla o reactivarla.

**Acceptance Scenarios**:

1. **Given** el vendedor accede al panel comercial de oficinas, **When** registra una nueva oficina con nombre comercial, usuario administrador, contraseña inicial y tipo de licencia, **Then** el sistema genera un identificador único e inmutable para la oficina y un código de activación irrepetible, y guarda la oficina con licencia activa.
2. **Given** una oficina registrada con licencia activa, **When** el vendedor suspende la licencia o la fecha de vencimiento expira, **Then** el estado de la oficina cambia a suspendida/vencida y no permite nuevas vinculaciones ni sincronización hasta ser reactivada.
3. **Given** una oficina registrada, **When** su administrador edita el nombre comercial o datos de contacto de la oficina, **Then** el identificador único de la oficina permanece intacto para no desconectar sus dispositivos ni su historial.

---

### User Story 2 - Arranque Limpio y Vinculación de Dispositivos por Oficina (Priority: P1)

Como oficina compradora (administrador o cobrador), al abrir una instalación nueva en escritorio o celular, no debo ver datos ni usuarios precargados de "Inversiones FBV"; en su lugar, debo poder vincular el equipo ingresando el código de activación de mi oficina y mis credenciales asignadas para cargar únicamente la configuración, rutas y usuarios de mi oficina.

**Why this priority**: Actualmente todos los celulares nuevos arrancan preconfigurados como "Inversiones FBV" y con usuario `admin-fbv`, lo que impide entregar la aplicación a otros clientes.

**Independent Test**: Se abre una instalación limpia sin datos previos; el sistema solicita vinculación de oficina (código de activación y usuario/contraseña). Al ingresar los datos de la "Oficina Norte", la app muestra el nombre "Oficina Norte" y solo sus rutas y usuarios, sin rastros de "Inversiones FBV".

**Acceptance Scenarios**:

1. **Given** una instalación nueva sin oficina vinculada, **When** el usuario abre la aplicación, **Then** el sistema muestra la pantalla de vinculación/inicio de sesión limpia, sin precargar "Inversiones FBV", sin crear usuarios por defecto y sin marcar ninguna oficina como configurada.
2. **Given** una instalación sin vincular, **When** el usuario ingresa un código de activación válido de una oficina con licencia activa y credenciales válidas de esa oficina, **Then** el dispositivo queda vinculado a esa oficina y descarga únicamente el nombre, configuración, rutas y cartera de esa oficina.
3. **Given** un código de activación inexistente o perteneciente a una oficina con licencia suspendida/vencida, **When** el usuario intenta vincular un dispositivo, **Then** el sistema rechaza la vinculación con un mensaje claro indicando el motivo.

---

### User Story 3 - Aislamiento Total de Datos y Sincronización Multi-Oficina (Priority: P1)

Como oficina cliente, necesito que todos mis usuarios, rutas, clientes, préstamos, cuotas, pagos y movimientos de caja queden estrictamente asociados al identificador único de mi oficina, garantizando que ningún otro cliente pueda ver, sobrescribir o mezclar información con la mía durante la sincronización entre escritorio y celulares.

**Why this priority**: Si dos oficinas comparten datos o sobrescriben registros por usar nombres iguales o identificadores derivados del nombre, se produce fuga o corrupción de datos financieros.

**Independent Test**: Dos oficinas distintas ("Oficina A" y "Oficina B", incluso con nombres comerciales similares) operan y sincronizan clientes y pagos; al consultar desde cada oficina, ninguna ve registros de la otra y cambiar el nombre comercial de "Oficina A" no rompe su sincronización.

**Acceptance Scenarios**:

1. **Given** dos oficinas activas con sus dispositivos vinculados, **When** ambas sincronizan clientes, préstamos y cobros, **Then** cada registro queda etiquetado con el identificador único de su oficina y las consultas de cada oficina devuelven exclusivamente sus propios registros.
2. **Given** un cobrador de la Oficina A intentando iniciar sesión o sincronizar contra la Oficina B, **When** envía credenciales o datos, **Then** el sistema rechaza la operación por no pertenecer a esa oficina.

---

### User Story 4 - Respaldo y Migración Segura de "Inversiones FBV" (Priority: P2)

Como dueño actual del sistema y de la cartera "Inversiones FBV", necesito que antes de activar el nuevo esquema de arranque limpio y vinculación, mis datos actuales de "Inversiones FBV" queden respaldados y asociados formalmente a una oficina registrada con licencia activa, sin perder clientes, créditos, cuotas ni cobros en curso.

**Why this priority**: Protege la operación real en curso de FBV mientras se habilita el sistema para venderlo a nuevos clientes.

**Independent Test**: Se ejecuta un respaldo exportable de la cartera actual de FBV, se registra FBV como oficina formal con su código de activación, y los dispositivos existentes de FBV continúan operando sobre sus datos sin pérdida ni duplicación.

**Acceptance Scenarios**:

1. **Given** un dispositivo con datos reales previos de "Inversiones FBV", **When** se actualiza a la nueva versión, **Then** el sistema conserva los datos locales existentes y permite respaldarlos/vincularlos explícitamente a la oficina formal de FBV sin borrarlos automáticamente.

---

### Edge Cases

- ¿Qué ocurre si dos oficinas compradoras eligen el mismo nombre comercial (ej. "Inversiones del Norte")? Al usar un identificador único inmutable (`office_id`) y un código de activación único generado al crear la oficina, ambas permanecen completamente aisladas sin colisión.
- ¿Qué ocurre si un celular ya vinculado intenta sincronizar cuando su licencia fue suspendida? El sistema debe bloquear la sincronización hacia/desde la nube e informar al usuario que la licencia de su oficina se encuentra suspendida o vencida, sin borrar los datos locales ya capturados en calle.
- ¿Qué ocurre si el cobrador intenta cambiar el nombre de la empresa localmente en el celular? Un cobrador no debe poder cambiar la oficina a la que está vinculado el dispositivo; solo un administrador o un proceso explícito de desvinculación/cambio de oficina puede hacerlo.
- ¿Qué ocurre si se pierde conexión a internet en calle después de vincular el celular? El celular ya vinculado sigue operando offline con los datos locales de su oficina y sincroniza al recuperar conectividad (siempre que la licencia siga activa).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE proveer un módulo de administración comercial (panel de vendedor) protegido para crear, listar, consultar, editar estado de licencia (activa, suspendida, vencida) y regenerar códigos de activación de oficinas clientes.
- **FR-002**: Al registrar una oficina, el sistema DEBE generar un identificador único e inmutable (`office_id`) independiente del nombre comercial editable de la oficina, junto con un código de activación único y credenciales iniciales del administrador de esa oficina.
- **FR-003**: Toda instalación nueva (escritorio o aplicación móvil acompañante) DEBE iniciar sin datos comerciales de "Inversiones FBV", sin marcar la oficina como configurada por defecto y sin crear usuarios predefinidos (`admin-fbv` o `cobrador` genéricos).
- **FR-004**: El sistema DEBE permitir vincular un dispositivo (escritorio o celular) mediante código de activación de oficina + usuario y contraseña pertenecientes a esa oficina, validando que la licencia de la oficina esté activa.
- **FR-005**: Todos los registros operativos y financieros (usuarios, rutas, clientes, préstamos, cuotas, renovaciones, pagos, promesas y movimientos de caja) DEBEN asociarse al `office_id` único e inmutable, eliminando cualquier derivación de `office_id` basada en el texto del nombre comercial.
- **FR-006**: El sistema DEBE impedir que un usuario o dispositivo vinculado a una oficina acceda, consulte o sincronice datos de otra oficina.
- **FR-007**: El sistema DEBE proveer un mecanismo seguro de respaldo y transición para los datos reales existentes de "Inversiones FBV" antes de aplicar la vinculación formal a su propio `office_id`.
- **FR-008**: Las credenciales de acceso (vendedor, administradores de oficina y cobradores) DEBEN almacenarse y verificarse mediante derivación criptográfica segura, nunca en texto plano.

### Key Entities *(include if feature involves data)*

- **Office (Oficina)**: Representa una empresa/cliente comprador del sistema. Atributos clave: identificador único e inmutable (`id`), nombre comercial, código de activación único, estado de licencia (`ACTIVE`, `SUSPENDED`, `EXPIRED`), fecha de expiración opcional, datos de contacto y configuración operativa.
- **License / Activation Code (Licencia y Código de Activación)**: Control comercial asociado a cada oficina que determina si puede vincular nuevos dispositivos y sincronizar datos.
- **User (Usuario de Oficina)**: Administrador, supervisor o cobrador perteneciente estrictamente a un único `office_id`, con credenciales verificables y rutas asignadas.
- **Device Link (Vinculación de Dispositivo)**: Asociación local en el equipo de escritorio o celular con el `office_id` al que pertenece tras validar código de activación y credenciales.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un vendedor puede dar de alta una nueva oficina con licencia activa y código de activación en menos de 2 minutos.
- **SC-002**: El 100% de las instalaciones nuevas arrancan sin referencias a "Inversiones FBV" ni cuentas predeterminadas activas antes de la vinculación.
- **SC-003**: Un cobrador o administrador puede vincular su celular con el código de activación y sus credenciales y ver exclusivamente las rutas y datos de su oficina en menos de 1 minuto.
- **SC-004**: El 100% de las operaciones de sincronización entre oficinas distintas mantienen aislamiento completo (0 registros cruzados incluso con nombres comerciales idénticos).
- **SC-005**: Los datos existentes de "Inversiones FBV" se respaldan y migran a su oficina formal con 0% de pérdida de clientes, préstamos, cuotas o pagos.

## Assumptions

- El panel principal de escritorio sigue siendo la aplicación nativa en Windows (JavaFX + Spring Boot) conforme a la constitución del proyecto, y la aplicación móvil actúa como aplicación acompañante sincronizada.
- Para la vinculación remota de celulares desde cualquier red (no solo LAN local) y el control centralizado de licencias y oficinas, se utiliza el servicio en la nube existente en el proyecto (Supabase) como registro maestro de oficinas, licencias y sincronización multi-tenant.
- El panel comercial de vendedor debe estar protegido para que las oficinas compradoras no puedan crear ni activar licencias por su cuenta.
- Las licencias pueden ser indefinidas (sin fecha de vencimiento, ej. venta única) o con fecha de vencimiento (ej. suscripción mensual/anual), controladas mediante el estado de la oficina y una fecha opcional de expiración.
