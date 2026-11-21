# Tasks: Complete Desktop→Cloud Sync & Strict Multi-Tenant RLS

- [x] T001 Write & apply `supabase/migrations/20261121010000_strict_rls_office_isolation.sql` (private sessions, server-side password auth RPC, vendor RPCs, strict per-office RLS).
- [x] T002 Update `SupabaseRegistryClient.java`, `OfficeLicensingService.java`, and `VendorLicensingDialog.java` to use `x-kredia-session`, `authenticate_kredia_user`, and `vendor_*` RPCs.
- [x] T003 Complete `DesktopCloudSyncService.pushLocalChangesToCloud` for `users`, `renewals`, `cash_movements`, and all immutable `financial_events` + add unit tests.
- [x] T004 Update `mobile/src/` (`types.ts`, `supabase-client.ts`, `local-store.ts`, `cloud-sync.ts`, `LoginView.tsx`) to authenticate via `authenticate_kredia_user` and attach `x-kredia-session` automatically.
- [x] T005 Run live RLS penetration tests (`node` against Supabase), `.\gradlew.bat compileJava test installDist`, `npx expo export --platform web --clear`, and `npx eas-cli deploy --prod`.
