# Implementation Plan: Desktop Comprehensive Audit Remediation (Phases 1–4)

**Feature**: `011-desktop-audit-remediation`  
**Stack**: Native JavaFX 21 + Spring Boot 3.4 + SQLite (Flyway V1–V4, `PRAGMA foreign_keys = ON`) + Gradle.

## Architecture & Safety Strategy
1. **Incremental Phase Execution with Test Gates**: Execute Phase 1 → Gradle test gate → Phase 2 → Gradle test gate → Phase 3 → Gradle test gate → Phase 4 → full Gradle test + package verification.
2. **Schema Compatibility**: Reuse existing `V1__initial_financial_schema.sql` tables (`role`, `user_role`, `system_setting`, `customer_attachment`, `daily_settlement`, etc.) so `MAX_SUPPORTED_SCHEMA_VERSION` stays compatible with existing office backups (while raising `OfficeRecoveryService` ceiling gracefully).
3. **Contract Preservation**:
   - Preserve existing `SettlementOpeningBaseTest`, `RenewLoanUseCaseTest`, `DesktopCloudSyncServiceTest`, `OfficeLicensingServiceTest`, `DatabaseBackupServiceTest`, `AuditFixesTest`, `LoanCalculatorTest`, `RenewalCalculatorTest`, `ImmutableLedgerServiceTest`.
   - Align `DesktopFinancialJourneyTest` / `DesktopParityTest` ONLY where pre-Spec-008 assertions explicitly expected paperwork to inflate `totalAdministrativeCapital` (updating them to assert the Spec 008 invariant: paperwork stays in physical `Base en oficina`, never inflates Administrative).
   - Add dedicated regression test classes (`Phase1AuditRemediationTest`, `Phase2FinancialRemediationTest`, `Phase3OperationalRemediationTest`, `Phase4ReportingAuditTest`) testing every critical/high fix in real Spring Boot + SQLite (`PRAGMA foreign_keys = ON`, `demo-data=false`).

## Key Design Decisions by Phase

### Phase 1
- **No Premature Refresh**: Add lazy/post-login refresh lifecycle in `CarteraApplication` (`initializeAfterLogin()` / `onLoginSuccess()`); remove DB-writing `refresh()` calls from `SettlementManagementView` and `CashManagementView` constructors.
- **No Shared Reparented Node**: Pass a dedicated `SettlementManagementView` instance to `TreasuryManagementView` (or separate `standaloneSettlementView` and `treasurySettlementView`), keeping both synchronized via shared refresh hooks.
- **Role Persistence**: Seed `role` rows (`ADMIN`, `SUPERVISOR`, `COBRADOR`) on demand in `AuthService` and persist/read `user_role` rows whenever users are created, hydrated from cloud, or edited; fall back to heuristic only for legacy pre-existing rows without a `user_role` mapping.
- **Safe Cloud Sync**:
  - Reverse `syncSilentlyInBackground()` order to **Pull/Merge first, then Push only missing/changed records** (never overwrite a cloud installment that already has higher `paid_amount` or terminal status with a local stale `PENDIENTE` row; never overwrite cloud `PAID`/`RENEWED`/`CANCELLED` loan with `ACTIVE`).
  - Paginate `SupabaseRegistryClient.fetchOfficeRows()` in chunks of 1,000 using `Range: start-end` until a page returns `< 1,000` rows.
  - On office switch (`previousOfficeId != null && !previousOfficeId.equals(newOfficeId)`), clear ALL child tables in topological FK order (`customer_attachment`, `payment_allocation`, `payment`, `delinquency_record`, `payment_promise`, `renewal`, `installment`, `cash_movement`, `daily_settlement`, `weekly_settlement`, `collection_session`, `loan`, `customer_reference`, `customer`, `route`, `user_role`, `audit_log`, `app_user`, operational `system_setting`) inside one transaction before switching `office.id`; if clearing fails, abort login switch instead of leaking Office A into Office B.
  - Detect `recovery.read_only_mode = true` (written by `OfficeRecoveryService.recover()`) in `DesktopCloudSyncService` so recovered backups NEVER auto-push to production Supabase.

### Phase 2
- **Unified Paperwork Accounting**:
  - `TodayCollectionsService.DailyMetrics` adds `paperworkBalance` and helper `totalPhysicalCashInBox()` (`cashBalance.add(paperworkBalance)`).
  - `TodayCollectionsService.getDailyMetricsForRoute()` calculates `cash` as **operational cash** (excluding retained paperwork from new loans `loan.principal - netDisbursed` AND excluding `RETIRO_PAPELERIA`), so `totalAdministrativeCapital = totalActiveDebt + operationalCash + digital` NEVER includes paperwork in EITHER Caso 1A (new loan) or Caso 1B (renewal).
  - `CashMovementUseCase.withdrawPaperwork(idempotencyKey, routeId, amount, description)` validates `amount <= getPaperworkAvailableBalance(routeId)` (integer `Money`, manager auth, open day, idempotent, audited) and saves `EGRESO RETIRO_PAPELERIA`.
  - `CashManagementView` displays both **Base Física Total** (`Efectivo base + Papelería`), **Papelería Disponible**, and a dedicated **"Retirar Papelería"** button, plus true two-route **"Traslado a otra ruta"**.
- **Integer Installments**: `CreateLoanUseCase.simulatePlan()` divides with `scale=0` (`RoundingMode.FLOOR` / `HALF_UP`) and puts remainder on the final installment so `sum(installments) == totalAgreed` with zero fractional pesos.
- **Immutable Closed Settlements**: `SettlementUseCase.previewDaySummary()` is read-only; when `daily_settlement` exists for a closed session, `DaySummary` populates `netExpectedCash = settlement.getExpectedCollection()`, `actualDelivered = settlement.getActualCollection()`, `cashDifference = settlement.getCashDifference()`.

### Phase 3
- **Atomic Customer + Loan**: Create `CreateCustomerWithLoanUseCase` (`@Transactional`) invoked by `CustomerDialog` when `chkDisburseNow` is checked.
- **Collector Ownership & Spec 009**: Resolve route's `collectorId` (with safe null handling when route has no collector) in `CreateLoanDialog`, `PaymentDialog`, `TodayCollectionsView` ("Gasto de Ruta"), and `CashMovementUseCase`; enforce `COBRADOR` restrictions across UI + backend.
- **Connected Policies & Real Receipts**: Enforce `route_allow_new_loans`, `route_allow_expenses`, `route_allow_reorder`, `route_allow_partial_payments`, `default_interest_percent` (synced under both keys for mobile backward compat), `company_city`, `company_phone`. Load real `PaymentEntity` in `TodayCollectionsView` receipts/WhatsApp and add `PrinterJob` print support in `ReceiptDialog`.
- **LAN Sync & Recovery**: Fix `ImportMobileSyncDialog` UX & background threads, wire `setOnSyncReceivedCallback()`, fix `LanSyncServerService` null-collector NPE & shutdown, and allow `OfficeRecoveryService` `.db` recovery with warning when attachments aren't bundled.

### Phase 4
- Fix `AuditView` (`SortedList`, user names, `previousValue`, detail modal), `CreditHistoryView` (alphanumeric docs, collector route scoping, `ScrollPane`), numeric `TableView` comparators across 4 views, `LoansView` search/filter/installments/footer, `theme.css` missing classes, dead code removal, and `onLogout()` cleanup.
