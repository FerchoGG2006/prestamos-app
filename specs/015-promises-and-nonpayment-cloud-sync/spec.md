# Feature Specification: Bidirectional Promises & Non-Payment Visits Cloud Sync + Desktop Quick Non-Payment Action

**Feature Branch**: `main` (incremental parity extension on `013-desktop-full-mobile-parity`)
**Created**: 2026-11-25
**Status**: Active

## Goal & Business Value
Ensure complete real-time operational parity between **Kredia Desktop** (Windows JavaFX + SQLite) and **Kredia Mobile / Web** (React Native / PWA) so that when an administrator or collector works on a route (e.g. Ruta 1) on either computer or phone, **every operational record** — including payment promises (`PaymentPromise`) and non-payment visits (`NonPaymentVisit` / `VISITA_NO_PAGO`) — synchronizes automatically and losslessly through Supabase (`offices.settings`) without requiring manual intervention or Postgres schema breaking changes.

## User Stories
1. **Bidirectional Payment Promises (`Móvil ↔ Desktop`)**:
   - As an administrator or collector, when I register or resolve a payment promise on Mobile (or Desktop), the other device automatically receives the promise on its next sync (~30s or manual Sync), preserving terminal statuses (`CUMPLIDA`, `CANCELADA`, `INCUMPLIDA`) over `PENDIENTE`.
2. **Bidirectional Non-Payment Visits (`Móvil ↔ Desktop`)**:
   - As a collector in the street recording a "No pagó" visit (e.g., *No estaba*, *Local cerrado*, *Sin dinero hoy*) on Mobile, the administrator sees that non-payment visit immediately on Desktop (both in `TodayCollectionsView` and in `Customer360Dialog` / follow-up history) — and vice versa if recorded from Desktop.
3. **Desktop 1-Click "No pagó" Action on Route View**:
   - As an administrator or collector on Desktop `TodayCollectionsView`, I can mark a quick "No pagó" visit directly on an unpaid route row using the same 5 standardized reasons as Mobile, and see a clear `NO PAGÓ HOY` visual badge for customers already visited today without payment.

## Non-Negotiable Constraints
- **Zero data loss / Union-Merge**: Neither Desktop nor Mobile may overwrite or drop remote promises or non-payment visits created on the other device; merge by `id` with monotonic status precedence (`CUMPLIDA`/`CANCELADA`/`INCUMPLIDA` > `PENDIENTE`) and cap serialized arrays to the 500 most recent items.
- **Read-Only Idle Sync Invariant**: When no local changes exist, Desktop background sync must NOT perform redundant `PATCH offices` writes.
- **Zero Financial Drift**: Promises and non-payment visits are operational follow-up records only; they never alter monetary balances, installments, cash movements, or immutable settlements.
- **Zero Breaking DB Migrations**: Transport uses existing `offices.settings` JSONB keys (`desktopPromises` and `nonPaymentVisits`) already protected by Supabase multi-tenant RLS (`office_id`).

## Success Criteria
- [ ] Mobile `upsertOffice` and `mergeCloudPortfolio` bidirectionally merge and persist `desktopPromises` and `nonPaymentVisits`.
- [ ] Desktop `DesktopCloudSyncService` bidirectionally merges `desktopPromises` (union-merge preserving Mobile fields + monotonic status) and `nonPaymentVisits` (`AuditLogEntity` with `entityType = "NON_PAYMENT_VISIT"`), preserving the read-only idle sync invariant.
- [ ] Desktop `TodayCollectionsView` offers a 1-click `"No pagó"` action on unpaid rows and shows a `NO PAGÓ HOY` indicator when a non-payment visit exists for today.
- [ ] Automated round-trip tests pass on both Mobile (`npm run typecheck`, `npm run test:finance`, new sync parity assertions) and Desktop (JUnit `DesktopFullMobileParityTest`).
- [ ] Deployed live as Mobile Web `web 1.2.28` + Desktop OTA `v1.2.3` (~1.3 MB, `min_shell_version: 1.2.0`).
