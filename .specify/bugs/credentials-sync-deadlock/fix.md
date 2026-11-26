# Bug Fix & Verification Record: `credentials-sync-deadlock`

## Changes Applied
1. `mobile/src/infrastructure/storage/local-store.ts`:
   - `setupOfficeAndRoutes` & `updateAdminCredentials` now preserve existing cloud admin/route/collector IDs or mint office-scoped unique IDs (`rt-<officeTag>-...`, `usr-adm-<officeTag>-...`, `usr-col-<officeTag>-...`), eliminating global PK collisions (`usr-adm-1`, `usr-col-1`, `route-norte`) with `off-fbv-001`.
2. `mobile/src/infrastructure/sync/supabase-client.ts`:
   - `syncUsersAndRoutes` filters out blank-password ghost user records and returns explicit `sessionExpired: true` on `42501` RLS errors.
   - `reauthenticateCloudSession` returns `authenticatedUsername` alongside `authenticatedUserId`.
3. `mobile/src/infrastructure/sync/cloud-sync.ts`:
   - `syncUsersAndRoutesNow()` marks `NEEDS_CLOUD_AUTH` and returns `sessionExpired: true` whenever the cloud token is missing or rejected.
   - `applyTokenOnlyReauth()` automatically heals any legacy hardcoded global IDs (`usr-adm-1`, `usr-col-1`, `route-norte`, etc.) on non-FBV offices (`officeId !== 'off-fbv-001'`) by remapping them to `authenticatedUserId` and office-scoped IDs before `syncBidirectional()` pushes local changes.
4. `mobile/src/presentation/components/OfficeConfigModal.tsx` & `mobile/src/presentation/views/auth/LoginView.tsx`:
   - Enforced strict rollback of local `users` and `routes` on ANY cloud sync failure (`!syncRes.ok`) for cloud-linked offices, preventing ghost local-only usernames (`kr0000`) from diverging from Supabase.
   - Preserved password when updating `@prestamos_remembered_credentials` on username-only changes.
5. `mobile/src/presentation/views/collector/TodayCollectionsView.tsx`:
   - Fixed nearly invisible password placeholder (`placeholderTextColor="#94A3B8"`), added show/hide password eye toggle, added clear guidance to enter the cloud-registered username (`plancha1` if edited offline), and aligned remembered credentials post-reconnect.
6. `mobile/src/infrastructure/sync/__tests__/cloud-sync-safety.test.ts`:
   - Added 8 new regression assertions covering `off-c995615df9` (`Inversiones La Plancha`) ID preservation, `sessionExpired` rollback trigger, and legacy global ID self-healing on reconnect.
