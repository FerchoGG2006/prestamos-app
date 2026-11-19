# Fix: Customer deactivation bypass
- Slug: customer-deactivation-bypass (resolved from current assessment)
- Date: 2026-11-18
- Status: applied
- Assessment: assessment.md
## Changes
CustomerLifecycleService wraps all active-contract cancellations, customer soft-deactivation and audit in one transaction. Rejections propagate, preserving customer, credits, allocations and cash. Already inactive replay performs no new writes. All profile updates validate session/ownership; moving a customer with contracts requires a separate audited transfer. CustomersView delegates every lifecycle/profile write and no longer catches cancellation failure to save CANCELADO or physically delete customers.
## Verification
DesktopParityTest covers payment rejection, multi-contract rollback, manager-only deactivation, route transfer rejection and successful replay without duplicate cash. Full Gradle results recorded in test.md after validation.
## Deviations
Soft-deactivate customers without history as well, preserving an audit trail and recovery path. No modifications to existing real data. No hooks registered in .specify/extensions.yml.
