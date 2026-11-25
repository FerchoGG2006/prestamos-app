# Implementation Tasks: `012-migration-payday-and-renewal-fixed-date` + `sync-stale-push-overwrite`

## Phase 1: Sync Hardening & Desktop v1.1.4 Versioning (Bug `sync-stale-push-overwrite`)
- [x] T001 Harden `DesktopCloudSyncService` so idle background sync is strictly read-only (`PULL`-only when no local changes/missing IDs), push only dirty/new `loans`/`installments` (including `fixed_due_date` and `MIGRACION` notes), and enforce `renewals.previous_loan_id` -> `RENOVADO` + paid installments on hydration.
- [x] T002 Enforce `renewals.previousLoanId` -> `RENEWED` + paid installments invariant in `mobile/src/infrastructure/storage/local-store.ts` (`mergeCloudPortfolio`).
- [x] T003 Bump Desktop release version to `1.1.4` in `desktop/build.gradle` and `desktop/packaging/windows/installer.iss`.

## Phase 2: Physical Card Migration `"Día de pago"` (Mobile & Desktop)
- [x] T004 Add `getUpcomingWeekdayDate`, `stepScheduleDate`, and `generateAnchoredMigrationSchedule` to `mobile/src/core/domain/calculator.ts`.
- [x] T005 Support `nextDueDate` in `localStore.createLoan(...)` using `generateAnchoredMigrationSchedule`.
- [x] T006 Add compact `"Día de pago"` controls (Semanal: Lun–Sáb + Calendar; Diario/Quincenal/Mensual: Hoy/Mañana + Calendar) + live schedule preview to `mobile/src/presentation/components/NewLoanModal.tsx`.
- [x] T007 Add anchored migration schedule support (`nextDueDate`, `simulateAnchoredMigrationPlan`, `computeAnchoredStartDate`, `upcomingWeekday`) to `desktop/.../CreateLoanUseCase.java`.
- [x] T008 Add compact `"Día de pago"` controls + live schedule preview & installment date badges to `desktop/.../CreateLoanDialog.java`.

## Phase 3: Renewal `"Fecha Fija"` Modality (Mobile & Desktop)
- [x] T009 Add `fixedDueDate` support and validation to `localStore.recordRenewal(...)`.
- [x] T010 Add `"Fecha Fija"` (`FIXED_DATE`) option, quick date shortcuts (`+7d`, `+15d`, `+30d`), and interactive Calendar modal to `mobile/src/presentation/components/RenewalModal.tsx`.
- [x] T011 Enhance `desktop/.../RenewLoanDialog.java` so `"FECHA FIJA"` locks installments to `1`, shows `"Fecha Fija de Pago Único *"`, defaults to `+7 days`, and offers quick `+7d/+15d/+30d` shortcuts.
- [x] T012 Bump `WEB_BUILD_LABEL` in `mobile/src/presentation/utils/appUpdates.ts` to `'web 1.2.24 (2026-11-24)'`.

## Phase 4: Automated Tests, Web Deploy & Windows v1.1.4 Packaging
- [x] T013 Add automated Mobile tests for anchored migration schedules, `FIXED_DATE` renewals, and `RENEWED` merge invariant; run `npm run typecheck && npm run test:finance`.
- [x] T014 Update `SyncAndKpiParityTest` and add `MigrationPaydayAndRenewalFixedDateTest` on Desktop; run `.\gradlew.bat clean compileJava test`.
- [x] T015 Export and deploy Mobile Web `1.2.24` (`npx expo export --platform web --clear && npx eas-cli deploy --prod --non-interactive`).
- [x] T016 Package Desktop Windows `v1.1.4` (`.\gradlew.bat packageAll "-PdistributionDir=dist/releases/1.1.4" -x test`) and verify deliverables in `desktop/dist/releases/1.1.4/`.
- [x] T017 Write `.specify/bugs/sync-stale-push-overwrite/fix.md` and `test.md` and mark all tasks complete.
