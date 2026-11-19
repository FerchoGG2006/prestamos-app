# Tasks: Native desktop operational parity
## Phase 1 Foundations
- [x] T001 Record spec, clarification assumptions and research in specs/003-desktop-operational-parity/
- [x] T002 [US1] Implement authorized atomic lifecycle in desktop/src/main/java/com/cartera/customers/application/CustomerLifecycleService.java and remove UI repository fallbacks
- [x] T003 [US1] Regression-test rejected/partial/successful/replayed deactivation and profile reassignment
## Phase 2 Native follow-up and files
- [x] T004 [US2] Implement FollowUpService for promises, immutable visits and due alerts
- [x] T005 [US3] Add V3 attachment metadata and AttachmentService managed storage
- [x] T006 [US2] [US3] Add CustomerOperationsDialog and wire native customer actions
- [x] T007 [US2] [US3] Verify roles, retry, no financial side effects and file persistence
## Phase 3 Recovery
- [x] T008 [US4] Implement read-only validation and office bundle recovery to new empty directory
- [x] T009 [US4] Add native recovery dialog and --office-dir startup override
- [x] T010 [US4] Verify recovery of DB/closed records/attachments, reject corruption/path traversal/overwrite
## Phase 4 Sync
- [x] T011 [US5] Normalize legacy contract; fail closed on ambiguous financial snapshots
- [x] T012 [US5] Add route-scoped temporary pairing and protected exports
- [x] T013 [US5] Verify HTTP push/pull, repeated lot, foreign route, invalid credential and closed day
## Phase 5 Distribution and acceptance
- [x] T014 [US6] Include jdk.httpserver, configurable installer compiler, fresh package output
- [ ] T015 Run full Gradle suite and original officeJourneyQa; inspect native dialogs and packaged isolated startup
- [x] T016 External acceptance: phone browser status only; do not mutate real mobile data
- [ ] T017 External acceptance: installer/update on another Windows PC
## Dependencies
US1 -> US2/US3 -> US4; US5 independent of native files but must pass financial regressions; US6 after all tests. Parallel examples: read-only sync/recovery research; implementation executes sequentially in shared workspace. MVP preserves user data before adding operations.

## Phase 6: Convergence — 2026-11-18
The code satisfies the native service/data requirements and passes 58 tests plus the original 35-scenario journey. Remaining acceptance depends on external devices or a Windows activation condition; no real user data may be used as a disposable fixture.
- [ ] T018 [US2] [US3] [US4] Complete visual acceptance of CustomerOperationsDialog and RecoveryDialog after resolving Windows Computer Use error `failed to activate captured window` (refines T015).
- [ ] T019 [US5] Confirm phone-browser status response, then run a full journey only with a separate disposable phone dataset/application, never the user's existing real clients (refines T016).
- [ ] T020 [US6] Execute installer/update acceptance on another Windows PC while preserving an isolated office, and record restart persistence (refines T017).

## Roundtrip acceptance update — 2026-11-18
- [x] T021 [US5] Run actual legacy mobile engine in memory against temporary native HTTP/SQLite; correct export contract and identity preservation (mobile-roundtrip-contract).
- [x] T022 [US5] Verify duplicate upload and empty-client reconstruction, 59 tests and 35 original journeys.
- [ ] T023 [US5] Repeat financial transactions inside a separate disposable Android environment. User has only the phone with real clients; do not use it or reset/reconfigure its app. PC has no Android emulator.
