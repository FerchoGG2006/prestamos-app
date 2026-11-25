# Bug Verification: SQLite Foreign Key Constraint Error in Vendor Commercial Panel Audit Log

- **Slug**: vendor-audit-log-fk-constraint
- **Tested**: 2026-11-21T13:56:00-05:00
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

The SQLite `FOREIGN KEY` violation in `OfficeLicensingService.logAudit()` is eliminated and verified with both unit assertions and a real Flyway-migrated SQLite integration test running under `PRAGMA foreign_keys = ON`. Fresh `installDist`, Windows `.exe` installer, and portable `.zip` packages built cleanly and the updated Desktop app is running.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (real SQLite FK test) | `DesktopCloudSyncServiceTest::vendorCommercialOfficeRegistrationPersistsAuditLogWithSqliteForeignKeysEnabled` | pass | Registers a commercial office outside any logged-in session against SQLite with `PRAGMA foreign_keys = ON` and confirms `audit_log` row persists cleanly. |
| Unit test (`OfficeLicensingServiceTest`) | `OfficeLicensingServiceTest::registerCommercialOfficeSavesOfficeAndAdminUser` | pass | Confirms `AuditLogEntity.userId == null` and `reason` starts with `"Panel distribuidor:"`. |
| Full Gradle build, regression suite & packaging | `cd desktop; .\gradlew.bat compileJava test installDist packageAll -PdistributionDir=C:\Users\ASUS\prestamos-app-1\dist\release-20261121-r2` | pass | `BUILD SUCCESSFUL in 3m 57s`; all tests green; `.exe` and `.zip` created cleanly. |
| Fresh Desktop launch | `wscript.exe iniciar-cartera.vbs` | pass | Fresh `javaw.exe` launched against updated `installDist`. |

## Output Excerpts

```text
Successful compile (64,828 sec). Resulting Setup program filename is:
C:\Users\ASUS\prestamos-app-1\dist\release-20261121-r2\Instalador-SistemaCartera-v1.1.1.exe
> Task :packageZip
> Task :packageAll
BUILD SUCCESSFUL in 3m 57s
```

## Residual Risks

None.

## Recommendation

Close the bug — verified end-to-end with real SQLite FK enforcement and fresh Windows packages.
