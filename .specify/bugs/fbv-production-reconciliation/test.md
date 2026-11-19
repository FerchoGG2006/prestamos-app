# Bug Verification: Descuadre FBV en desembolsos nuevos y respaldo incompleto de rutas/base

- **Slug**: fbv-production-reconciliation
- **Date**: 2026-11-19
- **Verdict**: verified (automated suite passed; live device transfer pending user execution)

## Commands Run

1. `cd mobile && npm run typecheck` — **EXIT 0** (0 TypeScript errors).
2. `cd mobile && npm run test:finance` — **EXIT 0**:
   - 6 pruebas financieras base (`calculator.test.ts`): PASS
   - 2 pruebas de regresión de renovación (`renewal-metrics.test.ts`): PASS
   - `RENEWAL_MATRIX PASS scenarios=127 assertions=1632` (`renewal-matrix.test.ts`): PASS
   - `backup-and-newloan.test.ts`: PASS
     - Round-trip completo de `exportFullBackupJSON()` / `restoreFullBackupJSON()` preservando `routes` (`initialCashBase = 210000`), `users`, `activeSession` y saldos exactos (`Cartera = 5.916.000`, `Base = 210.000`, `Admin = 6.126.000`).
     - Cobros posteriores (`$18.000` + `$100.000`) + desembolso nuevo (`$250.000` -> `$300.000`): `Base = 78.000`, `Cartera = 6.098.000`, `Admin = 6.176.000`.
     - Escenario exacto de `fbv-production-reconciliation`: `17-11` (`Admin 5.851.000`, `Cartera 5.626.000`, `Base 225.000`) -> `18-11` (`+$45.000` cobro, `-$200.000` nuevo crédito para `$230.000`) -> `Admin 5.881.000`, `Cartera 5.811.000`, `Base 70.000` (eliminado el exceso de `$74.000`) -> `19-11` (`+$18.000` cobro) -> `Admin 5.881.000`, `Cartera 5.793.000`, `Base 88.000` (invariante tras invertir `backup.loans`).
