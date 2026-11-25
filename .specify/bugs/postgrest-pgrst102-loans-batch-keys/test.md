# Bug Verification Report: PostgREST `PGRST102` on `loans` Batch Upsert

**Slug**: `postgrest-pgrst102-loans-batch-keys`
**Verdict**: `verified`
**Version**: `1.2.1` (OTA Patch `1,611 KB`, SHA-256 `3a47e21c191561094277d66b154ce687a5a1aa986685dd2620a55d17d4f00bfe`)

## Verification Evidence
1. **Automated Unit & Integration Suite**: `.\gradlew.bat test` passed 100% green (`BUILD SUCCESSFUL`).
   - Verified `SupabaseRegistryClient.normalizeBatchChunk(...)` produces identical top-level JSON keys across mixed `DAILY` + `FIXED_DATE` + `MIGRACION` loan payloads (`fixed_due_date` and `notes` padded cleanly with `null` where absent).
   - Verified `DesktopCloudSyncService` explicitly sets `fixed_due_date` and `notes` on every loan row in `pushLocalChangesToCloud`.
2. **OTA Patch Artifact**: `.\gradlew.bat buildOtaPatch` emitted `kredia-app-1.2.1.jar` (`1,611 KB`) and `latest.json` (`min_shell_version = 1.2.0`) with zero `jpackage` / Inno Setup overhead.
