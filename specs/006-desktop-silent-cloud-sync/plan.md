# Implementation Plan: Zero-Jargon Automatic Desktop Cloud Auth & Background Sync

**Branch**: `006-desktop-silent-cloud-sync` | **Date**: 2026-11-21

## Changes
1. `desktop/src/main/resources/application.properties`: Add default `cartera.cloud.url` and `cartera.cloud.anon-key` properties so end users never enter cloud settings.
2. `desktop/src/main/java/com/cartera/infrastructure/security/PasswordHasher.java`: Add `verifyAny(raw, stored)` supporting both `PBKDF2-HMAC-SHA256` (`saltHex$hashHex`) and mobile `sha256$salt$hash`.
3. `desktop/src/main/java/com/cartera/infrastructure/security/AuthService.java`: Fix `determineRole` to recognize `usr-adm*` and `admin*` usernames (and persisted user roles).
4. `desktop/src/main/java/com/cartera/infrastructure/licensing/OfficeLicensingService.java`: Fall back to `cartera.cloud.url` / `cartera.cloud.anon-key` when `system_setting` has no override.
5. `desktop/src/main/java/com/cartera/infrastructure/licensing/SupabaseRegistryClient.java`: Add `findActiveUsersByUsername`, `findOfficeById`, `fetchOfficePortfolio`, and `upsertTableRows` / `insertImmutableEvents` REST helpers.
6. `desktop/src/main/java/com/cartera/sync/application/DesktopCloudSyncService.java`:
   - `authenticateAndHydrate(username, rawPassword)`: Cloud login + license check + safe backup if switching offices + full portfolio hydration into SQLite (mapping statuses/categories cleanly) + offline fallback when network is unavailable.
   - `syncSilentlyInBackground()`: Automatic bidirectional push (local SQLite -> Supabase + immutable `financial_events`) and pull (Supabase -> SQLite) with zero UI interruptions.
7. `desktop/src/main/java/com/cartera/ui/views/LoginView.java` & `CarteraApplication.java`:
   - Clean zero-jargon login (only Usuario + Contraseña + Ingresar; remove public `"Registrar mi oficina y crear credenciales"`; keep discreet PIN-protected `"Acceso distribuidor"`).
   - Run authentication off the JavaFX UI thread with `"Ingresando..."` indicator.
   - Start automatic 30-second silent background sync timer upon login (stopping cleanly on logout/exit) and auto-refresh active dashboard views when remote updates arrive.
8. `desktop/src/test/java/com/cartera/sync/application/DesktopCloudSyncServiceTest.java`: Unit tests covering `sha256$` + `PBKDF2` verification, status/category mapping, and cloud auth + hydration.
