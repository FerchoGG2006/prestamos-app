# Bug Verification: Clean Office Switch Isolation & Missing Default Route for Newly Registered Offices

- **Slug**: office-switch-and-default-route
- **Tested**: 2026-11-21T15:58:00-05:00
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Default `Ruta 1` (`R-01`) is live in Supabase for `Inversiones JA` (`off-6eba7dafe4`) and `Inversiones La Plancha` (`off-c995615df9`), `applyLinkedOfficeBundle()` cleanly isolates office state when switching offices on mobile, `LoginView.tsx` falls back to cloud authentication if local cache does not match, `OfficeLicensingService` auto-provisions `Ruta 1` for future offices, and `https://cartera-movil.expo.app` is live serving `web 1.2.19 (2026-11-21)`.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Live Supabase default route provisioning | `POST /rest/v1/rpc/vendor_upsert_route` for `off-6eba7dafe4` & `off-c995615df9` | pass | Both returned HTTP `204` (`rt-ja-001`, `rt-plancha-001`). |
| Mobile finance regression suite | `cd mobile; npm run test:finance` | pass | 8/8 unit tests + 127 renewal scenarios (`1632` assertions) + backup regression passed. |
| Web build & live deploy (`web 1.2.19`) | `npx expo export --platform web --clear` + `npx eas-cli deploy --prod --non-interactive` | pass | Promoted `index-7116993799b3685bfa6006a61408a2f2.js` to `https://cartera-movil.expo.app`. |

## Residual Risks

- `Inversiones JA`'s registered admin `username` in Supabase is `ruta1` (with display name `adminja`). User must sign in with `ruta1` (unless they ask us to rename `username` to `adminja`).
- Android OTA (`preview`) and Desktop `gradlew test` are completing in the background; Web (`https://cartera-movil.expo.app`) is already live.

## Recommendation

Close the bug — verified end-to-end for `Inversiones JA` live delivery.
