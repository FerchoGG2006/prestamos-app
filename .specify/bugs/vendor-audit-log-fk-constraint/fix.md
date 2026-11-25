# Bug Fix: SQLite Foreign Key Constraint Error in Vendor Commercial Panel Audit Log

- **Slug**: vendor-audit-log-fk-constraint
- **Fixed**: 2026-11-21T13:52:00-05:00
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Fixed `OfficeLicensingService.logAudit()` to stop inserting the non-existent `"vendor"` string into `audit_log.user_id`. It now uses the active authenticated `UserSession` ID when available or `null` when invoked from the pre-login `"Acceso distribuidor"` dialog (recording `"Panel distribuidor: ..."` in `reason`), matching `DatabaseBackupService` and satisfying SQLite's `FOREIGN KEY (user_id) REFERENCES app_user(id)` constraint.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java` | modified | Replaced hardcoded `"vendor"` in `logAudit()` with `UserSessionContext.getSession().map(UserSession::userId).orElse(null)` and prefixed `reason` with `"Panel distribuidor: "` when no user session is active. |
| `desktop/src/test/java/com/cartera/infrastructure/licensing/OfficeLicensingServiceTest.java` | modified | Added `AuditLogEntity` captor assertions verifying `userId` is `null` and `reason` records `"Panel distribuidor:"` outside a logged-in user session. |
| `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java` | modified | Added real SQLite integration test (`PRAGMA foreign_keys = ON`) proving `registerCommercialOffice()` writes to `audit_log` with zero FK violations. |

## Tests Added or Updated

- `OfficeLicensingServiceTest::registerCommercialOfficeSavesOfficeAndAdminUser` — asserts `auditLog.getUserId() == null` when `UserSessionContext` is empty.
- `DesktopCloudSyncServiceTest::vendorCommercialOfficeRegistrationPersistsAuditLogWithSqliteForeignKeysEnabled` — runs `registerCommercialOffice()` against real Flyway-migrated SQLite with `PRAGMA foreign_keys = ON` and verifies `audit_log` row count increments cleanly.

## Local Verification

- Pending completion of `.\gradlew.bat compileJava test installDist packageAll -PdistributionDir=...\dist\release-20261121-r2` (recorded in `test.md`).

## Deviations from Assessment

None.

## Follow-ups

- Relaunch fresh Kredia Desktop via `iniciar-cartera.vbs` once `packageAll` finishes.
