# Feature Specification: Paperwork Inside Physical Base (Excluding Administrative) & Settlement Opening Base (Option B)

**Feature Branch**: `008-paperwork-base-and-settlement-opening-base`
**Created**: 2026-11-22
**Status**: Approved by user

## Business Goals & Invariants

1. **Paperwork (`Papelería`) reflected in physical Base without inflating Administrative Capital (`Patrimonio operativo`)**:
   - When an office has `paperworkFeeEnabled = true`:
     - Example 1A (New Loan): Opening Base = `$380.000`. Loan principal = `$300.000` at 20% (`$360.000` agreed). Paperwork (5%) = `$15.000`. Collector physically hands over `$285.000`.
       - `Cartera en calle` = `$360.000`.
       - `Efectivo base` (operational cash base) = `$80.000` (`$380.000 - $300.000`).
       - `Papelería` (available paperwork balance in box) = `$15.000`.
       - `Base en oficina` (total physical + digital cash in box) = `$95.000` (`Efectivo base $80.000 + Papelería $15.000 + Transf/Nequi $0`).
       - `Patrimonio operativo (Administrativo)` = **`$440.000`** (`Cartera $360.000 + Efectivo base $80.000 + Transf/Nequi $0`) — **paperwork NEVER increases Administrative Capital**.
     - Example 1B (Renewal): Opening Base = `$380.000`, prior balance = `$100.000` (`Admin = $480.000`). New principal = `$300.000` at 20% (`$360.000` agreed), paperwork = `$15.000`. Collector physically hands over `$185.000`.
       - `Cartera en calle` = `$360.000`.
       - `Efectivo base` = `$180.000` (`$380.000 - ($300.000 - $100.000)`).
       - `Papelería` = `$15.000`.
       - `Base en oficina` (total in box) = `$195.000` (`$380.000 - $185.000`).
       - `Patrimonio operativo (Administrativo)` = **`$540.000`** (`$360.000 + $180.000`, increasing ONLY by `$60.000` new interest — NEVER by `$15.000` paperwork).
     - Example 1C (Paperwork Withdrawal via `Mis Recaudos → Papelería → Retirar Papelería`):
       - Withdrawing `$15.000` reduces `Papelería` from `$15.000` to `$0` and reduces `Base en oficina` from `$95.000` → `$80.000` (or `$195.000` → `$180.000`).
       - `Efectivo base` and `Patrimonio operativo (Administrativo)` remain **strictly unchanged**.
     - Example 1D (Office with `paperworkFeeEnabled = false`):
       - No paperwork fee is charged; `Papelería` breakdown row is hidden when `paperworkFeeEnabled = false` and `paperworkAvailableBalance === 0`.
     - Migrated legacy physical cards (`Migrado de cartulina física`) MUST NOT invent paperwork cash in the current box.

2. **Daily Settlement (`Liquidación`) with Option B — `Cobrado hoy` + `Base de inicio de ruta`**:
   - Keep `Cobrado hoy` visibly separate so owners know pure daily collections (e.g. `$175.000`).
   - Add **`Base de inicio (ruta)`** (editable by Administrator per route/day, read-only for Collector so the collector cannot tamper with it; e.g. `$50.000`).
   - Show **`Cobrado hoy + Base`** (e.g. `$175.000 + $50.000 = $225.000`).
   - Compute net cash to hand over to office:
     - Mobile: `(Cobrado Efectivo Hoy + Base de Inicio) - Gastos Hoy - Desembolsos Netos Entregados Hoy - Avances Hoy` (preserving signed negative balance display when disbursements exceed `Cobrado + Base`).
     - Desktop: `(Cobrado Efectivo Hoy + Base de Inicio) - Gastos Operativos Ruta` (preserving full backward compatibility when `openingRouteBase = 0`).
   - Persist `openingRouteBase` and `collectedPlusBase` in settlement records, receipts, and WhatsApp closure reports, and sync per-route daily opening base cleanly inside `offices.settings` JSONB.

## Non-Regression Constraints

- All 127+ existing mobile renewal matrix scenarios (`RENEWAL_MATRIX`), `renewal-metrics.test.ts`, and `backup-and-newloan.test.ts` MUST continue passing without modification to existing invariants.
- All existing Desktop JUnit tests (`DesktopParityTest`, `DesktopFinancialJourneyTest`, `RenewLoanUseCaseTest`, `AuditFixesTest`, `OfficeLicensingServiceTest`, `DesktopCloudSyncServiceTest`, etc.) MUST remain 100% green.
- Use `BigDecimal` exclusively on Desktop.
