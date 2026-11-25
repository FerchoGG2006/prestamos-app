# Bug Assessment: `sync-stale-push-overwrite`

- **Slug**: `sync-stale-push-overwrite`
- **Date**: `2026-11-24`
- **Severity**: High (Cross-device state regression on Supabase cloud sync)
- **Office Affected**: `off-fbv-001` (`Inversiones FBV`)

## 1. Symptom

After the mobile app (`web 1.2.23`) synced all Nov 21–24 operations cleanly to Supabase, an older Desktop installation (`C:\Program Files\SistemaCartera`, JAR from Nov 21) left running in the background continued polling every 30 seconds and executing unconditional `pushLocalChangesToCloud` upserts over `loans` and `installments`. That reverted 3 loans in Supabase (`#00103` reverted from `RENEWED` to `ACTIVE`; two other loans reverted to older `paid_amount` values).

Even after upgrading to `v1.1.3`, `DesktopCloudSyncService.syncSilentlyInBackground()` still invoked `pushLocalChangesToCloud(...)` on every 30-second cycle even when Desktop had **zero** local modifications, creating an unnecessary write race window against active mobile collectors. Additionally, neither Desktop nor Mobile enforced the relational invariant that any loan referenced by `renewals.previous_loan_id` must always remain in terminal `RENOVADO`/`RENEWED` state with zero pending installments. Finally, `desktop/build.gradle` and `desktop/packaging/windows/installer.iss` still carried version `1.1.1`, making upgrades ambiguous in Windows Programs & Features.

## 2. Root Causes

1. **Unconditional background push while idle** (`DesktopCloudSyncService.syncSilentlyInBackground()`): runs `PULL` followed unconditionally by `PUSH` of all local rows every 30s, even when Desktop made no local changes since the previous sync.
2. **Row-wide loan/installment upsert during push** (`DesktopCloudSyncService.pushLocalChangesToCloud()`): pushes every local `loan` and `installment` row even when identical to what was just pulled from Supabase, widening race windows with concurrent Mobile writes.
3. **Missing `renewals.previous_loan_id` terminal invariant**: both `DesktopCloudSyncService.hydrateOfficeFromCloud()` and `localStore.mergeCloudPortfolio()` only checked `loan.status`, not whether `renewals` already closed `previous_loan_id`.
4. **Stale installer version metadata**: `desktop/build.gradle` and `desktop/packaging/windows/installer.iss` hardcoded `1.1.1`.

## 3. Remediation Plan

1. **Read-only background sync when idle** in `DesktopCloudSyncService`:
   - Track `lastSyncedDigest` (`AtomicReference<String>`) updated after `authenticateAndSync` hydration and after every `syncSilentlyInBackground` cycle.
   - Capture remote IDs and loan/installment state fingerprints in `RemotePullContext`.
   - In `syncSilentlyInBackground()`, only invoke `pushLocalChangesToCloud` when Desktop actually modified local data (`beforeDigest != lastSyncedDigest`) OR holds local-only records absent from the remote pull. When idle, background sync is strictly read-only `PULL`.
   - When `pushLocalChangesToCloud` does run, only upsert `loans` and `installments` that are new or actually differ from the remote state just pulled (preserving `loan_number`, `fixed_due_date`, and `notes` on migrated loans).
2. **Relational `RENEWED` invariant** on both platforms:
   - In `DesktopCloudSyncService.hydrateOfficeFromCloud()` and `localStore.mergeCloudPortfolio()`, collect all `previous_loan_id` from merged renewals and force each referenced loan to `RENOVADO`/`RENEWED` with all its installments marked paid (`pending = 0`).
3. **Clean Desktop `v1.1.4` versioning**:
   - Bump `desktop/build.gradle` (`--app-version '1.1.4'`, `SistemaCartera-v1.1.4-Windows-x64.zip`, default `dist/releases/1.1.4`) and `desktop/packaging/windows/installer.iss` (`MyAppVersion "1.1.4"`, `Instalador-SistemaCartera-v1.1.4`, `VersionInfoVersion=1.1.4.0`).

## 4. Verification Criteria

- Live Supabase (`off-fbv-001`) has `0` loan/installment anomalies after stopping the legacy Nov 21 process (confirmed: iPhone self-healed all 3 loans automatically; `cashAvailableInHand = +533,000`).
- Automated Desktop test proves idle `syncSilentlyInBackground()` performs `0` writes to Supabase, while a local edit triggers selective push preserving `loan_number`, `initial_cash_base`, and excluding `cm-mig-paper-*`.
- Automated Desktop & Mobile tests prove a loan referenced by `renewals.previous_loan_id` is forced to `RENOVADO`/`RENEWED` with paid installments even if a stale remote row reports `ACTIVE`.
