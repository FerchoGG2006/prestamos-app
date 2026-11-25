# Tasks: Custom Installment Count Input & Strict Collector Permissions

- [x] T001 Add custom editable installment-count input first (before presets) across Daily/Weekly/Biweekly/Monthly in `NewLoanModal.tsx` and `RenewalModal.tsx`.
- [x] T002 Hide and defensively block `Cartulina a Digital` for collectors in `NewLoanModal.tsx` and empty-route state in `TodayCollectionsView.tsx`.
- [x] T003 Remove `Registrar Avance / Retiro a Oficina` and all `RecaudoModal` entry points for collectors in `CollectorCuadreModal.tsx` and `App.tsx`.
- [x] T004 Bump `WEB_BUILD_LABEL` (`web 1.2.21`), run `npm run test:finance` and `npm run typecheck`, and verify zero regressions.
- [x] T005 Export & deploy live Web (`https://cartera-movil.expo.app`) and publish verified Android OTA (`preview`).
