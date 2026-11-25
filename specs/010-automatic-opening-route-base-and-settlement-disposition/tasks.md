# Tasks: Automatic Opening Route Base & Flexible Settlement Cash Disposition

- [x] T001 Extend Mobile domain types (`types.ts`) and implement automatic `autoOpeningRouteBase` + `withdrawToOfficeAmount` closing disposition in `local-store.ts`.
- [x] T002 Update Mobile UI (`SettlementModal.tsx`, `CollectorCuadreModal.tsx`, `appUpdates.ts` `web 1.2.22`).
- [x] T003 Add Mobile financial tests covering Day 1 auto base, Day 2 rollover excluding paperwork, weekly Saturday sweep, and daily withdrawal + injection; verify `npm run test:finance` and `npm run typecheck`.
- [x] T004 Implement Desktop parity (`SettlementUseCase.java`, `SettlementManagementView.java`) and JUnit tests (`SettlementOpeningBaseTest.java`); verify `.\gradlew.bat compileJava test installDist`.
- [x] T005 Deploy Web (`https://cartera-movil.expo.app`), publish Android OTA (`preview`), package Windows `.exe`/`.zip` (`dist/release-20261123`), and relaunch Desktop cleanly.
