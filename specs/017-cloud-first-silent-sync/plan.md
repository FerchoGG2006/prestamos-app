# Implementation Plan: 017-cloud-first-silent-sync

## Architecture Decisions

1. **PostgreSQL Session Refresh Without Breaking RLS Read-Only Stability**
   - `private.current_office_id()` remains `STABLE` and read-only (no `UPDATE` inside RLS predicate).
   - `public.authenticate_kredia_user` sets `expires_at = NOW() + interval '365 days'`.
   - `public.refresh_kredia_session()` (`SECURITY DEFINER`, `SET search_path = ''`) reads `x-kredia-session`, verifies active office license, extends `expires_at = NOW() + interval '365 days'`, and returns `{ ok, office_id, expires_at }`.
   - Clients call `refresh_kredia_session()` silently on startup and foreground resume (throttled to avoid redundant RPC calls).

2. **Real-Time Silent Write-Through Without Sync Feedback Loops (Mobile)**
   - `LocalStore` tracks `notify(source: 'LOCAL_MUTATION' | 'CLOUD_MERGE' | 'METADATA' = 'LOCAL_MUTATION')` (backward-compatible listener signature + separate `subscribeLocalMutations(listener)` hook).
   - `mergeCloudPortfolio`, `applyLinkedOfficeBundle`, `initialize`, and `updateOfficeConfig({ lastSyncedAt })` emit `'CLOUD_MERGE'` / `'METADATA'` so `CloudSyncEngine` ONLY schedules the 800 ms debounced write-through push on genuine `'LOCAL_MUTATION'` events.
   - If a push is already in flight when another local mutation happens, `pendingRealtimeSync = true` triggers one follow-up pass once the current pass finishes.

3. **Authoritative Server Routes & Safe Ghost Pruning**
   - New RPC `public.delete_empty_route(p_route_id TEXT)` validates `private.current_office_id()`, ensures the office retains >= 1 route, verifies 0 `customers` and 0 `loans` reference `p_route_id`, and deletes the route cleanly.
   - Mobile `mergeCloudPortfolio`: when `remote.routes.length > 0`, local routes not in `remote.routes` are pruned; if any local customer/loan/session references a pruned route, it is transparently reassigned to `remote.routes[0].id` (zero data loss).
   - Desktop `hydrateOfficeFromCloud`: when `!remoteRoutes.isEmpty()`, local `RouteEntity` rows not in `validRouteIds` are deleted ONLY IF 0 local `customers`, 0 local `loans`, 0 `collection_sessions`, and 0 `cash_movements` reference them.

4. **Zero Cloud/Reconnect UI Across Mobile & Desktop**
   - Mobile `TodayCollectionsView.tsx` removes the cloud status chip, both amber `"Sincronización con la nube en pausa"` banners, and `renderCloudReconnectModal`.
   - Mobile `OfficeConfigModal.tsx`, `supabase-client.ts`, and `cloud-sync.ts` reword any user-facing fallback error messages to plain, non-technical banking copy (no `"Reconectar nube"` or `"nube en pausa"`).
   - Desktop `CarteraApplication.java` removes `lblCloudSyncStatus` and replaces `"↻ Sincronizar"` with `"↻ Actualizar"`, keeping silent background sync every 15s.

## Deployment Targets (Zero Reinstall)
- **Supabase**: Apply `supabase/migrations/20261126010000_sliding_365d_sessions_and_clean_routes.sql` via live SQL Editor and verify Inversiones La Plancha counts.
- **Mobile Web**: Bump `WEB_BUILD_LABEL` to `web 1.2.32 (2026-11-26)`, deploy to `https://cartera-movil.expo.app`.
- **Android OTA**: Publish to `preview` channel (`runtimeVersion: 1.2.2`, `--max-workers 1 --no-bytecode`).
- **Desktop OTA**: Bump `AppVersion` to `1.2.5`, build `kredia-app-1.2.5.jar` + `latest.json`, upload to Supabase Storage `desktop-updates`.
