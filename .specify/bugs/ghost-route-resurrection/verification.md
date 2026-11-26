# Bug Verification Report: `ghost-route-resurrection`

**Verdict**: `verified`  
**Verified At**: 2026-11-26

## Verification Evidence
1. **Live Root Cause Confirmation**:
   - Supabase `public.routes` showed `route-norte` (`off-fbv-001`, `collector_id: NULL`) created at `19:45:48Z` and `rt-plancha-001` (`off-c995615df9`, `collector_id: NULL`) created at `19:49:58Z`, matching client sync after `local-store.ts:initialize()` fabricated empty-password `usr-col-2`.
2. **Automated Tests**:
   - `npm run typecheck`: 0 errors.
   - `npm run test:finance`: 100% PASS, including `cloud-sync-safety.test.ts` **38/38 assertions** covering cached `route-norte` (`RN-01`) with fabricated `usr-col-2` (`password: ''`) never pushed back and pruned on pull.
3. **Database-Level Guard Proof (Live Dry-Run in Supabase)**:
   - Applied `supabase/migrations/20261126020000_prevent_ghost_route_resurrection.sql`.
   - Executed live dry-run `INSERT INTO public.routes (id='route-norte', office_id='off-fbv-001', collector_id=NULL) ON CONFLICT DO UPDATE` -> silently ignored (`RETURN NULL`) with HTTP 201 and zero error.
   - Live `guard_verification` confirmed:
     - `trigger_exists: true`
     - `fbv_routes`: `[{"id":"route-1","name":"Galeria","collector_id":"usr-col-1"}]` (`fbv_customers: 27`)
     - `plancha_routes`: `[{"id":"rt-c995615d-01","name":"La plancha 1","collector_id":"usr-col-c995615d-2"}]` (`plancha_customers: 22`)
4. **Deployments**:
   - Mobile Web `web 1.2.33` (`https://cartera-movil.expo.app`)
   - Android OTA (`preview`, `runtimeVersion: 1.2.2`)
