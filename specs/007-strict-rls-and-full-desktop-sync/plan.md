# Implementation Plan: Complete Desktop→Cloud Sync & Strict Multi-Tenant RLS

**Branch**: `007-strict-rls-and-full-desktop-sync` | **Date**: 2026-11-21

## Changes
1. **Supabase Migration (`supabase/migrations/20261121010000_strict_rls_office_isolation.sql`)**:
   - Create `private` schema (revoked from `anon`/`authenticated`).
   - Create `private.office_sessions` and `private.vendor_config`.
   - Create `private.verify_kredia_password(raw, stored)` supporting both `sha256$salt$hash` and `PBKDF2-HMAC-SHA256` (65536 iterations via `extensions.hmac` + native `bit(256)` XOR).
   - Create `private.current_office_id()` (`STABLE SECURITY DEFINER`, `SET search_path = ''`) validating `x-kredia-session` token hash, expiry, revocation, and active office license.
   - Create `public.authenticate_kredia_user(p_username, p_password)` returning session token + office + user metadata without leaking `password_hash`.
   - Create vendor RPCs (`public.vendor_list_offices`, `public.vendor_upsert_office`, `public.vendor_upsert_user`, `public.vendor_upsert_route`, `public.vendor_set_license_status`, `public.vendor_regenerate_code`, `public.vendor_username_exists`) protected by `private.is_valid_vendor_request()`.
   - Replace ALL `Allow anon all on ...` RLS policies on `offices`, `users`, `routes`, `customers`, `loans`, `installments`, `payments`, `renewals`, `daily_settlements`, `cash_movements`, and `financial_events` with `(SELECT private.current_office_id())` isolation!
   - Recreate `public.office_ledger_balances` with `WITH (security_invoker = true)`.
2. **Desktop JavaFX (`desktop/`)**:
   - `SupabaseRegistryClient.java`: Support `x-kredia-session` header (stored in `system_setting`), call `rpc/authenticate_kredia_user`, and route Vendor Console calls through `rpc/vendor_*` with `x-kredia-vendor-key`.
   - `DesktopCloudSyncService.java`:
     - Authenticate via `rpc/authenticate_kredia_user` and persist `cloud.session_token`.
     - Complete `pushLocalChangesToCloud`: also push `users` (collectors/admins created/updated in Configuration), `renewals` (+ `RENEWAL_EXECUTED` immutable events), `cash_movements` (+ `CAPITAL_INJECTED` / `EXPENSE_RECORDED` / `OFFICE_WITHDRAWAL` / `PAPERWORK_WITHDRAWAL` / `ADJUSTMENT_ENTRY` immutable events), and `LOAN_DISBURSED` immutable events!
   - `VendorLicensingDialog.java` + `OfficeLicensingService.java`: Support configuring & storing `cloud.vendor_secret` for the Vendor Console only (never exposed to buyer login).
   - Update `DesktopCloudSyncServiceTest.java` & `OfficeLicensingServiceTest.java`.
3. **Mobile/Web (`mobile/`)**:
   - `types.ts` (`OfficeCompanyConfig.cloudSessionToken`) & `supabase-client.ts`:
     - Authenticate via `rpc('authenticate_kredia_user', { p_username, p_password })`, persist `cloudSessionToken`, and attach `x-kredia-session` header to `@supabase/supabase-js` client automatically on init & login!
     - Re-export `mobile/dist --clear` and deploy to `https://cartera-movil.expo.app`.
4. **Live End-to-End Verification**:
   - Apply SQL migration in Supabase SQL Editor.
   - Verify with `curl.exe` that unauthenticated `anon` reads return `[]` and writes return `401/403`.
   - Verify `rpc/authenticate_kredia_user` with `admin-fbv` / `FBV2026*` returns a session token that reads all 21 FBV customers AND rejects writes to another `office_id`!
   - Run `.\gradlew.bat compileJava test installDist` and `npx eas-cli deploy --prod`.
