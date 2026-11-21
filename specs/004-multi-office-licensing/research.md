# Research: Multi-Office Registry, Licensing & Device Linking

**Feature**: `004-multi-office-licensing`  
**Date**: 2026-11-20

## 1. Root Cause of Current Behavior

### Decision: Remove hardcoded FBV bootstrap in mobile and replace name-derived `officeId` with immutable `officeId`
- **Finding in `mobile/src/infrastructure/storage/local-store.ts`**:
  - `DEFAULT_OFFICE_CONFIG.companyName` is hardcoded to `'Inversiones FBV'`.
  - `loadInitialData()` unconditionally sets `this.officeConfig.companyName = 'Inversiones FBV'` if empty, forces `this.officeConfig.isSetupCompleted = true`, and force-creates `admin-fbv` in `this.users` even on a brand-new device.
- **Finding in `mobile/src/infrastructure/sync/cloud-sync.ts`**:
  - `formattedOfficeId` is computed on every sync from `cfg.companyName` (`off-${companyName.toLowerCase().replace(...)}`).
  - If two offices use the same name, they collide in Supabase; if an office renames itself, it loses its `office_id`.
- **Rationale**: Fresh installs must start with `officeId: ''`, `companyName: ''`, `isSetupCompleted: false`, `users: []`, `routes: []`, while preserving existing local data on devices that already have `savedCustomers` / `savedLoans` / `savedPayments` (FBV protection).
- **Alternatives considered**: Keeping `'Inversiones FBV'` as a template and asking users to rename it. Rejected because renaming still leaks FBV branding, creates `admin-fbv` by default, and cannot guarantee unique `office_id` isolation.

## 2. Central Office Registry & Licensing

### Decision: Extend existing Supabase `offices` table with `activation_code`, `license_status`, `license_plan`, and `license_expires_at`
- **Finding in `supabase/migrations/20261111000000_multitenant_cartera_schema.sql`**:
  - The database already defines `offices`, `users`, `routes`, `customers`, `loans`, `installments`, `payments`, and `cash_movements` keyed by `office_id`.
- **Rationale**: Extending `offices` avoids duplicating infrastructure and works for both the JavaFX desktop application (via `java.net.http.HttpClient` + Jackson to Supabase REST/RPC) and the mobile companion app (via `@supabase/supabase-js`).
- **Alternatives considered**: Building a separate custom Spring Boot licensing server hosted on a VPS. Rejected for v1 because Supabase is already integrated in the repository and requires zero extra server provisioning, while still allowing a future backend migration behind the same contract.

## 3. Vendor Panel & Desktop Integration (Constitution Compliance)

### Decision: Implement the Vendor Commercial Console inside the native JavaFX 21 desktop application
- **Constitution Check**: `AGENTS.md` and `.specify/memory/constitution.md` mandate that the primary desktop UI is **JavaFX 21 + Spring Boot 3.4** (no React/WebView/localhost UI for desktop).
- **Rationale**: Adding a dedicated **Panel Comercial (Vendedor)** dialog/view in JavaFX (protected by a vendor PIN/secret and/or `SUPER_ADMIN` role) lets the product owner register offices, issue activation codes, manage licenses (`ACTIVE` / `SUSPENDED` / `EXPIRED`), and export/migrate FBV safely without violating the native desktop rule.
- **Security**: Passwords use `PBKDF2-HMAC-SHA256` (`PasswordHasher.java` on desktop) and salted/hashed verification on mobile, never plaintext.
