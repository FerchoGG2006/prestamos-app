# Bug Assessment: Signed Daily Cash Reconciliation Clamped to $0 & Ticket Payment Count

- **Slug**: settlement-net-cash-clamping
- **Created**: 2026-11-21T08:24:00-05:00
- **Source**: pasted text + user screenshots (`Caja del Administrador`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> En la vista de administrador, `(=) EFECTIVO NETO A RENDIR (CAJA OFICINA)` aparece en `$0` aunque se registren nuevos cobros en efectivo (por ejemplo `$10.000` adicionales sobre `$23.000` cuando hay `$100.000` en desembolsos del día). En la pantalla del cobrador los `$10.000` sí suben inmediatamente, pero en el cuadro principal de `Caja del Administrador` permanece en `$0`. Adicionalmente, el ticket diario muestra `(26 cuotas cobradas)` contando pagos históricos de toda la ruta en vez de los de la jornada, y `version.json` / `WEB_BUILD_LABEL` quedaron desalineados respecto al último lanzamiento.

## Symptom

When daily loan/renewal disbursements exceed cash collected on the same session date (e.g., `$23.000` collected vs. `$100.000` disbursed), `SettlementModal` (`Caja del Administrador`) and `CollectorCuadreModal` (`Cuadre del Cobrador`) clamp `netCashExpected` with `Math.max(0, ...)` to `$0`. Collecting additional cash payments (e.g. `+$10.000` → `$33.000`) visibly increases `COBRADO EFECTIVO`, but the primary net balance card stays frozen at `$0` instead of showing the real signed daily cash balance (`-$77.000` → `-$67.000`) with clear labeling that the deficit is covered by the office base. Separately, the daily ticket header renders `payments.length` (all historical route payments) instead of only today's completed payments, and `version.json` still references the superseded `v1.2.2` APK (`version_code: 6`).

## Reproduction

1. Open an active route session with `$100.000` in daily loan/renewal disbursements and `$23.000` in cash collections.
2. Open `Caja del Administrador` (`SettlementModal`) or `Cuadre` (`CollectorCuadreModal`).
3. Observe `(=) EFECTIVO NETO A RENDIR (CAJA OFICINA)` showing `$0` (hiding the real `-$77.000` net flow).
4. Record another `$10.000` cash collection and re-open `Caja del Administrador`.
5. Observe `COBRADO EFECTIVO` updates to `$33.000`, while `(=) EFECTIVO NETO A RENDIR (CAJA OFICINA)` remains frozen at `$0` instead of advancing to `-$67.000`.
6. Scroll to `TICKET DE CIERRE DIARIO Y ARQUEO` and observe `Cobro Pleno (26 cuotas cobradas)` reflecting cumulative historical route payments instead of only today's session payments.

## Suspected Code Paths

- `mobile/src/presentation/components/SettlementModal.tsx:85-92` — `Math.max(0, collectedCash - expensesToday - disbursedToday - recaudoRetiradoToday)` hides negative daily net cash flow behind `$0`.
- `mobile/src/presentation/components/SettlementModal.tsx:133,1070` — uses `payments.length` (all historical `routeScopedPayments`) instead of filtering completed payments for the active session day.
- `mobile/src/presentation/components/CollectorCuadreModal.tsx:86-90,117,570-655` — mirrors the same `Math.max(0, ...)` clamping and `payments.length` usage in the verification hash.
- `mobile/src/infrastructure/storage/local-store.ts:2951-2954` — duplicates the daily net cash expectation formula inside `closeDailySettlement()`.
- `mobile/src/presentation/utils/appUpdates.ts:6` & `version.json:1-10` — `WEB_BUILD_LABEL` and `version.json` still point to older release metadata (`web 1.2.17 (2026-11-19)` / `v1.2.2` APK URL).

## Root Cause Hypothesis

Confidence: **high**. Both settlement modals compute only a single clamped scalar `Math.max(0, collectedCash - expensesToday - disbursedToday - recaudoRetiradoToday)` and use it simultaneously for both (a) the physical handover expectation (which cannot be negative) and (b) the primary daily cash flow summary card (which *should* display the real signed net flow so every new payment visibly moves the balance, e.g. `-$77.000` → `-$67.000`, and explain when the deficit is covered by the office base). Furthermore, `App.tsx` passes all `routeScopedPayments` to both modals, and the modals call `payments.length` without filtering to `todayStr` / active session.

## Proposed Remediation

**Preferred** (User-confirmed Option B):
1. Add two pure, unit-tested helpers in `mobile/src/core/domain/calculator.ts`:
   - `calculateDailyCashReconciliation({ collectedCash, expensesToday, disbursedToday, recaudoRetiradoToday })` returning `{ signedNetCashFlow, cashToHandOver, coveredByBaseDeficit, isDeficitCoveredByBase }`.
   - `filterSessionDayPayments(payments, todayStr, session)` matching the exact day/session filter used by `localStore.getDailyRouteMetrics`.
2. Update `SettlementModal.tsx` and `CollectorCuadreModal.tsx`:
   - Display `signedNetCashFlow` in the primary net balance card so any collection immediately moves the number (e.g. `-$77.000` → `-$67.000` → `+$20.000`).
   - When `isDeficitCoveredByBase` is true (`signedNetCashFlow < 0`), style the card with a warm amber/red accent, label it `(=) BALANCE NETO DEL DÍA (CUBIERTO POR BASE)`, and display a clear plain-Spanish subtitle stating today's cash collected and that physical cash to hand over is `$0`.
   - Keep `cashToHandOver` (`Math.max(0, signedNetCashFlow)`) for the physical cash handover reconciliation (`Arqueo Físico`) and `closeDailySettlement()` so closing a deficit day never demands negative cash handover.
   - Include signed daily net cash balance in the WhatsApp/copied closure reports and Collector formula breakdown when negative.
   - Replace `payments.length` with `dayPayments.length` (via `filterSessionDayPayments`) in the ticket header and verification hash.
3. Reuse `calculateDailyCashReconciliation` in `local-store.ts` (`closeDailySettlement`) to keep one single source of truth.
4. Update `WEB_BUILD_LABEL` in `mobile/src/presentation/utils/appUpdates.ts` to `'web 1.2.18 (2026-11-21)'` and align `version.json` to the current compiled APK (`latest_version: "1.2.17"`, `version_code: 19`, latest EAS APK URL) so older Android APKs prompt cleanly without causing an update loop on the current APK.

**Alternatives**:
- Option A (exclude disbursements from `EFECTIVO NETO A RENDIR`): rejected by user because collectors in this operation can disburse from daily route collections; Option B preserves exact route cash accounting while eliminating the misleading `$0` freeze.

**Files likely to change**:
- `mobile/src/core/domain/calculator.ts`
- `mobile/src/core/domain/__tests__/calculator.test.ts`
- `mobile/src/presentation/components/SettlementModal.tsx`
- `mobile/src/presentation/components/CollectorCuadreModal.tsx`
- `mobile/src/infrastructure/storage/local-store.ts`
- `mobile/src/presentation/utils/appUpdates.ts`
- `version.json`

**Tests to add or update**:
- Unit tests in `mobile/src/core/domain/__tests__/calculator.test.ts` for `calculateDailyCashReconciliation` (deficit `23000 - 100000 = -77000`, incremental collection `+10000 -> -67000`, positive surplus `120000 - 100000 = +20000`, expenses/advances deductions) and `filterSessionDayPayments` (filters out prior days and cancelled payments).

## Risks & Considerations

- `formatCOP(-77000)` in `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' })` must be verified under Node/Web/React Native to confirm clean minus sign rendering.
- `version.json` must NOT declare a `version_code` higher than the compiled APK (`19`), otherwise phones running the current APK would hit a repeated update prompt.
- Zero changes to `local-store.ts` renewal/base formulas (`totalRenewalCapitalOut`, `cashAvailableInHand`, `totalAdministrativeCapital`) or Desktop SQLite schema.

## Open Questions

None — remediation scope explicitly confirmed by user (`Opción B` + ticket count fix + version metadata alignment + web publish).
