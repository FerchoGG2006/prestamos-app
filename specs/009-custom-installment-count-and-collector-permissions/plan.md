# Implementation Plan: Custom Installment Count Input & Strict Collector Permissions

## Architecture & Files
1. `mobile/src/presentation/components/NewLoanModal.tsx`:
   - Add custom numeric pill-input as the first item in the installment-count selector across `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`.
   - Guard `isCardMigration` strictly off when `isCollector === true` (state init, UI tab visibility, submit guard).
2. `mobile/src/presentation/components/RenewalModal.tsx`:
   - Add custom numeric pill-input as the first item in the installment-count selector across `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`.
   - Validate positive integer installment count on confirm.
3. `mobile/src/presentation/views/collector/TodayCollectionsView.tsx`:
   - Gate empty-route `"Cartulina a Digital"` title/description/CTA behind `isAdminMode`.
4. `mobile/src/presentation/components/CollectorCuadreModal.tsx`:
   - Remove `onOpenRecaudo` prop and `"Registrar Avance / Retiro a Oficina"` CTA while preserving read-only advance display.
5. `mobile/App.tsx`:
   - Guard `openRecaudoModal` and `<RecaudoModal>` strictly for `userRole === 'ADMIN'`.
   - Remove `onOpenRecaudo` from `<CollectorCuadreModal>` and from `collectionsViewProps` for collectors; remove `"Recaudo y Gestión de Papelerías"` from collector operational menu.
6. `mobile/src/presentation/utils/appUpdates.ts`:
   - Bump `WEB_BUILD_LABEL` to `web 1.2.21 (2026-11-23)`.

## Verification
- `cd mobile; npm run test:finance` (100% pass, zero regressions).
- `cd mobile; npm run typecheck` (0 TypeScript errors).
- Export & deploy Web (`https://cartera-movil.expo.app`, verify `web 1.2.21` + Supabase URL).
- Publish Android OTA (`preview`, verify Supabase URL in `.hbc`).
