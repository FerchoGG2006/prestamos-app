# Auditoría del proyecto — Sistema de Cartera

**Fecha:** 2026-09-20  
**Base auditada:** rama `main`, commit `29751b10a0169ee525b84b5b74d42f47379daae6`  
**Alcance:** diagnóstico previo a migración. No se modificó código de producto.

## 1. Resumen ejecutivo

El repositorio actual es un prototipo funcional **Expo / React Native / TypeScript** que puede abrirse en Electron. Aunque se presenta como escritorio, el comando `desktop` inicia Expo Web en `127.0.0.1:8081` y Electron carga esa URL. Por tanto, **no cumple** el requisito de una aplicación Windows nativa JavaFX sin navegador/WebView/localhost.

Tiene valor importante para la migración: el dominio de créditos ya modela pagos parciales, distribución de un pago en cuotas, renovaciones, arqueo, auditoría y configuraciones comerciales. Debe conservarse como especificación y convertirse con pruebas equivalentes a Java; no debe trasladarse React, Electron ni AsyncStorage al runtime final.

## 2. Stack actual

| Área | Hallazgo | Decisión |
|---|---|---|
| UI | React Native 0.86 + React 19 + Expo 57 | Migrar a JavaFX; conservar flujos, textos y estilo como referencia. |
| Escritorio actual | Electron 44 sobre Expo Web | Eliminar como runtime final. No es escritorio JavaFX real. |
| Lenguaje | TypeScript 6 | Reimplementar dominio en Java 21 LTS (o 25 si se valida compatibilidad). |
| Persistencia | `@react-native-async-storage/async-storage`, JSON por colección | Reemplazar por SQLite + JPA/Hibernate + Flyway. |
| Backend | No existe Spring Boot ni API de dominio separada | Crear monolito modular Java con Spring Boot embebido/interno, sin UI web. |
| Pruebas | Un script con `console.assert`; no hay runner configurado | Migrar los casos a JUnit 5; añadir Mockito y Testcontainers cuando exista persistencia/sync. |
| Empaquetado | No hay instalador ni pipeline | Implementar `jpackage` para instalador Windows. |

Dependencias que no pertenecen al producto final: Expo, React, React Native, React DOM/Web, Electron, `wait-on`, `concurrently`, `lucide-react-native` y AsyncStorage.

## 3. Estructura y componentes existentes

```text
App.tsx                              composición, navegación y selector manual de modo
electron/main.js                     shell Electron que carga localhost / HTML splash
src/core/config/business-rules.ts    parámetros comerciales en memoria
src/core/domain/types.ts             contratos del dominio
src/core/domain/calculator.ts        cálculos y aplicación de pagos
src/infrastructure/storage/          semilla y almacén JSON AsyncStorage
src/presentation/components/         modales de pago, promesa, renovación y liquidación
src/presentation/views/admin/        dashboard, créditos, liquidaciones, auditoría, ajustes
src/presentation/views/collector/    cobros de hoy y ficha 360° de cliente
src/presentation/theme/colors.ts     tokens de color
assets/                              iconos Expo/Android y splash
```

## 4. Assets y dirección visual

Los assets disponibles son `icon.png`, `splash-icon.png`, `favicon.png` y tres iconos Android. No se encontraron logos, fuentes personalizadas, imágenes de clientes ni ilustraciones.

La paleta reutilizable está en `src/presentation/theme/colors.ts`: fondos azul pizarra `#0f172a/#1e293b/#334155`; azul principal `#2563eb`; éxito `#10b981`; alerta `#f59e0b`; mora `#ef4444`; información `#0ea5e9`; renovación `#8b5cf6`. Migrar estos tokens a una hoja CSS de JavaFX y validar contraste y densidad de tablas en escritorio.

## 5. Funcionalidad ya representada

| Dominio / flujo | Estado actual |
|---|---|
| Usuarios, roles y rutas | Tipos y datos de semilla; no hay autenticación ni autorización ejecutable. |
| Clientes y ficha 360° | Vista de detalle y tipos con referencias, contacto, ruta y cobrador. |
| Créditos | Creación desde tabla; interés plano y cuotas generadas en memoria. |
| Cuotas y pagos | Parcial, varias cuotas y adelantado modelados por `applyPaymentToLoan`. |
| Renovación | Registra capital nuevo, deducción de saldo, papelería y efectivo neto. |
| Cobros diarios | Vista del cobrador y sesión local activa. |
| Promesas | Modal y persistencia local. |
| Caja / liquidación / arqueo | Cierre de jornada con diferencia y justificación obligatoria. |
| Auditoría | Se agrega para pago y cierre; cobertura incompleta. |
| Offline | Persistencia local JSON, sin cola, sincronización, transacciones ni resolución de conflictos. |

## 6. Modelo y reglas existentes: observaciones críticas

- El dominio usa `number` para dinero. En Java debe ser `BigDecimal`; en SQLite/PostgreSQL, `NUMERIC/DECIMAL` con escala única documentada.
- `Payment` incorpora `installmentsBreakdown` como JSON/valor embebido. El modelo definitivo requiere `Payment` y `PaymentAllocation` persistidos por separado.
- La fecha operativa está fijada a `2026-09-19` en `App.tsx`; debe venir de un reloj/servicio de jornada.
- `recordPayment` construye una clave de idempotencia, pero no la consulta ni la impone de forma única. No protege de duplicados ante reintento.
- `recordRenewal` usa fecha final aproximada fija (`2026-10-30`) y genera IDs con reloj/aleatoriedad. Ambos deben ser servicios deterministas y transaccionales.
- Las configuraciones se muestran y editan visualmente, pero `ConfigView` no las persiste ni las aplica.
- El cálculo de mora deja el recargo en cero por defecto, correcto; sin embargo ya contiene fórmulas hipotéticas condicionales. Deben trasladarse sólo como una interfaz/estrategia no activada, no como regla aprobada.
- La liquidación cuenta todas las renovaciones históricas (`this.renewals`) en vez de limitarse a la jornada; debe corregirse durante la migración.
- No hay autenticación, hash de contraseñas, permisos de capa de servicio, bloqueo de edición de liquidación cerrada, sincronización central ni trazabilidad integral.

## 7. Qué se conserva, migra y descarta

### Conservar como fuente de requisitos

- Tipos y relaciones de `src/core/domain/types.ts`.
- Casos de cálculo de `calculator.ts`, después de verificarlos contra las reglas confirmadas.
- Casos de prueba de `calculator.test.ts` como matriz inicial de aceptación.
- Flujos operativos de `TodayCollectionsView`, `CustomerDetailView`, modales y vistas administrativas.
- Texto funcional, datos de semilla, paleta de color e iconos existentes.

### Migrar / rediseñar

- Dominio a paquetes Java por contexto y capas `domain`, `application`, `infrastructure`, `presentation`.
- Almacén JSON a SQLite, entidades JPA y migraciones Flyway.
- Componentes React Native a controles JavaFX: shell, sidebar, top bar, tablas, diálogos y formularios reutilizables.
- Auditoría y caja a servicios transaccionales autorizados.
- Offline a `SyncOperation` con UUID/idempotency key, cola y motor de sincronización.

### Descartar como runtime final

- React Native, Expo, React Web, Electron, HTML splash y localhost.
- AsyncStorage como fuente financiera.
- Selector visible `Cobrador (Móvil) / Admin (Desktop)`; el rol autenticado decide la experiencia.

## 8. Arquitectura propuesta

```text
JavaFX desktop (sin WebView)
        │
presentation → application → domain ← infrastructure
        │                         │
        └── SQLite/Flyway/JPA ─────┘
                 │
       Sync queue / sync engine (futuro)
                 │
          PostgreSQL central
```

Paquetes iniciales: `auth`, `users`, `customers`, `routes`, `collectors`, `loans`, `installments`, `payments`, `delinquency`, `renewals`, `cash`, `settlements`, `reports`, `audit`, `configuration` y `sync`. Spring Boot se usa para infraestructura y composición interna; no se expone UI HTML.

## 9. Riesgos de migración

1. **Reglas financieras incompletas:** mora y redondeo de papelería requieren decisión de negocio; no se deben inferir.
2. **Integridad financiera:** el prototipo en memoria no ofrece transacciones, restricciones únicas ni bloqueo de concurrencia.
3. **Datos existentes:** al no existir una base persistente versionada, se debe decidir si los datos AsyncStorage/semilla se migran o se descartan como demo.
4. **Alcance UI:** hay sólo un subconjunto de pantallas requeridas; no confundir pantallas existentes con cobertura funcional completa.
5. **Sincronización:** debe desarrollarse después de que la operación SQLite sea transaccional y auditable.

## 10. Plan de migración por fases

1. Fijar decisiones pendientes, aprobar este modelo y definir política de datos de demostración.
2. Crear esqueleto Maven/Gradle Java 21, JavaFX, Spring Boot interno, SQLite, JPA y Flyway.
3. Implementar modelo financiero, dinero, repositorios y pruebas JUnit antes de pantallas.
4. Migrar clientes, créditos, cuotas, pagos y asignaciones.
5. Migrar rutas, jornadas, renovaciones, caja, arqueo y liquidaciones.
6. Construir shell JavaFX y experiencias por rol; migrar las pantallas de mayor valor operativo primero.
7. Añadir auditoría, autorización, reportes y configuración persistente.
8. Incorporar cola offline/sync con PostgreSQL central y pruebas de idempotencia.
9. Empaquetar y validar `SistemaCartera.exe` con `jpackage`.

