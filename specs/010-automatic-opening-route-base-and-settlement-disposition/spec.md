# Feature Specification: Automatic Opening Route Base & Flexible Settlement Cash Disposition

**Feature Branch**: `010-automatic-opening-route-base-and-settlement-disposition`
**Created**: 2026-11-23
**Status**: Approved by user

## Business Rules

1. **Automatic Opening Route Base (`Base de inicio` — strictly operational cash base, excluding paperwork)**:
   - Unless an Administrator explicitly sets a manual override for a specific route and date, the day's `openingRouteBase` is calculated automatically from the route's real starting operational cash balance (before today's collections, loans, expenses, and midday withdrawals, plus any capital injections made today).
   - Formula (Mobile):
     `autoOpeningRouteBase = max(0, cashAvailableInHand - collectedCashToday + capitalOutToday + expensesToday + recaudoRetiradoToday)`
   - **Strict Paperwork Separation**: Unwithdrawn paperwork (`paperworkAvailableBalance`) is NEVER included in `openingRouteBase`; it remains tracked separately in `Base en oficina -> Papelería` and `Mis Recaudos -> Papelería`.
   - Collectors never start at `$0` when their route carries a real operational cash balance (whether from initial route setup, digitized cards, prior-day carryover, or capital injection).

2. **Flexible Settlement Cash Disposition (Supports Daily Withdrawal, Next-Day Rollover, and Saturday Weekly Sweep)**:
   - When an Administrator closes a daily settlement (`SettlementModal` on Mobile, `SettlementManagementView` on Desktop), two clear options are offered:
     1. **Dejar en la ruta (base para mañana)** *(default)*: No office withdrawal is recorded; tomorrow's `openingRouteBase` automatically inherits the remaining operational `Efectivo base` of the route (supporting next-day rollover and Mon–Sat weekly accumulation).
     2. **Retirar a oficina (todo o parcial)**: Admin specifies an amount (up to available operational `Efectivo base`, with quick presets like `Retirar todo`, `Dejar $50.000`, `Dejar $100.000`). Upon closing, the system records an audited `RECAUDO_OFICINA` cash outflow stamped on the closed session date, reducing tomorrow's automatic `openingRouteBase` by that exact withdrawn amount.
   - Collectors cannot withdraw to office; their cuadre shows the automatic `openingRouteBase` in read-only mode.

## Non-Regression Constraints
- All existing Mobile financial tests (127+ renewal matrix scenarios, calculator tests, backup/newloan, Spec 008) must pass without regression.
- All 74 existing Desktop JUnit tests must remain green; all Desktop money math uses `BigDecimal`.
