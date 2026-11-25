# Feature Specification: Desktop Full Mobile Parity (v1.1.5)

**Feature Branch**: `013-desktop-full-mobile-parity`
**Created**: 2026-11-25
**Status**: Approved by User (`"comienza con todo eso, procede"`)
**Target Release**: Desktop Windows `v1.1.5` (parity with Mobile Web `1.2.25`)

---

## 1. Problem Statement & Goals

While the native JavaFX Desktop application (`v1.1.4`) now shares exact financial calculations (`Cartera en Calle`, `Base en Caja`, `Patrimonio Administrativo`, migrated physical card payday selection, and renewal `FECHA FIJA`) with Mobile (`web 1.2.25`), several synchronization, operational UX, and commercial polish gaps remain:

1. **Incomplete Bidirectional Cloud Sync & Stale Version Label**:
   - Office policies (`excludeSundays`, `allowRouteNewLoans`, `allowCollectorExpenses`, `allowRouteReorder`, `allowPartialPayments`, `maxNewLoanLimit`, `defaultInstallmentsCount`) and per-route/date opening bases (`dailyOpeningBaseByRouteDate` + `dailyOpeningBaseMeta`, keyed by `<routeId>::<YYYY-MM-DD>`) are not synced bidirectionally with Supabase `offices.settings`.
   - Customer route visit sequence (`customers.order_index`) is not persisted in Desktop SQLite or synced with Supabase `customers.order_index`.
   - Payment promises (`payment_promise`) created on Desktop do not survive reinstalls or sync across devices via `offices.settings.desktopPromises` (note: Supabase does not define standalone `payment_promises` / `non_payment_visits` tables).
   - Sidebar hardcodes a stale label `"Sistema Cartera v1.4"` instead of a centralized `AppVersion.CURRENT` (`"1.1.5"`).

2. **Fragmented Multi-Screen Operational Flows (UX Parity)**:
   - Inspecting a customer requires hopping across `CustomersView`, `CustomerOperationsDialog`, `LoansView`, and `TodayCollectionsView` instead of a unified **Ficha 360°** screen with 1-click actions (Cobrar, Renovar, Promesa, No Pago, WhatsApp, Mapa, Editar, Anular Pago, Archivos).
   - Digitizing physical paper cards (`Cartulina física a digital`) for new customers forces creating the customer on one screen and switching to `CreateLoanDialog` for the loan, without a quick `"Guardar y siguiente cartulina"` workflow.
   - Desktop lacks an actionable **Notifications Bell** in the top bar summarizing overdue customers, today's/overdue payment promises, and active loans ready for renewal (`>= 60%` amortized).
   - `DashboardView` lacks a **Period Filter** (`Hoy / Ayer / 7 días / Este mes / Histórico`) and a **Privacy Mode Toggle** (`Ocultar/Mostrar montos`) to protect office numbers when visitors see the monitor.

3. **Commercial Desktop Product Polish**:
   - No background update checker to notify offices when a new Windows installer is published (`desktop-version.json`).
   - Settlement WhatsApp report only copies to clipboard; lacks a 1-click **"Enviar por WhatsApp"** action (for both live preview and historical closed settlements) powered by a centralized `WhatsAppReceiptUtil.generateDailySettlementMessage(...)`.

---

## 2. Functional Requirements

### Block 1 — Complete Bidirectional Cloud Sync & Versioning (`v1.1.5`)
- **FR-1.1 Centralized Version (`AppVersion`)**: Define `AppVersion.CURRENT = "1.1.5"` and `AppVersion.BUILD_DATE = "2026-11-25"` plus SemVer comparator `compareSemver(String a, String b)`. Display `v1.1.5` consistently in sidebar, login view, window title, and configuration view.
- **FR-1.2 Customer Route Order (`V6__customer_order_index.sql`)**: Add Flyway migration `V6__customer_order_index.sql` (`ALTER TABLE customer ADD COLUMN order_index INTEGER DEFAULT 0;`) and `orderIndex` property on `CustomerEntity`. Persist `orderIndex` (1..N) when moving rows up/down or auto-sorting in `TodayCollectionsView` and sort route collections by `orderIndex` (when > 0). Pull and push `order_index` in `DesktopCloudSyncService`.
- **FR-1.3 Office Settings & Daily Opening Base Bidirectional Sync**:
  - Add `SupabaseRegistryClient.patchOfficeSettings(url, key, officeId, settingsNode)` (`PATCH /rest/v1/offices?id=eq.<officeId>`).
  - Pull & push all policies in `offices.settings` (preserving unknown keys from Mobile): `paperworkFeeEnabled`, `paperworkRate`, `defaultInterestRate`, `defaultInstallmentsCount`, `excludeSundays`, `allowRouteNewLoans`, `allowCollectorExpenses`, `allowRouteReorder`, `allowPartialPayments`, `maxNewLoanLimit`.
  - Pull & merge `dailyOpeningBaseByRouteDate` and `dailyOpeningBaseMeta` (keyed by `<routeId>::<YYYY-MM-DD>` with ISO timestamp winner-takes-all resolution) into `system_setting` (`opening_base::<routeId>::<date>` and `opening_base_meta::<routeId>::<date>`).
  - Persist user-edited daily opening bases from `SettlementManagementView` via `SettlementUseCase.saveOpeningRouteBase(...)`, and restore automatic computation via a `"Restaurar automático"` control.
  - Sync `payment_promise` records safely in `offices.settings.desktopPromises` (JSON array) so promises survive reinstalls and share across Desktop workstations without hitting non-existent Supabase tables.
  - Maintain strict read-only idle sync invariant: background sync NEVER pushes to Supabase unless local operational data, customer order, settings, opening bases, or promises genuinely changed/diverged.
- **FR-1.4 Cloud Session Reconnect UX**: Keep `lblCloudSyncStatus` and `btnSyncNow` in `topBar`; when session expires, clicking the status badge or sync button alerts clearly and offers quick re-authentication.

### Block 2 — One-Screen Operational Fluidity (UX Parity)
- **FR-2.1 Unified Customer 360° (`Customer360Dialog`)**:
  - Single native JavaFX Stage showing: customer header (initials avatar, full name, document, phone/WhatsApp, route, order `#`, status badge), top 1-click action bar (**Cobrar**, **Renovar**, **Promesa**, **No Pago**, **Nuevo Crédito / Cartulina**, **WhatsApp Estado**, **Mapa**, **Editar Datos**), KPI Bento cards (**Saldo Pendiente**, **Total Abonado**, **Progreso %**, **Estado / Mora**), and 4 tabs:
    1. *Plan de Cuotas* (full installment schedule with statuses and pending balances)
    2. *Historial de Pagos* (with 1-click **Recibo** and Admin/Supervisor **Anular Pago**)
    3. *Promesas y Visitas* (inline create/resolve promise and non-payment visit log)
    4. *Archivos y Cartulina* (attached photos/documents via `AttachmentService`)
  - Accessible with 1 click (`"Ficha 360°"`) or double-click from `CustomersView`, `TodayCollectionsView`, `LoansView`, and `NotificationsDialog`.
- **FR-2.2 Unified New Customer + Loan / Physical Card Migration**:
  - Add atomic overload in `CreateCustomerWithLoanUseCase` supporting migration parameters (`isMigration`, `paidInstallmentNumbers`, `cardPhotoPath`, `migrationNotes`, `nextDueDate`).
  - Add `Cliente Existente` / `Nuevo Cliente` toggle inside `CreateLoanDialog` (with inline compact customer fields: Nombre*, Cédula*, Teléfono*, Dirección, Barrio, Negocio, Ruta).
  - Add **"Guardar y siguiente cartulina"** button when `chkMigration` is checked so operators can digitize consecutive physical cards without closing/reopening the dialog.
- **FR-2.3 Actionable Notifications Bell (`NotificationsDialog`)**:
  - Add Bell button (`🔔 N`) with live counter badge in `CarteraApplication.topBar()`, automatically updated on refresh/sync.
  - Clicking opens `NotificationsDialog` with filter tabs: **Todas**, **En Mora**, **Promesas Hoy/Vencidas**, **Listos para Renovar (>= 60%)**. Each item offers 1-click **"Abrir Ficha 360°"** or **"Ir a Cobros"**.
- **FR-2.4 Dashboard Period Filter & Privacy Mode**:
  - Add period selector (`Hoy`, `Ayer`, `7 días`, `Este mes`, `Histórico`) in `DashboardView` backed by `TodayCollectionsService.getCollectedAmountForPeriod(...)` using `BigDecimal`.
  - Add Privacy Mode toggle button (`Ocultar montos` / `Mostrar montos`) persisted in `system_setting` (`ui.privacy_mode`), masking monetary amounts on `DashboardView` as `$ •••••••` when enabled.

### Block 3 — Commercial Desktop Polish
- **FR-3.1 Automatic Desktop Update Checker (`DesktopUpdateChecker`)**:
  - Background non-blocking HTTP check against `cartera.update.url` (configured in `application.properties`, defaulting to repo raw `desktop-version.json`), silent on offline/404/network error.
  - When `latest_version > AppVersion.CURRENT`, display an unobtrusive green pill button `"⬆ Actualizar vX.Y.Z"` in `topBar` opening release notes + 1-click download link.
  - Display installed version (`v1.1.5`) and manual `"Buscar actualizaciones"` button in `ConfigurationView`.
  - Create `desktop-version.json` in repository root.
- **FR-3.2 1-Click WhatsApp Daily Settlement Report**:
  - Add `WhatsAppReceiptUtil.generateDailySettlementMessage(...)` matching Mobile's official cuadre formatting.
  - Add **"Enviar por WhatsApp"** (opens `wa.me` with pre-filled summary) alongside **"Copiar Reporte WhatsApp"** in `SettlementManagementView` (for current preview/closed day AND inside the historical voucher dialog).

---

## 3. Non-Functional & Financial Invariants (Constitution)

- 100% Native JavaFX UI (NO WebView, Electron, or HTML screens).
- `BigDecimal` exclusively for all monetary quantities; zero `double`/`float` money math.
- All financial writes remain transactional, auditable, authorized, and idempotent.
- Closed settlements remain strictly immutable.
- Backward-compatible constructors preserved on all Spring services and UI classes so existing automated tests continue passing with 0 regressions.
- Windows release packaged cleanly as **`v1.1.5`** in `desktop/dist/releases/1.1.5/` (`Instalador-SistemaCartera-v1.1.5.exe` + `SistemaCartera-v1.1.5-Windows-x64.zip`).
