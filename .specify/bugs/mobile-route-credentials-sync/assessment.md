# Bug Assessment: `mobile-route-credentials-sync`

- **Date**: 2026-11-25
- **Reporter**: User (Production — Web/Mobile `OfficeConfigModal` → *Rutas Activas*)
- **Status**: Assessed

## Symptom
In *Panel Operativo de la Oficina → Rutas → Rutas Activas*, editing the active route (changing route name, collector username, and password) and pressing **Guardar Cambios**:
1. Gives no visible confirmation or validation feedback on Web (`Alert.alert` is a no-op on React Native Web).
2. Route name appears updated, yet logging out and attempting to sign in with the newly saved collector username and password fails with `"Credenciales incorrectas o usuario no registrado"`.

## Root Causes Verified in Code
1. **Silent Web alerts (`OfficeConfigModal.tsx:302-326`)**: `handleSaveEditedRoute`, `handleSaveAdminCredentials`, and `handleCreateRouteWithCredentials` call only `Alert.alert(...)` instead of a cross-platform Web+Native alert/banner, hiding both validation errors and save confirmations on Web/iOS PWA.
2. **No immediate cloud sync on credential save (`OfficeConfigModal.tsx:273-442`, `App.tsx:2250`)**: Saving route/collector or admin credentials only writes to local storage and calls `syncFromStore()`. Logging out immediately (before the 60s periodic sync) or signing in from another device hits Supabase RPC `authenticate_kredia_user`, which still holds the old user record.
3. **Silent `users` upsert failures in `supabaseSyncService.syncUsersAndRoutes()` (`supabase-client.ts`)**:
   - Ignores `{ error }` from `from('users').upsert(payloadUsers)` and returns `true` unconditionally.
   - Sends unnormalized `role` values (`'COLLECTOR'` violates Postgres `CHECK (role IN ('ADMIN','COBRADOR','SUPERVISOR','SUPER_ADMIN'))`), aborting the entire batch upsert of `users` while `routes.upsert` still succeeds with the new route name.
   - Any conflict on `uq_users_global_username` (`LOWER(TRIM(username))`) fails silently; the subsequent `pullFullPortfolio()` + `mergeCloudPortfolio()` overwrites local `this.users` with stale remote users while keeping the updated route name.
   - `cloudSyncEngine.syncBidirectional()` does not abort pull/merge when `syncUsersAndRoutes()` fails.
4. **Password hash corruption & validation mismatch**:
   - `OfficeConfigModal.tsx:296` preloads the edit password input with `collector.password` (a cryptographic hash).
   - `security.ts:110-116` (`hashPassword`) skips `sha256$...` hashes but re-hashes Desktop PBKDF2 `<32hex>$<64hex>` hashes, corrupting Desktop-originated credentials on edit.
   - `local-store.ts` only blocks `'123'` and `'123456'`, whereas `LoginView.tsx:63-74` blocks 10 weak passwords (`123`, `1234`, `12345`, `123456`, `000`, `0000`, `000000`, `admin`, `password`, `cobrador`), accepting credentials at save time that `LoginView` immediately rejects.

## Remediation Plan
1. **`security.ts`**: Add `isHashedPassword()` recognizing both `sha256$<salt>$<hash>` and PBKDF2 `<32hex>$<64hex>` so `hashPassword()` is strictly idempotent; export shared `FORBIDDEN_DEFAULT_PASSWORDS` / `validateSecurePassword()` used by both `local-store.ts` and `LoginView.tsx`.
2. **`local-store.ts`**:
   - Normalize user roles to Postgres-compatible values (`COLLECTOR` → `COBRADOR`).
   - In `updateRouteWithCredentials` and `updateAdminCredentials`: allow blank password when editing an existing user that already has a valid stored password hash (preserving existing hash untouched), require valid non-forbidden >=6 char password for new users or when changing password.
   - Support rollback snapshot or clean error reporting if immediate cloud sync rejects the username (e.g. already taken globally in Supabase).
3. **`supabase-client.ts` & `cloud-sync.ts`**:
   - Normalize `role` (`COLLECTOR` → `COBRADOR`) in `syncUsersAndRoutes`.
   - Check `{ error }` on both `users` and `routes` upserts and return `{ ok: boolean; error?: string }` with clear Spanish error messages for `uq_users_global_username` / `23505` conflicts.
   - In `cloudSyncEngine.syncBidirectional()`: check `syncUsersAndRoutes` result; if it fails, abort `pullFullPortfolio`/`mergeCloudPortfolio` so stale cloud users never overwrite unsynced local changes!
4. **`OfficeConfigModal.tsx`**:
   - Keep edit password fields blank by default with clear placeholder (`"Dejar vacío para mantener clave actual"` for existing users, `"Mínimo 6 caracteres"` for new users).
   - After local save in `handleSaveEditedRoute`, `handleSaveAdminCredentials`, and `handleCreateRouteWithCredentials`, immediately push `syncUsersAndRoutes` to Supabase (when linked/connected) with loading state, revert or warn clearly if Supabase rejects (e.g. username already taken in another office), and display visible Web + Native feedback banner/alert.
   - Never expose raw cryptographic hashes when toggling eye icon in route card (show `"Clave protegida (encriptada)"` if stored value is a hash).
5. **Tests**: Add comprehensive regression tests in `cloud-sync-safety.test.ts` covering every single case above.
