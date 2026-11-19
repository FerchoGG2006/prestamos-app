# Implementation Plan: Sistema de Cartera y Cobros (Windows Desktop & Sincronización Multi-Ruta)

**Branch**: `001-sistema-cartera-cobros` | **Date**: 2026-11-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-sistema-cartera-cobros/spec.md`

## Summary

Aplicación nativa de escritorio para Windows desarrollada en **Java 21 LTS + JavaFX 21** con composición interna en **Spring Boot 3.4** (sin servidor web de UI) y persistencia transaccional en **SQLite + JPA/Hibernate + Flyway**. Implementa el ciclo completo de microcréditos, imputación exacta de pagos mediante `BigDecimal` y `PaymentAllocation`, renovaciones con papelería configurable, liquidación diaria multi-ruta inmutable, sincronización bidireccional LAN con cobradores móviles, respaldos locales y empaquetado autocontenido con `jpackage`.

## Technical Context

**Language/Version**: Java 21 LTS (Eclipse Temurin 21.0.12)
**Primary Dependencies**: JavaFX 21.0.5 (`javafx-controls`, `javafx-graphics`), Spring Boot 3.4.0 (`spring-boot-starter-data-jpa`, sin web UI), Hibernate Community Dialects (`sqlite-jdbc`), Flyway Core
**Storage**: SQLite transaccional local en `%USERPROFILE%\.sistema-cartera\cartera.db` gestionado con migraciones Flyway (`V1__initial_financial_schema.sql`)
**Testing**: JUnit 5 + Spring Boot Test (`./gradlew test`)
**Target Platform**: Windows 10 / 11 (x64) ejecutable nativo (`SistemaCartera.exe` vía `jpackage` e instalador Inno Setup / ZIP portable)
**Project Type**: Native Windows Desktop Application (`desktop/`) + Mobile Collector Sync Companion (`mobile/`)
**Performance Goals**: Inicio en frío < 3 segundos; registro transaccional de cobros y arqueos < 100 ms en SQLite local; UI fluida a 60 fps
**Constraints**: Offline-first 100%, prohibido WebView/Electron/React como UI de escritorio, uso obligatorio de `BigDecimal` para valores monetarios, liquidaciones cerradas inmutables
**Scale/Scope**: Múltiples rutas por oficina, miles de clientes, créditos, cuotas y pagos locales con sincronización LAN concurrente

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **[PASS] Principio I (UI Nativa JavaFX 21)**: La aplicación de escritorio reside en `desktop/src/main/java/com/cartera/ui/` usando exclusivamente escenas y controles nativos de JavaFX (`CarteraApplication.java`, `MainWorkspaceView.java`, `DashboardView.java`, `TodayCollectionsView.java`, `LoansView.java`, `CustomersView.java`, `SettlementManagementView.java`, `TreasuryManagementView.java`, `ReportsView.java`).
- **[PASS] Principio II (Exactitud Financiera con `BigDecimal`)**: `Money.java`, `LoanCalculator.java`, `RecordPaymentUseCase.java` y todas las columnas numéricas operan exclusivamente con `BigDecimal` y separan `PaymentEntity` de `PaymentAllocationEntity`.
- **[PASS] Principio III (Transaccionalidad, Inmutabilidad y Auditoría)**: Operaciones anotadas con `@Transactional`, bitácora en `AuditLogEntity`, e inmutabilidad de liquidaciones cerradas en `DailySettlementEntity`.
- **[PASS] Principio IV (Seguridad Criptográfica PBKDF2 y LAN Sync)**: `PasswordHasher.java` usa `PBKDF2WithHmacSHA256` con sal aleatoria de 128 bits, y `LanSyncServerService.java` valida tamaño de payload, rate limit por IP y cabecera `X-Office-Sync-Pin`.
- **[PASS] Principio V (Verificación con Gradle y JUnit 5)**: Suite automatizada en `desktop/src/test/java/com/cartera/`.

## Project Structure

### Documentation (this feature)

```text
specs/001-sistema-cartera-cobros/
├── spec.md              # Especificación funcional y criterios de aceptación
├── plan.md              # Plan de arquitectura e implementación técnica
├── research.md          # Decisiones arquitectónicas y técnicas (Fase 0)
├── data-model.md        # Modelo de entidades, relaciones e invariantes (Fase 1)
├── quickstart.md        # Guía de validación, pruebas y empaquetado (Fase 1)
├── checklists/
│   └── requirements.md  # Checklist de validación de calidad de especificación
├── contracts/
│   └── lan-sync-and-desktop-ui.md # Contratos de interfaz UI y sincronización LAN
└── tasks.md             # Desglose de tareas trazables por historia de usuario
```

### Source Code (repository root)

```text
desktop/
├── build.gradle
└── src/
    ├── main/
    │   ├── java/com/cartera/
    │   │   ├── CarteraInfrastructureApplication.java
    │   │   ├── collections/application/TodayCollectionsService.java
    │   │   ├── customers/application/CreateCustomerUseCase.java
    │   │   ├── domain/money/Money.java
    │   │   ├── history/application/CreditHistoryService.java
    │   │   ├── infrastructure/
    │   │   │   ├── backup/DatabaseBackupService.java
    │   │   │   ├── bootstrap/DataInitializer.java
    │   │   │   ├── persistence/entity/       # Entidades JPA (Loan, Installment, Payment, etc.)
    │   │   │   ├── persistence/repository/   # Repositorios Spring Data JPA
    │   │   │   ├── reporting/ExcelReportExporter.java
    │   │   │   └── security/                 # OfficeAccessService, PasswordHasher
    │   │   ├── loans/
    │   │   │   ├── application/              # CreateLoanUseCase, RenewLoanUseCase, PortfolioManagementService
    │   │   │   └── domain/LoanCalculator.java
    │   │   ├── operations/application/       # RouteOperationsService, TreasuryManagementService
    │   │   ├── payments/application/         # RecordPaymentUseCase, PaymentApplicationService
    │   │   ├── sync/application/             # LanSyncServerService, MobileSyncProcessorService
    │   │   └── ui/                           # CarteraApplication, vistas JavaFX y diálogos modales
    │   └── resources/
    │       ├── application.properties
    │       ├── db/migration/V1__initial_financial_schema.sql
    │       └── ui/theme.css
    └── test/
        └── java/com/cartera/                 # Pruebas unitarias y de integración JUnit 5
```

**Structure Decision**: Monolito modular nativo en `desktop/` con separación estricta entre `domain`, `application`, `infrastructure` y `ui` (JavaFX), complementado por `mobile/` para los cobradores en ruta que sincronizan vía LAN con el escritorio.

## Complexity Tracking

Ninguna violación a la Constitución del proyecto.
