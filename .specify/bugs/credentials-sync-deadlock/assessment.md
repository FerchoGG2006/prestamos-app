# Bug Assessment: Multi-Office Credentials Desync & Reconnect Deadlock (`credentials-sync-deadlock`)

## Symptom
On an Android device linked to office **Inversiones La Plancha** (`off-c995615df9`), the app showed:
- Red status badge: `• Reconectar nube` (`Sincronización con la nube en pausa`)
- Reconnect modal pre-filled with username `kr0000`
- Submitting `kr0000` + password returned: `Credenciales incorrectas o usuario no registrado.`
- Password placeholder text (`Tu contraseña`) was nearly invisible white-on-light-gray.

## Verified Root Causes (Direct Supabase + Code Audit)
1. **Cloud vs Local Username Divergence (`off-c995615df9`)**:
   - In Supabase `public.users`, the ONLY registered user for `Inversiones La Plancha` (`off-c995615df9`) is `usr-adm-a65ad54d` with `username = 'plancha1'` (`updated_at: 2026-11-21 18:42:22+00`). `kr0000` never reached Supabase.
2. **No Rollback on Failed Cloud Sync in `OfficeConfigModal.tsx`**:
   - `handleSaveAdminCredentials`, `handleSaveEditedRoute`, and `handleCreateRouteWithCredentials` only rolled back local state on `usernameConflict` (`23505`). When `syncUsersAndRoutesNow()` failed due to missing/expired `cloudSessionToken` or network failure, the new username (`kr0000`) remained persisted locally while Supabase still held `plancha1`.
3. **Ghost Local-Only Wizard & Global PK Collisions in `LoginView.tsx` + `local-store.ts`**:
   - `LoginView.tsx` (`handleSaveSetup`) called `localStore.setupOfficeAndRoutes(...)` without ever syncing to Supabase.
   - Worse, `localStore.setupOfficeAndRoutes(...)` hardcoded `id: 'usr-adm-1'`, `collectorId: 'usr-col-1'`, and `routeId: 'route-norte'` — global primary keys ALREADY owned by `off-fbv-001` (`Inversiones FBV`) in Supabase! Any subsequent upsert by another office fails with PostgreSQL RLS error `42501`.
4. **Stale `@prestamos_remembered_credentials` on Username-Only Change**:
   - Changing only the admin `username` (keeping password blank) did not update `username` in `@prestamos_remembered_credentials`, breaking silent token recovery on next refresh.
5. **Reconnect Modal UX & Placeholder Contrast (`TodayCollectionsView.tsx`)**:
   - `openCloudReconnectModal` blindly pre-filled the unsynced local username (`kr0000`) without explaining to use the cloud-registered username (`plancha1`), and lacked `placeholderTextColor` + password visibility toggle.

## Remediation Plan
1. `local-store.ts`: Preserve existing office admin/route/collector IDs or mint office-scoped unique IDs in `setupOfficeAndRoutes` (zero hardcoded `usr-adm-1`/`usr-col-1`/`route-norte` collisions).
2. `supabase-client.ts`: Filter out blank-password ghost users in `syncUsersAndRoutes`, detect `sessionExpired` explicitly (`42501`), and return `authenticatedUsername` from `reauthenticateCloudSession`.
3. `cloud-sync.ts`: Return `sessionExpired` from `syncUsersAndRoutesNow()`, and in `reconnectCloudSession` reconcile local admin ID with `authenticatedUserId` before pushing.
4. `OfficeConfigModal.tsx` & `LoginView.tsx`: Enforce strict rollback on ANY cloud sync failure when linked to a cloud office; keep `@prestamos_remembered_credentials` updated when admin username changes.
5. `TodayCollectionsView.tsx`: Add readable `placeholderTextColor="#94A3B8"`, password show/hide eye button, and clear guidance to enter the cloud-registered username if local username was edited offline.
6. Verify with regression assertions in `cloud-sync-safety.test.ts`, `npm run typecheck`, `npm run test:finance`, and live deploy (Web + Android OTA).
