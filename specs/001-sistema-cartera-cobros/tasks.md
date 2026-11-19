# Tasks: Sistema de Cartera y Cobros (Windows Desktop & Sincronización Multi-Ruta)

**Input**: Design documents from `/specs/001-sistema-cartera-cobros/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuración de proyecto Gradle, Java 21, JavaFX 21, Spring Boot 3.4 (sin web UI) y SQLite + Flyway.

- [x] T001 Configurar proyecto Gradle con Java 21, JavaFX 21, Spring Boot Data JPA, SQLite y Flyway en `desktop/build.gradle`
- [x] T002 [P] Configurar propiedades de base de datos SQLite local (`~/.sistema-cartera/cartera.db`) y Flyway en `desktop/src/main/resources/application.properties`
- [x] T003 [P] Crear punto de entrada de infraestructura Spring Boot en `desktop/src/main/java/com/cartera/CarteraInfrastructureApplication.java`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema relacional transaccional, aritmética monetaria `BigDecimal`, entidades JPA, repositorios y datos semilla.

- [x] T004 Crear migración inicial Flyway con tablas financieras, claves foráneas e índices de idempotencia en `desktop/src/main/resources/db/migration/V1__initial_financial_schema.sql`
- [x] T005 [P] Implementar clase de valor monetario inmutable sobre `BigDecimal` en `desktop/src/main/java/com/cartera/domain/money/Money.java`
- [x] T006 [P] Implementar calculadora financiera de dominio (`LoanCalculator`) para créditos, cuotas, pagos y renovaciones en `desktop/src/main/java/com/cartera/loans/domain/LoanCalculator.java`
- [x] T007 [P] Crear entidades JPA (`AppUserEntity`, `RouteEntity`, `CustomerEntity`, `LoanEntity`, `InstallmentEntity`, `PaymentEntity`, `PaymentAllocationEntity`, `RenewalEntity`, `PaymentPromiseEntity`, `CollectionSessionEntity`, `CashMovementEntity`, `DailySettlementEntity`, `AuditLogEntity`, `SystemSettingEntity`) en `desktop/src/main/java/com/cartera/infrastructure/persistence/entity/`
- [x] T008 [P] Crear repositorios Spring Data JPA correspondientes en `desktop/src/main/java/com/cartera/infrastructure/persistence/repository/`
- [x] T009 Implementar cargador de datos semilla iniciales (`DataInitializer`) en `desktop/src/main/java/com/cartera/infrastructure/bootstrap/DataInitializer.java`

---

## Phase 3: User Story 1 - Cobros Diarios e Imputación Exacta de Pagos (Priority: P1) 🎯 MVP

**Goal**: Registrar abonos parciales, pagos completos y pagos adelantados con asignaciones explícitas (`PaymentAllocation`) e idempotencia estricta.

**Independent Test**: `RecordPaymentUseCaseTest` y `PaymentApplicationServiceTest` verifican imputación exacta y bloqueo de duplicados por `idempotencyKey`.

- [x] T010 [P] [US1] Implementar servicio de aplicación de pagos y distribución en cuotas en `desktop/src/main/java/com/cartera/payments/application/PaymentApplicationService.java`
- [x] T011 [US1] Implementar caso de uso transaccional `RecordPaymentUseCase` con validación de `idempotencyKey`, persistencia de `PaymentAllocationEntity`, actualización de `InstallmentEntity`/`LoanEntity` y registro de `CashMovementEntity` en `desktop/src/main/java/com/cartera/payments/application/RecordPaymentUseCase.java`
- [x] T012 [P] [US1] Implementar consulta operativa de cobros del día en `desktop/src/main/java/com/cartera/collections/application/TodayCollectionsService.java`
- [x] T013 [US1] Construir vista nativa JavaFX de cobros diarios y diálogos de pago/recibo en `desktop/src/main/java/com/cartera/ui/views/TodayCollectionsView.java`, `desktop/src/main/java/com/cartera/ui/views/PaymentDialog.java` y `desktop/src/main/java/com/cartera/ui/views/ReceiptDialog.java`
- [x] T014 [P] [US1] Verificar pruebas unitarias e integración de pagos en `desktop/src/test/java/com/cartera/payments/application/RecordPaymentUseCaseTest.java` y `desktop/src/test/java/com/cartera/payments/application/PaymentApplicationServiceTest.java`

---

## Phase 4: User Story 2 - Otorgamiento de Créditos Nuevos y Renovaciones con Papelería (Priority: P2)

**Goal**: Crear créditos nuevos con interés plano sobre capital inicial y ejecutar renovaciones separando capital nuevo, saldo anterior deducido, papelería y efectivo neto entregado.

**Independent Test**: `LoanCalculatorTest` y creación/renovación desde `LoansView` y `RenewLoanDialog`.

- [x] T015 [P] [US2] Implementar alta de clientes en `desktop/src/main/java/com/cartera/customers/application/CreateCustomerUseCase.java`
- [x] T016 [US2] Implementar otorgamiento de créditos nuevos (`CreateLoanUseCase`) en `desktop/src/main/java/com/cartera/loans/application/CreateLoanUseCase.java`
- [x] T017 [US2] Implementar renovación transaccional de créditos (`RenewLoanUseCase`) con liquidación de crédito previo y cálculo de papelería en `desktop/src/main/java/com/cartera/loans/application/RenewLoanUseCase.java`
- [x] T018 [P] [US2] Implementar gestión de cartera e historial crediticio 360° en `desktop/src/main/java/com/cartera/loans/application/PortfolioManagementService.java` y `desktop/src/main/java/com/cartera/history/application/CreditHistoryService.java`
- [x] T019 [US2] Construir vistas JavaFX de préstamos, clientes, renovación e historial en `desktop/src/main/java/com/cartera/ui/views/LoansView.java`, `desktop/src/main/java/com/cartera/ui/views/RenewLoanDialog.java`, `desktop/src/main/java/com/cartera/ui/views/CustomersView.java` y `desktop/src/main/java/com/cartera/ui/views/CreditHistoryDialog.java`

---

## Phase 5: User Story 3 - Gestión de Rutas, Jornadas, Caja, Arqueo y Liquidación Diaria Inmutable (Priority: P3)

**Goal**: Administrar rutas, gastos operativos, tesorería y cierre de liquidación diaria exigiendo justificación ante diferencias de arqueo e impidiendo edición de cierres.

**Independent Test**: Cierre de jornada en `RouteOperationsService` y `SettlementManagementView` con validación de diferencias e inmutabilidad.

- [x] T020 [US3] Implementar servicio de operaciones de ruta, gastos y cierre de liquidación diaria inmutable en `desktop/src/main/java/com/cartera/operations/application/RouteOperationsService.java`
- [x] T021 [P] [US3] Implementar servicio de tesorería general e inyecciones de capital en `desktop/src/main/java/com/cartera/operations/application/TreasuryManagementService.java`
- [x] T022 [US3] Construir vistas y diálogos JavaFX de liquidaciones, gastos de ruta y tesorería en `desktop/src/main/java/com/cartera/ui/views/SettlementManagementView.java`, `desktop/src/main/java/com/cartera/ui/views/CloseSettlementDialog.java`, `desktop/src/main/java/com/cartera/ui/views/RouteExpenseDialog.java`, `desktop/src/main/java/com/cartera/ui/views/TreasuryManagementView.java` y `desktop/src/main/java/com/cartera/ui/views/CapitalInjectionDialog.java`

---

## Phase 6: User Story 4 - Seguridad por Rol, Sincronización LAN Offline-First, Respaldos y Reportes (Priority: P4)

**Goal**: Autenticar con `PBKDF2-HMAC-SHA256`, sincronizar lotes móviles por LAN, respaldar SQLite y exportar reportes Excel.

**Independent Test**: `AuditFixesTest`, `ExcelReportExporter`, `DatabaseBackupService` y `LanSyncServerService`.

- [x] T023 [P] [US4] Implementar hash criptográfico `PBKDF2WithHmacSHA256` y control de acceso por rol en `desktop/src/main/java/com/cartera/infrastructure/security/PasswordHasher.java` y `desktop/src/main/java/com/cartera/infrastructure/security/OfficeAccessService.java`
- [x] T024 [US4] Implementar servidor de sincronización LAN y procesador transaccional de paquetes móviles en `desktop/src/main/java/com/cartera/sync/application/LanSyncServerService.java` y `desktop/src/main/java/com/cartera/sync/application/MobileSyncProcessorService.java`
- [x] T025 [P] [US4] Implementar servicio de respaldos locales de base de datos SQLite en `desktop/src/main/java/com/cartera/infrastructure/backup/DatabaseBackupService.java`
- [x] T026 [P] [US4] Implementar exportador de reportes financieros a formato Excel en `desktop/src/main/java/com/cartera/infrastructure/reporting/ExcelReportExporter.java`
- [x] T027 [US4] Construir vistas JavaFX de Login, Dashboard, Reportes y Sincronización Móvil en `desktop/src/main/java/com/cartera/ui/views/LoginView.java`, `desktop/src/main/java/com/cartera/ui/views/DashboardView.java`, `desktop/src/main/java/com/cartera/ui/views/ReportsView.java` y `desktop/src/main/java/com/cartera/ui/views/ImportMobileSyncDialog.java`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Empaquetado nativo Windows (`jpackage`), refinamiento visual JavaFX y documentación operativa de oficinas.

- [x] T028 Configurar tareas `packageWindows` y `packageZip` con `jpackage` en `desktop/build.gradle` y scripts `empaquetar-windows.bat` / `ejecutar.bat`
- [x] T029 [P] Refinar sistema de diseño oscuro en pizarra, tipografía Manrope y transiciones fluidas en `desktop/src/main/resources/ui/theme.css` y `desktop/src/main/java/com/cartera/ui/util/MotionUtil.java`
- [x] T030 [P] Documentar guías de instalación en oficinas, sincronización móvil y marco legal en `docs/GUIA_INSTALACION_OFICINAS.md`, `docs/GUIA_MOVIL_COBRADORES.md` y `docs/TITULARIDAD_LEGAL_Y_LICENCIAMIENTO_COLOMBIA.md`
