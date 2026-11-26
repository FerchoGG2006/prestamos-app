# Tasks: 017-cloud-first-silent-sync

**Status**: Converged (100% Complete & Verified Live)

## Phase 1 — Spec & Supabase Migration
- [x] T001 Inspect Mobile, Desktop, and Supabase session/route codebases
- [x] T002 Create Spec 017 artifacts (`spec.md`, `plan.md`, `tasks.md`)
- [x] T003 Author `supabase/migrations/20261126010000_sliding_365d_sessions_and_clean_routes.sql` (365-day TTL, extend active sessions, `refresh_kredia_session`, `delete_empty_route`, guarded cleanup of `rt-plancha-001` & `route-norte`)
- [x] T004 Execute migration live in Supabase and verify Inversiones La Plancha (`off-c995615df9`) sessions extended to 2027-11-26 and 100% customers/loans intact

## Phase 2 — Mobile Silent Real-Time Sync & Zero Cloud UI
- [x] T005 Add `refreshCloudSession()` and `deleteEmptyRoute()` to `mobile/src/infrastructure/sync/supabase-client.ts`; clean technical error copy
- [x] T006 Upgrade `mobile/src/infrastructure/storage/local-store.ts`: separate local-mutation notifications from cloud merges, remove hardcoded `'route-norte'` defaults, and prune ghost routes safely in `mergeCloudPortfolio`
- [x] T007 Upgrade `mobile/src/infrastructure/sync/cloud-sync.ts`: 800 ms debounced real-time write-through sync on local mutations, silent `refreshCloudSession()` on boot/foreground, `deleteRouteInCloud()`, skip empty unlinked ghost routes on push
- [x] T008 Remove all cloud status pills, amber `"Sincronización con la nube en pausa"` banners, and `"Reconectar Sincronización en la Nube"` modal from `TodayCollectionsView.tsx`
- [x] T009 Wire `deleteRouteInCloud` in `OfficeConfigModal.tsx`, clean technical copy, and remove remaining hardcoded `'route-norte'` / `'Ruta Norte'` fallbacks in `App.tsx`, `NewLoanModal.tsx`, `EditCustomerModal.tsx`, `RouteSelectorModal.tsx`, `CollectorCuadreModal.tsx`, `SettlementModal.tsx`
- [x] T010 Bump `WEB_BUILD_LABEL` to `web 1.2.32 (2026-11-26)` and add regression tests in `cloud-sync-safety.test.ts` (36/36 assertions passing)

## Phase 3 — Desktop Silent Sync, Ghost Route Pruning & Clean Top Bar
- [x] T011 Add `refreshCloudSession` and `deleteEmptyRoute` to `SupabaseRegistryClient.java`
- [x] T012 Upgrade `DesktopCloudSyncService.java`: silent session refresh, safe pruning of empty ghost routes absent from server during hydration, skip empty ghost route push
- [x] T013 Clean `CarteraApplication.java` top bar (remove `lblCloudSyncStatus` cloud pill and reconnect popup, rename refresh button to `↻ Actualizar`, 15s silent background sync) and bump `AppVersion` to `1.2.5`
- [x] T014 Add JUnit test in `DesktopCloudSyncServiceTest.java` verifying empty ghost route pruning without touching customers or loans

## Phase 4 — Verification, Commit & Live Deployment
- [x] T015 Verify Mobile (`npm run typecheck` + `npm run test:finance` — 0 errors, 36/36 sync safety + 1632 renewal assertions + 6/6 receipt suites)
- [x] T016 Verify Desktop (`compileJava`, 8/8 JUnit suite, `buildOtaPatch` `v1.2.5` — 1,381,668 bytes)
- [x] T017 Commit and push to `origin/main` (`3d65607`)
- [x] T018 Deploy Mobile Web (`1.2.32`), Android OTA (`preview`, `a1178a4f-aea4-4042-8c9b-dac6341c441d`), and Desktop OTA (`v1.2.5` in Supabase Storage `desktop-updates`)
- [x] T019 Final live Supabase read-only audit confirming Inversiones La Plancha (`off-c995615df9`) intact (22 customers, 23 loans, 1 route `La plancha 1`, 2 active sessions extended to `2027-11-26`) and Inversiones FBV (`off-fbv-001`) with 1 route (`Galeria`)
