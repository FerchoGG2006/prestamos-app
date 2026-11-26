# Feature Specification: Bank-Grade Silent Sync, Zero Cloud UI & Single-Source Routes

**Feature Branch**: `017-cloud-first-silent-sync`  
**Created**: 2026-11-26  
**Status**: Approved by User (`1. Si`, `2. si`)  
**Scope**: Supabase (PostgreSQL/RLS), Mobile/Web (`mobile/`), Desktop JavaFX (`desktop/`).

---

## Problem Statement

1. **Noisy Technical Cloud UI**: Users (administrators and collectors) see red/amber `"Reconectar nube"` pills, `"Sincronización con la nube en pausa"` banners, and technical `"Reconectar Sincronización en la Nube"` modals — creating friction and confusion unlike modern fintech/banking apps (Nequi, Bancolombia, Nu).
2. **Short Session TTL & Stale Push Timing**: `authenticate_kredia_user` issues 30-day tokens without sliding refresh, and mobile sync runs on a 60-second polling interval instead of immediate write-through push on every mutation.
3. **Duplicate / Ghost Routes**: Offices repeatedly show two routes (e.g., Inversiones La Plancha displays empty initial `Ruta 1` (`rt-plancha-001`) alongside active `La plancha 1`; Inversiones FBV carries empty `route-norte` alongside `Galeria`) because:
   - Legacy hardcoded `'route-norte'` fallbacks exist across Mobile and Desktop.
   - `mergeCloudPortfolio` unions local routes with server routes instead of pruning empty ghost routes absent from Supabase.
   - `deleteRoute()` only removes routes locally without deleting them in Supabase, allowing them to resurrect.

---

## Non-Negotiable Safety & Zero-Data-Loss Invariants

- **Live Tenant Protection (`off-c995615df9` — Inversiones La Plancha)**: The admin (`kr0000`) is actively onboarding customers right now.
  - Active tokens in `private.office_sessions` MUST NOT be revoked; instead, all valid non-revoked sessions are extended in place to 365 days.
  - ZERO `customers`, `loans`, `installments`, `payments`, `renewals`, or `cash_movements` may be deleted or wiped.
  - OTA updates MUST NOT reset local storage (`AsyncStorage` / `localStorage` / SQLite).
- **Safe Route Cleanup Guard**: Any route deletion (in migration SQL, `delete_empty_route` RPC, Mobile merge, or Desktop hydration) MUST verify **0 referencing customers and 0 referencing loans** (and if any local customer/loan ever points to a removed ghost route during client merge, transparently reassign it to the first valid server route instead of deleting it).
- **Native Desktop Rule**: Desktop UI remains 100% pure JavaFX 21 + `BigDecimal` financial precision.

---

## Functional Requirements

### FR-1: 365-Day Sliding Banking Sessions (Supabase + Mobile + Desktop)
- `public.authenticate_kredia_user` issues sessions with `expires_at = NOW() + interval '365 days'`.
- Existing active non-revoked rows in `private.office_sessions` are extended to `GREATEST(expires_at, NOW() + interval '365 days')`.
- New `SECURITY DEFINER` RPC `public.refresh_kredia_session()` extends the caller's active `x-kredia-session` token by 365 days without mutating `private.current_office_id()` (keeping RLS planner function `STABLE` and read-only).
- Mobile and Desktop invoke `refresh_kredia_session()` silently on app boot and foreground resume.

### FR-2: Zero Technical Cloud UI (Mobile + Desktop)
- **Mobile (`TodayCollectionsView.tsx`)**:
  - Remove the top cloud status pill (`Reconectar nube` / `Nube HH:mm` / `Sincronizando...` / `Pendiente subir`).
  - Remove the amber `"Sincronización con la nube en pausa"` banner from both Admin and Collector dashboards.
  - Remove the `"Reconectar Sincronización en la Nube"` modal.
  - Keep pull-to-refresh silently executing `cloudSyncEngine.syncBidirectional()` without cloud alerts or reconnect popups; simplify Web update bar label to `"↻ Actualizar"`.
- **Desktop (`CarteraApplication.java`)**:
  - Remove `lblCloudSyncStatus` (`● Conectando nube...` / `⚠ Nube sin sincronizar`) and its `"Reconectar Sesión en la Nube"` popup from the top bar.
  - Replace `"↻ Sincronizar"` with a clean banking-style `"↻ Actualizar"` button with non-technical feedback (`"Información actualizada."`).

### FR-3: Silent Real-Time Write-Through Sync + Invisible Offline Queue
- **Mobile (`cloud-sync.ts`, `local-store.ts`)**:
  - Every local mutation (`createCustomer`, `createLoan`, `recordPayment`, `renewLoan`, `updateCustomer`, etc.) triggers a debounced (~800 ms) silent background sync automatically.
  - Cloud pulls (`mergeCloudPortfolio` / `lastSyncedAt` metadata updates) MUST NOT trigger feedback-loop pushes.
  - When offline, mutations persist immediately to local storage and queue silently in the invisible outbox, flushing automatically on `online` / foreground / periodic check with zero user-facing popups.
- **Desktop (`DesktopCloudSyncService.java`, `CarteraApplication.java`)**:
  - Background sync runs silently every 15 seconds (down from 30s) and extends the 365-day sliding session silently.

### FR-4: Single-Source-of-Truth Routes & Safe Ghost Route Cleanup
- New `SECURITY DEFINER` RPC `public.delete_empty_route(p_route_id TEXT)` scoped to `private.current_office_id()`, deleting a route only when the office keeps >= 1 other route and 0 customers/loans reference it (with optional safe orphan cleanup on `collector_id` if unused).
- Safe SQL cleanup in migration:
  - Delete `rt-plancha-001` (`Ruta 1`, `collector_id IS NULL`) in `off-c995615df9` ONLY IF 0 customers/loans/payments/cash/settlements reference it.
  - Delete `route-norte` (`collector_id IS NULL`) in `off-fbv-001` ONLY IF 0 customers/loans/payments/cash/settlements reference it.
- **Mobile**:
  - Remove hardcoded `'route-norte'` / `'Ruta Norte'` fallbacks across `local-store.ts`, `cloud-sync.ts`, `App.tsx`, `NewLoanModal.tsx`, `EditCustomerModal.tsx`, `RouteSelectorModal.tsx`, `CollectorCuadreModal.tsx`, and `SettlementModal.tsx`, resolving dynamically from `routes[0]?.id || ''`.
  - In `localStore.mergeCloudPortfolio`: when `remote.routes.length > 0`, prune local routes absent from `remote.routes` (safely reassigning any local customer/loan referencing a pruned route to `remote.routes[0].id` so zero data is ever lost).
  - In `OfficeConfigModal.tsx`: `handleDeleteRouteItem` invokes `cloudSyncEngine.deleteRouteInCloud(route.id)` so deleted routes stay deleted in Supabase.
- **Desktop**:
  - In `DesktopCloudSyncService.hydrateOfficeFromCloud`: when `remoteRoutes` is non-empty, prune local routes absent from `remoteRoutes` ONLY IF 0 local customers and 0 local loans reference them (and in `hasLocalDivergenceToPush` / `pushLocalChangesToCloud`, never resurrect an unlinked empty `route-norte` when the office already has server routes).
  - In `OfficeLicensingService.registerCollectorForOffice`: when adding the first collector to an office that still has the auto-seeded empty `Ruta 1` (`collector_id IS NULL`, 0 customers), update/reuse or keep routes clean going forward.

---

## Success Criteria

1. `off-c995615df9` (Inversiones La Plancha) has **1 route** (`La plancha 1`), **100% of customers/loans/payments intact**, and active sessions extended to `~2027-11-26`.
2. Mobile (`npm run typecheck`, `npm run test:finance`) passes 100% including new regression tests for ghost route pruning, non-looping real-time write-through sync, and zero-data-loss reassignment.
3. Desktop (`gradlew.bat compileJava test buildOtaPatch`) passes 100% including JUnit test for ghost route pruning.
4. Mobile Web (`1.2.32`), Android OTA (`preview`, `runtimeVersion: 1.2.2`), and Desktop OTA (`v1.2.5`) are all deployed live with zero user reinstallation required.
