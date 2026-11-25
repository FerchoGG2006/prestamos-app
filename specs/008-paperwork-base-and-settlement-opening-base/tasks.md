# Tasks: Paperwork Inside Physical Base & Settlement Opening Base (Option B)

- [x] T001 Extend mobile domain types (`types.ts`) and pure cash reconciliation helper (`calculator.ts`) for paperwork balance and `openingRouteBase` / `collectedPlusBase`.
- [x] T002 Implement `getPaperworkAvailableBalance`, consistent `getPaperworkHistory`, `getSessionOpeningBase` / `setSessionOpeningBase`, `getDailyRouteMetrics`, and `closeDailySettlement` updates in `mobile/src/infrastructure/storage/local-store.ts` and `supabase-client.ts`.
- [x] T003 Update mobile UI: `TodayCollectionsView.tsx` (Base en oficina breakdown with Papelería without inflating Administrativo), `RecaudoModal.tsx`, `SettlementModal.tsx`, `CollectorCuadreModal.tsx`, and `appUpdates.ts` (`web 1.2.20`).
- [x] T004 Add comprehensive mobile financial tests in `calculator.test.ts` and new `paperwork-and-settlement.test.ts` wired into `mobile/scripts/test-finance.cjs`, and verify `npm run test:finance` + `npm run typecheck`.
- [x] T005 Implement Desktop parity (`TodayCollectionsService.java`, `SettlementUseCase.java`, `SettlementManagementView.java`, `DashboardView.java`) using `BigDecimal` with full backward compatibility.
- [x] T006 Add Desktop JUnit financial tests (`SettlementOpeningBaseTest.java`) and verify `.\gradlew.bat compileJava test installDist`.
- [x] T007 Export & deploy live Web (`https://cartera-movil.expo.app`), publish Android OTA (`preview` with verified Supabase env), package fresh Windows `.exe`/`.zip`, and relaunch Desktop cleanly.
