# Customer deactivation bypass
- Date: 2026-11-18
- Verdict: valid, statically confirmed; regression reproduction required
- Slug generated from the authorized task: customer-deactivation-bypass
## Root cause
CustomersView.handleDeleteCustomer catches cancellation rejection and directly saves CANCELADO, then deletes/inactivates the customer. UI writes bypass transactional financial validation. Editing also directly writes customer route without considering active contracts.
## Proposed Remediation
Introduce a transactional customer lifecycle service. Deactivation is manager-only, with required reason, cancels every active contract via CancelLoanUseCase in one transaction, propagates every rejection, never physically deletes historical entities, and is idempotent for already inactive customers. Profile updates validate authenticated ownership and route consistency, audit changes, and cannot silently reassign contracts. UI delegates all writes and displays actual errors.
## Files likely to change
CustomersView, CarteraApplication, new CustomerLifecycleService, isolated integration tests.
## Tests to add or update
Active-payment rejection preserves loan/customer/allocations/ledger; closed period rejection; multi-loan rollback; successful cancellation compensates once and soft-deactivates; inactive replay; unauthenticated and collector denial; editing/reassignment authorization.
## Risks
No real database changes. Existing invalid historical records require explicit correction, not silent normalization. Closed settlements remain immutable.
