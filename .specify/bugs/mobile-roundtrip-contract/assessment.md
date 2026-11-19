# Assessment: Real mobile-engine roundtrip contract
- Date: 2026-11-18
- Slug: mobile-roundtrip-contract (generated from authorized isolated roundtrip task)
- Verdict: valid, reproduced
## Evidence
MobileEngineRoundTripTest executes actual legacy TS localStore with memory-only AsyncStorage and a real JavaFX HTTP server on isolated SQLite. Initial run fails: ACTIVO != ACTIVE immediately after pull. Static review confirms missing expectedAmount/createdAt fields, missing historical loans/renewals/payments on download, and potential duplicate mobile/native payment identities after authoritative return.
## Proposed Remediation
Fix desktop export only, keeping installed phone and mobile application source unchanged. Emit the mobile field/status/frequency contract plus compatible aliases; include required history, renewal and payment/allocation records for the selected route. Preserve incoming mobile payment IDs through audited identity mappings instead of changing financial records or historical amounts. Do not import device-exported copies of desktop bookkeeping as new expenses. Reject ambiguous contracts rather than infer financial corrections. Use the real mobile engine to exercise pull -> cash payment -> renewal -> digital payment -> push -> duplicate push -> authoritative pull.
## Files likely to change
MobileSyncProcessorService; test-only mobile/scripts/test-desktop-roundtrip.cjs; MobileEngineRoundTripTest; QA reports.
## Tests
Opening debt620000/cash500000; cash payment20000; renewal700000 at40%, paper35000, cash65000; digital payment10000; final debt970000/cash420000/digital10000/admin1400000. Repeated push must not duplicate 2 payments or 1 renewal; real mobile engine sees old credit RENEWED after download. All existing 58 desktop tests and 35 financial journeys must pass.
## Risks
No real mobile/office data access or writes. This verifies actual engine and HTTP in isolated PC runtimes, not physical Android transactions. Generic initial-cash reconciliation across all legacy historical portfolios remains a separate acceptance concern; this journey uses an explicit, known fixture, no invented corrections.
