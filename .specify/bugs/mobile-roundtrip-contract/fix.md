# Fix: Real mobile-engine roundtrip
- Slug: mobile-roundtrip-contract (from current assessment)
- Date: 2026-11-18
- Status: applied
- Assessment: assessment.md
## Changes
Desktop MobileSyncProcessorService now exports mobile status/frequency/required-field names while retaining the amount alias, history of route credits, renewals and payments with allocations. Required creation dates and migration markers allow the actual mobile engine to operate downloaded credits. An audited mapping preserves original mobile Payment IDs across native persistence and re-export, preventing duplicate records on the device. Mapping conflicts reject the transactional package rather than modify old amounts. No installed phone or mobile application source changed; only a memory-isolated test runner was added under mobile/scripts.
## Tests
MobileEngineRoundTripTest spawns the actual TS localStore with mock AsyncStorage backed by a process-only Map, connects to a temporary JavaFX HTTP server/SQLite, exercises payment/renewal/digital payment/repeated push/return pull and then discards local test arrays and verifies reconstruction into an empty client. Opening debt620000/cash500000, cash20000, renewed700000 at40%, paper35000, net65000, digital10000 -> debt970000/cash420000/digital10000/Admin1400000.
## Verification
Initial reproduction failed at ACTIVO != ACTIVE. First corrected real-engine roundtrip passed. Final full-suite results recorded in test.md. No extension hooks registered.
## Limits
PC process with actual mobile engine is not a physical Android UI journey. General opening-ledger reconciliation for unrelated legacy portfolios, settlement download, profile/media changes and ambiguous reversal reconciliation are not certified by this fixture. No real historical records were read or changed.
