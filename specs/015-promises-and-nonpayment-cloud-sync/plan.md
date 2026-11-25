# Implementation Plan: Bidirectional Promises & Non-Payment Cloud Sync

## Shared JSON Contract (`offices.settings`)

### 1. `offices.settings.desktopPromises` (array, max 500)
```json
{
  "id": "prom-...",
  "customerId": "cust-...",
  "loanId": "loan-...",
  "collectorId": "usr-...",
  "amount": 50000,
  "promisedDate": "2026-11-26",
  "status": "PENDIENTE",
  "notes": "Paga en la tarde",
  "createdAt": "2026-11-25T17:30:00",
  "updatedAt": "2026-11-25T17:30:00"
}
```
- **Merge rule**: Union by `id`. If both sides have `id`: terminal status (`CUMPLIDA`, `CANCELADA`, `INCUMPLIDA`) beats `PENDIENTE`; otherwise newer `updatedAt` (fallback `createdAt`) wins.
- Mobile reads both `amount` and `promisedAmount` and maps to `PaymentPromise`.
- Desktop reads `amount` (fallback `promisedAmount`), validates `validCustomerIds`/`validLoanIds`, and writes union-merged list sorted deterministically by `createdAt DESC, id ASC` so `jsonSemanticallyEqual` stays stable on idle sync.

### 2. `offices.settings.nonPaymentVisits` (array, max 500)
```json
{
  "id": "npv-...",
  "customerId": "cust-...",
  "loanId": "loan-...",
  "collectorId": "usr-...",
  "reason": "NO_ESTABA",
  "reasonLabel": "No estaba en el domicilio",
  "notes": "Regresa a las 5pm",
  "date": "2026-11-25",
  "createdAt": "2026-11-25T17:30:00Z"
}
```
- **Merge rule**: Union by `id`; deduplicate same `customerId::date` keeping latest `createdAt` (Mobile view) while preserving distinct audit IDs on Desktop SQLite (`audit_log.entity_type = 'NON_PAYMENT_VISIT'`).
- Desktop pulls into `audit_log` with `entityType = "NON_PAYMENT_VISIT"`, `entityId = loanId`, `action = "VISITA_NO_PAGO"`, `newValue = "Cliente=" + customerId + ";Fecha=" + date`, `reason = reasonLabel (+ " — " + notes)`.
- Desktop pushes local `NON_PAYMENT_VISIT` audit rows union-merged with remote `nonPaymentVisits` by `id` (preserving exact remote `reason`/`reasonLabel`/`notes` when already present remotely, and inferring structured fields for Desktop-originated visits).

## File Changes
1. **Mobile (`mobile/`)**:
   - `src/infrastructure/sync/supabase-client.ts`: extend `upsertOffice(...)` to accept optional `promises` and `nonPaymentVisits`, union-merging with `existingOffice.settings.desktopPromises` and `existingOffice.settings.nonPaymentVisits`.
   - `src/infrastructure/sync/cloud-sync.ts`: pass `localStore.getPromises()` and `localStore.getNonPaymentVisits()` to `upsertOffice(...)`.
   - `src/infrastructure/storage/local-store.ts`:
     - In `mergeCloudPortfolio(...)`: merge `remote.office.settings.desktopPromises` into `this.promises` and `remote.office.settings.nonPaymentVisits` into `this.nonPaymentVisits`, and persist both `STORAGE_KEYS.PROMISES` and `STORAGE_KEYS.NON_PAYMENT_VISITS`.
     - In `recordPromise(...)` and `recordNonPaymentVisit(...)`: ensure full timestamp `updatedAt` and notify subscribers.
   - `src/infrastructure/sync/cloud-sync-safety.test.ts` (or `scripts/test-finance.cjs`): add bidirectional merge regression tests for promises and non-payment visits.
   - `src/presentation/utils/appUpdates.ts`: bump `WEB_BUILD_LABEL` to `'web 1.2.28 (2026-11-25)'`.
2. **Desktop (`desktop/`)**:
   - `src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java`:
     - Upgrade `applyRemoteOfficeSettings(...)` to hydrate `nonPaymentVisits` into `auditLogRepository` (`NON_PAYMENT_VISIT`) and preserve `INCUMPLIDA` status on promises.
     - Upgrade `buildMergedOfficeSettings(...)` to union-merge `desktopPromises` and `nonPaymentVisits` cleanly without wiping remote records and preserving deterministic ordering for idle-sync equality.
   - `src/main/java/com/cartera/collections/application/TodayCollectionsService.java` & `TodayCollectionsView.java` + `CarteraApplication.java`:
     - Expose `hasNonPaymentToday` indicator on route items (or lookup from `auditLogRepository`), inject `FollowUpService` into `TodayCollectionsView`, add 1-click `"No pagó"` button on unpaid rows with the 5 Mobile reasons + optional note, and show `NO PAGÓ HOY` badge when visited without payment today.
   - `src/main/java/com/cartera/infrastructure/version/AppVersion.java`: bump `CURRENT = "1.2.3"` (`SHELL_VERSION = "1.2.0"`).
   - `src/test/java/com/cartera/parity/DesktopFullMobileParityTest.java`: add tests verifying bidirectional sync of `desktopPromises` and `nonPaymentVisits` + idle-sync no-op invariant.
