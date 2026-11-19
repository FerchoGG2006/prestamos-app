# Verification: Real mobile-engine roundtrip
- Slug: mobile-roundtrip-contract (resolved from current assessment/fix)
- Date: 2026-11-18
- Assessment: assessment.md
- Fix: fix.md
- Result: verified for isolated real-engine/HTTP reproduction

## Checks performed
| Check | Result | Evidence |
|---|---|---|
| Original actual-engine reproduction | reproduced before fix | Initial run failed ACTIVO != ACTIVE after real localStore pull |
| Real TS localStore + memory-only AsyncStorage + native HTTP/SQLite | pass | MobileEngineRoundTripTest: pull, cash20k, renewal700k/40%, paper35k, net65k, NEQUI10k, push, duplicate push, return pull |
| Empty-client reconstruction | pass | Discarded process-local fixture arrays and re-downloaded history; same debt/cash/Admin and exactly2 payments/1 renewal |
| Full regression | pass | 59 JUnit tests, no failures/errors/skips |
| Original diagnostic journey | pass | 35/35 unchanged scenarios |
| Physical phone connectivity | confirmed by user | Phone browser returned status OK on fictitious desktop server |
| Physical Android financial transactions | not run | User only has a phone with real clients; that app must remain untouched. No Android emulator found locally. |

Commands: `.\gradlew.bat :desktop:test :desktop:officeJourneyQa --offline --console=plain -PisolatedBuildDir=build/mobile-roundtrip-20261118` -> BUILD SUCCESSFUL. Final counts and JSON result are in docs/qa/2026-11-18/mobile-roundtrip/. .specify/extensions.yml has hooks: {}.

## Observed values
Opening cash500000/debt620000. Cash payment20000 -> cash520000/debt600000. Renewal700000 at40%, paperwork35000, net65000 -> cash420000/debt980000. Digital payment10000 -> cash420000/digital10000/debt970000/Admin1400000. Duplicate upload preserves values and identities.

## Limits and recommendation
This closes the reproduced desktop export/identity defects against actual mobile source, without changing or reinstalling the real phone application. It is not a physical Android UI transaction test or certification of every real historical portfolio, opening-capital model, closed-settlement download or reversal. Keep physical transactions pending until a separate disposable Android environment is available. No real customer/office records were read or altered.
