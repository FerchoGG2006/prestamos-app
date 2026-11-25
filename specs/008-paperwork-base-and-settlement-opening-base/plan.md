# Implementation Plan: Paperwork Inside Physical Base & Settlement Opening Base (Option B)

## Architecture & File Changes

### 1. Mobile Domain & Calculator (`mobile/src/core/`)
- `mobile/src/core/domain/types.ts`:
  - Add `dailyOpeningBaseByRouteDate?: Record<string, number>` to `OfficeCompanyConfig`.
  - Add `openingRouteBase?: number` to `CollectionSession`.
  - Add `openingRouteBase?: number` and `collectedPlusBase?: number` to `DailySettlement`.
  - Add `paperworkAvailableBalance`, `paperworkGeneratedToday`, `totalOfficeBaseWithPaperwork`, and `openingRouteBase` to `DailyRouteMetrics`.
- `mobile/src/core/domain/calculator.ts`:
  - Extend `calculateDailyCashReconciliation` with optional `openingRouteBase = 0`, returning `openingRouteBase`, `collectedPlusBase`, `signedNetCashFlow`, `cashToHandOver`, `coveredByBaseDeficit`, `isDeficitCoveredByBase`.

### 2. Mobile Storage & Cloud Sync (`mobile/src/infrastructure/`)
- `mobile/src/infrastructure/storage/local-store.ts`:
  - Add `getPaperworkFeeForLoan(loan)` (excludes migrated legacy cards and cancelled/renewal loans; reads actual retained fee `Math.max(0, loan.principal - disbursementMovement.amount)` for immutability even if config changes later).
  - Add `getPaperworkAvailableBalance(routeId?)` and align `getPaperworkHistory(routeId?)` to the exact same calculation so Hero Card and `RecaudoModal` match to the exact peso.
  - Add `getSessionOpeningBase(todayStr, routeId?)` and `setSessionOpeningBase(amount, todayStr, routeId?)`.
  - Populate `paperworkAvailableBalance`, `paperworkGeneratedToday`, `totalOfficeBaseWithPaperwork`, and `openingRouteBase` inside `getDailyRouteMetrics()` while leaving `cashAvailableInHand` and `totalAdministrativeCapital` strictly intact.
  - Update `closeDailySettlement()` to accept optional `openingRouteBase` (defaulting to `getSessionOpeningBase`) and persist `openingRouteBase` & `collectedPlusBase`.
- `mobile/src/infrastructure/sync/supabase-client.ts`:
  - Include `dailyOpeningBaseByRouteDate` in `offices.settings` JSONB upsert.

### 3. Mobile Presentation (`mobile/src/presentation/`)
- `mobile/src/presentation/views/collector/TodayCollectionsView.tsx`:
  - Under `Base en oficina`, display `totalOfficeBaseWithPaperwork` (`Efectivo base + Papelería + Transf/Nequi`) with breakdown rows `Efectivo base`, `Papelería` (when enabled or `> 0`), and `Transf / Nequi`, while keeping `Patrimonio operativo` strictly equal to `metrics.totalAdministrativeCapital`.
- `mobile/src/presentation/components/RecaudoModal.tsx`:
  - Bind `paperworkAvailableBalance` directly to `localStore.getPaperworkAvailableBalance(routeId)`.
- `mobile/src/presentation/components/SettlementModal.tsx`:
  - Add editable `(+) BASE DE INICIO (RUTA)` input (saving immediately via `localStore.setSessionOpeningBase`), prominent `(=) COBRADO HOY + BASE` summary card, paperwork note when `paperworkGeneratedToday > 0`, and include both in ticket, sealed receipt, and WhatsApp report.
- `mobile/src/presentation/components/CollectorCuadreModal.tsx`:
  - Add read-only `(+) BASE DE INICIO (RUTA)` card, `(=) COBRADO HOY + BASE` card, formula breakdown row, sealed receipt, and WhatsApp report lines.
- `mobile/src/presentation/utils/appUpdates.ts`:
  - Bump `WEB_BUILD_LABEL` to `'web 1.2.20 (2026-11-22)'`.

### 4. Desktop Financial Parity (`desktop/src/main/java/`)
- `desktop/src/main/java/com/cartera/collections/application/TodayCollectionsService.java`:
  - Add `getPaperworkAvailableBalance(String routeFilter)` (using `BigDecimal` exclusively) computing exact retained paperwork in box minus `RETIRO_PAPELERIA`, without altering `DailyMetrics` canonical record or `totalAdministrativeCapital`.
- `desktop/src/main/java/com/cartera/settlement/application/SettlementUseCase.java`:
  - Add backward-compatible overloads `getOrCreateDaySummary(collectorId, date, BigDecimal openingRouteBase)` and `closeSettlement(..., BigDecimal openingRouteBase, ...)` so `collectedPlusBase = collectedInCash + openingRouteBase` and `netExpectedCash = max(0, collectedPlusBase - routeExpenses)`, preserving 100% compatibility when `openingRouteBase == 0`.
- `desktop/src/main/java/com/cartera/ui/views/SettlementManagementView.java`:
  - Add `(+) Base de Inicio (Ruta)` input field and `Cobrado hoy + Base` metric card in the settlement view and WhatsApp report.
- `desktop/src/main/java/com/cartera/ui/views/DashboardView.java`:
  - Show `Papelería disponible` cleanly beneath `BASE EN CAJA` when `> 0` without altering `PATRIMONIO DE RUTA`.

### 5. Comprehensive Financial Regression Tests
- `mobile/src/core/domain/__tests__/calculator.test.ts`: Tests for `openingRouteBase` + `collectedPlusBase` (Cases B1 `$175k + $50k = $225k`, B2 `$175k + $50k - $95k - $10k = $120k`, deficit case `$23k + $50k - $95k = -$22k`).
- `mobile/src/infrastructure/storage/__tests__/paperwork-and-settlement.test.ts` (wired into `mobile/scripts/test-finance.cjs`):
  - Full E2E tests of Case 1A (`$380k` base → `$300k` loan w/ `$15k` paperwork → `Base en oficina = $95k`, `Efectivo base = $80k`, `Papelería = $15k`, `Admin = $440k`), Case 1B (Renewal `$380k` base + `$100k` prev balance → `$300k` renewal w/ `$15k` paperwork → `Base en oficina = $195k`, `Efectivo base = $180k`, `Papelería = $15k`, `Admin = $540k`), Case 1C (`Retirar Papelería $15k` → `Papelería = $0`, `Base en oficina = $80k`/`$180k`, `Admin` unchanged!), Case 1D (paperwork disabled), migrated-card non-contamination, and Case 2 (`openingRouteBase = $50k` + `$175k` collected → `collectedPlusBase = $225k` → `closeDailySettlement` exact match!).
- `desktop/src/test/java/com/cartera/payments/application/AuditFixesTest.java` (or new `SettlementOpeningBaseTest.java`):
  - Verifies Desktop `SettlementUseCase` with `openingRouteBase = 50000` (`$175k + $50k = $225k`, and with `$10k` expense = `$215k`) and `BigDecimal` precision.
