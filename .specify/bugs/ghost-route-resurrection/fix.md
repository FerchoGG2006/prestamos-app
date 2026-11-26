# Bug Fix Record: `ghost-route-resurrection`

## Changes Applied
1. **`mobile/src/infrastructure/storage/local-store.ts`**:
   - Removed legacy startup fabrication loop that created empty-password `usr-col-N` (`ruta2`) users and attached them to unlinked ghost routes on `initialize()`.
   - Added startup cleanup that strips previously fabricated empty-password ghost collectors (`usr-col-N` / `rutaN`) and prunes empty unlinked ghost routes whenever the office has > 1 route locally.
   - Removed automatic fallback injection of `INITIAL_ROUTES` when `this.routes` is empty.
2. **`mobile/src/infrastructure/sync/supabase-client.ts`**:
   - Added lightweight `fetchOfficeRouteIds(officeId)` querying authoritative server route IDs.
3. **`mobile/src/infrastructure/sync/cloud-sync.ts`**:
   - `syncBidirectional()` now queries `fetchOfficeRouteIds(officeId)` before `syncUsersAndRoutes()` and only pushes local routes that already exist on the server or have >= 1 local customer/loan — making it impossible for cached stale routes (`route-norte`, `rt-plancha-001`, or deleted routes) to resurrect.
   - `syncUsersAndRoutesNow()` also filters out empty unlinked ghost routes whose collector has no real password.
4. **`supabase/migrations/20261126020000_prevent_ghost_route_resurrection.sql`**:
   - Installed PostgreSQL `BEFORE INSERT` trigger `trg_prevent_ghost_route_resurrection` on `public.routes` that silently ignores (`RETURN NULL`) any new insert with `collector_id IS NULL` when the office already has another active route — protecting the server even against older un-updated devices!
   - Re-ran guarded cleanup removing `route-norte` (`off-fbv-001`) and `rt-plancha-001` (`off-c995615df9`) with 0 customers and 0 loans.
5. **`mobile/src/presentation/utils/appUpdates.ts` & `cloud-sync-safety.test.ts`**:
   - Bumped `WEB_BUILD_LABEL` to `web 1.2.33 (2026-11-26)`.
   - Added regression test verifying `route-norte` (`RN-01`) with fabricated `usr-col-2` (`password: ''`) is never pushed back to Supabase and is pruned locally.
