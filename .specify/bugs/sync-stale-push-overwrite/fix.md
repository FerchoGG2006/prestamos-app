# Bug Fix Record: `sync-stale-push-overwrite`

- **Slug**: `sync-stale-push-overwrite`
- **Date**: `2026-11-24`
- **Status**: Fixed

## Changes Applied

1. **Read-Only Idle Background Sync & Selective Dirty Push** — `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java`:
   - Added `lastSyncedDigest` (`AtomicReference<String>`) initialized after `authenticateAndSync` hydration and refreshed after every `syncSilentlyInBackground` cycle.
   - Expanded `computeLocalChangeDigest()` to hash routes (`initialCashBase`), customers, loans, installments, payments, renewals, cash movements (excluding local-only `cm-mig-paper-*`), and daily settlements.
   - Expanded `RemotePullContext` with remote IDs and normalized fingerprints for `loans` and `installments` (plus remote loan `notes`).
   - Updated `syncSilentlyInBackground()` so when Desktop has zero local changes since last sync AND zero local records absent/divergent from remote, `pushLocalChangesToCloud` is **skipped completely** (strictly read-only `PULL`).
   - Updated `pushLocalChangesToCloud()` so `loans` and `installments` only upsert rows that are new or genuinely modified locally (preserving `loan_number`, `fixed_due_date` for `FIXED_DATE` loans, and `notes` for migrated cards).
2. **Relational `RENEWED` Invariant on Both Platforms**:
   - `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java` (`hydrateOfficeFromCloud`): collects `renewals.previous_loan_id` across remote + local renewals and forces every referenced loan to `RENOVADO` with all installments marked `PAGADA` (`paidAmount = amount`).
   - `mobile/src/infrastructure/storage/local-store.ts` (`mergeCloudPortfolio`): collects `this.renewals[].previousLoanId` and forces every referenced loan to `status: 'RENEWED'` with all installments marked `PAGADA` (`paidAmount = expectedAmount, pendingAmount = 0`).
3. **Clean Desktop Release Version `1.1.4`**:
   - Updated `desktop/build.gradle` (`--app-version '1.1.4'`, `SistemaCartera-v1.1.4-Windows-x64.zip`, default `dist/releases/1.1.4`) and `desktop/packaging/windows/installer.iss` (`MyAppVersion "1.1.4"`, `Instalador-SistemaCartera-v1.1.4`, `VersionInfoVersion=1.1.4.0`).
4. **Live Environment Cleanup**:
   - Stopped the legacy Nov 21 `C:\Program Files\SistemaCartera\SistemaCartera.exe` process; verified live Supabase (`off-fbv-001`) self-healed to `0` loan/installment anomalies via iPhone sync (`cashAvailableInHand = +533,000`).
