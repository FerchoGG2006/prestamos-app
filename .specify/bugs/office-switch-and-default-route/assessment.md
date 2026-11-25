# Bug Assessment: Clean Office Switch Isolation & Missing Default Route for Newly Registered Offices

- **Slug**: office-switch-and-default-route
- **Created**: 2026-11-21T15:49:00-05:00
- **Source**: urgent user report while onboarding newly created office `Inversiones JA` (`off-6eba7dafe4`)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim or summarized)

> "ya creé la oficina y me sale que usuario no registrado en el cel"
> "Necesito que esto funcione con la oficina que acabo de crear, no con una que tú crees. Necesito que ya funcione esa, Inversiones JA, y todo lo que creé. Así que rápido, que tengo 20 minutos para que el man venga a buscar eso."

## Symptom

1. For `Inversiones JA` (`off-6eba7dafe4`), the admin account was saved with `username = 'ruta1'` and `name = 'adminja'`, so entering `adminja` triggers `"Credenciales incorrectas o usuario no registrado."`.
2. Newly created offices via `OfficeLicensingService.registerCommercialOffice()` have `0` rows in `public.routes`. When the office logs in on mobile and creates its first customer/loan, `NewLoanModal` falls back to hardcoded `'route-norte'` (violating Supabase `routes.id` foreign key on sync).
3. On a mobile device previously logged into another office (e.g., `Inversiones FBV`), `localStore.applyLinkedOfficeBundle()` skips overwriting `this.routes` when `params.routes.length === 0`, spreads previous `this.officeConfig` (leaking `routeInitialCashBase`/`recoveryPin`), and does not clear previous `promises`/`nonPaymentVisits`/`activeSession`.
4. `LoginView.tsx` does not fall back to cloud authentication when a local username matches an old cached user with a different/stale password.

## Reproduction

1. Register a new office (`Inversiones JA`, `off-6eba7dafe4`) via Desktop `Panel Comercial`.
2. Query `public.routes` for `off-6eba7dafe4` → returns 0 rows.
3. Log into `Inversiones JA` (`ruta1`) on a mobile device previously linked to `Inversiones FBV` → FBV's `route-1` and `routeInitialCashBase` remain in memory instead of a clean office state.

## Suspected Code Paths

- `mobile/src/infrastructure/storage/local-store.ts:847-895` — `applyLinkedOfficeBundle()` leaks prior office config/routes/promises/visits when switching offices or when `params.routes` is empty.
- `mobile/src/presentation/views/auth/LoginView.tsx:233-243` — rejects login locally without checking cloud if a cached local user has a stale password.
- `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java:229-245` — `registerCommercialOffice()` creates `offices` and `users` without provisioning an initial `Ruta 1` row in `routes`.

## Root Cause Hypothesis

Confidence: **high**. Directly verified in code and live Supabase query (`off-6eba7dafe4` and `off-c995615df9` both have `0` rows in `public.routes`).

## Proposed Remediation

**Preferred**:
1. Provision default `Ruta 1` in Supabase for existing newly created offices (`off-6eba7dafe4` `Inversiones JA` and `off-c995615df9` `Inversiones La Plancha`) via `vendor_upsert_route`, and update `OfficeLicensingService.registerCommercialOffice()` to auto-provision `Ruta 1` for all future offices.
2. Fix `localStore.applyLinkedOfficeBundle()` to completely isolate office config, routes, promises, non-payment visits, and active session whenever switching offices (`!params.preserveLocalPortfolio`).
3. Fix `LoginView.tsx` to fall back to `handleCloudCredentialLogin()` whenever `supabaseSyncService.isConnected()` and local verification fails.
4. Update `WEB_BUILD_LABEL` to `web 1.2.19 (2026-11-21)`, verify with `npm run test:finance` + `npm run typecheck`, deploy live to `https://cartera-movil.expo.app`, and publish Android OTA update to `preview`.

**Files likely to change**:
- `mobile/src/infrastructure/storage/local-store.ts`
- `mobile/src/presentation/views/auth/LoginView.tsx`
- `mobile/src/presentation/utils/appUpdates.ts`
- `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java`
- `desktop/src/test/java/com/cartera/infrastructure/licensing/OfficeLicensingServiceTest.java`
- `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java`

**Tests to add or update**:
- Verify `mobile` `npm run test:finance` + `npm run typecheck`.
- Verify `desktop` `OfficeLicensingServiceTest` asserts default `Ruta 1` creation on `registerCommercialOffice`.

## Risks & Considerations

- Must NOT alter `ruta1` or `plancha1` usernames or passwords without user's explicit request, since the user may already be giving those exact credentials to the buyer.
- Must verify `fmcotpmydstyrwcmqazb.supabase.co` is present in exported web bundle and Android `.hbc` OTA bundle.

## Open Questions

None.
