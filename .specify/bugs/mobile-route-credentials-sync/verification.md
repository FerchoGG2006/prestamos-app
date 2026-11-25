# Bug Verification Report: `mobile-route-credentials-sync`

- **Date**: 2026-11-25
- **Verdict**: `verified`

## Verification Evidence
1. **TypeScript Static Check**: `npm run typecheck` exited `0` (0 errors).
2. **Automated Financial & Sync Regression Suite**: `npm run test:finance` exited `0`:
   - `PASS cloud-sync-safety.test.ts (18/18 assertions)` — explicitly verified:
     - `isHashedPassword()` and `hashPassword()` preserve Desktop PBKDF2 (`<32hex>$<64hex>`) and Mobile `sha256$<salt>$<hash>` without double-hashing.
     - `updateRouteWithCredentials()` preserves existing password hash when left blank, normalizes `COLLECTOR` → `COBRADOR`, rejects forbidden weak passwords (`cobrador`, `000000`, `123456`, `< 6 chars`) identically to `LoginView`, and stores a verifiable hash when a new password is entered.
     - `cloudSyncEngine.syncBidirectional()` aborts `pullFullPortfolio()` / `mergeCloudPortfolio()` if `syncUsersAndRoutes()` returns `{ ok: false }` (e.g. `usernameConflict: true`), preventing stale remote users from overwriting local credential edits.
     - `cloudSyncEngine.syncUsersAndRoutesNow()` immediately pushes updated users and routes to Supabase with active session token.
   - `RENEWAL_MATRIX PASS scenarios=127 assertions=1632`
   - `PASS migration-and-renewal-fixed.test.ts (all assertions)`
3. **Production Deployment**:
   - **Mobile Web**: `web 1.2.29 (2026-11-25)` exported and promoted live to `https://cartera-movil.expo.app` (`https://cartera-movil--wm0khjbanb.expo.app`).
   - **Android OTA**: Published to Expo Updates `preview` channel (`runtimeVersion: 1.2.2`).
