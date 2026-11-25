# Tasks: Commercial Desktop OTA Auto-Updater (Base Shell v1.2.0)

- [x] T001 Create `desktop/gradle.properties` (RAM cap) and optimize `installer.iss` (`lzma2/fast`, v1.2.0)
- [x] T002 Create pure-JDK launcher `desktop/src/launcher/java/com/cartera/launcher/KrediaLauncher.java` with SHA-256 validation, `--wait-pid`, and automatic crash-guard rollback
- [x] T003 Upgrade `AppVersion.java` (`1.2.0` + `installedShellVersion`), `DesktopUpdateChecker.java` (Supabase Storage `latest.json` + `min_shell_version` + `core_jar_url`/`sha256`), and create `DesktopOtaService.java`
- [x] T004 Integrate OTA boot health marker, automatic background 1.6 MB staging, 1-click restart-to-update UX in `CarteraApplication.java`, `ConfigurationView.java`, and `application.properties`
- [x] T005 Update `desktop/build.gradle` with `launcher` sourceSet, `launcherJar`, separated `app/core` + `app/libs` layout in `packageWindows` (`v1.2.0`), and 5-second `buildOtaPatch` task
- [x] T006 Create Supabase Storage bucket migration `supabase/migrations/20261125000000_desktop_updates_storage_bucket.sql` and 1-command publisher `scripts/publish-desktop-ota.ps1` + update root `desktop-version.json`
- [x] T007 Add comprehensive JUnit tests in `DesktopOtaUpdaterTest.java` and run full Desktop test suite (`.\gradlew.bat clean test`)
- [x] T008 Build OTA patch (`buildOtaPatch`) + Base Shell `v1.2.0` (`packageAll "-PdistributionDir=dist/releases/1.2.0"`) and verify `KrediaLauncher` launches cleanly
- [x] T009 Verify/create `desktop-updates` bucket in live Supabase and upload baseline `v1.2.0` manifest + JAR, verified live over HTTPS + SHA-256

**Status**: Converged (`9/9` tasks completed & live-verified).
