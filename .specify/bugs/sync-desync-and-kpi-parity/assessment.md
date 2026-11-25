# Bug Assessment: Mobile/Web Cloud Sync Freeze & Desktop KPI Parity Mismatch

- **Slug**: sync-desync-and-kpi-parity
- **Created**: 2026-11-24
- **Source**: pasted text + comparative screenshots (Desktop vs Mobile/Web for `Inversiones FBV` / `off-fbv-001`)
- **Verdict**: valid
- **Severity**: critical

## Report (verbatim or summarized)

> "Ya estoy revisando los arreglos que hiciste en el desktop, pero hay algo que no me cuadra realmente. Se supone que todo está sincronizado, es decir, tanto el desktop como el móvil tienen obviamente las mismas credenciales, es la misma oficina manejada por los mismos usuarios y demás... ¿Por qué no está sincronizado realmente todo? Mira lo que tengo yo en desktop, porque lo que tengo yo en móvil es muy diferente y lo que tengo en móvil está muy bien."

Observed comparison on `2026-11-23` at ~10:08–10:09 p.m. for office `Inversiones FBV` (`off-fbv-001`, "Todas las Rutas"):
- **Mobile (`Kredia • web 1.2.22`)**: Patrimonio operativo `$6.347.000`, Cartera en calle `$6.211.000`, Base en oficina `$136.000` (Efectivo base `$136.000`, Digital `$0`), Cobrado hoy `$255.000` (`49%` vs meta), En mora `$327.000` (`6` clientes).
- **Desktop**: Patrimonio de ruta `COP 5,045,000`, Cartera en calle `COP 5,545,000`, Base en caja `-COP 500,000`, Fondos digitales `COP 0`, Cobrado hoy `COP 0` (`0%` meta), Cartera en mora `COP 376,000`.

## Symptom

Mobile/Web (`web 1.2.22`) silently stopped pushing operational data to Supabase after `2026-11-21 01:36:48 AM` while displaying a hardcoded green `• En línea` status, leaving Supabase and Desktop frozen on `2026-11-20` data. Independently, even on identical `2026-11-20` data, Desktop's `BASE EN CAJA` diverges from Mobile by `-COP 596,000` (`-COP 500,000` vs `+COP 96,000`), loses `MIGRACION` classification, lacks `daily_settlements` / `route.initial_cash_base` sync, corrupts `loan_number` on push, and mis-scales `offices.settings.paperworkRate` (`5000 * 100000 = 500,000,000`).

## Reproduction

1. On a Mobile/Web session remembered via `@prestamos_logged_user_id` from prior to `2026-11-21 02:31` (when strict RLS `20261121010000_strict_rls_office_isolation.sql` was activated), open `Kredia • web 1.2.22`.
2. Observe `App.tsx` auto-login bypasses `authenticate_kredia_user`, leaving `officeConfig.cloudSessionToken` empty.
3. Record payments/loans/settlements on Nov 21–23. Observe `TodayCollectionsView` still displays `• En línea`, while `cloud-sync.ts:139` silently skips Supabase sync every 60s.
4. Open Desktop (`off-fbv-001`). Observe Desktop pulls exact Supabase state (frozen at `2026-11-20`, 0 diff vs Supabase), yet computes `BASE EN CAJA = -COP 500,000` instead of Mobile's `+COP 96,000` on the exact same dataset.

## Suspected Code Paths

- `mobile/App.tsx:780-806` — Auto-restores remembered user session without verifying/refreshing `cloudSessionToken` or triggering immediate cloud sync.
- `mobile/src/infrastructure/sync/cloud-sync.ts:139-177` — Silently skips Supabase sync when `cloudSessionToken` is empty; does not check `pushFullPortfolio` failure before executing `pullFullPortfolio` + `mergeCloudPortfolio`; exposes no subscriber API for live UI status.
- `mobile/src/infrastructure/sync/supabase-client.ts:437-440,648-671,809-841` — `pushFullPortfolio` swallows errors returning `false`; `pullFullPortfolio` lacks pagination (>1,000 rows); `checkOfficeLicense` misclassifies expired/invalid RLS session token (`data=null, error=null`) as `SUSPENDED` license; lacks token-only re-auth helper that preserves unsynced local data.
- `mobile/src/presentation/views/auth/LoginView.tsx:149-162` — `handleCloudCredentialLogin` passes `preserveLocalPortfolio: false` unconditionally, risking overwriting unsynced local portfolio when re-authenticating on the same office.
- `mobile/src/presentation/views/collector/TodayCollectionsView.tsx:690-725` — Hardcodes `• En línea` pill regardless of cloud sync status; `Forzar Actualización` reloads browser caches without syncing cloud data or renewing session token.
- `desktop/src/main/java/com/cartera/collections/application/TodayCollectionsService.java:185-281` — Computes `cashBalance` from raw `cash_movement` rows including orphan `COBRO_HISTORICO`/`REVERSO_HISTORICO` (`COP 530,000` net) while omitting pre-migration amortized collections on `MIGRACION` loans (`COP 1,126,000`), `route.initial_cash_base`, and renewal paperwork when synced from cloud without a `PAPELERIA_RENOVACION` movement.
- `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java:330-343,420-438,493-531,707-724,773-842` — Loses `MIGRACION` operationType from `notes`, omits `route.initial_cash_base`, multiplies `paperworkRate` (`5000`) by `100,000`, overwrites `loan_number` on push, omits `daily_settlements` sync, and does not normalize UTC `created_at` to `America/Bogota` when `local_created_at` is absent.
- `desktop/src/main/java/com/cartera/ui/CarteraApplication.java:302-328,508-512` — Hardcodes `"● Conectado • Listo para Operar"` with no live sync state or manual `"Sincronizar"` trigger.

## Root Cause Hypothesis

High confidence (verified directly against live Supabase `off-fbv-001` rows and local SQLite `cartera.db` to the exact peso):
1. Strict RLS (`x-kredia-session`) left pre-existing remembered Mobile/Web sessions without a `cloudSessionToken`, causing silent sync bypass since `2026-11-21 01:36 AM` while UI showed a hardcoded `En línea` pill.
2. Desktop's cash balance formula ignored pre-migration paid installments on migrated cards (`COP 1,126,000`) and counted orphan historical collection cash movements (`COP 530,000` net), creating an exact `COP 596,000` discrepancy (`-COP 500,000` vs `+COP 96,000`) even on identical Nov 20 data, alongside `paperworkRate`, `loan_number`, `MIGRACION`, and `daily_settlements` sync gaps.

## Proposed Remediation

**Preferred**:
1. **Mobile/Web safe rescue & reliable sync**:
   - Add `reauthenticateCloudSession(username, password)` in `supabase-client.ts` that obtains a fresh `x-kredia-session` token via `authenticate_kredia_user` without overwriting local portfolio data.
   - Distinguish expired/missing RLS session (`sessionInvalid: true`) from real license suspension in `checkOfficeLicense`.
   - Make `pushFullPortfolio` return `{ ok, error }` and abort `pullFullPortfolio`/`mergeCloudPortfolio` if push fails; paginate `pullFullPortfolio` in 1,000-row pages; merge installments monotonically in `mergeCloudPortfolio`.
   - Expose reactive sync status (`IDLE | SYNCING | SYNCED | NEEDS_CLOUD_AUTH | OFFLINE_QUEUED | ERROR`) with subscriber notifications in `cloud-sync.ts`; attempt silent token refresh on startup when remembered credentials exist for the same office; run immediate sync on login.
   - Protect `LoginView.tsx` so re-authenticating on the same office with existing local data sets `preserveLocalPortfolio: true` and triggers push-first sync instead of wiping local data.
   - Replace static `En línea` in `TodayCollectionsView.tsx` with a live clickable sync badge + reconnect banner/modal when `NEEDS_CLOUD_AUTH`, and bump `WEB_BUILD_LABEL` to `web 1.2.23 (2026-11-24)`.
2. **Desktop KPI parity & sync hardening**:
   - Add Flyway migration `V5__route_initial_base_and_loan_number.sql` adding `route.initial_cash_base` (`NUMERIC NOT NULL DEFAULT 0`) and `loan.loan_number` (`TEXT`), updating `RouteEntity` and `LoanEntity`.
   - Align `TodayCollectionsService` (`getDailyMetricsForRoute` & `getPaperworkAvailableBalance`) to include `route.initialCashBase`, include pre-migration historical collections on `MIGRACION` loans, exclude orphan `COBRO_HISTORICO`/`REVERSO_HISTORICO` from operational cash, and handle cloud-synced renewal `paperworkDeducted` without double-counting Desktop `PAPELERIA_RENOVACION` rows — preserving 100% of existing pure-Desktop test invariants.
   - Update `DesktopCloudSyncService` to detect `MIGRACION` from `notes`, fix `paperworkRate` scaling (`<= 1 ? rate * 100000 : rate`), preserve `loan_number` and `route.initial_cash_base`, sync `daily_settlements` bidirectionally, normalize UTC timestamps to `America/Bogota`, and expose real sync status metadata.
   - Update `CarteraApplication.topBar()` to show live cloud sync status and a clickable `"↻ Sincronizar"` button that triggers immediate sync and refreshes active views.

**Files likely to change**:
- `mobile/src/infrastructure/sync/supabase-client.ts`
- `mobile/src/infrastructure/sync/cloud-sync.ts`
- `mobile/src/infrastructure/storage/local-store.ts`
- `mobile/src/presentation/views/auth/LoginView.tsx`
- `mobile/src/presentation/views/collector/TodayCollectionsView.tsx`
- `mobile/src/presentation/utils/appUpdates.ts`
- `mobile/App.tsx`
- `desktop/src/main/resources/db/migration/V5__route_initial_base_and_loan_number.sql`
- `desktop/src/main/java/com/cartera/infrastructure/persistence/entity/RouteEntity.java`
- `desktop/src/main/java/com/cartera/infrastructure/persistence/entity/LoanEntity.java`
- `desktop/src/main/java/com/cartera/collections/application/TodayCollectionsService.java`
- `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java`
- `desktop/src/main/java/com/cartera/ui/CarteraApplication.java`
- New unit/integration tests on both Mobile (`mobile/src/infrastructure/sync/__tests__/cloud-sync-safety.test.ts` + `mobile/scripts/test-finance.cjs`) and Desktop (`desktop/src/test/java/com/cartera/sync/application/SyncAndKpiParityTest.java`).

**Tests to add or update**:
- Mobile: push failure aborts pull/merge; expired token returns `sessionInvalid` (not `SUSPENDED`); same-office re-auth preserves local Nov 21–23 data and pushes first; paginated pull > 1,000 rows.
- Desktop: exact Nov 20 `off-fbv-001` scenario (migrated cards + orphan `COBRO_HISTORICO` + in-app payments + disbursements + renewal + withdrawals) yields `+COP 96,000` cash, `COP 5,545,000` debt, `COP 5,641,000` admin (0 peso diff vs Mobile); `paperworkRate = 5000` stays `5000` (never `500,000,000`); `MIGRACION` detected from `notes`; `loan_number` preserved on push; `daily_settlements` hydrated from cloud; all 90 baseline Desktop tests remain green.

## Risks & Considerations

- **Zero data loss on user's phone**: Unsynced local data from Nov 21–23 must NEVER be overwritten on re-auth or sync failure; push-first gate + `preserveLocalPortfolio: true` for same-office sessions directly mitigates this.
- **Backward compatibility with existing Desktop tests**: Pure-Desktop tests assert negative cash balances on new loans without prior base (`DesktopFinancialJourneyTest`) and `CashMovementUseCase.availableBalance` (`DesktopParityTest`). Keeping Desktop's ledger semantics intact while specifically bridging `MIGRACION` pre-app collections, orphan `COBRO_HISTORICO`, `route.initial_cash_base`, and cloud renewal paperwork preserves every existing test invariant.
- **SQLite Flyway validation**: `spring.jpa.hibernate.ddl-auto=validate` requires `V5` columns to match JPA entity annotations cleanly on both fresh and existing databases.

## Open Questions

None — all root causes and numeric discrepancies were directly verified against live data and source code.
