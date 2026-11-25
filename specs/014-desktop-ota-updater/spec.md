# Feature Specification: Commercial Desktop OTA Auto-Updater (Base Shell v1.2.0)

**Feature Branch**: `014-desktop-ota-updater`
**Created**: 2026-11-25
**Status**: Approved by User (`"1. op a"`, `"2. sí, hazlo"`)
**Hosting**: Supabase Storage (`https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/`)
**Base Shell Version**: `1.2.0`

---

## 1. Problem Statement

Rebuilding and redistributing a full 82 MB Windows `.exe` installer (`jpackage` + Inno Setup `lzma2/ultra64`) for every incremental fix or feature causes two major commercial & developer bottlenecks:
1. **Developer Machine RAM & Disk Exhaustion**: Each full build consumes >1 GB RAM (`lzma2/ultra64` + unbounded Gradle daemons) and produces ~315 MB on disk, even though the application's own compiled code (`kredia-app.jar`) is only **~1.6 MB** (98% of the installer is static JDK 21 + JavaFX + Spring + Hibernate + SQLite libraries).
2. **Client Distribution Friction**: Sending and manually reinstalling `.exe` packages across every customer office for small updates does not scale commercially.

---

## 2. Functional Requirements

- **FR-1 Separated Base Shell Packaging (`v1.2.0`)**:
  - `SistemaCartera.exe` launches a lightweight native launcher (`com.cartera.launcher.KrediaLauncher`, pure JDK 21 stdlib, zero third-party dependencies).
  - Bundled third-party dependencies live in `app/libs/*`; the bundled baseline core app lives in `app/core/kredia-app.jar`.
  - `KrediaLauncher` spawns the bundled `runtime/bin/javaw.exe` with `-cp <resolvedCoreJar>;<appDir>/libs/* com.cartera.ui.CarteraMain`, passing `-Dkredia.shell.version`, `-Dkredia.launcher.exe`, and `-Dkredia.app.dir`, and exits immediately (0 MB RAM overhead).
  - Supports `--wait-pid=<pid>` using Java 21 `ProcessHandle` so in-app restarts cleanly wait for SQLite/JVM shutdown with zero console window flash.

- **FR-2 Secure OTA Patch Staging & Automatic Rollback (`~/.sistema-cartera/updates/`)**:
  - OTA updates stage inside `~/.sistema-cartera/updates/` (100% user-writable on Windows without UAC admin elevation).
  - `DesktopOtaService` downloads `kredia-app-<version>.jar` (~1.6 MB) to a `.part` file, verifies exact **SHA-256** digest, atomically moves it into place, writes `active-ota.json` (`pending_verification: true, attempts: 0`), and prunes stale cached JARs while preserving the previous version for rollback.
  - On startup, `KrediaLauncher` verifies the SHA-256 of the active OTA JAR and enforces a crash-guard watchdog: if `pending_verification == true` and `attempts >= 2`, `KrediaLauncher` automatically rolls back to `previous_jar_file` (or bundled baseline) so a broken update can never lock out an office.
  - Once `CarteraApplication` boots cleanly, it calls `DesktopOtaService.markCurrentBootHealthy()` (`pending_verification: false, attempts: 0`).

- **FR-3 Seamless Client Update UX (OTA + Fallback Full Installer)**:
  - `DesktopUpdateChecker` checks `https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/latest.json` silently in the background.
  - When `latest_version > AppVersion.CURRENT` and `installedShellVersion >= min_shell_version` and `core_jar_url` + `core_jar_sha256` are present (running inside `KrediaLauncher`), it automatically downloads & verifies the 1.6 MB patch in the background and surfaces a top-bar pill: **`⬇ vX.Y.Z lista — Reiniciar`**.
  - Clicking the pill shows release notes and a **"Reiniciar y actualizar ahora"** button (closes Spring/SQLite gracefully, launches `SistemaCartera.exe --wait-pid=<pid>`, exits).
  - When `min_shell_version > installedShellVersion` (rare runtime/dependency upgrade), falls back cleanly to downloading the full `.exe` installer from `installer_url`.

- **FR-4 Fast 5-Second OTA Publishing Pipeline & Dev RAM Relief**:
  - `desktop/gradle.properties` caps Gradle JVM memory (`-Xmx1024m`) and shortens idle daemon timeout.
  - `desktop/packaging/windows/installer.iss` switches from `lzma2/ultra64` to `lzma2/fast` to slash RAM usage by ~80% when compiling the base shell.
  - Gradle task `buildOtaPatch` builds ONLY `desktop/dist/ota/kredia-app-<version>.jar` + `desktop/dist/ota/latest.json` (with automatic SHA-256 & byte size) in ~5 seconds without running `jpackage` or Inno Setup.
  - Script `scripts/publish-desktop-ota.ps1` builds and uploads the 1.6 MB JAR + `latest.json` directly to Supabase Storage bucket `desktop-updates`.
  - Supabase migration `supabase/migrations/20261125000000_desktop_updates_storage_bucket.sql` creates the public `desktop-updates` bucket with strict RLS (public `SELECT`, vendor-key/service-role `INSERT`/`UPDATE`/`DELETE`).
