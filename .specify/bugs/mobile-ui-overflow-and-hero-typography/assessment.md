# Bug Assessment: `mobile-ui-overflow-and-hero-typography`

- **Slug**: `mobile-ui-overflow-and-hero-typography`
- **Date**: `2026-11-24`
- **Platform**: Mobile Web PWA (`https://cartera-movil.expo.app` — iOS Safari / React Native Web) & Native Mobile

## 1. Symptoms Observed (Screenshots on iPhone)

1. **Modal Header Overflow (`NewLoanModal` Calendar Modal — "Día de pago")**: Long subtitle text inside a `flexDirection: 'row'` header pushed the `X` close button off the right edge and overflowed past the white rounded modal border.
2. **2-Column `TextInput` Overlap & Focus Ring Bleed (`EditCustomerModal`, `NewLoanModal`, `OfficeConfigModal`)**: In iOS Safari / React Native Web, side-by-side inputs inside flex rows (`Nombre del Negocio` + `Ocupación / Oficio`) overflowed horizontally into adjacent columns and rendered Safari's blue focus outline over the neighboring field; multi-line field labels (`Posición / Orden en Ruta (#)`) also vertically misaligned paired inputs.
3. **Oversized Truncated Collector Hero Amount (`TodayCollectionsView` — "COBRADO HOY EN MI RUTA")**: The collected-today figure rendered at `fontSize: 34` in a horizontal row beside the daily goal text (`de $ 445.000 • 5/24 cobrados`), relying on iOS-native-only `adjustsFontSizeToFit` (ignored on Web), truncating `$ 687.000` into an unreadable `$ 687.0...`.

## 2. Root Causes

1. Flex header title wrappers lacked `flex: 1, minWidth: 0, paddingRight: 10`, and modal cards lacked `overflow: 'hidden'`, allowing long subtitles to expand past the modal width and displace the close icon.
2. `mobile/App.tsx` sets `input, textarea, select { font-size: 16px !important; }` to prevent iOS Safari auto-zoom, while HTML `<input>` keeps default intrinsic `size="20"` (`min-width: auto` ~190px) and default browser focus outlines. Flex row column wrappers across forms also lacked `minWidth: 0` and `alignItems: 'flex-end'`.
3. `adjustsFontSizeToFit` has no effect on React Native Web, so fixed large `fontSize` values (`34px` in `cleanMainAmount`, and fixed `splitValue` / `bentoAmountDark` / `collectorCapitalItemVal` / `capGlobalValue`) clip with `...` whenever currency strings grow (`>= $100.000` or `>= $1.000.000`).

## 3. System-Wide Remediation Plan

1. **Global Web Input Containment (`mobile/App.tsx`)**: Add `min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; outline: none !important;` (and clean `:focus` without oversized Safari ring) to the global web stylesheet in `App.tsx`.
2. **All Modal Headers & Multi-Column Form Rows**:
   - Add `flex: 1, minWidth: 0, paddingRight: 10` to title containers, `flexShrink: 0` to close buttons, and `overflow: 'hidden'` to modal cards across `NewLoanModal`, `RenewalModal`, `EditCustomerModal`, `RecaudoModal`, `NotificationsModal`, `OfficeConfigModal`, `CustomerOptionsModal`, `CollectorCuadreModal`, `SettlementModal`, `ExpenseModal`, `PaymentModal`, `PromiseModal`, `NonPaymentModal`, and `RouteSelectorModal`.
   - Add `minWidth: 0` and `alignItems: 'flex-end'` to all 2-column form rows and `minWidth: 0, width: '100%'` to inputs (`EditCustomerModal`, `NewLoanModal`, `OfficeConfigModal`, `SettlementModal`), shortening wrapping labels (`Orden en Ruta (#)`).
3. **Collector Hero Card & Web-Safe Responsive Currency Typography**:
   - Redesign `TodayCollectionsView` Collector Hero card (`cleanAmountRow`) into a clean stacked layout: full-width dynamically-sized collected amount (`28px` / `26px` / `23px` / `20px` by magnitude, `tabular-nums`) on line 1, and full-width goal/progress subtitle (`Meta: $ ... • X/Y cobrados`) on line 2 — completely readable with zero `...` truncation even for 8-digit COP amounts.
   - Apply magnitude-responsive font sizing across all currency tiles (`TodayCollectionsView`, `CollectorCuadreModal`, `SettlementModal`, `CustomerDetailView`, `OfficeConfigModal`) so no monetary value clips with `...` on 375–390px screens.
4. **Release**: Bump `WEB_BUILD_LABEL` to `web 1.2.25 (2026-11-24)`, run `npm run typecheck && npm run test:finance`, and deploy to production (`https://cartera-movil.expo.app`).
