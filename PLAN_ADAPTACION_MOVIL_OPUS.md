# PLAN DE ADAPTACIÓN MÓVIL Y MODERNIZACIÓN FINTECH UI/UX (`prestamos-app-1`)

> **Documento de Arquitectura Principal & Playbook de Ejecución para Opus 5.5**  
> **Fecha de Auditoría:** 2026-10-15  
> **Stack Auditado:** Java 21 LTS • JavaFX 21.0.6 • Spring Boot 3.4.13 (`WebApplicationType.NONE`) • SQLite 3 (`cartera.db`) + Flyway • React Native 0.86 / Expo 57 (`legacy/`)  
> **Referencia Visual:** Figma *Finance Management Mobile App UI UX Kit for Budget Tracker Financial Prototype Design (Community)* (`node-id=7020-3430`)

---

## 1. Radiografía Real del Código (`desktop/` vs. `legacy/`)

### 1.1 Mapa Exacto del Subproyecto Activo (`desktop/`)

#### A. Configuración de Build y Runtime
- **Build file:** `desktop/build.gradle`
  - **Toolchain:** Java 21 LTS (`JavaLanguageVersion.of(21)`).
  - **JavaFX:** `org.openjfx.javafxplugin` v`0.1.0`, versión `21.0.6`, módulos `javafx.controls`, `javafx.fxml`.
  - **Spring Boot:** `3.4.13` (`spring-boot-starter`, `spring-boot-starter-data-jpa`, sin `spring-boot-starter-web`).
  - **Persistencia:** `org.xerial:sqlite-jdbc:3.49.1.0`, `org.hibernate.orm:hibernate-community-dialects` (`SQLiteDialect`), `org.flywaydb:flyway-core`.
  - **Main Class:** `com.cartera.ui.CarteraApplication`.
- **Propiedades (`desktop/src/main/resources/application.properties`):**
  - `spring.main.web-application-type=none`
  - `spring.datasource.url=jdbc:sqlite:${user.home}/.sistema-cartera/cartera.db`
  - `spring.jpa.hibernate.ddl-auto=validate`
  - `spring.flyway.locations=classpath:db/migration`
  - `cartera.demo-data.enabled=true`

#### B. Esquema SQLite Real (`V1__initial_financial_schema.sql`) vs. Entidades JPA
La migración `desktop/src/main/resources/db/migration/V1__initial_financial_schema.sql` define **19 tablas** en `cartera.db`, de las cuales **12 tienen `@Entity` y `@Repository`** implementados actualmente en `com.cartera.infrastructure.persistence`:

| Tabla SQLite (`V1__initial_financial_schema.sql`) | Entidad JPA (`entity/`) | Repositorio Spring Data (`repository/`) | Estado en `desktop/` |
|---|---|---|---|
| `system_setting` | `SystemSettingEntity.java` | `SystemSettingRepository.java` | Activa (`ConfigurationView`) |
| `app_user` | `AppUserEntity.java` | `AppUserRepository.java` | Activa (`AuthService`, `DataInitializer`) |
| `role` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite, aún no mapeada |
| `user_role` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite, aún no mapeada |
| `route` | `RouteEntity.java` | `RouteRepository.java` | Activa (`DataInitializer`) |
| `customer` | `CustomerEntity.java` | `CustomerRepository.java` | Activa (`CustomersView`, `CreateCustomerUseCase`) |
| `customer_reference` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite; sí usada en `legacy/` |
| `loan` | `LoanEntity.java` | `LoanRepository.java` | Activa (`LoansView`, `CreateLoanUseCase`, `RenewLoanUseCase`) |
| `installment` | `InstallmentEntity.java` | `InstallmentRepository.java` | Activa (`TodayCollectionsService`, `RecordPaymentUseCase`) |
| `collection_session` | `CollectionSessionEntity.java` | `CollectionSessionRepository.java` | Activa (`SettlementUseCase`) |
| `payment` | `PaymentEntity.java` | `PaymentRepository.java` | Activa (`RecordPaymentUseCase`, `ReportsView`) |
| `payment_allocation` | `PaymentAllocationEntity.java` | `PaymentAllocationRepository.java` | Activa (`RecordPaymentUseCase`) |
| `renewal` | `RenewalEntity.java` | `RenewalRepository.java` | Activa (`RenewLoanUseCase`) |
| `payment_promise` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite; sí existe `PromiseModal.tsx` en `legacy/` |
| `delinquency_record` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite |
| `cash_movement` | `CashMovementEntity.java` | `CashMovementRepository.java` | Activa (`CashManagementView`, `RecordPaymentUseCase`) |
| `daily_settlement` | `DailySettlementEntity.java` | `DailySettlementRepository.java` | Activa (`SettlementManagementView`, `SettlementUseCase`) |
| `weekly_settlement` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite |
| `audit_log` | `AuditLogEntity.java` | `AuditLogRepository.java` | Activa (`AuditView`, todos los UseCases) |
| `sync_operation` | *(Sin entidad JPA)* | *(Sin repositorio)* | Tabla creada en SQLite para cola offline/sync |

#### C. Servicios, Casos de Uso y Dominio en `desktop/src/main/java/com/cartera`
- **Dominio Puro (Inmutable con `BigDecimal`):**
  - `domain.money.Money`: Wrapper sobre `BigDecimal` con escala y validaciones monetarias.
  - `installments.domain.Installment` y `InstallmentStatus` (`PENDIENTE`, `PARCIAL`, `PAGADA`, `ADELANTADA`, `VENCIDA`).
  - `loans.domain.LoanCalculator`: `quote(Money principal, BigDecimal interestRate, int installmentCount)` -> `LoanQuote`.
  - `payments.domain.PaymentAllocation`: Registro `(UUID installmentId, Money amount)`.
  - `payments.application.PaymentApplicationService`: Distribuye pagos cronológicamente entre cuotas (`allocate()`).
  - `renewals.domain.RenewalCalculator`: Cálculo de deducción de saldo previo y papelería.
- **Servicios de Aplicación Spring (`@Service` / `@Transactional`):**
  - `collections.application.TodayCollectionsService`: Expone `getDailyMetrics(LocalDate)` (`DailyMetrics`) y `getTodayCollectionItems(LocalDate)` (`List<CollectionItem>`).
  - `payments.application.RecordPaymentUseCase`: Ejecuta cobros idempotentes (`idempotencyKey`), persiste `PaymentEntity`, `PaymentAllocationEntity`, actualiza `InstallmentEntity`, finaliza `LoanEntity` si el saldo llega a `0`, inserta `CashMovementEntity` y `AuditLogEntity`.
  - `customers.application.CreateCustomerUseCase`: Registro transaccional de clientes con auditoría.
  - `loans.application.CreateLoanUseCase`: Simulador de plan de cuotas (`simulatePlan`, excluyendo domingos en modalidad `DIARIO`) y desembolso transaccional (`execute`).
  - `renewals.application.RenewLoanUseCase`: Liquida el préstamo activo anterior, crea el préstamo `RENOVACION`, registra `RenewalEntity`, movimiento de caja por efectivo neto entregado y auditoría.
  - `settlement.application.SettlementUseCase`: Gestiona `CollectionSessionEntity` y cierre inmutable en `DailySettlementEntity`.
  - `infrastructure.security`: `AuthService`, `PasswordHasher`, `UserSession`, `UserSessionContext`.
  - `infrastructure.bootstrap.DataInitializer`: Semilla automática condicional (`cartera.demo-data.enabled=true`) con usuarios `carlos`/`carlos123` y `admin`/`admin123`, ruta `route-norte` y 4 clientes con préstamos en Barranquilla.

#### D. Vistas y Diálogos JavaFX Actuales (`com.cartera.ui` y `com.cartera.ui.views`)
- **Shell Principal:** `CarteraApplication.java` (contiene `sidebar()`, `topBar()`, `navigateTo()`, control de sesión por rol `isCollector()` vs `isAdmin()`).
- **Vistas de Pantalla Completa:**
  - `LoginView.java`: Autenticación contra `AuthService`.
  - `DashboardView.java`: 4 tarjetas `.metric-card` (`Cobrado hoy`, `Clientes por cobrar`, `Cuotas vencidas`, `Caja actual`) + banner de acción hacia `Cobros y Rutas`.
  - `TodayCollectionsView.java`: Barra segmentada (`Ruta y Cobros de Hoy` | `Cuadre y Liquidación Diaria`), buscador `.search-field` y `TableView<CollectionItem>` de 6 columnas con `table-card-footer`.
  - `CustomersView.java`: Barra segmentada (`Ficha de Clientes y Créditos` | `Cartera Global de Préstamos`) y `SplitPane` (60% `TableView<CustomerEntity>`, 40% `detailCard` con resumen de contacto, crédito activo y modal de plan de cuotas).
  - `LoansView.java`: `TableView<LoanEntity>` de 7 columnas con botón `+ Otorgar Crédito` y acción `Renovar` por fila.
  - `TreasuryManagementView.java`: Contenedor con barra segmentada que alterna entre `CashManagementView.java` y `SettlementManagementView.java`.
  - `ReportsView.java`: Contenedor con barra segmentada que alterna entre métricas/tabla consolidada por crédito y `AuditView.java`.
  - `ConfigurationView.java`: Parámetros de empresa (`system_setting`), exportación de backup `.db` (`FileChooser`) y gestión de usuarios cobradores.
- **Diálogos Modales:**
  - `PaymentDialog.java`: Modal para cobrar con atajos (`Cuota exacta`, `2 Cuotas`), selector `EFECTIVO`/`TRANSFERENCIA` y disparo automático de `ReceiptDialog.java`.
  - `ReceiptDialog.java`: Ticket térmico en pantalla con impresión (`PrinterJob`) y copia de texto al portapapeles.
  - `CreateLoanDialog.java`, `RenewLoanDialog.java`, `CustomerDialog.java`.

#### E. Inventario de Clases CSS en `desktop/src/main/resources/ui/theme.css` (429 líneas)
- **Layout y Shell:** `.app-root`, `.view-container`, `.sidebar`, `.brand`, `.nav-button`, `.nav-button-active`, `.top-bar`, `.page-title`, `.status-ok`, `.section-title`, `.sidebar-scroll`, `.sidebar-section-header`, `.sidebar-user-card`, `.sidebar-version`.
- **Tarjetas y Tipografía:** `.metric-card`, `.metric-value`, `.metric-value-green`, `.metric-value-red`, `.muted`.
- **Botones y Segmentos:** `.btn-primary`, `.btn-success`, `.btn-secondary`, `.segment-bar`, `.segment-btn`, `.segment-btn-active`.
- **Badges:** `.badge-today`, `.badge-overdue`, `.badge-paid`.
- **Inputs y Tablas:** `.search-field`, `.text-field`, `.password-field`, `.combo-box`, `.table-card`, `.table-card-footer`, `.table-view`, `.table-row-cell`, `.table-cell`.

---

### 1.2 Hallazgos Críticos de Inconsistencia en `desktop/` (Detectados en la Auditoría)

Antes de transformar la UI, el agente debe corregir **2 inconsistencias de estado en base de datos** descubiertas al cruzar los UseCases con las vistas:

1. **Inconsistencia en `PaymentEntity.status` (`"APLICADO"` vs `"REGISTRADO"`):**
   - `RecordPaymentUseCase.java` (línea 149) guarda cada pago con estado `"APLICADO"`.
   - Sin embargo, `SettlementUseCase.java` (línea 61) y `ReportsView.java` (línea 241) filtran pagos con `"REGISTRADO".equalsIgnoreCase(p.getStatus())`, ignorando los pagos reales cobrados con `RecordPaymentUseCase`.
   - **Corrección obligatoria:** Estandarizar en `"APLICADO"` (o aceptar `Set.of("APLICADO", "REGISTRADO")`) tanto en `SettlementUseCase` como en `ReportsView`.
2. **Inconsistencia en `CashMovementEntity.movementType` (`"ENTRADA"`/`"SALIDA"` vs `"INGRESO"`/`"EGRESO"`):**
   - `RecordPaymentUseCase.java` (línea 200) registra `"ENTRADA"` y `TodayCollectionsService.java` (líneas 90-92) suma `"ENTRADA"` y resta `"SALIDA"`.
   - En cambio, `CreateLoanUseCase.java` (línea 199), `RenewLoanUseCase.java` (línea 163) y `CashManagementView.java` (líneas 149, 204, 209, 235) usan `"INGRESO"` y `"EGRESO"`.
   - **Corrección obligatoria:** Unificar el dominio y las consultas de caja para reconocer ambos pares o normalizar todo a `"ENTRADA"` / `"SALIDA"` según `docs/DOMAIN_MODEL.md` (línea 55).

---

### 1.3 Árbol Real de `legacy/` y Matriz de Paridad Funcional (`legacy/` vs. `desktop/`)

#### Árbol Auditado en `legacy/`
- `legacy/package.json`: Expo `~57.0.24`, React Native `0.86.3`, React `19.2.3`, `@react-native-async-storage/async-storage` `2.2.0`, `lucide-react-native` `^1.47.0`.
- `legacy/src/core/config/business-rules.ts`: Configuración de tasas (20%), papelería ($5.000 por cada $100.000 con modos `PROPORTIONAL`, `STEP_CEIL`, `STEP_FLOOR`), `formatCOP()`.
- `legacy/src/core/domain/types.ts` y `calculator.ts`: `calculateLoanSummary`, `calculatePaperworkFee`, `calculateRenewalDisbursement`, `generateInstallments`, `applyPaymentToLoan`, `calculateDelinquencyMetrics`.
- `legacy/src/infrastructure/storage/local-store.ts` e `initial-data.ts`: Estado reactivo offline-first con `AsyncStorage`.
- `legacy/src/presentation/views/collector/`:
  - `TodayCollectionsView.tsx`: Buscador + **5 chips horizontales de filtro** (`TODOS`, `PENDIENTES`, `PAGADOS`, `MORA`, `PROMESAS`) + **Tarjetas de cobro móviles (`customerCard`)** con semáforo de mora, monto esperado hoy (`pendingAmount + overdueAmount`) y 3 botones de acción (`[ COBRAR ]`, `Promesa`, `Renovar`).
  - `CustomerDetailView.tsx`: **Ficha 360° del Cliente** con llamada telefónica (`Linking.openURL('tel:...')`), referencias personales, 4 KPIs del cliente (`Total Prestado`, `Total Pagado`, `Saldo Actual`, `Días Mora`), progreso del crédito activo, lista de cuotas coloreadas, historial de pagos recientes y promesas de pago.
- `legacy/src/presentation/components/`:
  - `PaymentModal.tsx`: Bottom sheet deslizante (`animationType="slide"`) con píldoras de atajo (`1 Cuota`, `2 Cuotas`), selector de método de pago tipo pill (`💵 Efectivo`, `📲 Transferencia`) y notas.
  - `PromiseModal.tsx`: Bottom sheet para registrar promesas de pago (`promisedAmount`, `promisedDate`, `notes`).
  - `RenewalModal.tsx` y `SettlementModal.tsx`: Modales de renovación con cálculo en vivo de desembolso neto y cierre de jornada separando `collectedCash` vs `collectedTransfers`.

#### Matriz de Paridad Funcional (`legacy/` -> `desktop/` y Flujo Móvil)

| Capacidad / Patrón | Estado en `legacy/` (React/Expo) | Estado en `desktop/` (JavaFX 21) | Acción Arquitectónica Requerida |
|---|---|---|---|
| **Tarjetas de Ruta (`Loan/Route Cards`)** | Implementado en `TodayCollectionsView.tsx` | Solo tabla rígida `TableView` en `TodayCollectionsView.java` | Crear `ListView<CollectionCardItem>` con `CollectionCardCell` virtualizada y toggle Vista Tarjetas / Vista Tabla |
| **Chips de Filtrado Rápido** | 5 chips (`TODOS`, `PENDIENTES`, `PAGADOS`, `MORA`, `PROMESAS`) | No existe (solo buscador de texto) | Implementar barra de chips `.filter-chip` en `TodayCollectionsView.java` y `LoansView.java` |
| **Barra de Progreso de Amortización** | Solo texto en `CustomerDetailView.tsx` | No existe en `TodayCollectionsView.java` ni `LoansView.java` | Añadir `ProgressBar` estilizada (`Cuota X de Y • Z%`) en cada tarjeta de cobro/préstamo |
| **Hero Balance Card (Recaudo vs Meta)** | Básico en `AdminDashboardView.tsx` | 4 `.metric-card` planas sin barra de meta diaria | Crear componente Hero Card en `DashboardView.java` y cabecera de `TodayCollectionsView.java` |
| **Drawer / Bottom Sheet de Abono Rápido** | `PaymentModal.tsx` tipo slide sheet | `PaymentDialog.java` (`Stage` ventana separada) | Crear `QuickPaymentDrawer.java` acoplado al `StackPane` raíz con `TranslateTransition` y 4 píldoras `BigDecimal` |
| **Promesas de Pago (`payment_promise`)** | `PromiseModal.tsx` + filtro `PROMESAS` | Tabla `payment_promise` existe en Flyway pero sin `@Entity` ni UI | Crear `PaymentPromiseEntity`, `PaymentPromiseRepository`, `RecordPromiseUseCase` e integrarlo en las tarjetas |
| **Desglose Efectivo vs Digital en Cuadre** | `local-store.ts` separa `collectedCash` y `collectedTransfers` | `SettlementUseCase.java` suma todo sin separar `EFECTIVO`, `NEQUI`, `TRANSFERENCIA` | Ampliar `DaySettlementSummary` y `SettlementManagementView.java` para desglosar Efectivo en mano vs Digital |
| **Acción Directa WhatsApp / Recibo** | Llamada en `CustomerDetailView.tsx` | `ReceiptDialog.java` copia al portapapeles | Añadir botón directo **WhatsApp / Copiar Recibo** en tarjeta y abrir `https://wa.me/57...` o portapapeles |

---

## 2. Estrategia de Adaptación Móvil para este Proyecto

> **Cumplimiento de `AGENTS.md`:** La aplicación principal en `desktop/` se mantiene 100% **JavaFX 21 nativa** (cero WebViews, cero HTML/CSS embebido). El directorio `legacy/` se utiliza únicamente como cliente móvil independiente para dispositivos Android/iOS en calle (o emulador Expo), sincronizado mediante paquetes firmados/auditados o LAN con la base `cartera.db` gobernada por Java 21 + `BigDecimal`.

---

### 2.1 Frente A: Modernización en `desktop/` con JavaFX 21 + `theme.css` (Inspirado en Figma `7020-3430`)

#### 1. Modo Responsive / Compacto de Ruta en `CarteraApplication.java`
- Añadir en `CarteraApplication.java` un interruptor en la `topBar()` (`Modo Ruta Compacto` / `Vista Escritorio`) y detección automática del ancho de escena (`scene.widthProperty()`):
  - Cuando el ancho sea `< 1024px` o el usuario active el **Modo Ruta Móvil**, colapsar el `sidebar()` lateral a una barra inferior o rail compacto de iconos (`.bottom-nav-bar` / `.sidebar-compact`) y activar por defecto la vista de tarjetas en `TodayCollectionsView`.

#### 2. Transformación de `DashboardView.java`
- **Reemplazar las 4 tarjetas planas superiores** por la composición del Figma Finance UI Kit:
  - **Hero Balance Card (`.hero-balance-card`):** Muestra el **Recaudo del Día (`BigDecimal`)** frente a la **Meta Diaria Esperada (`BigDecimal`)**, porcentaje de avance (`ProgressBar` `.hero-progress-bar`), y dos sub-indicadores en fila: **Capital Activo en la Calle** y **Total en Mora**.
  - **Quick Action Pills (`.quick-action-pill`):** Fila horizontal de 4 botones táctiles de 1 clic debajo del Hero Card:
    1. `+ Registrar Abono` (navega a `Cobros y Rutas` con foco en buscador/cobro rápido).
    2. `+ Nuevo Préstamo` (abre `CreateLoanDialog`).
    3. `+ Nuevo Cliente` (abre `CustomerDialog`).
    4. `Cuadre de Caja` (navega directamente a la sección `settlement` de `TodayCollectionsView`).
  - **Tarjetas Analytics de Cuadre Rápido (`.analytics-card`):** Dos tarjetas inferiores limpias:
    - *Recaudo Hoy por Medio de Pago*: `Efectivo en Mano` vs. `Nequi / Transferencia` con barras comparativas.
    - *Resumen Operativo de Ruta*: Clientes visitados, pendientes de hoy, en mora y promesas activas.

#### 3. Transformación de `TodayCollectionsView.java` y `LoansView.java`
- **Chips Horizontales de Filtrado Rápido (`.filter-chip`, `.filter-chip-active`):**
  - Debajo del `.search-field`, insertar un `HBox` con chips interactivos que combinan su predicado con el texto buscado sobre el `FilteredList`:
    - `Todos (N)`
    - `Cobrar Hoy (N)`
    - `En Mora (N)`
    - `Al Día / Pagados (N)`
    - `Promesas (N)` *(o `Finalizados` en `LoansView`)*
- **Tarjetas de Préstamo / Ruta de Cobro (`ListView<CollectionItem>` con `CollectionCardCell`):**
  - Mantener un `ToggleButton` en la cabecera para alternar entre **Vista Tarjetas (Figma Mobile Style, por defecto)** y **Vista Tabla (`TableView`)**.
  - Cada tarjeta (`.loan-route-card`) renderiza:
    - **Fila Superior:** Avatar circular con iniciales + Nombre del cliente + Negocio/Barrio + **Badge Pastel** (`.badge-paid` "Al día", `.badge-today` "Cobrar hoy", `.badge-overdue` "En mora X días").
    - **Fila Central (Financiera):** Valor de la cuota del día en `BigDecimal` destacado (`$ 15.000`), saldo restante del crédito (`$ 180.000`) y monto en mora si aplica.
    - **Barra de Amortización (`.amortization-progress`):** `ProgressBar` con etiqueta `Cuota X de Y • Z% pagado` calculada con `BigDecimal.divide(..., RoundingMode.HALF_UP)`.
    - **Fila Inferior (Acciones Directas):**
      - Botón primario `Cobrar en 1 Clic` (abre el `QuickPaymentDrawer` pre-cargado con la cuota exacta).
      - Botón secundario `Promesa` (abre diálogo/drawer de promesa de pago).
      - Botón `Recibo / WhatsApp` (copia el comprobante formateado y abre enlace `https://wa.me/`).

#### 4. Nuevo `QuickPaymentDrawer.java` (Reemplazo/Evolución del Modal `PaymentDialog.java`)
- En lugar de abrir una ventana `Stage` desconectada cada vez, montar un panel deslizante inferior/lateral (`QuickPaymentDrawer extends VBox`) sobre el `StackPane` (`appRoot` o `contentArea` de `TodayCollectionsView`), animado con `TranslateTransition` (220ms `Interpolator.EASE_OUT`).
- **Píldoras de Monto Precalculadas en `BigDecimal` (`.amount-pill`):**
  1. `Cuota exacta` (`item.installmentPending()`)
  2. `2 Cuotas` (`item.installmentPending().multiply(BigDecimal.valueOf(2)).min(item.loanBalance())`)
  3. `Ponerse al día (Mora + Hoy)` (`item.overdueTotal().add(item.installmentPending())`)
  4. `Liquidar total` (`item.loanBalance()`)
- **Selector de Medio de Pago por Píldoras (`.method-pill`):**
  - `EFECTIVO`, `NEQUI`, `TRANSFERENCIA` (reemplazando el `ComboBox` por botones tipo pill de 1 toque).

---

### 2.2 Frente B: Operación en Celular en Calle con `legacy/` (Expo) + Sincronización Offline-First con `cartera.db`

Para cuando el cobrador sale a la calle con su teléfono Android/iOS ejecutando la app móvil de `legacy/` y regresa a la oficina donde corre `desktop/` (o sincroniza por Wi-Fi local):

#### 1. Modernización Visual de `legacy/` al Tema Claro Figma (`#f8fafc`)
- Actualizar `legacy/src/presentation/theme/colors.ts` de modo oscuro (`#0f172a`) al mismo sistema de diseño claro del Figma y de `desktop/src/main/resources/ui/theme.css`:
  - `bgPrimary: '#f8fafc'`, `bgSecondary: '#ffffff'`, `bgTertiary: '#e2e8f0'`, `textPrimary: '#0f172a'`, `textSecondary: '#475569'`, `textMuted: '#64748b'`, `primary: '#2563eb'`, `success: '#059669'`, `danger: '#dc2626'`, `warning: '#d97706'`.
- En `legacy/src/presentation/views/collector/TodayCollectionsView.tsx`:
  - Incorporar el **Hero Balance Card** en la parte superior de la lista con barra de progreso de recaudo diario.
  - Añadir la barra de progreso de amortización (`Cuota X de Y • Z%`) en cada `customerCard`.
  - En `PaymentModal.tsx`, agregar las 4 píldoras (`1 Cuota`, `2 Cuotas`, `Mora + Hoy`, `Liquidar Total`) y el tercer medio de pago `NEQUI`.

#### 2. Protocolo de Sincronización 100% Offline-First con `cartera.db` (Fuente de Verdad en Java 21 `BigDecimal`)
- **Regla de Oro Contable:** El móvil (`legacy/`) **nunca** es la fuente definitiva de saldos contables; el móvil emite **comandos idempotentes de operación** (`SyncOperationPayload`) y Java 21 (`RecordPaymentUseCase`, `RenewLoanUseCase`, `RecordPromiseUseCase`) los procesa transaccionalmente con `BigDecimal` sobre `cartera.db`, registrando cada operación en la tabla `sync_operation` (ya existente en `V1__initial_financial_schema.sql`).
- **Mecanismo Dual de Intercambio (Sin depender de Internet ni servidores en la nube):**
  1. **Paquete Diario de Ruta JSON (`cartera-ruta-YYYY-MM-DD.json`):**
     - **Por la mañana (Exportar Ruta desde `desktop/`):** Un nuevo servicio `RouteSyncPackageService.java` exporta un archivo JSON con los clientes activos de la ruta, sus préstamos activos, cuotas e historial resumido (todos los montos serializados como `String` exactos desde `BigDecimal.toPlainString()`).
     - **En la calle (Operación Offline en `legacy/`):** `local-store.ts` importa el paquete JSON, permite registrar cobros y promesas offline generando un `UUID` único como `idempotencyKey` por cada cobro, y al finalizar genera un archivo/payload `operaciones-cobrador-YYYY-MM-DD.json`.
     - **Al regresar (Importar y Conciliar en `desktop/`):** `RouteSyncPackageService.importOperations()` lee cada operación pendiente, verifica en `sync_operation` y `payment.idempotency_key` si ya fue aplicada, e invoca a `RecordPaymentUseCase.execute()` dentro de una transacción `@Transactional`, garantizando **cero duplicados** y cálculo exacto con `BigDecimal`.
  2. **Sincronización LAN Opcional por Socket/HTTP Efímero Local:**
     - Sin agregar `spring-boot-starter-web` ni WebViews a la UI, `RouteSyncPackageService` puede exponer opcionalmente un `com.sun.net.httpserver.HttpServer` nativo del JDK 21 ligado únicamente a la IP LAN local durante la ventana de sincronización ("Modo Recibir Ruta de Celular por Wi-Fi") con dos endpoints firmados: `GET /api/sync/route-package` y `POST /api/sync/operations`.

---

## 3. Mapeo Detallado de Componentes (Figma `7020-3430` & UI8 -> Código Real)

### 3.1 Resumen del Plan Base para Opus 5.5 (Referencia Rápida en Canvas + Archivos Reales)

| Componente del Figma (Budget Tracker) | Adaptación al Dominio de Cobros / Préstamos | Implementación en tu Stack (`desktop/` JavaFX 21 + `legacy/`) | Archivos Reales en `prestamos-app-1` |
|---|---|---|---|
| **Hero Balance Card** | Tarjeta de Recaudo del Día y Cartera Activa | `VBox` `.hero-card` (`.hero-balance-card`) con Recaudado Hoy vs. Meta Diaria (`BigDecimal`), `ProgressBar` de cumplimiento y sub-tarjetas para Capital en la Calle y Total en Mora. | `DashboardView.java`, `TodayCollectionsView.java`, `TodayCollectionsView.tsx` |
| **Quick Action Pills** | Acciones Operativas en 1 Clic | `HBox` con 4 botones táctiles (`.quick-action-btn` / `.quick-action-pill`): `+ Registrar Abono`, `+ Nuevo Préstamo`, `+ Nuevo Cliente` y `Cuadre de Caja`. | `DashboardView.java`, `CarteraApplication.java` |
| **Savings Goals Cards** | Tarjetas de Préstamo Activo y Amortización | `ListView<CollectionItem>` (alias `TarjetaCobroRecord`) con `ListCell` reciclable (`.loan-card` / `.loan-route-card`): Cliente, badge pastel (`.badge-aldia` / `.badge-paid`, `.badge-hoy` / `.badge-today`, `.badge-mora` / `.badge-overdue`), cuota en `BigDecimal`, `ProgressBar` (`Cuota X de Y • Z%`), saldo pendiente y botón `Cobrar`. | `TodayCollectionsView.java`, `CollectionCardCell.java`, `LoansView.java`, `TodayCollectionsView.tsx` |
| **Budget Filters** | Chips de Filtro Rápido de Ruta | `HBox` de `ToggleButton` (`.filter-chip`, `:selected` / `.filter-chip-active`): `Todos`, `Cobrar Hoy`, `En Mora`, `Al Día`, `Pagados` con conteo dinámico. | `TodayCollectionsView.java`, `LoansView.java`, `TodayCollectionsView.tsx` |
| **Transfer Bottom Sheet** | Drawer / Panel Deslizable de Abono Rápido | Panel superpuesto en `StackPane` con `TranslateTransition`, píldoras de monto rápido en `BigDecimal` (`Cuota exacta`, `2 Cuotas`, `Ponerse al día`, `Liquidar saldo`), medio de pago (`Efectivo`, `Nequi`, `Transferencia`) y recibo para WhatsApp. | `QuickPaymentDrawer.java`, `PaymentDialog.java`, `ReceiptDialog.java`, `PaymentModal.tsx` |
| **Statistics Charts** | Cuadre de Caja Diario y Flujo de Cartera | `BarChart<String, Number>` nativo de JavaFX estilizado en `theme.css` (Recaudo `#10b981` vs. Desembolsos `#2563eb`) y separación de `Efectivo en mano` vs. `Digital`. | `DashboardView.java`, `SettlementManagementView.java`, `ReportsView.java` |

---

### 3.2 Especificación Técnica de los Nuevos `records` en Java 21

En `desktop/src/main/java/com/cartera/collections/application/TodayCollectionsService.java`, ampliar los `records` para soportar la Hero Card, las barras de amortización, las píldoras de abono y el desglose Efectivo vs Digital usando exclusivamente `BigDecimal` y `LocalDate`:

```java
package com.cartera.collections.application;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;

public record DailyMetrics(
        BigDecimal collectedToday,
        BigDecimal expectedDailyGoal,
        BigDecimal activeCapitalInStreet,
        BigDecimal overdueAmount,
        BigDecimal cashBalance,
        BigDecimal collectedCashToday,
        BigDecimal collectedDigitalToday,
        BigDecimal disbursedToday,
        int pendingCustomersCount,
        int totalCustomersToday,
        int overdueCustomersCount
) {
    public double progressRatio() {
        if (expectedDailyGoal == null || expectedDailyGoal.signum() <= 0) {
            return collectedToday != null && collectedToday.signum() > 0 ? 1.0 : 0.0;
        }
        return collectedToday
                .divide(expectedDailyGoal, 4, RoundingMode.HALF_UP)
                .min(BigDecimal.ONE)
                .doubleValue();
    }

    public int progressPercentage() {
        return (int) Math.round(progressRatio() * 100);
    }
}

/**
 * Representa cada tarjeta de cobro en la ruta diaria (equivalente a TarjetaCobroRecord del diseño Canvas).
 */
public record CollectionItem(
        String customerId,
        String fullName,
        String documentNumber,
        String phone,
        String address,
        String neighborhood,
        String businessName,
        String loanId,
        BigDecimal loanPrincipal,
        BigDecimal loanTotal,
        BigDecimal loanPaidTotal,
        BigDecimal loanBalance,
        int paidInstallmentsCount,
        int totalInstallmentsCount,
        String installmentId,
        int installmentNumber,
        LocalDate installmentDueDate,
        BigDecimal installmentAmount,
        BigDecimal installmentPending,
        String statusText,
        boolean isPaidToday,
        BigDecimal overdueTotal,
        int overdueDays,
        BigDecimal activePromiseAmount,
        LocalDate activePromiseDate
) {
    /** Porcentaje de amortización del crédito [0.0 .. 1.0] para el ProgressBar de JavaFX. */
    public double amortizationProgress() {
        if (loanTotal == null || loanTotal.signum() <= 0) return 0.0;
        return loanPaidTotal
                .divide(loanTotal, 4, RoundingMode.HALF_UP)
                .min(BigDecimal.ONE)
                .max(BigDecimal.ZERO)
                .doubleValue();
    }

    public int amortizationPercentage() {
        return (int) Math.round(amortizationProgress() * 100);
    }

    /** Monto sugerido para ponerse al día (mora acumulada + cuota de hoy). */
    public BigDecimal catchUpAmount() {
        BigDecimal base = (overdueTotal != null ? overdueTotal : BigDecimal.ZERO)
                .add(installmentPending != null ? installmentPending : BigDecimal.ZERO);
        return base.signum() > 0 ? base.min(loanBalance) : installmentAmount.min(loanBalance);
    }
}
```

---

### 3.3 Celdas Virtualizadas `ListCell<CollectionItem>` en JavaFX 21

Para lograr 60 FPS en el scroll de la ruta de cobro sin el costo de instanciar cientos de nodos pesados, `TodayCollectionsView.java` debe usar un `ListView<CollectionItem>` con una celda reciclable `CollectionCardCell`:

```java
package com.cartera.ui.views;

import com.cartera.collections.application.TodayCollectionsService.CollectionItem;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ListCell;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.*;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.function.Consumer;

public final class CollectionCardCell extends ListCell<CollectionItem> {
    private static final NumberFormat COP = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("es-CO"));
    static { COP.setMaximumFractionDigits(0); }

    private final VBox card = new VBox(12);
    private final Label lblInitials = new Label();
    private final Label lblCustomerName = new Label();
    private final Label lblSubtitle = new Label();
    private final Label lblBadge = new Label();

    private final Label lblInstallmentValue = new Label();
    private final Label lblBalanceValue = new Label();
    private final Label lblOverdueValue = new Label();

    private final ProgressBar progressBar = new ProgressBar(0);
    private final Label lblProgressText = new Label();

    private final Button btnQuickPay = new Button("Cobrar en 1 Clic");
    private final Button btnDrawerPay = new Button("Otro Monto");
    private final Button btnWhatsApp = new Button("WhatsApp");

    private CollectionItem currentItem;

    public CollectionCardCell(
            Consumer<CollectionItem> onOneClickPay,
            Consumer<CollectionItem> onOpenPaymentDrawer,
            Consumer<CollectionItem> onShareWhatsApp
    ) {
        card.getStyleClass().addAll("loan-card", "loan-route-card");

        // Header: Avatar + Nombre + Badge Pastel
        StackPane avatar = new StackPane(lblInitials);
        avatar.getStyleClass().add("card-avatar");
        lblInitials.getStyleClass().add("card-avatar-text");

        VBox titleBox = new VBox(2, lblCustomerName, lblSubtitle);
        lblCustomerName.getStyleClass().add("card-customer-name");
        lblSubtitle.getStyleClass().add("muted");
        HBox.setHgrow(titleBox, Priority.ALWAYS);

        HBox header = new HBox(12, avatar, titleBox, lblBadge);
        header.setAlignment(Pos.CENTER_LEFT);

        // Fila de montos financieros
        VBox colCuota = new VBox(2, new Label("CUOTA HOY") {{ getStyleClass().add("card-kpi-label"); }}, lblInstallmentValue);
        VBox colSaldo = new VBox(2, new Label("SALDO PENDIENTE") {{ getStyleClass().add("card-kpi-label"); }}, lblBalanceValue);
        VBox colMora  = new VBox(2, new Label("MORA ACUMULADA") {{ getStyleClass().add("card-kpi-label"); }}, lblOverdueValue);
        HBox.setHgrow(colCuota, Priority.ALWAYS);
        HBox.setHgrow(colSaldo, Priority.ALWAYS);
        HBox.setHgrow(colMora, Priority.ALWAYS);

        HBox financialsRow = new HBox(16, colCuota, colSaldo, colMora);
        financialsRow.getStyleClass().add("card-financials-box");

        // Barra de progreso de amortización (estilo Savings Goal Card de Figma)
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.getStyleClass().add("amortization-progress");
        lblProgressText.getStyleClass().add("amortization-label");
        VBox progressBox = new VBox(4, lblProgressText, progressBar);

        // Acciones
        btnQuickPay.getStyleClass().add("btn-success");
        btnDrawerPay.getStyleClass().add("btn-primary");
        btnWhatsApp.getStyleClass().add("btn-secondary");

        btnQuickPay.setOnAction(e -> { if (currentItem != null) onOneClickPay.accept(currentItem); });
        btnDrawerPay.setOnAction(e -> { if (currentItem != null) onOpenPaymentDrawer.accept(currentItem); });
        btnWhatsApp.setOnAction(e -> { if (currentItem != null) onShareWhatsApp.accept(currentItem); });

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        HBox actionsRow = new HBox(8, btnQuickPay, btnDrawerPay, spacer, btnWhatsApp);
        actionsRow.setAlignment(Pos.CENTER_LEFT);

        card.getChildren().addAll(header, financialsRow, progressBox, actionsRow);
        setStyle("-fx-background-color: transparent; -fx-padding: 6 2;");
    }

    @Override
    protected void updateItem(CollectionItem item, boolean empty) {
        super.updateItem(item, empty);
        this.currentItem = item;
        if (empty || item == null) {
            setGraphic(null);
            setText(null);
            return;
        }

        lblInitials.setText(extractInitials(item.fullName()));
        lblCustomerName.setText(item.fullName());
        lblSubtitle.setText((item.businessName().isBlank() ? "" : item.businessName() + " • ")
                + item.address() + " (" + item.neighborhood() + ") • Tel: " + item.phone());

        lblInstallmentValue.setText(COP.format(item.installmentPending()));
        lblInstallmentValue.getStyleClass().setAll("card-kpi-value-green");

        lblBalanceValue.setText(COP.format(item.loanBalance()));
        lblBalanceValue.getStyleClass().setAll("card-kpi-value-blue");

        boolean hasOverdue = item.overdueTotal() != null && item.overdueTotal().compareTo(BigDecimal.ZERO) > 0;
        lblOverdueValue.setText(hasOverdue ? COP.format(item.overdueTotal()) + " (" + item.overdueDays() + "d)" : "$ 0");
        lblOverdueValue.getStyleClass().setAll(hasOverdue ? "card-kpi-value-red" : "muted");

        // Badge pastel según estado (.badge-aldia/.badge-paid, .badge-mora/.badge-overdue, .badge-hoy/.badge-today)
        lblBadge.getStyleClass().removeAll("badge-paid", "badge-overdue", "badge-today", "badge-aldia", "badge-mora", "badge-hoy");
        if (item.isPaidToday()) {
            lblBadge.setText("AL DÍA / PAGADO");
            lblBadge.getStyleClass().addAll("badge-paid", "badge-aldia");
        } else if (hasOverdue || item.statusText().contains("VENCIDA")) {
            lblBadge.setText("EN MORA");
            lblBadge.getStyleClass().addAll("badge-overdue", "badge-mora");
        } else {
            lblBadge.setText("COBRAR HOY");
            lblBadge.getStyleClass().addAll("badge-today", "badge-hoy");
        }

        // Progreso de amortización
        progressBar.setProgress(item.amortizationProgress());
        lblProgressText.setText("Cuota " + item.paidInstallmentsCount() + " de "
                + item.totalInstallmentsCount() + " • " + item.amortizationPercentage() + "% amortizado");

        btnQuickPay.setDisable(item.isPaidToday());
        btnQuickPay.setText(item.isPaidToday() ? "Pagado Hoy" : "Cobrar " + COP.format(item.installmentPending()));

        setGraphic(card);
    }

    private static String extractInitials(String name) {
        if (name == null || name.isBlank()) return "CL";
        String[] parts = name.trim().split("\\s+");
        return parts.length >= 2
                ? (parts[0].substring(0, 1) + parts[1].substring(0, 1)).toUpperCase()
                : name.substring(0, Math.min(2, name.length())).toUpperCase();
    }
}
```

---

### 3.4 Animación `TranslateTransition` para el Drawer de Abono Rápido (`QuickPaymentDrawer.java`)

```java
// Apertura suave tipo Bottom Sheet / Right Drawer dentro del StackPane contentArea
public void openWithAnimation(StackPane hostPane) {
    if (!hostPane.getChildren().contains(overlayBackdrop)) {
        hostPane.getChildren().addAll(overlayBackdrop, this);
    }
    this.setTranslateY(420);
    overlayBackdrop.setOpacity(0);

    var slideIn = new javafx.animation.TranslateTransition(javafx.util.Duration.millis(220), this);
    slideIn.setToY(0);
    slideIn.setInterpolator(javafx.animation.Interpolator.EASE_OUT);

    var fadeIn = new javafx.animation.FadeTransition(javafx.util.Duration.millis(180), overlayBackdrop);
    fadeIn.setToValue(1.0);

    new javafx.animation.ParallelTransition(slideIn, fadeIn).play();
}
```

---

### 3.5 Nuevos Selectores CSS a Agregar en `desktop/src/main/resources/ui/theme.css`

Agregar al final de `desktop/src/main/resources/ui/theme.css` (a partir de la línea 429), incluyendo los alias de clases del Canvas (`.hero-card`, `.quick-action-btn`, `.loan-card`, `.badge-aldia`, `.badge-hoy`, `.badge-mora`) y el estilizado de `BarChart` (`#10b981` Recaudo vs `#2563eb` Desembolsos):

```css
/* ==========================================================================
   ADAPTACIÓN MÓVIL & FINTECH UI KIT (FIGMA 7020-3430 & CANVAS BASE)
   ========================================================================== */

/* Hero Balance Card (Recaudo vs Meta Diaria) */
.hero-card, .hero-balance-card {
    -fx-background-color: linear-gradient(to bottom right, #1e40af, #2563eb);
    -fx-background-radius: 18;
    -fx-padding: 24 28;
    -fx-effect: dropshadow(gaussian, rgba(37, 99, 235, 0.25), 16, 0, 0, 6);
}

.hero-balance-label {
    -fx-text-fill: #bfdbfe;
    -fx-font-size: 12px;
    -fx-font-weight: bold;
}

.hero-balance-amount {
    -fx-text-fill: #ffffff;
    -fx-font-size: 32px;
    -fx-font-weight: bold;
}

.hero-submetric-box {
    -fx-background-color: rgba(255, 255, 255, 0.12);
    -fx-background-radius: 12;
    -fx-padding: 10 16;
}

.hero-progress-bar > .track {
    -fx-background-color: rgba(255, 255, 255, 0.22);
    -fx-background-radius: 8;
    -fx-pref-height: 10;
}

.hero-progress-bar > .bar {
    -fx-background-color: #34d399;
    -fx-background-radius: 8;
    -fx-background-insets: 0;
}

/* Quick Action Pills (1-Touch Actions) */
.quick-action-btn, .quick-action-pill {
    -fx-background-color: #ffffff;
    -fx-text-fill: #0f172a;
    -fx-font-size: 13px;
    -fx-font-weight: bold;
    -fx-padding: 12 20;
    -fx-background-radius: 24;
    -fx-border-color: #e2e8f0;
    -fx-border-radius: 24;
    -fx-cursor: hand;
    -fx-effect: dropshadow(gaussian, rgba(15, 23, 42, 0.04), 8, 0, 0, 2);
}

.quick-action-btn:hover, .quick-action-pill:hover {
    -fx-background-color: #eff6ff;
    -fx-border-color: #93c5fd;
    -fx-text-fill: #1d4ed8;
}

/* Chips Horizontales de Filtrado Rápido (ToggleButton / Button) */
.filter-chip {
    -fx-background-color: #ffffff;
    -fx-text-fill: #475569;
    -fx-font-size: 12px;
    -fx-font-weight: bold;
    -fx-padding: 7 16;
    -fx-background-radius: 20;
    -fx-border-color: #cbd5e1;
    -fx-border-radius: 20;
    -fx-cursor: hand;
}

.filter-chip:hover {
    -fx-background-color: #f1f5f9;
    -fx-text-fill: #0f172a;
}

.filter-chip:selected, .filter-chip-active {
    -fx-background-color: #2563eb !important;
    -fx-text-fill: #ffffff !important;
    -fx-border-color: #2563eb !important;
    -fx-effect: dropshadow(gaussian, rgba(37, 99, 235, 0.22), 6, 0, 0, 2);
}

/* Alias de Badges Pastel del Canvas (.badge-aldia, .badge-hoy, .badge-mora) */
.badge-aldia {
    -fx-background-color: #ecfdf5;
    -fx-text-fill: #047857;
    -fx-border-color: #a7f3d0;
    -fx-border-radius: 12;
    -fx-padding: 4 10;
    -fx-background-radius: 12;
    -fx-font-weight: bold;
    -fx-font-size: 11px;
}

.badge-hoy {
    -fx-background-color: #eff6ff;
    -fx-text-fill: #1d4ed8;
    -fx-border-color: #bfdbfe;
    -fx-border-radius: 12;
    -fx-padding: 4 10;
    -fx-background-radius: 12;
    -fx-font-weight: bold;
    -fx-font-size: 11px;
}

.badge-mora {
    -fx-background-color: #fef2f2;
    -fx-text-fill: #b91c1c;
    -fx-border-color: #fecaca;
    -fx-border-radius: 12;
    -fx-padding: 4 10;
    -fx-background-radius: 12;
    -fx-font-weight: bold;
    -fx-font-size: 11px;
}

/* Tarjetas de Préstamo / Ruta de Cobro (Savings Goals Card Pattern) */
.loan-card, .loan-route-card {
    -fx-background-color: #ffffff;
    -fx-background-radius: 16;
    -fx-border-color: #e2e8f0;
    -fx-border-radius: 16;
    -fx-border-width: 1;
    -fx-padding: 18 20;
    -fx-effect: dropshadow(gaussian, rgba(15, 23, 42, 0.04), 10, 0, 0, 3);
}

.loan-card:hover, .loan-route-card:hover {
    -fx-border-color: #cbd5e1;
    -fx-effect: dropshadow(gaussian, rgba(37, 99, 235, 0.08), 14, 0, 0, 4);
}

.card-avatar {
    -fx-pref-width: 42;
    -fx-pref-height: 42;
    -fx-min-width: 42;
    -fx-min-height: 42;
    -fx-background-color: linear-gradient(to bottom right, #3b82f6, #1d4ed8);
    -fx-background-radius: 21;
}

.card-avatar-text {
    -fx-text-fill: #ffffff;
    -fx-font-weight: bold;
    -fx-font-size: 13px;
}

.card-customer-name {
    -fx-text-fill: #0f172a;
    -fx-font-size: 15px;
    -fx-font-weight: bold;
}

.card-financials-box {
    -fx-background-color: #f8fafc;
    -fx-background-radius: 12;
    -fx-padding: 12 16;
    -fx-border-color: #f1f5f9;
    -fx-border-radius: 12;
}

.card-kpi-label {
    -fx-text-fill: #64748b;
    -fx-font-size: 10px;
    -fx-font-weight: bold;
}

.card-kpi-value-green {
    -fx-text-fill: #059669;
    -fx-font-size: 16px;
    -fx-font-weight: bold;
}

.card-kpi-value-blue {
    -fx-text-fill: #2563eb;
    -fx-font-size: 16px;
    -fx-font-weight: bold;
}

.card-kpi-value-red {
    -fx-text-fill: #dc2626;
    -fx-font-size: 16px;
    -fx-font-weight: bold;
}

/* Barra de Amortización */
.amortization-label {
    -fx-text-fill: #475569;
    -fx-font-size: 11px;
    -fx-font-weight: bold;
}

.amortization-progress > .track {
    -fx-background-color: #e2e8f0;
    -fx-background-radius: 6;
    -fx-pref-height: 8;
}

.amortization-progress > .bar {
    -fx-background-color: linear-gradient(to right, #2563eb, #10b981);
    -fx-background-radius: 6;
    -fx-background-insets: 0;
}

/* Drawer / Bottom Sheet de Abono Rápido */
.drawer-backdrop {
    -fx-background-color: rgba(15, 23, 42, 0.45);
}

.quick-payment-drawer {
    -fx-background-color: #ffffff;
    -fx-background-radius: 22 22 0 0;
    -fx-border-color: #e2e8f0;
    -fx-border-radius: 22 22 0 0;
    -fx-padding: 24 28;
    -fx-effect: dropshadow(gaussian, rgba(15, 23, 42, 0.18), 24, 0, 0, -4);
}

.amount-pill {
    -fx-background-color: #f8fafc;
    -fx-text-fill: #334155;
    -fx-font-size: 12px;
    -fx-font-weight: bold;
    -fx-padding: 8 14;
    -fx-background-radius: 16;
    -fx-border-color: #cbd5e1;
    -fx-border-radius: 16;
    -fx-cursor: hand;
}

.amount-pill:hover, .amount-pill-active {
    -fx-background-color: #eff6ff;
    -fx-text-fill: #1d4ed8;
    -fx-border-color: #2563eb;
}

.method-pill {
    -fx-background-color: #f8fafc;
    -fx-text-fill: #475569;
    -fx-font-size: 13px;
    -fx-font-weight: bold;
    -fx-padding: 10 18;
    -fx-background-radius: 12;
    -fx-border-color: #cbd5e1;
    -fx-border-radius: 12;
    -fx-cursor: hand;
}

.method-pill-active {
    -fx-background-color: #ecfdf5 !important;
    -fx-text-fill: #047857 !important;
    -fx-border-color: #059669 !important;
}

/* Statistics BarChart Nativo (Recaudo #10b981 vs Desembolsos #2563eb) */
.chart {
    -fx-padding: 12;
    -fx-background-color: transparent;
}

.chart-plot-background {
    -fx-background-color: transparent;
}

.chart-vertical-grid-lines {
    -fx-stroke: transparent;
}

.chart-horizontal-grid-lines {
    -fx-stroke: #f1f5f9;
}

.default-color0.chart-bar {
    -fx-bar-fill: #10b981;
    -fx-background-radius: 6 6 0 0;
}

.default-color1.chart-bar {
    -fx-bar-fill: #2563eb;
    -fx-background-radius: 6 6 0 0;
}
```

---

## 4. Playbook de Prompts Quirúrgicos para Opus 5.5 (100% Enfocado en `mobile/` — `desktop/` y `legacy/` Intactos)

> [!IMPORTANT]
> **REGLA ESTRICTA DE AISLAMIENTO (`NO TOCAR desktop/ NI legacy/ POR AHORA`):**
> Todo lo construido en la aplicación de escritorio (`desktop/`) y el prototipo histórico (`legacy/`) permanece **100% intacto y sin modificaciones**. Todo el trabajo de implementación desde la **Etapa 1 hasta la Etapa 4** se ejecuta exclusivamente sobre la **nueva carpeta móvil independiente (`mobile/` — React Native / Expo Offline-First)**.

Copia y pega estos prompts directamente en tu IDE para ejecutar la implementación móvil paso a paso.

---

### 4.1 PROMPT MAESTRO MÓVIL (Contexto Global y Carpeta Independiente `mobile/`)

```markdown
Actúa como Principal Mobile & Fintech Architect experto en React Native 0.86, Expo SDK 57, TypeScript 6, arquitecturas Offline-First (`AsyncStorage`) y sincronización con SQLite (`cartera.db`).
Vamos a ejecutar el plan técnico definido en `PLAN_ADAPTACION_MOVIL_OPUS.md` para implementar y modernizar la **aplicación móvil de cobros y préstamos** en la carpeta dedicada `mobile/` tomando como referencia visual el kit de Figma "Finance Management Mobile App UI UX Kit" (`node-id=7020-3430`).

REGLAS INQUEBRANTABLES DE ESTA FASE:
1. PROHIBIDO modificar cualquier archivo dentro de `desktop/` o `legacy/` por ahora.
2. Toda la implementación se realiza en la carpeta móvil independiente (`mobile/`), transformando la experiencia del cobrador al diseño Fintech en tonos claros (`#f8fafc` fondo primario, `#ffffff` tarjetas, `#2563eb` azul primario, `#10b981` / `#059669` verde esmeralda, badges pastel y bordes redondeados).
3. Respetar estrictamente las reglas de negocio de `docs/BUSINESS_RULES.md` y `mobile/src/core/config/business-rules.ts`:
   - Interés simple del 20% sobre capital inicial (`FLAT_INITIAL_CAPITAL`), 30 cuotas diarias por defecto.
   - Papelería: $5.000 COP por cada $100.000 COP (deducida del desembolso neto en renovaciones).
   - Mora fáctica: suma de `pendingAmount` en cuotas con `dueDate < todayStr` (sin inventar recargos moratorios no autorizados).
   - Todo pago genera un `idempotencyKey` único y su desglose cuota por cuota (`installmentsBreakdown`).

Confirma que has leído `PLAN_ADAPTACION_MOVIL_OPUS.md` y que estás listo para trabajar exclusivamente en `mobile/`.
```

---

### 4.2 PROMPT ETAPA 1 MÓVIL: Paleta Fintech Clara (`colors.ts`), Tipos de Dominio (`types.ts`) y Motor Offline-First Enriquecido (`local-store.ts`)

```markdown
Ejecuta la **Etapa 1 Móvil** exclusivamente dentro de `mobile/` (NO toques ningún archivo de `desktop/` ni `legacy/`):

1. **Migrar `mobile/src/presentation/theme/colors.ts` al Tema Claro Fintech del Figma (`node-id=7020-3430`)**:
   - Actualiza `COLORS` a la paleta clara profesional:
     - Fondos: `bgPrimary: '#f8fafc'`, `bgSecondary: '#ffffff'`, `bgTertiary: '#e2e8f0'`, `bgElevated: '#f1f5f9'`.
     - Textos: `textPrimary: '#0f172a'`, `textSecondary: '#475569'`, `textMuted: '#64748b'`.
     - Acentos: `primary: '#2563eb'`, `primaryLight: '#eff6ff'`, `primaryBorder: '#bfdbfe'`, `heroGradientStart: '#1e40af'`, `heroGradientEnd: '#2563eb'`.
     - Estados y Badges Pastel:
       - Éxito / Al día (`.badge-aldia`): `success: '#059669'`, `successBright: '#10b981'`, `successLight: '#ecfdf5'`, `successBorder: '#a7f3d0'`.
       - Cobrar Hoy / Info (`.badge-hoy`): `info: '#1d4ed8'`, `infoLight: '#eff6ff'`, `infoBorder: '#bfdbfe'`.
       - Alerta / Parcial: `warning: '#d97706'`, `warningLight: '#fffbeb'`, `warningBorder: '#fde68a'`.
       - Mora / Peligro (`.badge-mora`): `danger: '#dc2626'`, `dangerLight: '#fef2f2'`, `dangerBorder: '#fecaca'`.
       - Renovación: `purple: '#7c3aed'`, `purpleLight: '#f5f3ff'`.

2. **Ampliar Tipos en `mobile/src/core/domain/types.ts`**:
   - Actualiza `PaymentMethod` a `'CASH' | 'NEQUI' | 'TRANSFER' | 'OTHER'`.
   - Añade las interfaces `DailyRouteMetrics` y `MobileSyncPackage`.

3. **Enriquecer `mobile/src/infrastructure/storage/local-store.ts`**:
   - En `recordPayment`, verifica idempotencia (`this.payments.some(p => p.idempotencyKey === idempotencyKey)`) y permite recibir un `idempotencyKey` opcional desde la UI.
   - Añade `createCustomer(params)` y `createLoan(params)` con generación automática de cuotas (`generateInstallments`), movimiento de caja (`LOAN_DISBURSEMENT`), y registro en `auditLogs` y `AsyncStorage`.
   - Añade el método `getDailyRouteMetrics(todayStr: string): DailyRouteMetrics`.
   - En `closeDailySettlement`, contabiliza dentro de `collectedTransfers` tanto `'TRANSFER'` como `'NEQUI'`.
   - Añade `exportMobileSyncPackage(todayStr: string)` para generar el paquete JSON de sincronización compatible con `cartera.db`.
```

---

### 4.3 PROMPT ETAPA 2 MÓVIL: Hero Balance Card, Quick Action Pills, Chips con Conteo y Tarjetas de Préstamo con Barra de Amortización (`TodayCollectionsView.tsx`)

```markdown
Ejecuta la **Etapa 2 Móvil** sobre `mobile/src/presentation/views/collector/TodayCollectionsView.tsx` (sin tocar `desktop/`):

1. **Hero Balance Card (Parte superior de la vista móvil)**:
   - Muestra una tarjeta principal destacada (`.hero-card` en azul `#1e40af` / `#2563eb` con texto blanco) que presente:
     - **Recaudo del Día (`collectedToday`) vs. Meta Diaria (`expectedDailyGoal`)** en formato moneda COP.
     - **Barra de progreso visual** de cumplimiento diario + etiqueta de porcentaje (`X% de la meta diaria`) y clientes visitados.
     - **2 Sub-tarjetas internas translúcidas**:
       1. **Capital Activo en la Calle** (`activeCapitalInStreet`).
       2. **Total en Mora** (`overdueTotalAmount` y conteo de clientes en mora).

2. **Quick Action Pills (Acciones operativas de 1 toque)**:
   - Debajo del Hero Card, agrega una fila horizontal de 4 botones táctiles (`.quick-action-btn`):
     - `+ Abono Rápido`
     - `+ Nuevo Préstamo`
     - `+ Nuevo Cliente`
     - `Cuadre de Caja`

3. **Spending Filters -> Chips Horizontales con Conteo Dinámico**:
   - Actualiza los chips horizontales para mostrar:
     - `Todos (N)`
     - `Cobrar Hoy (N)`
     - `En Mora (N)`
     - `Al Día (N)`
     - `Pagados (N)`
     - `Promesas (N)`
   - Mantén el buscador instantáneo por nombre, cédula, negocio o barrio.

4. **Savings Goals Cards -> Tarjetas de Préstamo / Ruta de Cobro (`.loan-card`)**:
   - Rediseña cada tarjeta de cliente en la lista con estética limpia sobre fondo `#ffffff`:
     - **Cabecera:** Avatar circular con iniciales del cliente, nombre completo, negocio/barrio y **Badge Pastel**:
       - `.badge-aldia` (`#ecfdf5` / `#047857`): `Al día` o `Pagado hoy`
       - `.badge-hoy` (`#eff6ff` / `#1d4ed8`): `Cobrar hoy`
       - `.badge-mora` (`#fef2f2` / `#b91c1c`): `En mora (X días)`
     - **Cuerpo Financiero:** Cuota a cobrar hoy, Saldo pendiente total y Mora acumulada.
     - **Barra de Progreso de Amortización:** Barra horizontal estilizada + etiqueta `Cuota X de Y • Z% pagado`.
     - **Acciones Directas:**
       - Botón primario **Cobrar en 1 Clic** (abre el Bottom Sheet preconfigurado).
       - Botón **WhatsApp / Recibo** (envía comprobante o recordatorio de cuota al teléfono del cliente).
       - Botones compactos de **Promesa** y **Renovar**.
```

---

### 4.4 PROMPT ETAPA 3 MÓVIL: Bottom Sheet de Abono Rápido (`PaymentModal.tsx`), Recibo por WhatsApp y Modales de Creación (`NewCustomerModal.tsx` / `NewLoanModal.tsx`)

```markdown
Ejecuta la **Etapa 3 Móvil** dentro de `mobile/src/presentation/components/` (sin tocar `desktop/`):

1. **Rediseñar `mobile/src/presentation/components/PaymentModal.tsx` como Bottom Sheet de Abono Rápido**:
   - Adapta el componente al patrón *Transfer / Add Expense Bottom Sheet* del Figma en tonos claros (`#ffffff` / `#f8fafc`):
   - **4 Píldoras de Monto Precalculadas**:
     1. `Cuota exacta` (`nextInstallment.pendingAmount` o `loan.installmentAmount`)
     2. `2 Cuotas` (`Math.min(defaultAmount * 2, totalRemainingBalance)`)
     3. `Ponerse al día` (`overdueAmount + todayPending`)
     4. `Liquidar saldo` (`totalRemainingBalance`)
   - **Selector de Medio de Pago por Píldoras**:
     - `💵 Efectivo` (`CASH`)
     - `🟣 Nequi` (`NEQUI`)
     - `🏦 Transferencia` (`TRANSFER`)
   - **Vista de Recibo / Comprobante post-pago con botón de WhatsApp**:
     - Al confirmar el abono, muestra el resumen del comprobante (con las cuotas aplicadas en `installmentsBreakdown` y el nuevo saldo pendiente) y un botón directo **Enviar Recibo por WhatsApp** (`Linking.openURL('https://wa.me/...')`) antes de cerrar.

2. **Crear `NewCustomerModal.tsx` y `NewLoanModal.tsx` en `mobile/src/presentation/components/`**:
   - `NewCustomerModal.tsx`: Formulario móvil ágil para registrar un cliente nuevo en ruta (Nombre completo, Cédula, Teléfono/WhatsApp, Dirección, Barrio, Ocupación/Negocio y Referencia familiar).
   - `NewLoanModal.tsx`: Formulario móvil con calculadora en vivo (Capital inicial, Tasa 20% por defecto, Número de cuotas 30 por defecto, Frecuencia diaria, cálculo automático de interés, papelería y valor de cuota diaria) conectado a `localStore.createLoan()`.
```

---

### 4.5 PROMPT ETAPA 4 MÓVIL: Estadísticas (`Recaudo vs. Desembolsos`), Cuadre de Caja Diario (`SettlementModal.tsx`) y Pulido de Navegación (`App.tsx`)

```markdown
Ejecuta la **Etapa 4 Móvil** en `mobile/` (sin tocar `desktop/`):

1. **Gráficos y Estadísticas Móviles (Recaudo `#10b981` vs. Desembolsos `#2563eb`) + Cuadre de Caja (`SettlementModal.tsx`)**:
   - En `mobile/src/presentation/components/SettlementModal.tsx` (y en una pestaña/vista de `Caja / Estadísticas` del cobrador), añade:
     - Tarjetas comparativas de **Efectivo en Mano (`CASH`)** vs. **Recaudo Digital (`NEQUI` + `TRANSFER`)**.
     - Gráfico de barras limpio (usando componentes nativos / `react-native-svg`) comparando **Recaudo del Día (`#10b981`) vs. Desembolsos del Día (`#2563eb`)**.
     - Arqueo físico de efectivo con cálculo automático de diferencia (`collectedCash - cashHandedOver`) y justificación obligatoria si existe descuadre.
     - Botón para **Exportar / Compartir Paquete de Ruta (JSON)** listo para sincronizar con `cartera.db`.

2. **Actualizar `mobile/App.tsx` y Vistas Complementarias (`CustomerDetailView.tsx`, `PromiseModal.tsx`, `RenewalModal.tsx`)**:
   - Configura `StatusBar` con `barStyle="dark-content"` y `backgroundColor={COLORS.bgPrimary}` (`#f8fafc`).
   - Conecta las 4 Quick Action Pills (`+ Abono Rápido`, `+ Nuevo Préstamo`, `+ Nuevo Cliente`, `Cuadre de Caja`) en `App.tsx`.
   - Asegura que `CustomerDetailView.tsx`, `PromiseModal.tsx` y `RenewalModal.tsx` luzcan impecables con el nuevo tema claro Fintech (`#f8fafc` / `#ffffff`) y añade botón directo de WhatsApp en `CustomerDetailView.tsx`.
   - Verifica con `npx tsc --noEmit` en `mobile/` que todo el proyecto TypeScript compile con cero errores.
```

---

## 5. Checklist de Verificación Móvil (`mobile/`) y Aislamiento de `desktop/`

- [ ] **Aislamiento Total de `desktop/` y `legacy/`:** Ningún archivo modificado ni agregado en `desktop/` ni en `legacy/`.
- [ ] **Fidelidad Visual Figma (`node-id=7020-3430`):** Tema claro `#f8fafc` / `#ffffff`, Hero Balance Card con barra de progreso, Quick Action Pills, Filter Chips con conteo, Tarjetas de Préstamo con barra de amortización (`Cuota X de Y • Z%`), Bottom Sheet de Abono Rápido y gráfico `Recaudo (#10b981) vs. Desembolsos (#2563eb)`.
- [ ] **Reglas de Negocio Intactas:** 20% interés simple sobre capital inicial, 30 cuotas diarias, papelería de $5.000 por cada $100.000, mora fáctica sin recargos inventados, e `idempotencyKey` en cada abono.
- [ ] **Compilación Limpia en TypeScript:** `npx tsc --noEmit` dentro de `mobile/` finaliza con 0 errores.



---

## 6. Conexión e Implementación del Análisis "Estilo Fintech UI" (`https://share.gemini.google/KjMOzkltAOCD`) en `mobile/`

Se integró de forma nativa en el subproyecto independiente [`mobile/`](file:///C:/Users/ASUS/prestamos-app-1/mobile) la corriente de diseño **Clean Fintech UI / Soft Minimalist UI** (inspirada en Nequi, Nu y Revolut en modo claro) junto con las **3 correcciones objetivas recomendadas por el agente de IA** en el chat compartido:

### 6.1.Los 7 Patrones Visuales y de UX Implementados en Código Real
1. **Soft UI / Flat 2.0 por Contraste de Superficies ([`colors.ts`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/theme/colors.ts))**:
   - Lienzo principal en gris ultra claro (`#F4F5F7`), tarjetas primarias en blanco puro (`#FFFFFF`) y tarjetas destacadas en lavanda pálido (`#F5F3FF`), eliminando líneas divisorias pesadas.
2. **Cuadrícula Bento Asimétrica (`Bento Grid`) ([`TodayCollectionsView.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/views/collector/TodayCollectionsView.tsx))**:
   - Debajo de la *Hero Balance Card*, se implementó un bloque modular asimétrico de 2 columnas: a la izquierda la tarjeta alta **"Mi Caja & Capital en Calle"** y a la derecha 2 tarjetas apiladas (**"Total en Mora"** y **"Desembolso Rápido"** en lavanda `#F5F3FF`).
3. **Barra de Navegación Flotante con FAB Central (`Floating Bottom Dock`) ([`App.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/App.tsx))**:
   - Se reemplazó el `Bottom Tab Bar` tradicional pegado al borde por una **píldora flotante de alto contraste** (`#1E1B4B` índigo/púrpura profundo) separada de los márgenes laterales e inferior (`borderRadius: 9999`), coronada por un **FAB central sobresaliente (`+`)** en verde esmeralda (`#10B981`) con anillo blanco que dispara el cobro en 1 toque del siguiente cliente pendiente.
4. **Hojas Inferiores Modales (`Bottom Sheets`) con Drag Handle**:
   - Implementadas con indicador de arrastre superior (`sheetHandle`) y `borderTopLeftRadius: 28` en [`PaymentModal.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/components/PaymentModal.tsx), [`NewCustomerModal.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/components/NewCustomerModal.tsx), [`NewLoanModal.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/components/NewLoanModal.tsx) y [`SettlementModal.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/components/SettlementModal.tsx).
5. **Inputs de Relleno con Etiquetas Flotantes Internas (`Filled Inputs con Floating Labels`)**:
   - Bloques sólidos `#F4F5F7` donde la etiqueta en mayúsculas (`fontSize: 9`, `fontWeight: '800'`) vive *dentro* de la parte superior del contenedor encima del valor editable, ahorrando espacio vertical en pantallas móviles.
6. **Píldoras de Estado Semánticas (`borderRadius: 9999`)**:
   - Fondos pastel con texto saturado del mismo matiz (`✓ Aprobado hoy` en esmeralda sobre menta `#ECFDF5`, `En mora` en rojo `#DC2626` sobre rosa `#FEF2F2`, `Cobrar hoy` en azul `#1D4ED8` sobre `#EFF6FF`).
7. **Esqueumorfismo Ligero en el Comprobante de Cobro ([`PaymentModal.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/components/PaymentModal.tsx))**:
   - El comprobante post-pago simula sutilmente una tirilla física de datáfono/POS con papel `#FAFAFC`, muescas circulares laterales (`ticketNotchLeft` / `ticketNotchRight`) y líneas divisorias perforadas (`borderStyle: 'dashed'`).

### 6.2. Correcciones del Crítico de IA Aplicadas en `mobile/`
- **Mejora #1 (Anti-desbordamiento en "Mi Caja" / Bento Grid)**: Se aplicó `overflow: 'hidden'`, `flexShrink: 1` y `adjustsFontSizeToFit` en las tarjetas Bento de [`TodayCollectionsView.tsx`](file:///C:/Users/ASUS/prestamos-app-1/mobile/src/presentation/views/collector/TodayCollectionsView.tsx) para que ninguna píldora o monto se salga del margen derecho en pantallas angostas.
- **Mejora #2 (Consistencia Visual Pura)**: Cero banners publicitarios invasivos ni sombras negras duras; toda la interfaz respeta la paleta *Soft Minimalist*.
- **Mejora #3 (Diferenciación de Superficies y Pulido del Dock)**: Se añadieron micro-bordes sutiles de `1px` (`rgba(15, 23, 42, 0.07)` en tarjetas y `rgba(15, 23, 42, 0.09)` en *Filled Inputs*) para que ningún bloque `#F4F5F7` se perciba inactivo, además de borde translúcido (`rgba(255, 255, 255, 0.12)`) en el *Floating Bottom Dock*.
