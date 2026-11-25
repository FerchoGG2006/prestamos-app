# Bug Verification: Desktop "Acceso distribuidor" Unresponsive & Inversiones FBV Login Failure

- **Slug**: desktop-vendor-access-and-login
- **Tested**: 2026-11-21T13:35:00-05:00
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

All root causes have been eliminated and verified: `VendorLicensingDialog` dialogs/alerts now declare `initOwner(...)` + `Modality.APPLICATION_MODAL` and load offices asynchronously after opening; `LoginView` keeps `"Acceso distribuidor"` directly clickable with explicit `try/catch` error display; `DesktopCloudSyncService.authenticateAndSync()` isolates post-auth hydration failures; the stale `01:56` desktop JVM (`PID 7708`) was terminated and replaced with a fresh launch; live end-to-end login with `admin-fbv` / `FBV2026*` succeeded with full FBV hydration; and fresh Windows `.exe`/`.zip` packages were generated.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Unit & Spring Boot tests | `cd desktop; .\gradlew.bat compileJava test installDist` | pass | `BUILD SUCCESSFUL in 1m 29s`; `DesktopCloudSyncServiceTest` verified FBV `sha256$` hash and transient hydration resilience. |
| Live E2E FBV login & hydration | `VerifyDesktopLogin.java` against temp copy of `cartera.db` + live Supabase | pass | `LIVE_LOGIN_OK=true`, `admin-fbv|ADMIN|Administrador FBV`, 21 customers, 22 loans, 35 payments, 67 immutable events. |
| Windows installer & ZIP build | `cd desktop; .\gradlew.bat packageAll -PdistributionDir=C:\Users\ASUS\prestamos-app-1\dist\release-20261121` | pass | `BUILD SUCCESSFUL in 1m 53s`; generated `.exe` and `.zip`. |
| Seller local DB vendor key | Stored `cloud.vendor_secret_key` solely in `%USERPROFILE%\.sistema-cartera\cartera.db` | pass | Not bundled in installer `.exe`; enables instant `"Acceso distribuidor"` office listing on distributor's PC. |
| Fresh Desktop launch | `wscript.exe iniciar-cartera.vbs` | pass | Fresh `javaw.exe` process running against newly compiled JARs. |

## Output Excerpts

```text
LIVE_LOGIN_OK=true
LIVE_LOGIN_MSG=
LIVE_SESSION=admin-fbv|ADMIN|Administrador FBV
CUSTOMERS=21
LOANS=22
PAYMENTS=35
EVENTS=67
```

```text
Successful compile (73,719 sec). Resulting Setup program filename is:
C:\Users\ASUS\prestamos-app-1\dist\release-20261121\Instalador-SistemaCartera-v1.1.1.exe
BUILD SUCCESSFUL in 1m 53s
```

## Residual Risks

- On the distributor's PC, the first click on `"Acceso distribuidor"` prompts once to create a local 4+ character seller PIN (stored hashed in `cartera.db`); afterwards it opens directly to the Commercial Panel with Inversiones FBV listed automatically.
- Notice `cobrador-fbv` in Supabase currently has no password hash set (carried over from the original backup with empty password); the administrator can assign or reset a collector password from Configuration or `"Acceso distribuidor"` when needed.

## Recommendation

Close the bug — verified end-to-end across JUnit tests, live Supabase authentication/hydration, Windows `.exe` packaging, and fresh Desktop launch.
