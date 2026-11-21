# Tasks: Multi-Office Registry, Licensing & Device Linking

**Feature**: `004-multi-office-licensing`  
**Plan**: [plan.md](file:///c:/Users/ASUS/prestamos-app-1/specs/004-multi-office-licensing/plan.md)

## Phase 1: Cloud Schema & Multi-Tenant Licensing Contract

- [x] T001 Create Supabase migration `supabase/migrations/20261120000000_office_licensing_and_isolation.sql` adding `activation_code`, `license_status`, `license_plan`, `license_expires_at`, `owner_name`, and `notes` to `public.offices`, plus unique index and `verify_office_activation` function.

## Phase 2: Mobile Companion — Clean Startup, Linking & Immutable `officeId`

- [x] T002 Update `OfficeCompanyConfig` in `mobile/src/core/domain/types.ts` with `officeId`, `activationCode`, `licenseStatus`, and `licenseExpiresAt`.
- [x] T003 Update `mobile/src/infrastructure/storage/local-store.ts` to remove hardcoded `'Inversiones FBV'` and `admin-fbv` auto-creation on fresh installs, preserve legacy local data safely, and add `linkDeviceToOffice(...)` and `hasLegacyUnlinkedData()`.
- [x] T004 Update `mobile/src/infrastructure/sync/supabase-client.ts` and `mobile/src/infrastructure/sync/cloud-sync.ts` to use immutable `officeConfig.officeId` (never `companyName`), validate license status before sync, and implement `verifyAndLinkOffice(...)` (plus password hash verification compatible with both mobile & desktop).
- [x] T005 Update `mobile/src/presentation/views/auth/LoginView.tsx` to present the clean **"Vincular Oficina"** flow (activation code + username + password) when unlinked, and a safe backup/link option when legacy FBV data is detected.

## Phase 3: Desktop JavaFX — Vendor Commercial Console & Office Activation

- [x] T006 Create `desktop/src/main/java/com/cartera/infrastructure/licensing/SupabaseRegistryClient.java` to manage `offices` and `users` in Supabase via `java.net.http.HttpClient` + Jackson.
- [x] T007 Create `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java` for generating unique `officeId` / `activationCode`, registering commercial offices, toggling license status (`ACTIVE`/`SUSPENDED`/`EXPIRED`), linking local desktop to an office, and backing up/registering existing FBV data.
- [x] T008 Create `desktop/src/main/java/com/cartera/ui/views/VendorLicensingDialog.java` (JavaFX 21) protected by vendor access, allowing the seller to create offices, issue activation codes, and suspend/activate licenses.
- [x] T009 Integrate office activation & vendor console access into `desktop/src/main/java/com/cartera/ui/views/LoginView.java` and `desktop/src/main/java/com/cartera/ui/views/ConfigurationView.java`.

## Phase 4: Verification & Build

- [x] T010 Add unit tests for `OfficeLicensingService` in `desktop/src/test/java/com/cartera/infrastructure/licensing/OfficeLicensingServiceTest.java` and run `.\gradlew.bat compileJava test`.
- [x] T011 Run `npx expo export --platform web` in `mobile/` to verify clean bundle compilation into `mobile/dist`.
