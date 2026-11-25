# Implementation Plan: Automatic Opening Route Base & Flexible Settlement Cash Disposition

## Mobile
1. `mobile/src/core/domain/types.ts`:
   - Add `autoOpeningRouteBase?: number` to `DailyRouteMetrics`.
   - Add `withdrawnToOffice?: number` and `closingDisposition?: 'KEEP_IN_ROUTE' | 'WITHDRAW_TO_OFFICE'` to `DailySettlement`.
2. `mobile/src/infrastructure/storage/local-store.ts`:
   - Track `regularCapitalOutToday` + `renewalCapitalOutToday` inside `getDailyRouteMetrics`.
   - Compute `autoOpeningRouteBase = Math.max(0, cashAvailableInHand - collectedCashToday + capitalOutToday + expensesToday + recaudoRetiradoToday)`.
   - Split `getManualSessionOpeningBase(todayStr, routeId?)` (`number | null`) and `clearSessionOpeningBaseOverride(todayStr, routeId?)`.
   - Use `manualOpeningBase ?? autoOpeningRouteBase` in `getDailyRouteMetrics` and `getSessionOpeningBase`.
   - Extend `closeDailySettlement` with optional `withdrawToOfficeAmount?: number`: reconcile first, then record audited `RECAUDO_OFICINA` movement on `session.date` capped to `Math.max(0, metrics.cashAvailableInHand)`, then open next day.
3. `mobile/src/presentation/components/SettlementModal.tsx`:
   - Display automatic `Base de inicio` with `"Automática"` / `"Restaurar automática"` affordance.
   - Add 2-option closing disposition selector (`Dejar en ruta (base mañana)` vs `Retirar a oficina`) with quick presets and live preview of tomorrow's automatic base.
   - Reflect `Retirado a oficina` and `Base para mañana` in sealed receipt and WhatsApp report.
4. `mobile/src/presentation/components/CollectorCuadreModal.tsx`:
   - Update `(+) BASE DE INICIO` subtitle to `"Efectivo base al iniciar el día"`.
5. `mobile/src/presentation/utils/appUpdates.ts`:
   - Bump `WEB_BUILD_LABEL` to `web 1.2.22 (2026-11-23)`.
6. `mobile/src/infrastructure/storage/__tests__/paperwork-and-settlement.test.ts`:
   - Add automated tests for automatic Day 1 base, Day 2 rollover excluding paperwork, Mon–Sat accumulation + Saturday withdrawal, daily full withdrawal + next-day injection.

## Desktop
1. `desktop/src/main/java/com/cartera/settlement/application/SettlementUseCase.java`:
   - Add `computeAutomaticOpeningRouteBase(String collectorId, LocalDate date)` (`BigDecimal`, excludes `RETIRO_PAPELERIA` & `DESCUENTO_NOMINA_DESCUADRE`).
   - Add backward-compatible `closeSettlement(..., BigDecimal withdrawToOfficeAmount)` overload recording audited `EGRESO` / `RECAUDO_OFICINA` movement on `sessionDate`.
2. `desktop/src/main/java/com/cartera/ui/views/SettlementManagementView.java`:
   - Auto-populate `txtOpeningBase` from `computeAutomaticOpeningRouteBase` when switching collector/date.
   - Add 2-option closing disposition toggle (`Dejar en la ruta (base para mañana)` vs `Retirar a oficina central`) with amount field, quick button, and live preview of tomorrow's base.
3. `desktop/src/test/java/com/cartera/settlement/application/SettlementOpeningBaseTest.java`:
   - Add JUnit tests verifying automatic opening base rollover, paperwork exclusion, and closing withdrawal reducing next-day base.
