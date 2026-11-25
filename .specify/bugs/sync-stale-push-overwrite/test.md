# Bug Verification Report: `sync-stale-push-overwrite`

- **Slug**: `sync-stale-push-overwrite`
- **Date**: `2026-11-24`
- **Verdict**: `verified`

## Verification Evidence

1. **Desktop Automated Tests (`.\gradlew.bat clean compileJava test`)**:
   - **Result**: `BUILD SUCCESSFUL` (all test suites passing, 0 failures).
   - `SyncAndKpiParityTest.cloudHydrationMatchesMobileCashFormulaFixesPaperworkRatePreservesLoanNumberAndSyncsSettlements`:
     - Confirmed idle `syncSilentlyInBackground()` performs `0` writes to Supabase (`pushedLoans`, `pushedRoutes`, `pushedCash` all empty).
     - Confirmed real local edits trigger selective push of ONLY modified/new rows, preserving `loan_number`, `fixed_due_date`, `initial_cash_base`, and never pushing `cm-mig-paper-*`.
   - `SyncAndKpiParityTest.renewedPreviousLoanInvariantForcesRenovadoAndPaidInstallmentsWhenRemoteLoanIsStaleActive`:
     - Confirmed stale remote `ACTIVE` loan referenced by `renewals.previous_loan_id` is forced to `RENOVADO` with all installments `PAGADA`.
   - `MigrationPaydayAndRenewalFixedDateTest`:
     - All 3 tests green (Weekly Friday migration entered Tuesday with 2 paid; Daily/Biweekly/Monthly anchored migration schedules; Renewal with `FECHA FIJA`).
2. **Mobile Automated Tests (`npm run typecheck && npm run test:finance`)**:
   - **Result**: `0` TypeScript errors; all finance suites green (`calculator.test.ts` 9/9, `renewal-metrics`, `renewal-matrix` 127 scenarios / 1632 assertions, `backup-and-newloan`, `paperwork-and-settlement`, `cloud-sync-safety` 6/6, `migration-and-renewal-fixed` all assertions including `RENEWED` relational merge invariant).
3. **Production Deliverables**:
   - Mobile Web **`web 1.2.24 (2026-11-24)`** deployed to `https://cartera-movil.expo.app` (Deployment URL `https://cartera-movil--76dfsewnhy.expo.app`).
   - Windows Desktop **`v1.1.4`** packaged cleanly in `desktop/dist/releases/1.1.4/` (`Instalador-SistemaCartera-v1.1.4.exe`, `SistemaCartera-v1.1.4-Windows-x64.zip`, `SistemaCartera\SistemaCartera.exe`).
4. **Live Supabase Check (`off-fbv-001`)**:
   - Legacy Nov 21 Desktop process stopped; iPhone self-healed all 3 previously reverted loans; `0` anomalies detected.
