# Bug Verification: Signed Daily Cash Reconciliation Clamped to $0 & Ticket Payment Count

- **Slug**: settlement-net-cash-clamping
- **Tested**: 2026-11-21T13:10:00-05:00
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

All reproduction cases (deficit balance `-$77.000` moving to `-$67.000` after a `+$10.000` collection, positive surplus `+$10.000`, non-negative physical handover `$0`, and strict session-day payment filtering), the full mobile financial regression suite, TypeScript type-checking, production Web deployment (`https://cartera-movil.expo.app`), and Android OTA update (`preview` channel with verified Supabase env vars in the `.hbc` binary) passed with zero regressions.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix) & new unit tests | `cd mobile; npm run test:finance` | pass | Tests 7 & 8 verify `23000 - 100000 = -77000`, `33000 - 100000 = -67000`, `cashToHandOver = 0`, positive surplus, and session-day payment filter. |
| Regression suite (finance + renewals + backup) | `cd mobile; npm run test:finance` | pass | 8/8 core finance tests, 2/2 renewal integration tests, `RENEWAL_MATRIX PASS scenarios=127 assertions=1632`, backup/new-loan test passed. |
| TypeScript type-check | `cd mobile; npm run typecheck` | pass | Exit code 0, zero TypeScript diagnostics. |
| Web production build & bundle verification | `cd mobile; npx expo export --platform web --clear` + bundle inspection | pass | `index-ac54fd4097dba581fea29600566df211.js` contains Supabase URL, `web 1.2.18 (2026-11-21)`, and `BALANCE NETO DEL DÍA`. |
| Web production deploy (iPhone / browser) | `cd mobile; npx eas-cli deploy --prod --non-interactive` + `curl.exe` live check | pass | `https://cartera-movil.expo.app` verified live serving `index-ac54fd4097dba581fea29600566df211.js`. |
| Android OTA publish & `.hbc` binary verification | `eas env:create` + `eas update --channel preview --environment preview --platform android --clear-cache` + `.hbc` inspection | pass | Update group `d9fff71a-e243-44af-abcc-87169c1ddea4` published; `.hbc` verified `{ hbcUtf8Supa: true, hbcUtf16Def: true }`. |

## Output Excerpts

```text
Test 7: Balance neto diario con signo y déficit cubierto por base
Test 7 superado con éxito.
Test 8: Conteo estricto de pagos de la jornada actual
Test 8 superado con éxito.
¡TODAS LAS PRUEBAS FINANCIERAS FUERON SUPERADAS AL 100%!
RENEWAL_MATRIX PASS scenarios=127 assertions=1632
✅ Test de respaldo completo, desembolsos con recaudo y persistencia/recuperación de Base tras recarga superado al 100%
```

```text
Production URL  https://cartera-movil.expo.app -> index-ac54fd4097dba581fea29600566df211.js
Android OTA     d9fff71a-e243-44af-abcc-87169c1ddea4 -> { hbcUtf8Supa: true, hbcUtf16Def: true }
```

## Residual Risks

- `version.json` has been updated locally in this repository; pushing the commit to `github.com/FerchoGG2006/prestamos-app` `main` is required for legacy Android APKs (`v1.2.2`) to see the updated `CLOUD_VERSION_URL` payload remotely.
- Note that running `eas update --platform android` overwrote the local `mobile/dist/` folder with the Android export (live Web hosting already holds the promoted static web export `index-ac54fd4097dba581fea29600566df211.js`).

## Recommendation

Close the bug — verified end-to-end across automated finance/typecheck tests, live Web production (`https://cartera-movil.expo.app`), and Android OTA (`preview`).
