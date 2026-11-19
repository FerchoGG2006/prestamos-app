# Bug Fix: desktop financial journey

- **Slug**: desktop-financial-journey
- **Fixed**: 2026-11-17
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary
Corrected the eleven reproduced desktop/service failures without changing the real office database or publishing software. Financial reads separate physical cash and digital funds while preserving total assets; original closed settlements and allocation evidence remain intact.

## Changes
| File / area | Change | Notes |
|---|---|---|
| FinancialAccess | added | Active actor, manager/collector permissions, immutable collector-day checks |
| PaymentMethods / CashLedger | added | Canonical aliases and reference-based classification of existing payment ledger rows |
| RecordPaymentUseCase | modified | Authentication, owner validation, closed-day protection, replay payload validation, integral COP validation, actual audit actor |
| Installment / PaymentAllocation | modified | Text identifiers; UUID constructor compatibility retained |
| ReversePaymentUseCase / CreditHistoryService | modified | Keep allocations, exclude annulled applied history, reject closed/renewed contracts, reject inconsistent allocation restoration |
| CreateLoanUseCase / CancelLoanUseCase | modified | Rate/total consistency, financial authorization and closed-day checks; compensate only actual known disbursements, never migration principal fallback |
| TodayCollectionsService / RenewalCalculator | modified | Separate physical/digital balances, retain digital assets in Admin and renewal preview |
| SettlementUseCase | modified | Cash-only net due, digital breakdown, assigned route resolution, active manager for close, after-commit backup |
| MobileSyncProcessorService | modified | Validate renewal balances/identity and rate representation, deterministic net/paperwork ledger entries, atomic invalid financial import rollback, natural idempotency and closed-day checks |
| DatabaseBackupService | modified | Active datasource path, SQLite VACUUM INTO consistent snapshot including WAL, unique names, integrity validation, no placeholder, after-commit creation, separate committed audit and visible failure warning |
| Native views | modified | Separate dashboard accounts and wrapping cards, Nequi option, physical cash history, cash/digital settlement breakdown, backup failure warning; no manually constructed sync service |
| Existing integration tests | updated | Authenticate actual service callers; isolate test transactions/closed sessions; replace invalid negative delivered-cash fixture with a justified surplus |
| DesktopFinancialJourneyTest / DatabaseBackupServiceTest | added | Real SQLite regressions and missing-database safety |

## Local Verification
Initial integrated pass: 39 JUnit tests passed and the original 35-scenario service journey passed 35/35. Final pass after additional authorization/closed-import regressions is recorded in test.md. Native JavaFX launched in a new fictitious office; admin login, separate dashboard account cards and settlement cash/digital breakdown were observed. No financial UI transactions were submitted in this final visual check.

## Deviations from Assessment
No unrelated feature added. Closed-period checks were also applied to new origination, native renewals and imported expenses because leaving those service paths open would bypass collector-day immutability. Payroll deductions are treated as noncash bookkeeping entries, not physical cash disbursements. Historical invalid values are not silently repaired.

## Follow-ups
Physical Android/LAN acceptance, complete office restore, installer on another Windows PC, printing/maps/WhatsApp remain external acceptance tasks. No production deployment was performed. Existing erroneous historical operations require a separate auditable correction workflow.
