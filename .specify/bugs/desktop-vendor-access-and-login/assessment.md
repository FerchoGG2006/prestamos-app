# Bug Assessment: Desktop "Acceso distribuidor" Unresponsive & Inversiones FBV Login Failure

- **Slug**: desktop-vendor-access-and-login
- **Created**: 2026-11-21T13:22:00-05:00
- **Source**: user report + desktop screenshot (`Sistema de Cartera y Cobros`, PID 7708)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> "acceso distribuidor, qué es? por qué no sirve, le doy clic y no muestra nada"
> "ningun atajo sirve, haz que funcione y no me sirve la credencial que ves en pantalla de Inversiones FBV, arregla todo. procede tambien con la Propuesta antes de aplicar cambios"

## Symptom

1. Clicking the `"Acceso distribuidor"` button on the Desktop JavaFX login screen shows no dialog and produces no visible feedback.
2. Entering the valid `Inversiones FBV` credentials (`admin-fbv` / `FBV2026*`) on the Desktop JavaFX login screen fails to sign in, even though Supabase `rpc/authenticate_kredia_user` returns `ok: true` with `session_token` and all FBV records (21 customers, 22 loans, 35 payments, 67 events).

## Reproduction

1. Observe the running desktop process (`PID 7708`, started `2026-11-21 01:56:05`) while `sistema-cartera-desktop-0.1.0-SNAPSHOT-plain.jar` on disk was rebuilt at `2026-11-21 02:40:37` (after strict RLS migration `20261121010000` was applied).
2. Click `"Acceso distribuidor"` on `LoginView` — nothing appears because (a) the stale JVM fails lazily loading `VendorLicensingDialog` from the overwritten JAR with no `try/catch` UI feedback in `LoginView.java`, and (b) `VendorLicensingDialog` creates `TextInputDialog`/`Dialog`/`Alert` instances without `initOwner(owner)` and calls synchronous network `refreshOffices()` before `modal.showAndWait()`.
3. Enter `admin-fbv` / `FBV2026*` — fails on the stale `01:56` JVM because pre-RLS code queries `/rest/v1/users` directly (blocked by strict RLS) and lacks `sha256$` verification; additionally, in current `DesktopCloudSyncService.authenticateAndSync()`, any exception thrown inside `hydrateOfficeFromCloud()` after successful RPC auth falls into the outer `catch` block and can falsely report `"Usuario o contraseña incorrectos."`.

## Suspected Code Paths

- `desktop/src/main/java/com/cartera/ui/views/LoginView.java:144-151` — `btnVendorPanel` click handler lacks `try/catch (Throwable)` and user-visible error reporting; if `licensingService` or dialog instantiation throws, failure is completely silent in `javaw.exe`.
- `desktop/src/main/java/com/cartera/ui/views/VendorLicensingDialog.java:83,88-122,234-238,348-352,416-420` — `promptVendorAccess()`, `buildLocalProtectionBar()`, `openAddCollectorDialog()`, and `showError()` omit `initOwner(...)` (causing dialogs to open behind a maximized Windows stage), and `show()` runs synchronous `refreshOffices()` before `modal.showAndWait()`.
- `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java:124-168` — single `try/catch` wraps both `registryClient.authenticateUser()` and `hydrateOfficeFromCloud()`, allowing a post-auth sync error to fall back into `"Usuario o contraseña incorrectos."` instead of completing the authenticated session and logging the sync warning.
- Running desktop JVM `PID 7708` (`2026-11-21 01:56:05`) — running stale pre-RLS bytecode against an overwritten JAR on disk.

## Root Cause Hypothesis

Confidence: **high**. Two compounding causes explain the user-observed failure:
1. Immediate runtime cause: the user's open desktop window (`PID 7708`) predated the strict-RLS + `sha256$` rebuild (`02:40:37`), so its JAR on disk was replaced under it (breaking lazy classloading of `VendorLicensingDialog`) and its in-memory auth client still queried `/rest/v1/users` directly instead of `rpc/authenticate_kredia_user`.
2. Code-level defects: `VendorLicensingDialog` dialogs/alerts lack `initOwner(owner)` (risking hidden dialogs behind maximized Windows stages) and block the FX thread on `refreshOffices()`; `LoginView` swallows exceptions from `"Acceso distribuidor"` silently; and `DesktopCloudSyncService.authenticateAndSync()` conflates post-authentication hydration errors with invalid credentials.

## Proposed Remediation

**Preferred**:
1. Update `VendorLicensingDialog.java`:
   - Pass `initOwner(owner)` (or `initOwner(modal)` for child dialogs) and `Modality.APPLICATION_MODAL` to every `TextInputDialog`, `Dialog`, and `Alert`, and request focus on the PIN field via `Platform.runLater`.
   - Convert `showError` to an instance helper accepting parent stage so error alerts never hide behind the maximized stage.
   - Run `refreshOffices()` asynchronously on a daemon thread triggered after the modal opens, displaying a friendly prompt if `Clave Distribuidor` is not yet configured instead of raw HTTP 401 JSON.
2. Update `LoginView.java`:
   - Keep `"Acceso distribuidor"` visible and directly clickable (no hidden shortcuts); wrap opening `VendorLicensingDialog` in `try/catch (Throwable)` with an owned error alert and log output so errors are never silent.
   - Ensure the window/stage is resolved cleanly even if `getScene().getWindow()` is checked.
3. Update `DesktopCloudSyncService.java`:
   - Isolate `hydrateOfficeFromCloud()` in its own `try/catch` after `registryClient.authenticateUser()` succeeds: if cloud authentication verified the user and license, persist/update the local user credentials and allow login to proceed even if one sync fetch hits a transient error, logging the exact cause to `cartera.log`.
   - Ensure `PasswordHasher.verify` and `authenticateAndSync` are verified via JUnit tests (including an end-to-end check for `admin-fbv` / `FBV2026*` hydration parity).
4. Stop the stale `PID 7708` process, compile and run all tests (`.\gradlew.bat compileJava test installDist`), rebuild the Windows installer `.exe` and portable `.zip` (`.\gradlew.bat packageAll`), and launch the fresh Desktop application via `iniciar-cartera.vbs`.

**Files likely to change**:
- `desktop/src/main/java/com/cartera/ui/views/VendorLicensingDialog.java`
- `desktop/src/main/java/com/cartera/ui/views/LoginView.java`
- `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java`
- `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java`

**Tests to add or update**:
- Unit tests in `DesktopCloudSyncServiceTest.java` verifying: (a) `PasswordHasher.verify` accepts FBV's `sha256$` hash, (b) `authenticateAndSync` succeeds and updates local PBKDF2 credentials even if `hydrateOfficeFromCloud` encounters a transient fetch error, and (c) full live-schema hydration test verifying `admin-fbv` login + local persistence.

## Risks & Considerations

- Never embed the Vendor Master Key (`KRD-VND-...`) inside the compiled `.exe` installer shipped to buyers; it remains local to the distributor's own `cartera.db` once entered in `"Acceso distribuidor"`.
- Must terminate `PID 7708` BEFORE running `installDist` / `packageAll` so Windows does not lock JAR files and the user immediately gets the fresh app window.

## Open Questions

None — user explicitly authorized fixing both `"Acceso distribuidor"`, the Inversiones FBV Desktop login, and rebuilding/relaunching cleanly.
