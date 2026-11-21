# Tasks: Immutable Financial Ledger & Real-Time FBV Cloud Sync

- [x] T001 Create Supabase migration `supabase/migrations/20261121000000_immutable_financial_ledger_and_renewals.sql` and apply it in `kredia-cartera`.
- [x] T002 Create Desktop Flyway migration `V4__immutable_financial_ledger.sql`, `FinancialEventEntity`, `FinancialEventRepository`, `ImmutableLedgerService`, and `ImmutableLedgerServiceTest`.
- [x] T003 Update `mobile/src/infrastructure/sync/supabase-client.ts`, `cloud-sync.ts`, `local-store.ts`, and `LoginView.tsx` to sync `renewals`, `settlements`, and immutable `financial_events` with Bogota date preservation.
- [x] T004 Upload `c:\Users\ASUS\Downloads\respaldo-fbv-2026-11-20.json` into `off-fbv-001` in Supabase (including historical `financial_events` ledger) and verify counts & immutability live.
- [x] T005 Run `.\gradlew.bat compileJava test installDist` in `desktop/`, rebuild `mobile/dist --clear`, and deploy to `https://cartera-movil.expo.app`.
