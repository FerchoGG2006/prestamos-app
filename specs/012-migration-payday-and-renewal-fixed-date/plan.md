# Technical Plan: `012-migration-payday-and-renewal-fixed-date`

## 1. Architecture & Parity Design

Both engines (TypeScript in `mobile/` and Java 21 / Spring Boot / JavaFX in `desktop/`) implement the exact same deterministic anchoring algorithm so schedules created on either device match day-for-day across Supabase sync.

### Anchored Migration Schedule Math
Given `(installmentCount, frequency, nextDueDate, paidSet, excludeSundays)`:
1. Determine `anchorNum` (1-based): smallest `n` in `[1..installmentCount]` not in `paidSet`; if all are paid, `anchorNum = installmentCount`.
2. Define bidirectional single-step helpers:
   - `stepForward(date, freq, excludeSundays)`:
     - `DAILY`: `+1 day`; if `excludeSundays && Sunday`, `+1 day` (Monday)
     - `WEEKLY`: `+7 days`
     - `BIWEEKLY`: `+15 days`
     - `MONTHLY`: `+1 month` (calendar month, clamping end-of-month e.g. Jan 31 → Feb 28)
   - `stepBackward(date, freq, excludeSundays)`:
     - `DAILY`: `-1 day`; if `excludeSundays && Sunday`, `-1 day` (Saturday)
     - `WEEKLY`: `-7 days`
     - `BIWEEKLY`: `-15 days`
     - `MONTHLY`: `-1 month` (calendar month, clamping end-of-month)
3. Place `dates[anchorNum] = nextDueDate`.
4. Walk backwards from `anchorNum - 1` down to `1` using `stepBackward`.
5. Walk forwards from `anchorNum + 1` up to `installmentCount` using `stepForward`.
6. Compute `effectiveStartDate = stepBackward(dates[1], freq, excludeSundays)`.
7. For `DAILY` with `excludeSundays = true`, if user picks a Sunday manually, keep their exact chosen date or shift? Actually, if someone explicitly taps a date in calendar, keeping `dates[anchorNum] = nextDueDate` and skipping Sundays on steps ensures predictable results (and our weekday pills only offer Lun–Sáb).

## 2. File-by-File Changes

### Mobile (`mobile/`)
1. `src/core/domain/calculator.ts`:
   - Add `getUpcomingWeekdayDate(todayStr, targetDow)` (1=Mon..6=Sat, returns upcoming date `>= todayStr`).
   - Add `stepScheduleDate(dateStr, frequency, direction, excludeSundays)`.
   - Add `generateAnchoredMigrationSchedule(loanId, summary, frequency, nextDueDateStr, paidInstallmentNumbers, config)`.
2. `src/infrastructure/storage/local-store.ts`:
   - `createLoan`: add optional `nextDueDate?: string`; when `isMigration && !isFixedDate && params.nextDueDate`, generate installments and `effectiveStartDate` via `generateAnchoredMigrationSchedule(...)`.
   - `recordRenewal`: add optional `fixedDueDate?: string`; validate `YYYY-MM-DD` when `effectiveFrequency === 'FIXED_DATE'`; pass to `generateInstallments(...)`, save on `newLoan.fixedDueDate` and `endDate`, and include in idempotency check.
   - `mergeCloudPortfolio`: enforce relational invariant forcing every `renewal.previousLoanId` to `status: 'RENEWED'` with installments `paidAmount = expectedAmount, pendingAmount = 0, status = 'PAGADA'`.
3. `src/presentation/components/NewLoanModal.tsx`:
   - Add state `migrationNextDueDateStr` + `calendarTarget: 'FIXED_DATE' | 'MIGRATION_PAYDAY'` (reusing the existing interactive calendar modal seamlessly!).
   - Inside physical card migration section (when `!isFixedDate`), add compact **`"Día de pago"`** block:
     - For `WEEKLY`: weekday pills (`Lun`, `Mar`, `Mié`, `Jue`, `Vie`, `Sáb`) + Calendar button.
     - For `DAILY`, `BIWEEKLY`, `MONTHLY`: quick buttons (`Hoy`, `Mañana`) + Calendar button.
     - Live schedule preview showing paid installments dates, next unpaid installment date & status (`Al día`, `Cobra hoy`, `En mora`), and final date.
   - Pass `nextDueDate: effectiveMigration && !isFixedDate ? migrationNextDueDateStr : undefined` into `localStore.createLoan(...)`.
4. `src/presentation/components/RenewalModal.tsx`:
   - Add `FIXED_DATE` (`Fecha Fija`) to `freqOptions`.
   - Handle `loan.frequency === 'FIXED_DATE'` on open.
   - When `frequency === 'FIXED_DATE'`, lock count to `1`, show fixed-date input + `Calendario` button + quick pills (`+7d`, `+15d`, `+30d`) + interactive Calendar modal.
   - Pass `fixedDueDate: isFixedDate ? fixedDueDateStr : undefined` to `localStore.recordRenewal(...)`.
   - Display `Pago único • Vence: YYYY-MM-DD` in the ticket card when `FIXED_DATE`.
5. `src/presentation/utils/appUpdates.ts`:
   - Update `WEB_BUILD_LABEL = 'web 1.2.24 (2026-11-24)'`.

### Desktop (`desktop/`)
1. `src/main/java/com/cartera/loans/application/CreateLoanUseCase.java`:
   - Add optional `LocalDate nextDueDate` field to `CreateLoanCommand` with backward-compatible overloaded constructors preserving all existing signatures.
   - Add `simulateAnchoredMigrationPlan(BigDecimal totalAgreed, int installmentCount, String frequency, LocalDate nextDueDate, Set<Integer> paidInstallmentNumbers)` and `computeAnchoredStartDate(...)` + `upcomingWeekday(LocalDate today, DayOfWeek target)`.
   - In `execute(cmd)`, when `cmd.isMigration() && cmd.nextDueDate() != null && !isFixedDate`, use anchored schedule and derived `effectiveStartDate`.
2. `src/main/java/com/cartera/ui/views/CreateLoanDialog.java`:
   - Add compact **`"Día de pago"`** panel in left/cartulina form when `chkMigration` is selected and modality is not `"FECHA FIJA"`:
     - `SEMANAL`: quick buttons `Lun`, `Mar`, `Mié`, `Jue`, `Vie`, `Sáb` + `DatePicker dpMigrationPayday`.
     - `DIARIO`, `QUINCENAL`, `MENSUAL`: quick buttons `Hoy`, `Mañana` + `DatePicker dpMigrationPayday`.
   - Live schedule preview label + tooltip/date under each installment tile in `gridCartulina` so the operator immediately sees the exact date of every installment (paid and pending) and whether the next unpaid installment is `Al día`, `Cobra hoy`, or `En mora`.
   - Pass `migrationNextDueDate` into `CreateLoanCommand`.
3. `src/main/java/com/cartera/ui/views/RenewLoanDialog.java`:
   - Keep `Label lblStartDate` reference so `cmbFrequency` listener switches between `"Fecha Fija de Pago Único *"` (with `txtInstallmentCount` locked to `"1"` and `dpStartDate` defaulted to `+7 days` when today) and `"Fecha Inicio *"` (restoring editable count).
   - Add quick pills (`+7d`, `+15d`, `+30d`) visible when `"FECHA FIJA"` is selected.
4. `src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java`:
   - Bug `sync-stale-push-overwrite` fixes (read-only idle sync, per-row loan/installment dirty filtering, `renewals.previous_loan_id` terminal invariant, push `fixed_due_date` and `MIGRACION` notes).
5. `desktop/build.gradle` & `desktop/packaging/windows/installer.iss`:
   - Bump version cleanly to **`1.1.4`**.

## 3. Verification Strategy

- **Mobile**: Unit tests in `mobile/src/core/domain/__tests__/migration-and-renewal-fixed.test.ts` registered in `mobile/scripts/test-finance.cjs`, run via `npm run typecheck && npm run test:finance`.
- **Desktop**: JUnit tests in `SyncAndKpiParityTest.java` + new `MigrationPaydayAndRenewalFixedDateTest.java`, run via `.\gradlew.bat clean compileJava test`.
- **Release**: Deploy Mobile Web `1.2.24` (`expo export` + `eas-cli deploy --prod`) and package Desktop Windows `v1.1.4` (`packageAll "-PdistributionDir=dist/releases/1.1.4"`).
