# Feature Specification: Native desktop operational parity
**Date**: 2026-11-18 | **Status**: implementation authorized
## User Scenarios & Testing
### US1 P1 Safe customer lifecycle
A manager deactivates a customer with reason. Any protected credit stops the entire operation; successful deactivation preserves history. Profile changes cannot silently move a credit between routes.
### US2 P2 Collection follow-up
An assigned collector or manager records a dated, valued promise or a reasoned no-payment visit from a customer file; sees pending/due/overdue commitments and closes a promise explicitly without creating a payment.
### US3 P2 Customer attachments
An authorized operator attaches and opens a photo/video/document in a managed office folder; sees filename/type/date. File selection cannot overwrite an existing attachment. Records and files survive restart.
### US4 P2 Recovery
A manager validates a backup and prepares a recovered office in a new folder, preserving the running office. Recovery checks database integrity/schema/foreign keys and documents how to launch the recovered office. Include managed attachments in an office recovery package.
### US5 P1 Sync acceptance
Using a fresh fictitious database, HTTP pull/push with office PIN preserves ownership, payment amounts, idempotency and closed-period rejection; prove invalid PIN and repeated requests correctly handled. Physical phone acceptance remains explicit and pending until a phone is available.
### US6 P3 Windows distribution
Generate a native Windows package after passing tests. Verify package contents and launch with an isolated office path. Document external install/upgrade acceptance.
## Functional Requirements
FR01 Lifecycle changes must be transactional, authorized, auditable and preserve closed history.
FR02 Promises require active loan, positive integral COP no greater than balance, nonpast promised date and notes; visits require reason; operation IDs make retries safe.
FR03 Follow-up transitions are PENDIENTE -> CUMPLIDA/CANCELADA; completion records user declaration, never synthesizes cash or Payment.
FR04 Managed attachments use metadata and unique names; access checks ownership, byte limits and supported types; no external URL media loading.
FR05 Recovery never overwrites the running office and rejects corrupt/incompatible snapshots or unsafe archive paths.
FR06 Native JavaFX screens only. LAN HTTP is a data protocol, never application UI.
FR07 Reports distinguish automated checks, native visual checks and unperformed phone/other-PC acceptance.
## Key Entities
Existing Customer, Loan, PaymentPromise, AuditLog; new CustomerAttachment metadata. Visits use append-only NON_PAYMENT_VISIT audit entries. No delinquency formula added.
## Success Criteria
No failed lifecycle action changes financial state. Native follow-up and attachment actions persist across reopen. Recovery reproduces customers, loan balance, allocations, closed settlements and attachments from an isolated package. Full existing 35-scenario journey stays green; new regression tests cover service and HTTP boundaries. Windows native executable generated and isolated launch checked.
## Assumptions & Clarifications
Use existing ADMIN/SUPERVISOR and assigned COBRADOR roles. Prefer soft deactivation for all customers. Do not infer promise fulfillment from unrelated payments. Recover into a new empty office folder, never silently replace an open SQLite file. LAN phone and other-PC access are external dependencies and not assumed successful.
