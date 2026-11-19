# Assessment: desktop financial journey

- Slug: desktop-financial-journey
- Date: 2026-11-17
- Verdict: valid, reproduced
- Severity: high

## Evidence
The isolated real-service journey recorded 11 failures among 35 scenarios. Original evidence is preserved in docs/qa/2026-11-17/journey-results.json and REPORT.md. No production data is used.

## Root causes
QA11/28: all payment methods treated as physical cash. QA12: payment service trusts collector without authentication. QA14: reversal deletes allocations. QA18: domain assumes UUID installment IDs. QA23: cancellation falls back to principal without a disbursement. QA24: rate and agreed total independently accepted. QA25: imported renewals close old loan without disbursement ledger. QA26: hardcoded route. QA32: file copied before close commits. QA33: payments do not check closed days.

## Proposed Remediation
Classify historical and new payment ledger entries by persisted payment method, preserving digital funds in total capital. Validate active authenticated actor, ownership and closed periods at financial services. Preserve allocations on reversal, filter annulled payments from applied history, reject reversing renewed credit or closed periods. Accept textual installment identifiers. Compensate only recorded disbursements. Validate principal/rate/total consistency. Validate imported renewal arithmetic, preserve identities, post net and paperwork once, rollback invalid renewal packages. Resolve collector route. Produce consistent SQLite snapshots after commit, never placeholders, with integrity verification and observable failures.

## Files likely to change
Desktop domain installment/payment IDs; payments, loans, collections, settlement, sync and backup services; shared financial guard/ledger classifier; DashboardView/CashManagementView/PaymentDialog; CreditHistoryService; test fixtures and integration regressions.

## Tests to add or update
Repeat all 35 diagnostic scenarios unchanged. Add regressions for method separation and capital reconciliation, annulment history, closed-period writes, imported renewal idempotency/invalid rollback, rate mismatch, authorization and backup contents/integrity. Authenticate and isolate existing integration fixtures. Run desktop test suite offline.

## Risks & Considerations
Do not modify real database or closed settlements. Digital funds remain an asset but cannot fund physical withdrawals. Keep BigDecimal. Missing disbursement cannot justify invented money. Preserve original QA evidence. Physical Android/LAN and full Windows installation remain outside these reproduced failures.
