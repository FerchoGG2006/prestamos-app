# Implementation Plan: Multi-Office Registry, Licensing & Device Linking

**Branch**: `004-multi-office-licensing` | **Date**: 2026-11-20 | **Spec**: [spec.md](file:///c:/Users/ASUS/prestamos-app-1/specs/004-multi-office-licensing/spec.md)

## Summary

Implement a multi-tenant office registry, commercial licensing control, clean device onboarding, and FBV data protection across Supabase, the JavaFX 21 + Spring Boot desktop application, and the mobile companion app.

## Technical Context

**Desktop Stack**: Java 21, JavaFX 21, Spring Boot 3.4, SQLite + Flyway, Gradle (`desktop/`)  
**Mobile Companion Stack**: React Native / Expo TypeScript (`mobile/`), AsyncStorage/localStorage, `@supabase/supabase-js`  
**Cloud Registry & Sync**: Supabase PostgreSQL (`supabase/migrations/`)  
**Testing**: JUnit 5 (`.\gradlew.bat compileJava test`), TypeScript/Jest (`mobile/`), `npx expo export --platform web`

## Constitution Check

- [x] **I. JavaFX 21 Native Desktop**: Vendor Commercial Panel and Office Linking UI on desktop are implemented strictly in JavaFX 21 (`desktop/`), with zero React/WebView/localhost desktop UI.
- [x] **II. Financial Precision (`BigDecimal`)**: No monetary calculations use `double`/`float` on desktop.
- [x] **III. Transactionality & Auditability**: Office linking, license status changes, and FBV backup/migration are logged and non-destructive.
- [x] **IV. Cryptographic Security**: Desktop credentials use `PasswordHasher` (`PBKDF2-HMAC-SHA256`); mobile credentials are hashed/verified without plaintext defaults.
- [x] **V. Gradle Verification**: All desktop changes will be verified with `.\gradlew.bat compileJava test`.

## Project Structure

### Documentation (this feature)
- `specs/004-multi-office-licensing/spec.md`
- `specs/004-multi-office-licensing/plan.md`
- `specs/004-multi-office-licensing/research.md`
- `specs/004-multi-office-licensing/data-model.md`
- `specs/004-multi-office-licensing/contracts/multi-office-licensing.md`
- `specs/004-multi-office-licensing/quickstart.md`

### Source Code Changes
1. **Cloud Schema (`supabase/migrations/`)**:
   - `20261120000000_office_licensing_and_isolation.sql`: Add `activation_code`, `license_status`, `license_plan`, `license_expires_at`, `owner_name`, `notes` to `public.offices`, plus helper RPC `verify_office_activation`.
2. **Mobile Companion (`mobile/src/`)**:
   - `core/domain/types.ts`: Add `officeId`, `activationCode`, `licenseStatus`, `licenseExpiresAt` to `OfficeCompanyConfig`.
   - `infrastructure/storage/local-store.ts`: Remove hardcoded `'Inversiones FBV'` & `admin-fbv` auto-creation on fresh installs; preserve legacy FBV data if already present; add `linkDeviceToOffice(...)` and `exportFullBackupJson()`.
   - `infrastructure/sync/supabase-client.ts` & `cloud-sync.ts`: Use immutable `officeConfig.officeId` instead of deriving from `companyName`; add `linkOfficeByActivationCode(activationCode, username, password)` and license status verification before sync.
   - `presentation/views/auth/LoginView.tsx`: Show clean **Vincular Oficina** flow when unlinked (and safe FBV backup/link banner if legacy data exists).
3. **Desktop JavaFX (`desktop/src/main/java/com/cartera/`)**:
   - `infrastructure/licensing/SupabaseRegistryClient.java`: HTTP client for Supabase `offices` & `users` management (register office, list offices, toggle license, regenerate activation code, verify activation).
   - `infrastructure/licensing/OfficeLicensingService.java`: Local office link persistence (`SystemSettingEntity`), FBV backup + registration helper, and license validation.
   - `ui/views/VendorLicensingDialog.java`: JavaFX modal for the vendor to create offices, issue activation codes, and manage licenses.
   - `ui/views/LoginView.java` & `ui/views/ConfigurationView.java`: Integrate office activation/linking and vendor console access.
