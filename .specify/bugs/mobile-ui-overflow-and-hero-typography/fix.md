# Bug Fix Record: `mobile-ui-overflow-and-hero-typography`

- **Slug**: `mobile-ui-overflow-and-hero-typography`
- **Date**: `2026-11-24`
- **Status**: Fixed

## Changes Applied

1. **Global iOS Safari / React Native Web Input Containment** (`mobile/App.tsx`):
   - Added `min-width: 0 !important; max-width: 100% !important; box-sizing: border-box !important; outline: none !important;` and clean `:focus` rules to the global web stylesheet, preventing side-by-side `<input>` fields from bursting out of flex columns or rendering Safari's oversized blue focus outline across neighboring inputs.
   - Added `minWidth: 0` on the top header brand row.
2. **Collector Hero Card & System-Wide Web-Safe Currency Typography**:
   - `mobile/src/presentation/views/collector/TodayCollectionsView.tsx`:
     - Stacked the collector hero card (`COBRADO HOY EN MI RUTA`) cleanly into 2 full-width rows: magnitude-responsive collected amount (`28px / 26px / 24px / 22px`, `tabular-nums`, full width) on row 1, and `Meta hoy: ... • X/Y cobrados` on row 2 — eliminating `$ 687.0...` truncation completely.
     - Added magnitude-responsive font scaling and `minWidth: 0` across Admin Hero (`Patrimonio operativo`), `Cartera en calle / Base en oficina`, `Resumen de hoy`, and the 3-column `Capital Asignado a mi Ruta` card.
   - `mobile/src/presentation/views/collector/CustomerDetailView.tsx`: magnitude-responsive `bentoAmountDark` + `minWidth: 0` on `bentoBox`.
   - `mobile/src/presentation/components/OfficeConfigModal.tsx`: magnitude-responsive `capGlobalValue` + `minWidth: 0` on 3-column consolidated grid.
   - `mobile/src/presentation/components/CollectorCuadreModal.tsx` & `SettlementModal.tsx`: tightened `splitValue` (`16px` / `16.5px`, `tabular-nums`), added `minWidth: 0, overflow: 'hidden'` on `splitCard` and Base de Inicio input wrapper.
3. **Modal Header Wrapping & Multi-Column Form Alignment**:
   - `mobile/src/presentation/components/NewLoanModal.tsx`: added `flex: 1, minWidth: 0, paddingRight: 10` to main & calendar modal headers, `flexShrink: 0` to close buttons, `overflow: 'hidden'` to `calendarModalCard`, `minWidth: 0` + `alignItems: 'flex-end'` to all 4 `formRow` blocks, and `width: '100%', minWidth: 0` to `textField`.
   - `mobile/src/presentation/components/RenewalModal.tsx`: added `flex: 1, minWidth: 0, paddingRight: 10` to main & calendar headers, `flexShrink: 0` to close buttons, and `overflow: 'hidden'` to `calendarModalCard`.
   - `mobile/src/presentation/components/EditCustomerModal.tsx`: added `flex: 1, minWidth: 0` to header & all 5 `rowTwoCols` blocks with uniform `gap: 10` + `alignItems: 'flex-end'`, shortened `"Posición / Orden en Ruta (#)"` to `"Orden en Ruta (#)"`, added `overflow: 'hidden'` to `modalCard` and `inputWithIcon`, and `width: '100%', minWidth: 0` to `textInput`.
   - `mobile/src/presentation/components/RecaudoModal.tsx`, `NotificationsModal.tsx`, `OfficeConfigModal.tsx`, and `TodayCollectionsView.tsx` (`renderCloudReconnectModal`): added `flex: 1, minWidth: 0` to header title containers and `flexShrink: 0` to close buttons.
4. **Web Release Label**:
   - Bumped `WEB_BUILD_LABEL` in `mobile/src/presentation/utils/appUpdates.ts` to `'web 1.2.25 (2026-11-24)'`.
