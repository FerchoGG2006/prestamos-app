# Bug Fix: Descuadre FBV en desembolsos nuevos y respaldo incompleto de rutas/base

- **Slug**: fbv-production-reconciliation
- **Date**: 2026-11-19
- **Status**: fixed (pending live iPhone transfer & verification by user)

## Root Causes Addressed

1. **Desembolso de créditos nuevos financiado con cobros en la app (`mobile/src/infrastructure/storage/local-store.ts`)**:
   - En `getDailyRouteMetrics`, `runningBaselineCash` solo acumulaba base manual, inyecciones y cobros previos en papel (`initialCollected`), excluyendo todos los cobros en efectivo realizados en la app (`inAppPaymentsByLoan`).
   - Al otorgar un crédito nuevo (`createLoan`, `isCardMigration = false`), `Math.min(Math.max(0, runningBaselineCash), l.principal)` descontaba solo una fracción (o `$0`) del capital prestado, inflando **Base en oficina** y **Patrimonio operativo (Administrativo)**.
   - **Corrección**: Se reconstruye la disponibilidad cronológica incorporando los cobros en efectivo completados en la app con marca temporal `<=` al desembolso del crédito (`LOAN_DISBURSEMENT.createdAt` o fecha del préstamo), sin permitir que cobros posteriores ni abonos del propio crédito sean absorbidos retroactivamente.

2. **Respaldo completo incompleto entre dispositivos (`mobile/src/infrastructure/storage/local-store.ts`)**:
   - `exportFullBackupJSON()` y `restoreFullBackupJSON()` omitían `routes` (donde vive `initialCashBase`), `users` y `activeSession`, por lo que transferir una cartera de `localhost` (PC) al iPhone perdía la base inicial de ruta y la configuración de rutas/usuarios.
   - **Corrección**: Ambos métodos ahora exportan y restauran `routes`, `users` y `activeSession` de forma retrocompatible y los persisten en `safeStorage`.

3. **UX de transferencia PC → iPhone (`mobile/src/presentation/components/OfficeConfigModal.tsx`)**:
   - Se agregó el botón **"Cargar Archivo de Respaldo (.json)"** (selector de archivos nativo web para iPhone Safari / WebClip) y el botón **"Copiar Respaldo JSON Completo"** junto a la descarga `.json`.
   - Se actualizó `WEB_BUILD_LABEL` a `web 1.2.15 (2026-11-19)` en `mobile/src/presentation/utils/appUpdates.ts`.

## Files Changed

- `mobile/src/infrastructure/storage/local-store.ts`
- `mobile/src/presentation/components/OfficeConfigModal.tsx`
- `mobile/src/presentation/utils/appUpdates.ts`
- `mobile/src/infrastructure/storage/__tests__/backup-and-newloan.test.ts`
- `mobile/scripts/test-finance.cjs`
