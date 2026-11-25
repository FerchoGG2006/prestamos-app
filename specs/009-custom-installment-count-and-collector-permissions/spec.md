# Feature Specification: Custom Installment Count Input & Strict Collector Permissions

**Feature Branch**: `009-custom-installment-count-and-collector-permissions`
**Created**: 2026-11-23
**Status**: Approved by user

## Requirements

1. **Custom Editable Installment Count First (All Modalities)**:
   - In both **Nuevo Préstamo** (`NewLoanModal.tsx`) and **Renovación** (`RenewalModal.tsx`), across **Diario**, **Semanal**, **Quincenal**, and **Mensual**, display an editable numeric input **first** (before the preset quick-select buttons such as `4, 6, 8, 10, 12 semanas`) so users can enter any custom number of installments while keeping all preset shortcuts right beside it.
   - Clearing/editing the field must not forcibly snap back while typing; form submission must validate `installmentCount >= 1`.

2. **Hide & Block "Cartulina a Digital" for Collectors**:
   - Collectors (`userRole === 'COBRADOR'` / `isCollector === true`) must NOT see or activate the **"Cartulina a Digital"** card-migration mode in `NewLoanModal.tsx`.
   - Default opening state for collectors must always be `isCardMigration = false` (even when the route has 0 customers or the last loan was migrated).
   - In `TodayCollectionsView.tsx`, empty-route messaging for collectors must not display `"Carga Inicial del Taco (Cartulinas a Digital)"` or `"Ingresar Clientes del Taco (Cartulina a Digital)"`.

3. **Remove Treasury / "Registrar Avance / Retiro a Oficina" Access for Collectors**:
   - Remove the **"Registrar Avance / Retiro a Oficina"** button and `onOpenRecaudo` callback from `CollectorCuadreModal.tsx`.
   - Remove **"Recaudo y Gestión de Papelerías"** from the Collector's operational menu in `App.tsx`.
   - Restrict `openRecaudoModal` and `<RecaudoModal />` strictly to `userRole === 'ADMIN'` in `App.tsx`.
   - Keep read-only display of `(-) AVANCES ENTREGADOS A OFICINA` in `CollectorCuadreModal.tsx` when an Admin records an advance for that route/day.

## Out of Scope (Pending User Confirmation)
- Automatic daily `Base de inicio` rollover logic (explicitly deferred pending user review of daily vs next-day vs Saturday-settlement rules).
