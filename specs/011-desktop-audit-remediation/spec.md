# Feature Specification: Desktop Comprehensive Audit Remediation (Phases 1–4)

**Feature Branch**: `011-desktop-audit-remediation`  
**Created**: 2026-11-23  
**Status**: Approved by user ("ejecutemos todas")  
**Input**: Exhaustive read-only audit of all 24 JavaFX views/dialogs and backend services in `desktop/` (82 verified findings: 22 Critical, 32 High, 21 Medium, 7 Low).

## Business & Engineering Objectives

Remediate all verified defects across the native Windows JavaFX 21 + Spring Boot 3.4 + SQLite desktop application across 4 structured phases without regressing existing verified financial flows:

### Phase 1 — Commercial-Office Stability, Navigation, Safe Cloud Sync & Auth
- **FR-1.1 (Zero Demo Hardcodes / Clean Commercial Startup)**: Remove all hardcoded demo IDs (`"route-norte"`, `"ruta-principal"`, `"usr-col-1"`, `"col-1"`, `"admin"`, `"sistema"`) from runtime fallbacks across UI views and use cases so fresh databases (`cartera.demo-data.enabled=false`) and commercial cloud offices (`rt-*`, `usr-adm-*`, `usr-col-*`) start, log in, refresh, and operate without `IllegalStateException` or `SQLITE_CONSTRAINT_FOREIGNKEY`.
- **FR-1.2 (Deferred Post-Auth Initialization & Safe Login)**: Do not run DB-writing view refreshes (`SettlementManagementView`, `CashManagementView`, etc.) before authentication. Guard `LoginView.doLogin()` against double-Enter concurrency and uncaught exceptions in `onLoginSuccess`.
- **FR-1.3 (Eliminate Blank Screen in Treasury / Reparenting)**: Eliminate JavaFX node reparenting of `SettlementManagementView` between `CarteraApplication` (`mainContainer`) and `TreasuryManagementView` by restoring `setCenter(...)` or providing an independent embedded instance and guarding tab switching against exceptions. Fix `DashboardView` "Supervisar" double/triple refresh and null-collector handling.
- **FR-1.4 (Safe Cloud Sync & Multi-Tenant Isolation)**:
  - Pull-before-Push (or safe merge) in `DesktopCloudSyncService` so local stale `PENDIENTE` rows never overwrite newer mobile payments/installments in Supabase.
  - Paginate `SupabaseRegistryClient.fetchOfficeRows()` using `Range` headers so offices with >1,000 rows never silently truncate.
  - Map `FINALIZADO`/`COMPLETADO` → `PAID`, `ANULADA` safely to Postgres-allowed status (or omit invalid status values that violate `chk_installments_status`), `REVERSED` → `ANULADO` consistently, `FECHA_FIJA` ↔ `FIXED_DATE`, `BLOQUEADO` ↔ `BLOCKED`, `MIGRACION` preserved without fake `LOAN_DISBURSED` cash outflow, and push `installments_breakdown` (`payment_allocation`).
  - Clear `customer_attachment`, `weekly_settlement`, stale `app_user` rows, `audit_log`, and operational `system_setting` before binding a different office on office switch; abort office switch on clear failure so Office A can never leak into Office B.
  - Guard recovered backup directories (`--office-dir` containing recovery marker) against auto-pushing stale data to production Supabase.
  - Hydrate `paperwork_enabled`, `paperwork_fee`, `license_expires_at` from `offices` / `offices.settings`; fail closed on expired/unparseable license timestamps and invalidate local license status when cloud reports suspended/expired.
  - Handle HTTP 409 conflict on `payments` (LAN-imported payments with matching `idempotency_key`) cleanly instead of halting sync permanently.
  - Refresh all active views on silent sync and avoid blocking FX thread in `CarteraApplication.stop()`.
- **FR-1.5 (Real Role Persistence & Non-Blocking Licensing Panel)**:
  - Persist and read real roles from SQLite `role`/`user_role` tables in `AuthService` (and sync `role` faithfully instead of username substring heuristics), avoiding privilege escalation and offline admin downgrade.
  - Remove hardcoded `"usr-admin-1"`/`"usr-col-1"`/`"route-norte"` in `AuthService.setupOfficeAndRoutes()` and deactivate replaced users; remove dead broken `linkLocalDesktopToOffice()`.
  - Execute all 5 HTTP actions in `VendorLicensingDialog` off the JavaFX thread (outside `@Transactional` SQLite transactions), add confirmation dialogs for destructive suspend/regenerate actions, keep "Crear Cobrador" dialog open on validation error, avoid creating orphan routes before users, and harden vendor PIN setup/secret handling.

### Phase 2 — Financial Integrity (Paperwork, Integer Installments, Settlements, Cash, Reports & History)
- **FR-2.1 (Unified Paperwork Accounting & Withdrawal UI)**:
  - Ensure paperwork retained on **both** New Loans (`CreateLoanUseCase`) and Renewals (`RenewLoanUseCase`) NEVER inflates `totalAdministrativeCapital` (aligning Desktop 100% with Spec 008 Caso 1A/1B/1C).
  - Expose `paperworkBalance` and `physicalCashInBox` (`operationalCash + paperworkBalance`) in `TodayCollectionsService.DailyMetrics`, `DashboardView`, `CashManagementView`, and `ExcelReportExporter`.
  - Add dedicated **"Retirar Papelería"** button/dialog in `CashManagementView` + validated `withdrawPaperwork` path in `CashMovementUseCase` validating against `getPaperworkAvailableBalance(routeId)`.
  - Ensure `CashMovementUseCase`, `CashManagementView`, and `ExcelReportExporter` exclude `RETIRO_PAPELERIA` from operational cash and Administrative Capital, and fix `CancelLoanUseCase` to cleanly handle paperwork reversal.
  - Fix `CreateLoanUseCase` decimal parsing of `paperwork_fee` / `max_new_loan_amount` (via `CurrencyInputUtil.parseAmount`), and enforce `paperwork_enabled == false` in backend (`CreateLoanUseCase`, `RenewLoanUseCase`).
- **FR-2.2 (Integer Installments & `FECHA FIJA` Renewal)**:
  - Generate installment amounts in integer pesos (`scale = 0`, last installment absorbs remainder) in `CreateLoanUseCase.simulatePlan()` and `RenewLoanUseCase` so payments and renewals never fail due to cent fractions.
  - Round `totalAgreed` with `Money` in `CustomerDialog` and `CreateLoanDialog`.
  - Support `"FECHA FIJA"` in `RenewLoanDialog` and `RenewLoanUseCase`.
- **FR-2.3 (Settlements & Route Expenses Integrity)**:
  - Display persisted immutable `expectedCollection`, `actualCollection`, and `cashDifference` on closed settlements in `SettlementManagementView` and WhatsApp closure copy.
  - Exclude `ANULADO` loans from paperwork subtraction in `computeAutomaticOpeningRouteBase()`.
  - Enforce `withdrawToOfficeAmount <= actualDelivered` and integer `Money` validation in `closeSettlement()`.
  - Separate read-only settlement preview from DB `collection_session` writes (no DB writes on keystroke in `txtOpeningBase`).
  - Pass `sessionDate` and `idempotencyKey` to `RouteExpenseDialog` / `SettlementUseCase.registerRouteExpense()`; disable expense actions on closed days; resolve route's collector when an Admin records a route expense from `TodayCollectionsView` or `SettlementManagementView`.
  - Fix `Limpiar Conteo` clearing `txtDelivered`, `txtDenomCoins` safe `BigDecimal` parsing, validation errors instead of silent `$0` on typos, route/collector columns + filter in `historyTable`, and state reset across date/collector changes.
- **FR-2.4 (Cash Ledger Integrity & Performance)**:
  - Implement true two-legged route-to-route transfer (`Traslado a otra ruta`) with destination route selector and paired `EGRESO` + `INGRESO` movements in one transaction.
  - Eliminate N+1 `paymentRepository.findAll()` inside `CashManagementView.refresh()` and `routeRepository.findById()` inside cell factories.
  - Enforce `FinancialAccess.manager()`, `requireOpen()`, `routeRepository.existsById()`, integer `Money`, and route collector assignment for gasoline/viáticos in `CashMovementUseCase`.
- **FR-2.5 (Reports, Excel & Credit History Accuracy)**:
  - Respect active route filter in `ReportsView` (`totalCollected`, `totalOverdue`) and `ExcelReportExporter`.
  - Exclude `ANULADO` loans/installments from paid totals and percentages; show distinct `ANULADO`/`ANULADA` badges (never green `PAGADA` / `100% Liquidado`) and support `COMPLETADO` in `ReportsView`, `ExcelReportExporter`, `LoansView`, and `CreditHistoryView`/`CreditHistoryService`.
  - Use `TodayCollectionsService` / `CashLedger.isPhysical()` in `ExcelReportExporter` (never mix digital/payroll/paperwork into physical cash or clamp negative cash to 0), strip illegal XML 1.0 control characters, exclude `TOTALES` from `<autoFilter>`, replace `double` ratios with `BigDecimal`, auto-append `.xlsx`, and add `<mergeCells>` to sheet banner.

### Phase 3 — Operational Buttons, Customers/Loans/Collections, Settings, LAN Sync & Recovery
- **FR-3.1 (Customers, Loans & Follow-Up Flows)**:
  - Assign route/customer collector (never Admin's `userId`) as `collectorId` in `CreateLoanDialog` and `PaymentDialog`.
  - Make customer + immediate loan creation atomic in `CustomerDialog` (single transactional use case or rollback/recovery).
  - Fix `CustomersView.showInstallmentsModal()` to filter reversed payments by `getStatus()` (excluding both `"ANULADO"` and `"REVERTIDO"`), support multiple allocations/payments per installment, recognize `"ADELANTADA"` in modal & WhatsApp statement, support selecting among multiple active loans per customer, expose/edit/use `altPhone` (WhatsApp), `city`, `notes`, preserve route when editing customer on inactive route, prevent lending to `INACTIVO` customers, and allow customer reactivation.
  - Enforce Spec 009 role restrictions for `COBRADOR` across `CustomersView` (hide "Cartera Global de Préstamos" tab), `LoansView`, `CreateLoanDialog` (`chkMigration` hidden/blocked in backend), `CustomerDialog` (filter routes/customers to collector), `CreateCustomerUseCase`, and `CarteraApplication.reloadGlobalRoutes()` (never assign another collector's or inactive route).
  - Fix `FollowUpService.visits()` filtering (no crash on historical/multi-collector loans), `CustomerOperationsDialog` ("Registrar promesa" stays usable after saving, idempotent visits, real customer names in "Compromisos", safe date parsing, delete attachment action), `CreateLoanUseCase` migration bypass of `max_new_loan_amount`, and saving `cardPhotoPath` via `AttachmentService`.
- **FR-3.2 (Collections, PaymentDialog & ReceiptDialog)**:
  - Fix `TodayCollectionsView`: load real `PaymentEntity` data for "Recibo" and "WhatsApp" buttons, fix NPE on null `address`/`neighborhood`, display route name instead of raw `routeId`, fix "Subir"/"Bajar" with active filters and `route_allow_reorder`, align `Al Día (N)` pill count, guard `colAction` index, and surface errors on Map/WhatsApp failures.
  - Fix `PaymentDialog` for `"Abonar +"` (when today's installment is `$0`, default to next pending installment/balance instead of `$0`), cap `"2 Cuotas"` at `loanBalance`, and avoid blocking retries if receipt display fails.
  - Fix `ReceiptDialog` WhatsApp return value check, add native JavaFX `PrinterJob` receipt printing button, rename/fix `customerPhone` parameter, guard nulls, and encode URL spaces as `%20` in `WhatsAppReceiptUtil`.
- **FR-3.3 (Connected Configuration, Safe Backups, LAN Sync & Recovery)**:
  - Wire `route_allow_new_loans`, `route_allow_expenses`, `route_allow_reorder`, `route_allow_partial_payments`, `company_city`, `company_phone`, and `default_interest_percent` (fix mobile key mismatch `"default_interest_rate"` ↔ `"default_interest_percent"`).
  - Reload `ConfigurationView.loadSettings()` on navigation/login; add numeric validation, audit logging, `FinancialAccess.manager()`, edit/deactivate routes, deactivate/reactivate users, explicit role selector, `PasswordField` on edit, password min-length 6 & `.trim()` consistency.
  - Fix `ConfigurationView.exportBackup()` and `openDbFolder()` to use active `--office-dir` / `DatabaseBackupService` (`VACUUM INTO`) off the FX thread; add backup retention policy & `PRAGMA foreign_key_check`.
  - Fix `ImportMobileSyncDialog` & `LanSyncServerService`: default LAN UX guides pairing link generation (no misleading 401 URL), expose server status & "Revocar enlaces", wire `setOnSyncReceivedCallback()` to auto-refresh Desktop UI, guard `scope.collector() == null` NPE in `POST /push`, require specific route when exporting JSON (no `"ALL"` → `"route-norte"`), hide/block LAN sync for `COBRADOR`, run heavy I/O off FX thread, fix `stopServer()`, virtual adapter filtering, CORS `HEAD`, and rate-limit friendliness.
  - Fix `OfficeRecoveryService` to support restoring `.db`-only backups gracefully (warning instead of hard-failing when attachments aren't bundled), run `RecoveryDialog` off FX thread with `*.zip` filter + copyable `--office-dir` command, and write a recovery marker so recovered offices never auto-push to production Supabase.

### Phase 4 — Audit, Table Sorting, CSS & Polish
- **FR-4.1 (AuditView & CreditHistoryView)**: Wrap `FilteredList` in `SortedList` in `AuditView`, sync `lblCount` on refresh, resolve user names, show `previousValue` and detail modal, remove duplicate header/Refresh button when embedded in `ReportsView`, allow alphanumeric documents in `CreditHistoryView`, filter suggestions by route for `COBRADOR`, add `ScrollPane`, and Spanish table placeholders.
- **FR-4.2 (Numeric Sorting, CSS & Dead Code Cleanup)**: Fix numeric/BigDecimal sorting in `CashManagementView`, `SettlementManagementView`, `ReportsView`, `CreditHistoryView`; add missing CSS classes (`.page`, `.metric-title`, `.card-title`, `.highlight-box`, `.feedback-error`) in `theme.css`; fix 5-button overflow in `ConfigurationView`; clean dead `LoginView.btnSetup`/`openOfficeSetupDialog()` and `PortfolioManagementView`; clear search/filters on `onLogout()`; update dynamic route title & date in `DashboardView`; add search/status filter/installments button and accurate footer in `LoansView`; add `initOwner` to modal `Alert`s; add `UiLabels` for `RETIRO_PAPELERIA` and `PAPELERIA_RENOVACION`.

## Success Criteria
- `.\gradlew.bat compileJava test` passes 100% with all existing tests + comprehensive new regression test suites covering Phases 1–4.
- `BigDecimal` used exclusively for all financial calculations (zero `double`/`float` in financial/report code).
- Zero hardcoded demo IDs causing FK failures in commercial offices (`cartera.demo-data.enabled=false`).
- Desktop application packages cleanly with `.\gradlew.bat packageZip`.
