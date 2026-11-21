# Implementation Plan: Immutable Financial Ledger & Real-Time FBV Cloud Sync

**Branch**: `005-immutable-financial-ledger` | **Date**: 2026-11-21 | **Spec**: [spec.md](file:///c:/Users/ASUS/prestamos-app-1/specs/005-immutable-financial-ledger/spec.md)

## Technical Context
- **Cloud Database**: Supabase PostgreSQL (`kredia-cartera` / `fmcotpmydstyrwcmqazb`)
- **Desktop**: Java 21, JavaFX 21, Spring Boot 3.4, SQLite + Flyway (`V4__immutable_financial_ledger.sql`), `BigDecimal` strictly
- **Mobile/Web**: Expo React Native Web (`mobile/`), `@supabase/supabase-js`, `eas-cli deploy --prod`

## Constitution Check
- [x] **I. JavaFX 21 Native Desktop**: Desktop ledger infrastructure is pure Spring/Flyway/SQLite (`desktop/`), zero web desktop UI.
- [x] **II. Financial Precision (`BigDecimal`)**: `ImmutableLedgerService` and `FinancialEventEntity` use `BigDecimal` exclusively.
- [x] **III. Transactionality, Immutability & Auditability**: Enforced at database engine level with SQLite & PostgreSQL `BEFORE UPDATE` / `BEFORE DELETE` triggers + Flyway migration `V4`.
- [x] **IV. Cryptographic Security**: `admin-fbv` credentials preserved with salted cryptographic hash; collector username made globally unique (`cobrador-fbv`).
- [x] **V. Gradle Verification**: Verified with `.\gradlew.bat compileJava test`.

## Source Code Changes
1. **Supabase SQL Migration**: `supabase/migrations/20261121000000_immutable_financial_ledger_and_renewals.sql`
   - Widen `installments.status` and `cash_movements.category` checks to match real operational values.
   - Add `idempotency_key` & `installments_breakdown` to `payments`.
   - Create `public.renewals` and `public.daily_settlements`.
   - Create `public.financial_events` with `BEFORE UPDATE OR DELETE` immutability trigger (`prevent_financial_event_mutation`) and `public.office_ledger_balances` view.
2. **Desktop Flyway + Immutable Ledger**:
   - `desktop/src/main/resources/db/migration/V4__immutable_financial_ledger.sql` (SQLite table + `BEFORE UPDATE`/`BEFORE DELETE` `RAISE(ABORT, ...)` triggers).
   - `desktop/src/main/java/com/cartera/infrastructure/persistence/entity/FinancialEventEntity.java`
   - `desktop/src/main/java/com/cartera/infrastructure/persistence/repository/FinancialEventRepository.java`
   - `desktop/src/main/java/com/cartera/ledger/application/ImmutableLedgerService.java` (`BigDecimal` append-only ledger + idempotency + balance projection).
   - `desktop/src/test/java/com/cartera/ledger/application/ImmutableLedgerServiceTest.java` (proves DB-level immutability, idempotency, and `BigDecimal` balance accuracy).
3. **Mobile/Web Sync & Immutable Events**:
   - `mobile/src/infrastructure/sync/supabase-client.ts`: Support `renewals`, `settlements`, `idempotency_key`, `installments_breakdown`, Colombia timezone date normalization, `appendFinancialEvent`, `appendFinancialEventsBatch`, and `pullFinancialEvents`.
   - `mobile/src/infrastructure/sync/cloud-sync.ts` & `mobile/src/infrastructure/storage/local-store.ts`: Emit immutable `financial_events` on payments/reversals/loans/renewals/cash movements, sync `renewals` & `settlements`, and hydrate `renewals` & `settlements` in `applyLinkedOfficeBundle`.
4. **FBV Real Data Migration**:
   - Import `c:\Users\ASUS\Downloads\respaldo-fbv-2026-11-20.json` into `off-fbv-001` in Supabase (routes, users, 21 customers, 22 loans, 307 installments, 35 payments, 1 renewal, 3 settlements, 60 cash movements + historical immutable `financial_events`), preserving `admin-fbv` login!
5. **Build, Verify & Production Deploy**:
   - Apply SQL migration in Supabase SQL Editor via browser subagent.
   - Run FBV backup uploader & verify live counts and `office_ledger_balances`.
   - Run `.\gradlew.bat compileJava test` in `desktop/`.
   - Run `npx expo export --platform web --clear` & `npx eas-cli deploy --prod --non-interactive` in `mobile/`.
