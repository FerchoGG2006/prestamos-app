# Bug Assessment: PostgREST `PGRST102` on `loans` Batch Upsert

**Slug**: `postgrest-pgrst102-loans-batch-keys`
**Date**: 2026-11-25
**Severity**: High (Blocks background & manual cloud push of loans whenever heterogeneous loan types are synced together)

## Symptom
Observed repeatedly in `~/.sistema-cartera/logs/cartera.log`:
```
WARN [kredia-silent-sync] c.c.s.a.DesktopCloudSyncService : Sincronización silenciosa pospuesta: Error sincronizando loans (400): {"code":"PGRST102","details":null,"hint":null,"message":"All object keys must match"}
```

## Root Cause
1. PostgREST requires every JSON object in a bulk `POST /rest/v1/<table>` array to contain the **exact same set of top-level keys**; otherwise it rejects the entire batch with HTTP `400` (`PGRST102`).
2. In `DesktopCloudSyncService.pushLocalChangesToCloud(...)`:
   - `"fixed_due_date"` was only added when `"FIXED_DATE".equals(cloudFreq)` (omitted for `DAILY`/`WEEKLY`/`BIWEEKLY`/`MONTHLY` loans).
   - `"notes"` was only added when remote notes were non-blank or `operationType == MIGRACION` (omitted for standard new loans).
3. `SupabaseRegistryClient.upsertRowsBatch(...)` serialized each chunk directly without normalizing top-level keys across rows in the chunk.

## Remediation Plan
1. Always populate `"fixed_due_date"` (`put` or `putNull`) and `"notes"` (`put` or `put("")`) uniformly for every loan row in `DesktopCloudSyncService`.
2. Add `SupabaseRegistryClient.normalizeBatchChunk(List<ObjectNode>)` in `upsertRowsBatch` so every chunk sent to PostgREST is guaranteed to have identical top-level JSON keys (defense-in-depth across all tables).
3. Bump `AppVersion.CURRENT` to `"1.2.1"` (leaving `SHELL_VERSION = "1.2.0"` unchanged), add regression tests, verify 100% green JUnit suite, build 1.6 MB OTA patch `kredia-app-1.2.1.jar`, and publish live to Supabase Storage `desktop-updates` so installed `v1.2.0` Desktop clients auto-update via OTA without reinstalling `.exe`.
