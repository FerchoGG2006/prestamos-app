# Implementation Plan: Desktop operational parity
## Technical Context
Java 21 / JavaFX 21 / Spring Boot / SQLite / Flyway / JUnit. No added web UI or monetary floating point. All existing user data excluded from execution; test user.home and datasource are temporary. Existing mobile remains a reference, never reinstalled/reset/overwritten.
## Constitution Check
PASS: JavaFX-only screens; BigDecimal; separate allocation records; immutable closed history; manager-authorized financial writes. No delinquency formula introduced.
## Architecture
Transactional CustomerLifecycleService; FollowUpService uses existing promises and visit audit records; AttachmentService manages unique files + relational metadata via V3. Native customer operations dialog exposes promise/visit/list/attachment actions. Recovery validates read-only SQLite and prepares complete recovered office in a NEW empty folder; add --office-dir startup override before Spring. ZIP bundles include database snapshot and managed attachments with validation; never replace running DB. LAN importer normalizes legacy fields, states and frequencies, reconstructs pre-payment balances before applying uploaded payments, validates ownership and creates origination movements once. Server serves status read-only and route-scoped temporary pairing links; base sync requires configured PIN and manager session. Packaging adds jdk.httpserver and avoids stale artifacts; build under a new dated output directory.
## Phases
P1 lifecycle bug fix + regressions; P2 native follow-up/media + migration/tests; P3 isolated recovery + tests; P4 sync compatibility/HTTP acceptance; P5 Gradle verification and native Windows package smoke checks; external phone status-only connectivity if user available.
## User Data Constraint
User explicitly confirms mobile contains real customers and correct payments. Never pull a fictitious route into that app, reset/reinstall it, read its data for fixtures, sync against production office or execute restore in real paths. Only status endpoint may be used from actual phone without mutations.
