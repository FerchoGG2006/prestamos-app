# Bug Assessment: SQLite Foreign Key Constraint Error in Vendor Commercial Panel Audit Log

- **Slug**: vendor-audit-log-fk-constraint
- **Created**: 2026-11-21T13:51:00-05:00
- **Source**: user screenshot (`Panel Comercial de Oficinas y Licencias` error dialog)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

Screenshot from `"Panel Comercial de Oficinas y Licencias"` after clicking `"Registrar Oficina y Generar Código"` for `"Inversiones La Plancha"`:
> `could not execute statement [[SQLITE_CONSTRAINT_FOREIGNKEY] A foreign key constraint failed (FOREIGN KEY constraint failed)] [insert into audit_log (action,created_at,entity_id,entity_type,new_value,previous_value,reason,user_id,id) values (?,?,?,?,?,?,?,?,?)]`

## Symptom

Registering a new commercial office (or creating a collector, changing license status, regenerating an activation code, or linking a local office) from `"Acceso distribuidor"` succeeds in Supabase (`Inversiones La Plancha` / `off-c995615df9` / `KRD-FXSG-TX4Z` was created remotely), but throws a `SQLITE_CONSTRAINT_FOREIGNKEY` error on the final local `audit_log` insert, preventing the success banner, form reset, clipboard copy, and table refresh from completing.

## Reproduction

1. Open Desktop `LoginView` (no local user session active) and click `"Acceso distribuidor"`.
2. Unlock with the vendor PIN.
3. Fill out `"2. Dar de Alta Nueva Oficina Cliente"` and click `"Registrar Oficina y Generar Código"`.
4. Observe `SQLITE_CONSTRAINT_FOREIGNKEY` inserting into `audit_log`.

## Suspected Code Paths

- `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java:416-429` — `logAudit()` passes hardcoded `"vendor"` as `user_id` into `new AuditLogEntity(...)`.
- `desktop/src/main/resources/db/migration/V1__initial_financial_schema.sql:19` — `audit_log.user_id` is nullable (`TEXT REFERENCES app_user(id)`), and `application.properties:11` enforces `PRAGMA foreign_keys = ON;`.

## Root Cause Hypothesis

Confidence: **high**. `OfficeLicensingService.logAudit()` inserts literal `"vendor"` into `audit_log.user_id`, which violates SQLite's `FOREIGN KEY (user_id) REFERENCES app_user(id)` constraint because no user row with `id = 'vendor'` exists in `app_user`. Other services such as `DatabaseBackupService` already solve this by passing `UserSessionContext.getSession().map(UserSession::userId).orElse(null)`.

## Proposed Remediation

**Preferred**:
1. Update `OfficeLicensingService.logAudit()` to resolve `userId` from `UserSessionContext.getSession().map(UserSession::userId).orElse(null)` (nullable FK, matching `DatabaseBackupService`), and record `"Panel distribuidor: " + details` in `reason` when `actorUserId == null`.
2. Add assertions in `OfficeLicensingServiceTest.java` verifying `AuditLogEntity.getUserId()` is `null` when invoked outside a user session (never `"vendor"`), and add a real SQLite (`PRAGMA foreign_keys = ON`) test in `DesktopCloudSyncServiceTest.java` proving `audit_log` persists vendor actions without FK violations.
3. Stop running Desktop `javaw.exe`, run `.\gradlew.bat compileJava test installDist`, rebuild the Windows `.exe`/`.zip` package, and relaunch Kredia Desktop cleanly.

**Files likely to change**:
- `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java`
- `desktop/src/test/java/com/cartera/infrastructure/licensing/OfficeLicensingServiceTest.java`
- `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java`

**Tests to add or update**:
- Unit check in `OfficeLicensingServiceTest` asserting `AuditLogEntity.getUserId()` is `null` when no user session is active.
- Real SQLite FK-enforced test in `DesktopCloudSyncServiceTest` verifying `OfficeLicensingService.registerCommercialOffice()` writes to `audit_log` cleanly with `PRAGMA foreign_keys = ON`.

## Risks & Considerations

- None; `audit_log.user_id` is explicitly nullable in `V1__initial_financial_schema.sql` and `AuditLogEntity`.

## Open Questions

None.
