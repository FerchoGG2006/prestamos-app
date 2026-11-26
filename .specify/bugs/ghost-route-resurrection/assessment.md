# Bug Assessment: Ghost Route Resurrection (`Ruta Norte` / `RN-01`)

**Slug**: `ghost-route-resurrection`  
**Reported**: 2026-11-26  
**Symptom**: After upgrading to `web 1.2.32` and deleting `route-norte` in Supabase (`off-fbv-001`), the user's iPhone (`Inversiones FBV`) still shows 2 routes in `Seleccionar Ruta Operativa`: `Galeria (R-01)` (27 customers) and `Ruta Norte (RN-01)` (`Cobrador no asignado`, 0 customers, 0 loans).

## Root Cause (Verified in Code)

1. **Phantom Collector Fabrication on Startup (`mobile/src/infrastructure/storage/local-store.ts:415-445`)**:
   - On every `localStore.initialize()`, any cached route in `@prestamos_mobile_routes_v1` with an empty `collectorId` (like legacy `route-norte` cached before Migration 017) triggered a legacy "healing" loop that fabricated a fake collector `usr-col-2` (`username: 'ruta2'`, `password: ''`) and assigned `rt.collectorId = 'usr-col-2'`.
2. **Ghost Route Resurrection on Sync (`mobile/src/infrastructure/sync/cloud-sync.ts:555-566` + `supabase-client.ts:445-457`)**:
   - Because `initialize()` had just stamped `collectorId = 'usr-col-2'` onto `route-norte`, `cloudSyncEngine.syncBidirectional()` saw `Boolean(r.collectorId.trim()) === true` and included `route-norte` in `routesToPush`.
   - Inside `supabaseSyncService.syncUsersAndRoutes()`, `usr-col-2` was filtered out of `validUsers` (because `password === ''`), so `route-norte` was upserted back into Supabase with `collector_id: null`!
   - Immediately afterward, `pullFullPortfolio()` pulled the just-resurrected `route-norte` (`collector_id: null`) back down, rendering `"Cobrador no asignado"`.
3. **Secondary Seeding Hazard (`mobile/src/infrastructure/storage/local-store.ts:508-510`)**:
   - `if (!this.routes || this.routes.length === 0) this.routes = [...INITIAL_ROUTES];` auto-created a synthetic `route-1` even on clean/empty startups before cloud hydration.
4. **Preventing Any Device from Resurrecting Deleted Empty Routes**:
   - `syncBidirectional()` should NEVER upsert an empty route (0 local customers & 0 local loans) that does NOT already exist on the server (since deliberate route creation/editing in `OfficeConfigModal` and `LoginView` already pushes immediately via `syncUsersAndRoutesNow()`).
   - Additionally, `supabase-client.ts` `fetchRemoteRouteIds(officeId)` (a tiny `SELECT id FROM routes WHERE office_id = ...`) lets `syncBidirectional()` know the authoritative server route IDs BEFORE calling `syncUsersAndRoutes()`, guaranteeing that no stale phone can EVER resurrect a route deleted on Supabase or another device!

## Remediation Plan

1. **Remove phantom collector fabrication** (`local-store.ts:412-450`):
   - Never fabricate `usr-col-N` users with empty passwords on unlinked routes.
   - Purge any previously fabricated empty-password ghost users (`password === ''` and `username` matching `/^ruta\d+$/`) and purge empty unlinked legacy `route-norte` when another route already exists locally.
   - Do not auto-seed `INITIAL_ROUTES` when the office is already linked (`Boolean(this.officeConfig.officeId?.trim())`) or uninitialized before login.
2. **Check server routes before pushing routes in `syncBidirectional()` (`supabase-client.ts` + `cloud-sync.ts`)**:
   - Add lightweight `fetchOfficeRouteIds(officeId)` in `supabase-client.ts`.
   - In `cloud-sync.ts` `syncBidirectional()`, only push routes that:
     - Exist in `remoteRouteIds` (when the server already has routes), **OR**
     - Have >= 1 local customer or local loan (`usedRouteIds.has(r.id)`), **OR**
     - Server currently has 0 routes (`remoteRouteIds.size === 0`).
   - Also validate collector has a real non-empty password in `validUserIds`.
3. **Mirror protection on Desktop (`DesktopCloudSyncService.java`)**:
   - Never push local empty routes absent from `remoteRouteIds` unless the route was explicitly created locally (`sync.routes_local_dirty` flag set by `ConfigurationView.openNewRouteDialog`) or has customers/loans.
4. **Clean `route-norte` in Supabase for `off-fbv-001`**, verify zero resurrection, add regression test for `initialize()` + `syncBidirectional()` with cached `route-norte` (`RN-01`), and deploy `web 1.2.33` + Android OTA + Desktop `v1.2.6` (if Desktop changes).
