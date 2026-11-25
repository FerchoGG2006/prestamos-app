# Technical Plan: Commercial Desktop OTA Auto-Updater (v1.2.0)

**Spec Reference**: [spec.md](file:///c:/Users/ASUS/prestamos-app-1/specs/014-desktop-ota-updater/spec.md)

---

## Architecture & Deliverables

### 1. Standalone Pure-JDK Launcher (`com.cartera.launcher.KrediaLauncher`)
- **NEW** `desktop/src/launcher/java/com/cartera/launcher/KrediaLauncher.java` (separate Gradle `sourceSet` `launcher` with ZERO external dependencies -> compiles to a tiny ~10 KB `kredia-launcher.jar`!).
- Responsibilities:
  - Parse `--wait-pid=<pid>` and wait up to 15s for the previous JVM to exit cleanly via `ProcessHandle.of(pid)`.
  - Resolve `appDir` (location of `kredia-launcher.jar`), `installDir` (`appDir.getParent()`), `bundledCoreJar` (`appDir/core/kredia-app.jar`), `libsDir` (`appDir/libs`), and `updatesDir` (`~/.sistema-cartera/updates`).
  - Read `active-ota.json` using zero-dependency minimal JSON key reader/writer.
  - Validate SemVer (`otaVersion > shellVersion`), JAR existence, and **SHA-256** digest.
  - Crash-guard watchdog: if `pending_verification == true` and `attempts >= 2`, roll back to `previous_jar_file` (if valid) or bundled baseline JAR and log to `updates/launcher.log`. Otherwise increment `attempts` before spawning.
  - Spawn `runtime/bin/javaw.exe` (or `java.home/bin/javaw.exe`) with `-cp "<selectedCoreJar>;<libsDir>\*"` + JVM options (`UTF-8`, `America/Bogota`, `es_CO`, `-Dkredia.shell.version=...`, `-Dkredia.launcher.exe=...`, `-Dkredia.app.dir=...`, `-Dkredia.active.jar=...`) + `com.cartera.ui.CarteraMain` + forwarded args.
  - Expose pure package-private/public static methods (`resolveLaunchPlan(...)`, `computeSha256(...)`, `compareSemver(...)`) for thorough JUnit testing without spawning processes!

### 2. Application OTA Engine (`DesktopUpdateChecker` + `DesktopOtaService`)
- **MOD** `AppVersion.java`: bump `CURRENT = "1.2.0"`, add `SHELL_VERSION = "1.2.0"`, helper `installedShellVersion()` reading `System.getProperty("kredia.shell.version", "")`, and `isOtaSupported()`.
- **MOD** `DesktopUpdateChecker.java`:
  - Default URL -> `https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/latest.json`.
  - Expand `UpdateInfo` with `minShellVersion`, `coreJarUrl`, `coreJarSha256`, `coreJarSizeBytes`, `installerUrl`, and helper `supportsOtaForShell(String installedShellVersion)`.
- **NEW** `desktop/src/main/java/com/cartera/infrastructure/version/DesktopOtaService.java`:
  - Manages `~/.sistema-cartera/updates/` (`active-ota.json`, `kredia-app-<ver>.jar`).
  - `markCurrentBootHealthy()`: sets `pending_verification = false, attempts = 0` when running from an OTA JAR.
  - `stageOtaUpdate(DesktopUpdateChecker.UpdateInfo info)`: downloads `coreJarUrl` to `.part`, verifies exact SHA-256, atomically moves into `kredia-app-<ver>.jar`, writes `active-ota.json` preserving `previous_version` / `previous_jar_file` for rollback, prunes obsolete cached JARs.
  - `isVersionAlreadyStaged(String version)`: avoids redownloading an already staged patch!
  - `relaunchToApplyUpdate(Runnable shutdownCallback)`: executes `shutdownCallback` (Spring/SQLite close), spawns `SistemaCartera.exe --wait-pid=<currentPid>`, exits cleanly.

### 3. UI Integration (`CarteraApplication`, `ConfigurationView`, `application.properties`)
- **MOD** `application.properties`: point `cartera.update.url` to Supabase Storage `desktop-updates/latest.json`.
- **MOD** `CarteraApplication.java`:
  - Call `desktopOtaService.markCurrentBootHealthy()` right after Spring/JavaFX boots.
  - In `checkForDesktopUpdateAsync()`: when update is available and OTA-compatible, silently download & verify the 1.6 MB JAR in background, then show **`⬇ vX.Y.Z lista — Reiniciar`** pill!
  - In `showAvailableUpdateDialog()`: if OTA is staged, offer **"Reiniciar y actualizar ahora"** (calls `desktopOtaService.relaunchToApplyUpdate(...)` after closing Spring context) + **"Aplicar al próximo inicio"**. If full installer required (`min_shell_version > shell`), offer **"Descargar instalador"**.
- **MOD** `ConfigurationView.java`:
  - Manual **"Buscar actualizaciones"** button also supports downloading & applying OTA patches directly with progress feedback!

### 4. Build, RAM Optimization & Supabase Storage Publishing
- **NEW** `desktop/gradle.properties`: cap Gradle JVM memory (`-Xmx1024m`) & idle daemon timeout (`120000` ms).
- **MOD** `desktop/build.gradle`:
  - Add `launcher` sourceSet + `launcherJar` task producing `kredia-launcher.jar`.
  - Update `packageWindows` to feed ONLY `kredia-launcher.jar` into `jpackage` (`--main-class com.cartera.launcher.KrediaLauncher`), copy app JAR to `app/core/kredia-app.jar`, copy dependency JARs to `app/libs/`, and pass `-Dkredia.shell.version=1.2.0`.
  - Add fast **`buildOtaPatch`** task (~5s, no `jpackage`/Inno!) emitting `desktop/dist/ota/kredia-app-<ver>.jar` + `desktop/dist/ota/latest.json`.
  - Bump base shell version to `1.2.0` (`Instalador-SistemaCartera-v1.2.0.exe`, `SistemaCartera-v1.2.0-Windows-x64.zip`).
- **MOD** `desktop/packaging/windows/installer.iss`: change `Compression=lzma2/ultra64` -> `Compression=lzma2/fast`, bump version to `1.2.0`.
- **NEW** `supabase/migrations/20261125000000_desktop_updates_storage_bucket.sql`: create public `desktop-updates` bucket + RLS (`SELECT` public, `INSERT`/`UPDATE`/`DELETE` vendor-key or service-role).
- **NEW** `scripts/publish-desktop-ota.ps1`: 1-command 5-second OTA patch build + upload to Supabase Storage `desktop-updates`.

### 5. Verification
- **NEW** `desktop/src/test/java/com/cartera/infrastructure/version/DesktopOtaUpdaterTest.java`:
  - Tests `KrediaLauncher.resolveLaunchPlan`: baseline boot, valid OTA boot with SHA-256 match, corrupted SHA-256 rejection, crash-guard rollback after 2 failed attempts, shell upgrade superseding older OTA.
  - Tests `DesktopOtaService`: download & SHA-256 verification against a local `com.sun.net.httpserver.HttpServer`, bad-hash rejection, `markCurrentBootHealthy`, stale JAR pruning.
  - Tests `DesktopUpdateChecker`: `min_shell_version` gating (OTA vs full installer fallback).
- Run full Desktop suite (`.\gradlew.bat clean test`) + `.\gradlew.bat buildOtaPatch` + `.\gradlew.bat packageAll "-PdistributionDir=dist/releases/1.2.0" -x test` + live smoke launch of `SistemaCartera.exe` verifying `KrediaLauncher` spawns the app cleanly!
