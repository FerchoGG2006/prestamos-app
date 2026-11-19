# Bug Fix: `initialize-base-purge`

- **Date**: `2026-11-19`
- **Target Release**: `web 1.2.17 (2026-11-19)` (`CURRENT_VERSION_CODE = 19`)

## Changes Applied
1. **`mobile/src/infrastructure/storage/local-store.ts`** (`LocalStore.initialize()`):
   - Replaced the overly broad `cm.description?.includes('Base')` filter with `isLegacySuggestedBase(cm)`, which explicitly excludes `cm.category === 'CAPITAL_INJECTION'` and only matches genuine legacy v1 `'base sugerida'` notes/descriptions or `ADJUSTMENT` of `200000` mentioning `'base'`.
   - Added `await` when persisting `STORAGE_KEYS.CASH_MOVEMENTS`.
   - Added an idempotent audit-backed recovery block: if `audit-conciliacion-2026-11-19` (`entityId === 'csm-inj-conciliacion-2026-11-19'`) exists in `this.auditLogs`, no `DELETE`/`ANNUL` audit exists for it, and `csm-inj-conciliacion-2026-11-19` is absent from `this.cashMovements`, restores the `\$210.000` `CAPITAL_INJECTION` movement with description `'Conciliación de capital inicial en caja de ruta (confirmada 2026-11-19)'` and awaits storage persistence.
2. **`mobile/src/presentation/utils/appUpdates.ts`**:
   - Bumped `CURRENT_APP_VERSION` to `'1.2.17'`, `CURRENT_VERSION_CODE` to `19`, and `WEB_BUILD_LABEL` to `'web 1.2.17 (2026-11-19)'`.
3. **`mobile/src/infrastructure/storage/__tests__/backup-and-newloan.test.ts`**:
   - Added `testCapitalInjectionWithBaseWordSurvivesReloadAndAutoRecovers()` covering:
     - `CAPITAL_INJECTION` containing `'Base'` surviving a cold `initialize()` reload while legacy v1 `'Base sugerida'` `ADJUSTMENT` is purged.
     - Exact simulation of the `v1.2.16` iPhone state (`audit-conciliacion-2026-11-19` present, `csm-inj-conciliacion-2026-11-19` missing, `\$5.000` newly collected) healing to `\$215.000` Base / `\$6.101.000` Patrimonio on first cold reload and remaining idempotent on subsequent reloads.
4. **`C:\Users\ASUS\Downloads\cartera_respaldo_2026-11-19_CUADRADO_IPHONE.json`**:
   - Updated the `csm-inj-conciliacion-2026-11-19` description from `"Conciliación de Base inicial..."` to `"Conciliación de capital inicial..."` for consistency.
