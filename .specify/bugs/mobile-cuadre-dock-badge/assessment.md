# Bug Assessment: Misleading Historical Badge on Mobile `Mi Cuadre` Tab

**Slug**: `mobile-cuadre-dock-badge`
**Date**: 2026-11-25

## Symptom
In Collector view on Mobile, the bottom navigation tab `Mi Cuadre` displayed a blue badge (`49`) even when `$ 0` (`0/24`) had been collected on the current day.

## Root Cause
`mobile/App.tsx:913` computed `todayPaymentsCount` by counting all `COMPLETED` payments across all historical dates without filtering by `todayStr`, and rendered it as a badge pill on the `Mi Cuadre` icon.

## Approved Remediation
Per user preference ("dejarlo limpio por completo y dejar el ícono limpio y mantener globito solo en Alertas"), remove the badge pill from `Mi Cuadre` completely so only `Alertas` carries a notification badge.
