# Bug Fix: Clean Office Switch Isolation & Missing Default Route for Newly Registered Offices

- **Slug**: office-switch-and-default-route
- **Fixed**: 2026-11-21T15:56:00-05:00
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Provisioned default `Ruta 1` (`R-01`) in Supabase for `Inversiones JA` (`off-6eba7dafe4`) and `Inversiones La Plancha` (`off-c995615df9`), updated Desktop `OfficeLicensingService.registerCommercialOffice()` to auto-create `Ruta 1` for all newly sold offices, fixed `localStore.applyLinkedOfficeBundle()` to isolate office config/routes/promises/visits/session completely when switching offices, and added cloud credential fallback in `LoginView.tsx` if local password verification fails.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `mobile/src/infrastructure/storage/local-store.ts` | modified | `applyLinkedOfficeBundle()` resets `officeConfig` from `DEFAULT_OFFICE_CONFIG`, replaces `routes` unconditionally, clears `promises`/`nonPaymentVisits`/`activeSession`, and persists all cleared keys when switching offices. |
| `mobile/src/presentation/views/auth/LoginView.tsx` | modified | Falls back to `handleCloudCredentialLogin()` when local password verification fails and cloud client is connected. |
| `mobile/src/presentation/utils/appUpdates.ts` | modified | Updated `WEB_BUILD_LABEL` to `web 1.2.19 (2026-11-21)`. |
| `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java` | modified | `registerCommercialOffice()` now auto-creates default `Ruta 1` (`R-01`) via `registryClient.upsertRoute(...)`. |
| `desktop/src/test/java/com/cartera/infrastructure/licensing/OfficeLicensingServiceTest.java` | modified | Added verification that `registerCommercialOffice()` provisions `Ruta 1` (`R-01`). |
| `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java` | modified | Added `upsertRoute` override on test stub for real SQLite FK test. |

## Local Verification

- Live Supabase `vendor_upsert_route` → `HTTP 204` for `off-6eba7dafe4` (`rt-ja-001`) and `off-c995615df9` (`rt-plancha-001`).
- `mobile`: `npm run test:finance` PASS (8 unit tests + 127 renewal matrix scenarios + backup regression).
- Pending completion of web export/deploy (`task-1115`) and Gradle `compileJava test` (`task-1116`), recorded in `test.md`.

## Deviations from Assessment

None.
