# Bug Verification Report: `mobile-ui-overflow-and-hero-typography`

- **Slug**: `mobile-ui-overflow-and-hero-typography`
- **Date**: `2026-11-24`
- **Verdict**: `verified`

## Verification Evidence

1. **TypeScript & Finance Test Suite (`npm run typecheck && npm run test:finance`)**:
   - `tsc --noEmit`: `0` errors.
   - `test:finance`: 100% passing (`calculator.test.ts` 9/9, `renewal-metrics`, `RENEWAL_MATRIX` 127 scenarios / 1632 assertions, `backup-and-newloan`, `paperwork-and-settlement`, `cloud-sync-safety` 6/6, `migration-and-renewal-fixed` all assertions).
2. **Production Web Build & Deployment**:
   - Exported static web bundle `_expo/static/js/web/index-b127990d9521d0665a7857b1c97fbc36.js`.
   - Promoted **`web 1.2.25 (2026-11-24)`** to production at `https://cartera-movil.expo.app` (Deployment URL `https://cartera-movil--wcmrfqv8zn.expo.app`).
3. **Issues Confirmed Addressed**:
   - Modal header wrapping & `overflow: 'hidden'` across `NewLoanModal` (including `"Día de pago"` calendar), `RenewalModal`, `EditCustomerModal`, `RecaudoModal`, `NotificationsModal`, `OfficeConfigModal`, and `TodayCollectionsView` reconnect modal.
   - Global iOS Safari `<input>` containment (`min-width: 0; max-width: 100%; box-sizing: border-box; outline: none`) + `minWidth: 0` & `alignItems: 'flex-end'` across all 2-column form rows.
   - Collector hero card (`COBRADO HOY EN MI RUTA`) stacked into full-width proportional amount (`28px` → `22px` by magnitude, `tabular-nums`) + full-width `Meta hoy` sub-line, plus responsive web-safe currency scaling across Admin hero, 2x2 summary tiles, 3-column capital cards, `CustomerDetailView`, `CollectorCuadreModal`, `SettlementModal`, and `OfficeConfigModal`.
