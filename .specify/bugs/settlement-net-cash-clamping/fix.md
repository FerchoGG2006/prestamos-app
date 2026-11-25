# Bug Fix: Signed Daily Cash Reconciliation Clamped to $0 & Ticket Payment Count

- **Slug**: settlement-net-cash-clamping
- **Fixed**: 2026-11-21T08:32:00-05:00
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

Replaced the clamped `Math.max(0, ...)` display formula in `SettlementModal` (`Caja del Administrador`) and `CollectorCuadreModal` (`Cuadre del Cobrador`) with a shared pure domain helper (`calculateDailyCashReconciliation`) that preserves the signed daily net cash flow (Option B) while keeping `cashToHandOver` non-negative for physical cash handover reconciliation. Fixed the daily ticket payment counter to count only completed payments of the active session day via `filterSessionDayPayments`, aligned `WEB_BUILD_LABEL` and `version.json`, and published the updated Web build (`https://cartera-movil.expo.app`).

## Changes

| File | Change | Notes |
|------|--------|-------|
| `mobile/src/core/domain/calculator.ts` | modified | Added `calculateDailyCashReconciliation()` and `filterSessionDayPayments()` pure helpers. |
| `mobile/src/core/domain/__tests__/calculator.test.ts` | modified | Added Tests 7 and 8 pinning down negative deficit flow (`-$77.000` → `-$67.000`), positive surplus (`+$10.000`), and strict session-day payment filtering. |
| `mobile/src/presentation/components/SettlementModal.tsx` | modified | Displays signed net daily cash balance (`-$77.000` with warm amber deficit card when `< 0`, normal blue card when `>= 0`), keeps `cashToHandOver` for physical arqueo, shows today's payment count on ticket/hash, and includes signed balance in WhatsApp report. |
| `mobile/src/presentation/components/CollectorCuadreModal.tsx` | modified | Displays signed net daily cash balance with clear deficit labeling and breakdown row when `< 0`; uses session-day payment count in verification hash. |
| `mobile/src/infrastructure/storage/local-store.ts` | modified | Reuses `calculateDailyCashReconciliation()` in `closeDailySettlement()` as single source of truth. |
| `mobile/src/presentation/utils/appUpdates.ts` | modified | Updated `WEB_BUILD_LABEL` to `web 1.2.18 (2026-11-21)`. |
| `version.json` | modified | Aligned `latest_version` (`1.2.17`), `version_code` (`19`), `apk_url` (latest EAS build), and release notes so legacy APKs prompt cleanly without looping on the current APK. |

## Diff Highlights

- `calculateDailyCashReconciliation`: computes `signedNetCashFlow = collected - expenses - disbursed - recaudoRetirado`, `cashToHandOver = Math.max(0, signedNetCashFlow)`, `coveredByBaseDeficit`, and `isDeficitCoveredByBase = signedNetCashFlow < 0`.
- `SettlementModal` & `CollectorCuadreModal`: render `formatCOP(signedNetCashFlow)` and switch card styling + copy to `(=) BALANCE NETO DEL DÍA (CUBIERTO POR BASE)` whenever `isDeficitCoveredByBase` is true, showing both cash collected today and physical cash to hand over (`$0`).
- `SettlementModal` ticket: uses `sessionDayPayments.length` (`Cobro Pleno (N cobros hoy)`) instead of historical `payments.length`.

## Tests Added or Updated

- `mobile/src/core/domain/__tests__/calculator.test.ts` Test 7 — verifies `23000 - 100000 = -77000` (`cashToHandOver = 0`, `isDeficitCoveredByBase = true`), incremental `+$10.000` collection moving balance to `-67000`, and surplus `120000 - 5000 - 100000 - 5000 = +10000`.
- `mobile/src/core/domain/__tests__/calculator.test.ts` Test 8 — verifies `filterSessionDayPayments` includes only `COMPLETED` payments matching `todayStr` / active session and excludes prior days and `ANNULLED` payments.

## Local Verification

- `cd mobile; npm run test:finance` → PASS (8 core finance unit tests + 2 renewal integration tests + 127 renewal matrix scenarios / 1632 assertions + backup/new-loan regression).
- `cd mobile; npm run typecheck` → PASS (exit code 0, zero TypeScript errors).
- `cd mobile; npx expo export --platform web --clear` → PASS (`index-ac54fd4097dba581fea29600566df211.js`, verified Supabase URL, `web 1.2.18 (2026-11-21)`, and `BALANCE NETO DEL DÍA` in bundle).
- `cd mobile; npx eas-cli deploy --prod --non-interactive` → PASS (`https://cartera-movil.expo.app` live and verified serving `index-ac54fd4097dba581fea29600566df211.js`).

## Deviations from Assessment

None. All edits stayed strictly within the 7 files planned in `assessment.md`.

## Follow-ups

- Commit and push `version.json` to `github.com/FerchoGG2006/prestamos-app` `main` branch if remote GitHub raw hosting is used by older Android APKs to check `CLOUD_VERSION_URL`.
