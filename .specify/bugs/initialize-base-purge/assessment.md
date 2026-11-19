# Bug Assessment: `initialize-base-purge`

- **Slug**: `initialize-base-purge`
- **Date**: `2026-11-19`
- **Severity**: Critical (silent cash/equity drop on page reload / Force Update)

## Symptom
After restoring `cartera_respaldo_2026-11-19_CUADRADO_IPHONE.json` on iPhone (`web 1.2.15`, Patrimonio `\$6.101.000`, Cartera `\$5.891.000`, Base `\$210.000`), collecting `\$5.000` in cash, and tapping **"Forzar Actualización"** to load `web 1.2.16`:
- Patrimonio operativo dropped from `\$6.101.000` to **`\$5.891.000`** (`-\$210.000`).
- Base en oficina dropped from `\$215.000` (`\$210.000 + \$5.000`) to **`\$5.000`** (`-\$210.000`).
- Cartera en calle (`\$5.886.000`), Cobrado hoy (`\$23.000`), and En mora (`\$230.000`) were intact.

## Root Cause
In `mobile/src/infrastructure/storage/local-store.ts` lines 452–466 inside `LocalStore.initialize()`:
```ts
const legacyBaseMovs = this.cashMovements.filter((cm: any) =>
  cm.description?.includes('Base') ||
  cm.notes?.includes('Base') ||
  (cm.category === 'ADJUSTMENT' && cm.amount === 200000) ||
  (cm.type === 'INCOME' && cm.amount === 200000 && cm.description?.toLowerCase().includes('base'))
);
```
This legacy v1→v2 migration filter intended to remove obsolete `'Base sugerida'` (`\$200.000`) mock entries, but matched **any** `CashMovement` whose `description` contained the substring `'Base'`—regardless of `category` or `amount`.
- `restoreFullBackupJSON()` saved `csm-inj-conciliacion-2026-11-19` (`category: 'CAPITAL_INJECTION'`, `amount: 210000`, `description: 'Conciliación de Base inicial en caja de ruta (confirmada 2026-11-19)'`) without calling `initialize()`.
- When the user later reloaded via **"Forzar Actualización"**, `initialize()` ran, matched `'Base'` in `description`, and permanently deleted `csm-inj-conciliacion-2026-11-19` from `this.cashMovements` and `localStorage`.
- Any user-created `CAPITAL_INJECTION` whose description contained `'Base'` would suffer the same silent deletion on reload.
- Crucially, `auditLogs` was untouched, preserving `audit-conciliacion-2026-11-19` (`entityId: 'csm-inj-conciliacion-2026-11-19'`) on the affected device alongside the user's subsequent `\$5.000` payment.

## Remediation Plan
1. Restrict the v1→v2 cleanup predicate in `LocalStore.initialize()` so it **never** deletes `category === 'CAPITAL_INJECTION'` and only targets genuine legacy `'base sugerida'` / `ADJUSTMENT` `\$200.000` records.
2. Add an idempotent, audit-backed auto-recovery guard in `LocalStore.initialize()` that restores `csm-inj-conciliacion-2026-11-19` (`\$210.000`) when `audit-conciliacion-2026-11-19` is present in `this.auditLogs`, no reversal/deletion audit exists, and the movement is missing from `this.cashMovements`—allowing affected devices to heal in one reload without re-importing backups or losing newly collected payments.
3. Add cold-reload persistence and auto-recovery regression tests in `mobile/src/infrastructure/storage/__tests__/backup-and-newloan.test.ts`.
4. Release and deploy `web 1.2.17 (2026-11-19)` to Expo Hosting (`https://cartera-movil.expo.app`).
