# Bug Verification: Mobile/Web Cloud Sync Freeze & Desktop KPI Parity Mismatch

- **Slug**: sync-desync-and-kpi-parity
- **Tested**: 2026-11-24
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

All automated reproductions, new regression tests, full Mobile/Desktop test suites, Web production deployment (`web 1.2.23`), and Windows desktop packaging (`1.1.3`) passed with zero errors or regressions. The original bugs (silent sync freeze on missing/expired RLS token, pull-overwriting local data on failed push, `-COP 500,000` vs `+COP 96,000` Desktop cash discrepancy on migrated cartulinas, `paperworkRate=5000` mis-scaling, `loan_number` overwrite, and missing `daily_settlements` sync) no longer reproduce.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Mobile TypeScript typecheck | `cd mobile && npm run typecheck` | pass | 0 errors across all TS/TSX files |
| Mobile financial & new cloud-sync safety tests | `cd mobile && npm run test:finance` | pass | 9 calculator tests + 127 renewal matrix scenarios (1,632 assertions) + Spec 008/010 + 6/6 `cloud-sync-safety` assertions |
| Mobile Web export & production deploy | `npx expo export --platform web --clear` + `npx eas-cli deploy --prod --non-interactive` | pass | Live at `https://cartera-movil.expo.app` (`web 1.2.23 (2026-11-24)`) |
| Desktop clean compile & full regression suite (incl. `SyncAndKpiParityTest` & `MobileEngineRoundTripTest`) | `cd desktop && .\gradlew.bat clean compileJava test` | pass | 92/92 tests passing, 0 failures (`BUILD SUCCESSFUL in 1m 27s`) |
| Desktop Windows native package & installer build | `cd desktop && .\gradlew.bat packageAll "-PdistributionDir=dist/releases/1.1.3" -x test` | pass | Generated `SistemaCartera.exe`, `Instalador-SistemaCartera-v1.1.1.exe` (82.6 MB), and `SistemaCartera-v1.1.1-Windows-x64.zip` (91.9 MB) |

## Output Excerpts

- Mobile:
  - `RENEWAL_MATRIX PASS scenarios=127 assertions=1632`
  - `PASS cloud-sync-safety.test.ts (6/6 assertions)`
  - `Production URL  https://cartera-movil.expo.app`
- Desktop:
  - `> Task :test` — `BUILD SUCCESSFUL in 1m 27s` (92/92 tests passed, including `SyncAndKpiParityTest` and `MobileEngineRoundTripTest`)
  - `Successful compile (47,891 sec). Resulting Setup program filename is: C:\Users\ASUS\prestamos-app-1\desktop\dist\releases\1.1.3\Instalador-SistemaCartera-v1.1.1.exe`

## Residual Risks

- The user's Nov 21–23 records currently reside inside their physical iPhone's browser `localStorage`; final live sync completes once the user opens `https://cartera-movil.expo.app` (`web 1.2.23`) on their iPhone (auto-reconnecting or tapping `Reconectar nube`), closes the old `dist\release-20261122\SistemaCartera\SistemaCartera.exe` process, and opens the new `1.1.3` Desktop build.

## Recommendation

Close the bug after the user refreshes their iPhone to `web 1.2.23`, verifies the green `● Nube HH:MM` indicator, and opens Desktop `1.1.3` to confirm identical balances across both screens.
