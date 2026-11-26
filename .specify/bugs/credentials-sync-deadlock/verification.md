# Bug Verification Report: `credentials-sync-deadlock`

- **Verdict**: `verified`
- **Date**: 2026-11-26

## Verification Checks
1. `npm run typecheck`: **PASS** (0 errors).
2. `npm run test:finance`: **PASS** (100% across all suites, including `cloud-sync-safety.test.ts` **26/26 assertions**):
   - Multi-office `setupOfficeAndRoutes` on `off-c995615df9` (`Inversiones La Plancha`) preserves `usr-adm-a65ad54d` and `rt-plancha-001` and never emits `usr-adm-1` / `usr-col-1` / `route-norte`.
   - `syncUsersAndRoutesNow()` reports `sessionExpired: true` when `cloudSessionToken` is absent, guaranteeing strict rollback in `OfficeConfigModal` and `LoginView`.
   - `reconnectCloudSession()` automatically heals colliding legacy global IDs (`usr-adm-1` -> `usr-adm-a65ad54d`, remapping `usr-col-1` and `route-norte`) before pushing to Supabase.
   - `syncUsersAndRoutes()` ignores empty-password ghost rows.
3. Live deployment: Mobile Web (`web 1.2.31`) + Android OTA (`preview` channel, `runtimeVersion: 1.2.2`).
