# Bug Fix Record: Remove Badge Pill from Mobile `Mi Cuadre` Tab

**Slug**: `mobile-cuadre-dock-badge`
**Release**: Mobile `web 1.2.26 (2026-11-25)`

## Changes
- [App.tsx](file:///c:/Users/ASUS/prestamos-app-1/mobile/App.tsx): Removed unused `todayPaymentsCount` and removed the `dockBadgePill` overlay from the `Mi Cuadre` tab icon so the icon remains clean while `Alertas` keeps its live notification badge.
- [appUpdates.ts](file:///c:/Users/ASUS/prestamos-app-1/mobile/src/presentation/utils/appUpdates.ts): Bumped `WEB_BUILD_LABEL` to `web 1.2.26 (2026-11-25)`.
