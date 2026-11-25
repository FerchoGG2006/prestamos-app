# Technical Implementation Plan: Desktop Full Mobile Parity (v1.1.5)

**Spec Reference**: [spec.md](file:///c:/Users/ASUS/prestamos-app-1/specs/013-desktop-full-mobile-parity/spec.md)

---

## Architecture & Module Map

### 1. Infrastructure & Versioning
- **NEW** `desktop/src/main/java/com/cartera/infrastructure/version/AppVersion.java`:
  - `CURRENT = "1.1.5"`, `BUILD_DATE = "2026-11-25"`.
  - `compareSemver(String v1, String v2)` robust parser (`v`-prefix tolerant, numeric segment comparison).
- **NEW** `desktop/src/main/java/com/cartera/infrastructure/version/DesktopUpdateChecker.java`:
  - `@Service` reading `@Value("${cartera.update.url:https://raw.githubusercontent.com/FerchoGG2006/prestamos-app/main/desktop-version.json}")`.
  - `checkForUpdate()` -> `Optional<UpdateInfo>` (`latestVersion`, `minVersion`, `downloadUrl`, `releaseNotes`, `updateAvailable`).
  - `parseUpdateInfo(String json, String currentVersion)` pure helper for deterministic unit testing without network.
- **NEW** `desktop-version.json` in repo root.
- **MOD** `desktop/src/main/resources/application.properties`: add `cartera.update.url`.

### 2. Persistence & Flyway Migration (`V6`)
- **NEW** `desktop/src/main/resources/db/migration/V6__customer_order_index.sql`:
  - `ALTER TABLE customer ADD COLUMN order_index INTEGER DEFAULT 0;`
- **MOD** `CustomerEntity.java`:
  - Add `@Column(name = "order_index") private Integer orderIndex = 0;` with getter/setter (preserve all existing constructors).

### 3. Bidirectional Cloud Sync (`DesktopCloudSyncService` & `SupabaseRegistryClient`)
- **MOD** `SupabaseRegistryClient.java`:
  - Add `patchOfficeSettings(String supabaseUrl, String apiKey, String officeId, ObjectNode settings)` using `PATCH /rest/v1/offices?id=eq.<officeId>` with `Prefer: return=minimal` and `updated_at`.
- **MOD** `DesktopCloudSyncService.java`:
  - Inject optional `PaymentPromiseRepository` (keep existing constructors delegating with `null`).
  - Include `customer.orderIndex` in pull, push (`order_index`), `computeLocalChangeDigest()`, and customer fingerprint check in `hasLocalDivergenceToPush(...)`.
  - Expand `RemotePullContext` with `remoteCustomerFingerprints`, `remoteSettingsNode`, and `remoteSettingsFingerprint`.
  - Pull & merge from `offices.settings`:
    - Policies: `paperworkFeeEnabled`, `paperworkRate`, `defaultInterestRate`, `defaultInstallmentsCount`, `excludeSundays`, `allowRouteNewLoans`, `allowCollectorExpenses`, `allowRouteReorder`, `allowPartialPayments`, `maxNewLoanLimit`.
    - Daily opening bases: `dailyOpeningBaseByRouteDate` + `dailyOpeningBaseMeta` (timestamp winner-takes-all per `<routeId>::<YYYY-MM-DD>` into `opening_base::<routeId>::<date>` & `opening_base_meta::<routeId>::<date>`).
    - Desktop promises: `desktopPromises` JSON array merged idempotently into local `payment_promise` (preserving status transitions `CUMPLIDA`/`CANCELADA` over `PENDIENTE`).
  - Push merged `offices.settings` via `patchOfficeSettings(...)` ONLY when local policies, opening bases, or promises changed/diverged from remote (starting from remote `offices.settings` copy so unknown Mobile keys are NEVER clobbered!).
  - Include settings/opening-base/promises fingerprint in `computeLocalChangeDigest()` and `hasLocalDivergenceToPush(...)` so idle sync stays strictly read-only (`PULL`-only).

### 4. Application Services
- **MOD** `TodayCollectionsService.java`:
  - Add `orderIndex` ordering in `getTodayCollectionItemsForRoute(...)` (positive `orderIndex` ascending first, then fallback by priority/name).
  - Add `saveCustomerRouteOrder(List<String> orderedCustomerIds)` persisting 1..N `orderIndex` on `CustomerEntity`.
  - Add `CollectionPeriod` enum (`TODAY`, `YESTERDAY`, `LAST_7_DAYS`, `THIS_MONTH`, `ALL_TIME`) and `getCollectedAmountForPeriod(CollectionPeriod period, LocalDate referenceDate, String routeFilter)` using `BigDecimal`.
  - Add `NotificationItem` record + `getActionableNotifications(LocalDate date, String routeFilter)` computing:
    - `OVERDUE` (clientes con cuotas vencidas, monto y días de atraso)
    - `PROMISE` (promesas pendientes vencidas o para hoy)
    - `RENEWAL_READY` (créditos activos con >= 60% amortizado)
- **MOD** `SettlementUseCase.java`:
  - Add `KEY_OPENING_BASE_PREFIX = "opening_base::"` and `KEY_OPENING_BASE_META_PREFIX = "opening_base_meta::"`.
  - Inject optional `SystemSettingRepository` (preserve all existing constructors).
  - Add `getSavedOpeningRouteBase(String routeId, LocalDate date)`, `saveOpeningRouteBase(String routeId, LocalDate date, BigDecimal amount)`, `clearSavedOpeningRouteBase(String routeId, LocalDate date)`, and `resolveOpeningRouteBase(String collectorId, LocalDate date)` (saved override > automatic previous-day calculation).
- **MOD** `CreateCustomerWithLoanUseCase.java`:
  - Add overload `execute(CustomerData, LoanData, boolean isMigration, Set<Integer> paidInstallmentNumbers, String cardPhotoPath, String migrationNotes, LocalDate nextDueDate)` reusing existing transactional customer creation + `CreateLoanUseCase`.
- **MOD** `WhatsAppReceiptUtil.java`:
  - Add `generateDailySettlementMessage(...)` and `openWhatsAppWithMessage(String phoneOrBlank, String message)` (`wa.me` direct share URL).

### 5. Native JavaFX UI Upgrades
- **NEW** `Customer360Dialog.java`:
  - Comprehensive single-screen Customer 360° modal Stage with header, 1-click actions, KPI cards, and 4 tabs (Cuotas, Pagos + Recibo/Anular, Promesas & Visitas, Archivos).
- **NEW** `NotificationsDialog.java`:
  - Filterable alerts dialog (`Todas`, `En Mora`, `Promesas`, `Listos para Renovar`) with direct jump to Customer 360° or Cobros.
- **MOD** `CreateLoanDialog.java`:
  - Add `setCreateCustomerWithLoanUseCase(...)` setter; add `Cliente Existente` / `Nuevo Cliente` toggle + inline customer form + **"Guardar y siguiente cartulina"** button in migration mode.
- **MOD** `CustomersView.java`, `TodayCollectionsView.java`, `LoansView.java`:
  - Wire `"Ficha 360°"` button and double-click row handler to open `Customer360Dialog`.
  - Wire `TodayCollectionsView` `btnMoveUp`, `btnMoveDown`, `btnAutoSort` to persist `orderIndex` via `TodayCollectionsService.saveCustomerRouteOrder(...)` and show `#orderIndex` badge!
  - Wire `CreateCustomerWithLoanUseCase` into `CreateLoanDialog` invocations.
- **MOD** `DashboardView.java`:
  - Add Period selector (`Hoy`, `Ayer`, `7 días`, `Este mes`, `Histórico`) + Privacy Mode toggle (`Ocultar montos` / `Mostrar montos`) persisted in `system_setting` (`ui.privacy_mode`).
- **MOD** `SettlementManagementView.java`:
  - Use `resolveOpeningRouteBase(...)`, persist edits to `txtOpeningBase` on blur/save with `"Restaurar automático"` button, and add 1-click **"Enviar por WhatsApp"** button next to **"Copiar Reporte WhatsApp"** (plus in historical voucher dialog).
- **MOD** `ConfigurationView.java`:
  - Show installed version `v1.1.5` + `"Buscar actualizaciones"` button using `DesktopUpdateChecker`.
- **MOD** `CarteraApplication.java` & `LoginView.java`:
  - Replace hardcoded `"Sistema Cartera v1.4"` with `AppVersion.CURRENT` (`"1.1.5"`).
  - Add Notifications Bell button (`🔔 N`) + Update Available pill button (`⬆ Actualizar vX.Y.Z`) to `topBar`.
  - Trigger non-blocking `DesktopUpdateChecker` check after startup.
  - Wire all new setters/dependencies (`CreateCustomerWithLoanUseCase`, `DesktopUpdateChecker`, `ReversePaymentUseCase`, `PaymentRepository`, `FollowUpService`, `AttachmentService`, `RenewLoanUseCase`, etc.).

### 6. Verification & Packaging (`v1.1.5`)
- Bump `desktop/build.gradle` and `desktop/packaging/windows/installer.iss` to `1.1.5`.
- Add `DesktopFullMobileParityTest.java` covering all 3 blocks.
- Run `.\gradlew.bat clean compileJava test` (100% green).
- Run `.\gradlew.bat packageAll "-PdistributionDir=dist/releases/1.1.5" -x test` and verify installer/zip/exe outputs.
