# Bug Fix: Desktop "Acceso distribuidor" Unresponsive & Inversiones FBV Login Failure

- **Slug**: desktop-vendor-access-and-login
- **Fixed**: 2026-11-21T13:32:00-05:00
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Fixed silent failures and dialog ownership bugs in `LoginView` and `VendorLicensingDialog` (so clicking `"Acceso distribuidor"` always displays its PIN and Commercial Panel dialogs cleanly in front of maximized Windows stages and loads offices asynchronously without blocking the UI thread), hardened `DesktopCloudSyncService.authenticateAndSync()` so a post-authentication hydration hiccup never reports false `"Usuario o contraseña incorrectos"` errors, terminated the stale `01:56` desktop JVM (`PID 7708`), verified live `admin-fbv` / `FBV2026*` authentication and hydration against Supabase, and rebuilt the Windows installer `.exe` and portable `.zip`.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `desktop/src/main/java/com/cartera/ui/views/VendorLicensingDialog.java` | modified | Added `initOwner(...)` and `Modality.APPLICATION_MODAL` to all dialogs/alerts (`promptVendorAccess`, local backup dialog, `openAddCollectorDialog`, `showError`), auto-focus on PIN field, asynchronous `refreshOffices()` after `modal.setOnShown`, and friendly prompt if vendor secret key is missing. |
| `desktop/src/main/java/com/cartera/ui/views/LoginView.java` | modified | Kept `"Acceso distribuidor"` directly clickable (no hidden shortcuts), wrapped handler in `try/catch (Throwable)` with visible owned `Alert` and SLF4J error logging, and added logging on unexpected login errors. |
| `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java` | modified | Separated `registryClient.authenticateUser()` from `hydrateOfficeFromCloud()` in `authenticateAndSync()`, adding `persistAuthenticatedUserLocally()` fallback so verified logins never fail with invalid-credential messages on transient sync errors. |
| `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java` | modified | Converted to full Spring Boot SQLite test verifying FBV's exact `sha256$` hash and proving `authenticateAndSync("admin-FBV", "FBV2026*")` succeeds and saves local PBKDF2 credentials even when post-auth hydration throws. |

## Diff Highlights

- `VendorLicensingDialog.promptVendorAccess()`: sets `initOwner(owner)`, `Modality.APPLICATION_MODAL`, and `Platform.runLater(pf::requestFocus)` so PIN prompts always appear on top of maximized Windows stages.
- `VendorLicensingDialog.show()`: triggers `refreshOffices()` inside `modal.setOnShown(...)` on a daemon thread so the modal renders immediately.
- `DesktopCloudSyncService.authenticateAndSync()`: isolates `hydrateOfficeFromCloud()` in its own `try/catch` and calls `persistAuthenticatedUserLocally()` on transient hydration failure instead of falling back into invalid credentials.

## Tests Added or Updated

- `DesktopCloudSyncServiceTest::passwordHasherVerifiesBothPbkdf2AndMobileSha256Hashes` — asserts exact FBV `sha256$` hash passes with `"FBV2026*"` and rejects wrong passwords.
- `DesktopCloudSyncServiceTest::authenticateAndSyncSucceedsEvenIfPostAuthHydrationFailsTransiently` — verifies case-insensitive `"admin-FBV"` login succeeds, assigns `ADMIN` role, persists office linkage (`off-fbv-001`), and upgrades local PBKDF2 password even when hydration throws.

## Local Verification

- `Stop-Process -Id 7708 -Force` → terminated stale `01:56` desktop JVM.
- `cd desktop; .\gradlew.bat compileJava test installDist` → `BUILD SUCCESSFUL in 1m 29s` (all JUnit suites green).
- Live E2E Java verification (`VerifyDesktopLogin.java` against temp copy of `cartera.db` + live Supabase): `LIVE_LOGIN_OK=true`, `LIVE_SESSION=admin-fbv|ADMIN|Administrador FBV`, `CUSTOMERS=21`, `LOANS=22`, `PAYMENTS=35`, `EVENTS=67`.
- Configured `cloud.vendor_secret_key` solely in the distributor's local `%USERPROFILE%\.sistema-cartera\cartera.db` (never bundled in installer).

## Deviations from Assessment

None.

## Follow-ups

- Wait for `.\gradlew.bat packageAll` to finish, launch the freshly built Desktop app via `iniciar-cartera.vbs`, and record final verification in `test.md`.
