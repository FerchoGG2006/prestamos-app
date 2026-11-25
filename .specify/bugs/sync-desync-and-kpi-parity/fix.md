# Bug Fix: Mobile/Web Cloud Sync Freeze & Desktop KPI Parity Mismatch

- **Slug**: sync-desync-and-kpi-parity
- **Fixed**: 2026-11-24
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Fixed the silent cloud sync freeze in Mobile/Web caused by empty/expired RLS session tokens after strict RLS activation, added safe push-first zero-data-loss session recovery and real live sync UI status (`web 1.2.23`), and aligned Desktop's KPI formulas and cloud sync hydration (`v1.1.3`) to match Mobile peso-for-peso without breaking any existing Desktop financial invariants.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `mobile/src/infrastructure/sync/supabase-client.ts` | modified | Explicit `{ ok, error }` return on chunked `pushFullPortfolio` with 409 idempotency fallback; paginated `pullFullPortfolio` (>1,000 rows); `sessionInvalid` distinction in `checkOfficeLicense`; new token-only `reauthenticateCloudSession`. |
| `mobile/src/infrastructure/sync/cloud-sync.ts` | modified | Reactive status subscription (`NEEDS_CLOUD_AUTH`, `SYNCING`, `SUCCESS`, `ERROR`, `OFFLINE_QUEUED`); silent token recovery from remembered credentials for the same office; strict PUSH-before-PULL gate; interactive `reconnectCloudSession`. |
| `mobile/src/infrastructure/storage/local-store.ts` | modified | Monotonic merge protection in `mergeCloudPortfolio` for terminal loan states and installment `paidAmount`. |
| `mobile/src/presentation/views/auth/LoginView.tsx` | modified | Preserve unsynced local portfolio (`preserveLocalPortfolio: true`) when re-authenticating on the same office and trigger immediate push-first sync. |
| `mobile/src/presentation/views/collector/TodayCollectionsView.tsx` | modified | Replaced hardcoded `En línea` pill with live clickable sync status pill, warning banner when `NEEDS_CLOUD_AUTH`, inline Safe Cloud Reconnect Modal, and sync-before-reload web refresh. |
| `mobile/src/presentation/utils/appUpdates.ts` | modified | Bumped `WEB_BUILD_LABEL` to `web 1.2.23 (2026-11-24)`. |
| `mobile/App.tsx` | modified | Trigger cloud sync when app resumes to `active` state. |
| `mobile/src/infrastructure/sync/__tests__/cloud-sync-safety.test.ts` | added test | 6 assertions locking down `NEEDS_CLOUD_AUTH`, `sessionInvalid` non-suspension, push-failure pull abort, silent token recovery order (`reauth -> push -> pull`), cross-office isolation, and monotonic merge. |
| `mobile/scripts/test-finance.cjs` | modified | Registered `cloud-sync-safety.test.ts` in mobile test runner. |
| `desktop/src/main/resources/db/migration/V5__route_initial_base_and_loan_number.sql` | added | Added `route.initial_cash_base` (`NUMERIC NOT NULL DEFAULT 0`) and `loan.loan_number` (`TEXT`). |
| `desktop/src/main/java/com/cartera/infrastructure/persistence/entity/RouteEntity.java` | modified | Mapped `initial_cash_base` with null-safe `BigDecimal.ZERO` default. |
| `desktop/src/main/java/com/cartera/infrastructure/persistence/entity/LoanEntity.java` | modified | Mapped nullable `loan_number` preserving cloud loan numbers. |
| `desktop/src/main/java/com/cartera/collections/application/TodayCollectionsService.java` | modified | Included `route.initialCashBase`, excluded orphan `COBRO_HISTORICO`/`REVERSO_HISTORICO`, and accounted for cloud renewal `paperworkDeducted` without double-counting `PAPELERIA_RENOVACION`. |
| `desktop/src/main/java/com/cartera/settlement/application/CashMovementUseCase.java` | modified | Included `route.initialCashBase` and excluded orphan `COBRO_HISTORICO`/`REVERSO_HISTORICO` in `availableBalance`. |
| `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java` | modified | Added `SyncStatus` tracking; detected `MIGRACION` from `notes`; materialized idempotent local `cm-mig-paper-<loanId>` reconciliation rows (never pushed back to Supabase); fixed `paperworkRate` scaling (`5000` vs `0.05`); preserved `loan_number` and `initial_cash_base`; synced `daily_settlements` bidirectionally; normalized UTC timestamps to `America/Bogota`. |
| `desktop/src/main/java/com/cartera/ui/CarteraApplication.java` | modified | Replaced static `"● Conectado • Listo para Operar"` with live cloud sync badge + clickable `"↻ Sincronizar"` button. |
| `desktop/src/test/java/com/cartera/sync/application/SyncAndKpiParityTest.java` | added test | Verifies exact `off-fbv-001` migrated-card reconciliation (`+96,000` cash, idempotent on resync), `paperworkRate=5000`, `loan_number` preservation, `daily_settlements` sync, cloud renewal paperwork, `route.initial_cash_base`, and UTC->Bogota normalization. |

## Tests Added or Updated

- `mobile/src/infrastructure/sync/__tests__/cloud-sync-safety.test.ts` — Verifies missing/expired RLS tokens never falsely suspend licenses, push failures abort pull/merge, same-office token recovery pushes before pulling, cross-office credentials are rejected, and monotonic merges preserve newer local state.
- `desktop/src/test/java/com/cartera/sync/application/SyncAndKpiParityTest.java` — Verifies exact Mobile↔Desktop KPI parity on migrated cards + orphan historical rows, `paperworkRate=5000` scaling, `loan_number` preservation, `daily_settlements` hydration, renewal paperwork, `route.initial_cash_base`, and Bogota timezone normalization.

## Local Verification

- Mobile typecheck & finance/sync suite: `npm run typecheck && npm run test:finance` → PASS (0 TS errors; all financial suites + 127 renewal matrix scenarios + 6/6 `cloud-sync-safety` assertions passed).
- Mobile Web production bundle export & deploy: `npx expo export --platform web --clear` + `npx eas-cli deploy --prod` → PASS (`https://cartera-movil.expo.app` live with `web 1.2.23 (2026-11-24)`).
- Desktop clean build & full test suite: `.\gradlew.bat clean compileJava test` → PASS (92/92 tests passing, 0 failures).

## Deviations from Assessment

- Instead of computing pre-migration paper installments dynamically inside `TodayCollectionsService` (which double-counted `MobileEngineRoundTripTest`'s desktop-seeded `MIGRACION` loan that also had an explicit `CAPITAL_INJECTION`), pre-migration paper amortizations for cloud-hydrated migrated cards are materialized idempotently in `DesktopCloudSyncService.hydrateOfficeFromCloud()` as local-only `CashMovementEntity("cm-mig-paper-<loanId>", "COBRO_CARTULINA_MIGRADA")` rows (excluded from cloud push). This preserves 100% compatibility with `MobileEngineRoundTripTest` and unifies `TodayCollectionsService`, `CashMovementUseCase.availableBalance`, and `SettlementUseCase` on a single cash ledger.

## Follow-ups

- User updates iPhone web app (`Kredia • web 1.2.23`) and reconnects cloud session once (or automatic silent recovery runs if credentials are remembered) so Nov 21–23 data uploads to Supabase.
- User closes old `dist\release-20261122\SistemaCartera\SistemaCartera.exe` and launches the new `desktop\dist\releases\1.1.3` build (or installs via setup `.exe`).
