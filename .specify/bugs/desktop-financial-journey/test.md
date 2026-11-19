# Bug Verification: desktop financial journey

- **Slug**: desktop-financial-journey (resolved from current assessment/fix context)
- **Tested**: 2026-11-17
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary
All eleven originally failing diagnostic scenarios pass. The original journey now passes 35/35 unchanged checks, and 41 JUnit tests pass with zero failures, errors or skipped tests. All database writes used synthetic offices or temporary test databases.

## Checks Performed

| Check | Command / Action | Result | Notes |
|---|---|---|---|
| Original reproduction, post-fix | `gradlew.bat :desktop:officeJourneyQa --offline` | pass | 35/35 unchanged service/SQLite scenarios, including all 11 original failures |
| Broader regression and compilation | `gradlew.bat :desktop:test :desktop:officeJourneyQa --offline --console=plain` | pass | Exit 0; 41 JUnit tests; original 30 retained, 11 added |
| New integration regressions | DesktopFinancialJourneyTest | pass | Cash/digital assets, allocation retention, authorization, closed periods/backdating, replay mismatch, atomic import, renewed-contract protection, backup contents/rollback |
| Missing database backup | DatabaseBackupServiceTest | pass | Uses active datasource path and rejects missing file without creating a .db placeholder |
| Native JavaFX | `gradlew.bat :desktop:officeQa --offline` and Computer Use | pass | Fictitious-office admin login, separate account cards, cash/digital settlement breakdown visibly rendered |
| Diff hygiene | `git diff --check` | pass | No whitespace errors; existing Git LF/CRLF advisory only |
| Android/LAN / installer / complete restore | External acceptance | not-run | Outside the reproduced desktop failures |

## Output Excerpts

```
JUnit: tests=41 failures=0 errors=0 skipped=0
QA_RESULT total=35 pass=35 fail=0
BUILD SUCCESSFUL in 1m 10s
```

Final isolated journey evidence: `desktop/build/qa/service-journey-13411375826719373756/journey-results.json`. Durable copy: `docs/qa/2026-11-17/journey-results-post-fix.json`. Original failing evidence remains in journey-results.json. Full build output: `desktop/build/qa/post-fix-verification.log` (ignored local artifact).

## Residual Risks

The final visual pass checked rendering and navigation, not a second complete UI transaction journey. Service regressions exercise real SQLite transactions and committed backup contents. Physical Android/LAN, full office restore, installer on another PC, printing, WhatsApp and maps were not certified. Historical bad entries were not silently changed; a separate auditable correction is required. No production deployment.

## Recommendation
Close the eleven reproduced desktop/service defects as verified. Retain external acceptance tasks before production rollout. `.specify/extensions.yml` has `hooks: {}`; no before/after fix or verification hooks apply.
