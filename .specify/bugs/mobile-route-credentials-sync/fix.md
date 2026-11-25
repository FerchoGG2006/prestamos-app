# Bug Fix Record: `mobile-route-credentials-sync`

- **Date**: 2026-11-25
- **Files Modified**:
  1. `mobile/src/core/utils/security.ts`:
     - Exported `FORBIDDEN_DEFAULT_PASSWORDS`, `isHashedPassword()` (supporting both `sha256$<salt>$<hash>` and Desktop PBKDF2 `<32hex>$<64hex>`), and `validateSecurePassword()`.
     - Made `hashPassword()` idempotent for both Mobile SHA-256 and Desktop PBKDF2 hashes.
  2. `mobile/src/infrastructure/storage/local-store.ts`:
     - Updated `updateAdminCredentials()` and `updateRouteWithCredentials()` to share `validateSecurePassword()`, keep existing password hash untouched when password input is left blank on edit, normalize `'COLLECTOR'` → `'COBRADOR'`, reuse existing collector assigned to the route when `route.collectorId` is empty, and return `{ route, collector }`.
  3. `mobile/src/infrastructure/sync/supabase-client.ts`:
     - Updated `syncUsersAndRoutes()` to normalize roles (`COLLECTOR` → `COBRADOR`), inspect `{ error }` on both `users` and `routes` upserts, and return explicit `{ ok, error, usernameConflict, networkError }` diagnostics (catching Postgres `23505` / `uq_users_global_username` / RLS errors instead of swallowing them).
  4. `mobile/src/infrastructure/sync/cloud-sync.ts`:
     - Added `syncUsersAndRoutesNow()` for immediate cloud persistence right after editing/creating credentials.
     - Hardened `syncBidirectional()` so a failure in `syncUsersAndRoutes()` aborts `pullFullPortfolio()`/`mergeCloudPortfolio()`, preventing stale remote users from overwriting local credential edits.
  5. `mobile/src/presentation/views/auth/LoginView.tsx`:
     - Unified `FORBIDDEN_DEFAULT_PASSWORDS` import from `security.ts`.
  6. `mobile/src/presentation/components/OfficeConfigModal.tsx`:
     - Added cross-platform `notifyUser()` (Web `window.alert` + Native `Alert.alert`) plus inline visible `routeFeedback` banner and `isSavingRouteCreds` loading state.
     - Stopped preloading cryptographic password hashes into edit inputs (`adminPassEdit` and `editPassword` default to `''` with `"Vacío = conservar clave"`).
     - Fixed `handleCreateRouteWithCredentials()` to hash collector passwords (`hashPassword`) instead of saving plaintext.
     - Triggered `cloudSyncEngine.syncUsersAndRoutesNow()` immediately on route edit, route creation, and admin credential update, rolling back local changes and showing clear feedback if Supabase rejects a duplicate global username.
     - Prevented leaking raw cryptographic hashes via the route card eye toggle.
  7. `mobile/src/presentation/utils/appUpdates.ts`:
     - Bumped `WEB_BUILD_LABEL` to `web 1.2.29 (2026-11-25)`.
  8. `mobile/src/infrastructure/sync/__tests__/cloud-sync-safety.test.ts`:
     - Added 8 new regression assertions covering PBKDF2 preservation, role normalization, forbidden password parity, immediate cloud push, and pull-abort on user sync errors.
