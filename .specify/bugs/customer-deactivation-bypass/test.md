# Verification: Customer deactivation bypass
- Slug: customer-deactivation-bypass (from current assessment/fix)
- Date: 2026-11-18
- Assessment: assessment.md
- Fix: fix.md
- Result: verified at transactional service boundary; visual acceptance pending
## Checks
DesktopParityTest: active payment rejects deactivation without changing loan/customer/allocations/ledger; multi-contract rejection rolls back earlier cancellations; successful soft-deactivation preserves contracts and compensates once; replay adds no cash/audit; collector denial and silent route transfer rejection. Static scan confirms no CustomerRepository/LoanRepository save/delete or CANCELADO fallback remains in JavaFX customer views.
Full suite: 58 tests, zero failures/errors/skips. Original diagnostic journey: 35/35 PASS. Commands use -PisolatedBuildDir=build/parity-20261118 with offline Gradle. All records fictitious; real office and mobile untouched.
## Limits
The packaged native executable exposes the fictitious-office login, but Computer Use twice reported `failed to activate captured window`; no final visual transaction was performed in that window. Tests cover the same invoked service boundary. No production deployment or customer-data migration performed. Hooks: .specify/extensions.yml contains hooks: {}.
