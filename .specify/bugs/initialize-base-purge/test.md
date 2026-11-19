# Bug Verification: `initialize-base-purge`

- **Date**: `2026-11-19`
- **Verdict**: `verified`

## Checks Executed
1. **TypeScript typecheck (`mobile/` -> `npm run typecheck`)**:
   - Exit code `0` (`tsc --noEmit` clean).
2. **Financial & Reload Regression Suite (`mobile/` -> `npm run test:finance`)**:
   - Exit code `0`.
   - Core calculator suite (Tests 1–6): PASS.
   - `renewal-metrics.test.ts`: PASS.
   - `renewal-matrix.test.ts`: `RENEWAL_MATRIX PASS scenarios=127 assertions=1632`.
   - `backup-and-newloan.test.ts`: PASS, including:
     - `CAPITAL_INJECTION` containing `'Base'` survives cold `localStore.initialize()` reload while legacy v1 `'Base sugerida'` (`ADJUSTMENT` `\$200.000`) is purged.
     - Exact `v1.2.16` bug state (`audit-conciliacion-2026-11-19` present, `csm-inj-conciliacion-2026-11-19` missing, `\$5.000` cash collection recorded) auto-recovers to `\$215.000` Base and `\$6.101.000` Patrimonio on first reload, and stays idempotent on second reload.
3. **End-to-end simulation on actual `cartera_respaldo_2026-11-19_CUADRADO_IPHONE.json`**:
   - After restore: `admin: 6101000`, `cartera: 5891000`, `base: 210000`, `cobradoHoy: 18000`, `mora: 235000`.
   - After recording `\$5.000` cash payment + stripping `csm-inj-conciliacion-2026-11-19` (simulating `v1.2.16` reload) + cold `initialize()` under `v1.2.17`:
     - `admin: 6101000`, `cartera: 5886000`, `base: 215000`, `cobradoHoy: 23000`, `mora: 230000`.
   - Second cold reload: identical (`admin: 6101000`, `base: 215000`), confirming idempotency.
