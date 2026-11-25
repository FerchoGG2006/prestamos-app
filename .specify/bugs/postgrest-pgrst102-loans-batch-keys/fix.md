# Bug Fix Record: PostgREST `PGRST102` on `loans` Batch Upsert

**Slug**: `postgrest-pgrst102-loans-batch-keys`
**Fixed Version**: `1.2.1` (OTA patch ~1.6 MB over Base Shell `1.2.0`)

## Changes Applied
1. [DesktopCloudSyncService.java](file:///c:/Users/ASUS/prestamos-app-1/desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java):
   - Always emits `"fixed_due_date"` (`put` for `FIXED_DATE`, `putNull` otherwise) and `"notes"` (`put` or `put("")`) uniformly on every `loans` upsert object.
2. [SupabaseRegistryClient.java](file:///c:/Users/ASUS/prestamos-app-1/desktop/src/main/java/com/cartera/infrastructure/licensing/SupabaseRegistryClient.java):
   - Added `normalizeBatchChunk(List<ObjectNode>)` in `upsertRowsBatch(...)` computing the union of top-level keys per chunk and padding missing keys with `null` so PostgREST can never reject any bulk upsert with `PGRST102`.
3. [AppVersion.java](file:///c:/Users/ASUS/prestamos-app-1/desktop/src/main/java/com/cartera/infrastructure/version/AppVersion.java):
   - Bumped `CURRENT` to `"1.2.1"` while keeping `SHELL_VERSION = "1.2.0"` (zero installer rebuild required).
4. [DesktopFullMobileParityTest.java](file:///c:/Users/ASUS/prestamos-app-1/desktop/src/test/java/com/cartera/parity/DesktopFullMobileParityTest.java):
   - Added PGRST102 regression test asserting uniform keys across heterogeneous batch rows.
