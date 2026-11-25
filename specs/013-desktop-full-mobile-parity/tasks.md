# Tasks: Desktop Full Mobile Parity (v1.1.5)

## Phase 1: Foundation, Versioning & Schema (`V6`)
- [x] T001 Create `AppVersion.java` (`1.1.5`, `2026-11-25`, `compareSemver`) and `DesktopUpdateChecker.java` + root `desktop-version.json` + `cartera.update.url` in `application.properties`
- [x] T002 Add Flyway migration `V6__customer_order_index.sql` and `orderIndex` field on `CustomerEntity.java`

## Phase 2: Block 1 — Complete Bidirectional Cloud Sync & Opening Base
- [x] T003 Add `patchOfficeSettings(...)` to `SupabaseRegistryClient.java`
- [x] T004 Upgrade `DesktopCloudSyncService.java` for bidirectional `customer.order_index`, full `offices.settings` policies, `dailyOpeningBaseByRouteDate`/`dailyOpeningBaseMeta` timestamp merge, and `desktopPromises` sync while preserving read-only idle sync
- [x] T005 Upgrade `SettlementUseCase.java` and `SettlementManagementView.java` with persisted daily opening base overrides (`opening_base::<routeId>::<date>`), `"Restaurar automático"`, and 1-click WhatsApp cuadre share (`WhatsAppReceiptUtil.generateDailySettlementMessage`)
- [x] T006 Wire `TodayCollectionsService.java` & `TodayCollectionsView.java` to sort by `orderIndex` and persist route order changes (Up/Down/Auto-sort) to SQLite

## Phase 3: Block 2 — One-Screen UX Parity
- [x] T007 Add period collection metrics (`Hoy / Ayer / 7 días / Este mes / Histórico`) and actionable notifications aggregator (`OVERDUE`, `PROMISE`, `RENEWAL_READY`) to `TodayCollectionsService.java`
- [x] T008 Upgrade `DashboardView.java` with Period Filter selector and persisted Privacy Mode toggle (`Ocultar/Mostrar montos`)
- [x] T009 Create unified `Customer360Dialog.java` and wire `"Ficha 360°"` + double-click from `CustomersView`, `TodayCollectionsView`, `LoansView`
- [x] T010 Add migration-aware atomic overload to `CreateCustomerWithLoanUseCase.java` and upgrade `CreateLoanDialog.java` with `Cliente Existente` / `Nuevo Cliente` toggle + `"Guardar y siguiente cartulina"`
- [x] T011 Create `NotificationsDialog.java` and integrate Bell badge + Update Available pill + `AppVersion.CURRENT` in `CarteraApplication.java`, `LoginView.java`, and `ConfigurationView.java`

## Phase 4: Verification & Windows Release (`v1.1.5`)
- [x] T012 Add comprehensive automated tests in `DesktopFullMobileParityTest.java` covering all 3 blocks
- [x] T013 Run full Desktop suite (`.\gradlew.bat clean compileJava test`) and confirm 100% green with 0 regressions
- [x] T014 Bump `desktop/build.gradle` and `desktop/packaging/windows/installer.iss` to `1.1.5` and package `desktop/dist/releases/1.1.5/` (`Instalador-SistemaCartera-v1.1.5.exe` + `SistemaCartera-v1.1.5-Windows-x64.zip`)

**Status**: Converged (`14/14` tasks completed & verified).
