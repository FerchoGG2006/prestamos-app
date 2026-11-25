# Feature Specification: Migration Payday ("Día de pago") & Renewal Fixed Date ("Fecha Fija")

- **Feature ID**: `012-migration-payday-and-renewal-fixed-date`
- **Date**: `2026-11-24`
- **Platforms**: Native Windows JavaFX Desktop (`desktop/`) & Mobile/Web PWA (`mobile/`)

## 1. Problem Statement

1. **Cartulina física a digital — Payday mismatch**: When an office migrates an existing paper card on a day other than the customer's actual payment day (e.g., entering a 6-week Friday customer on Tuesday with 2 installments already paid), the system currently anchors backward dates to `todayStr` (Tuesday), causing all future installments to land on Tuesdays instead of Fridays and triggering false delinquency or wrong collection days. This affects all periodic modalities: **Semanal**, **Diario**, **Quincenal**, and **Mensual**.
2. **Renovación — Missing "Fecha Fija" modality**: During loan renewal on Mobile (`RenewalModal.tsx`), only `Diario`, `Semanal`, `Quincenal`, and `Mensual` were available — **`Fecha Fija`** (`FIXED_DATE`) was missing, and `localStore.recordRenewal()` did not accept a custom `fixedDueDate`. On Desktop (`RenewLoanDialog.java`), `"FECHA FIJA"` existed in the dropdown but did not lock installments to `1` or update the date label/default for single fixed-date payment.

## 2. Functional Requirements

### FR-1: `"Día de pago"` Selector in Physical Card Migration (Mobile & Desktop)
- Visible in physical card migration mode whenever the modality is periodic (`DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`).
- Exact UI field label requested by the business: **`"Día de pago"`**.
- Modality-adapted quick buttons + exact date selector:
  - **Semanal (`WEEKLY` / `SEMANAL`)**: quick weekday pills (**Lun / Mar / Mié / Jue / Vie / Sáb**) that select the upcoming occurrence of that weekday (`>= today`, defaulting to upcoming matching day), plus a Calendar / DatePicker allowing any exact date (future, today, or past if the customer is already overdue).
  - **Diario / Quincenal / Mensual**: quick buttons (**Hoy**, **Mañana**) plus a Calendar / DatePicker allowing any exact date (including past dates if already overdue).
- **Anchored schedule algorithm (identical in TypeScript and Java)**:
  - Let `anchorIndex` (1-based) be the lowest installment number in `1..installmentCount` that is **not** marked as paid in `paidInstallmentNumbers` (or `installmentCount` if all installments are marked paid).
  - Place installment `#anchorIndex` **exactly** on the chosen `"Día de pago"` (`nextDueDate`).
  - Project installments `#(anchorIndex - 1)` down to `#1` backwards by one period per step (`±7d` for Weekly, `±15d` for Biweekly, `±1 calendar month` for Monthly, `±1 business day` skipping Sundays when `excludeSundays` is active for Daily).
  - Project installments `#(anchorIndex + 1)` up to `#installmentCount` forwards by the same period step.
  - Set `loan.startDate` to one period before installment `#1` so contract origination date matches the real paper card timeline.
  - Mark every installment in `paidInstallmentNumbers` as `PAGADA` (`paidAmount = amount`, `pendingAmount = 0`).
- **Live schedule preview**: Display before saving the dates of already-paid installments (paz y salvo), the next pending installment date + status (`Al día hasta ...` / `Cobra hoy` / `En mora desde ...`), and the final installment date.

### FR-2: `"Fecha Fija"` Payment Modality in Loan Renewal (Mobile & Desktop)
- **Mobile (`RenewalModal.tsx` & `localStore.recordRenewal`)**:
  - Add **`Fecha Fija`** (`FIXED_DATE`) to the payment modality selector in `RenewalModal.tsx`.
  - When selected, lock installment count to `1` (single payment), show a fixed-date picker with quick shortcuts (`+7d`, `+15d`, `+30d`) and interactive Calendar modal (defaulting to `+7 days` from `todayStr` or the previous loan's `fixedDueDate` if still in the future).
  - Accept optional `fixedDueDate?: string` (`YYYY-MM-DD`) in `localStore.recordRenewal(...)`, validate it when `frequency === 'FIXED_DATE'`, generate 1 installment due on `fixedDueDate`, and persist `fixedDueDate` and `endDate = fixedDueDate` on the new `Loan`.
- **Desktop (`RenewLoanDialog.java` & `DesktopCloudSyncService.java`)**:
  - When `"FECHA FIJA"` is selected in `RenewLoanDialog`, lock `txtInstallmentCount` to `"1"` (disabled), change the date field label to `"Fecha Fija de Pago Único *"`, and default `dpStartDate` to `LocalDate.now().plusDays(7)` if currently today; restore editable count and `"Fecha Inicio *"` when switching to periodic modalities.
  - Ensure `DesktopCloudSyncService` pushes `fixed_due_date` for `FIXED_DATE` loans to Supabase.

## 3. Acceptance Criteria

1. **Friday Weekly Migration Example (from user)**:
   - Entering a 6-week weekly loan on Tuesday (`2026-11-24`) with 2 installments paid (`#1`, `#2`) and `"Día de pago"` = **Vie** (`2026-11-27`):
     - Cuota #1 = `2026-11-13` (`PAGADA`, paz y salvo)
     - Cuota #2 = `2026-11-20` (`PAGADA`, paz y salvo)
     - Cuota #3 = `2026-11-27` (`PENDIENTE` → Al día on Tue–Thu, Cobrar hoy on Fri, En mora on Sat)
     - Cuotas #4–#6 = `2026-12-04`, `2026-12-11`, `2026-12-18` (`PENDIENTE`)
     - `startDate = 2026-11-06`, `endDate = 2026-12-18`.
2. **All Modalities Supported**: Anchored migration works accurately for `DAILY` (skipping Sundays), `WEEKLY`, `BIWEEKLY`, `MONTHLY`, and past-date overdue cards on both Mobile and Desktop.
3. **Renewal with `"Fecha Fija"`**: Renewing an active loan with `"Fecha Fija"` and target date `2026-12-10` closes the prior loan as `RENEWED`/`RENOVADO`, creates a 1-installment loan due `2026-12-10` with `frequency = FIXED_DATE`/`FECHA FIJA`, and syncs cleanly across Mobile, Supabase, and Desktop.
4. **Constitutional Compliance**: `BigDecimal` only on Desktop, pure JavaFX UI on Desktop, transactional/auditable/idempotent writes, zero regression in existing 92+ Desktop tests and all Mobile finance tests.
