# Tasks: Zero-Jargon Automatic Desktop Cloud Auth & Background Sync

- [x] T001 Configure default cloud properties in `application.properties` and fallback in `OfficeLicensingService.java`.
- [x] T002 Extend `PasswordHasher.java` (`sha256$` + `PBKDF2`) and fix `AuthService.determineRole`.
- [x] T003 Extend `SupabaseRegistryClient.java` with user lookup, office lookup, portfolio pull, and upsert/append helpers.
- [x] T004 Create `DesktopCloudSyncService.java` for silent cloud login, SQLite hydration/merge, bidirectional push, and immutable `financial_events` sync.
- [x] T005 Update `LoginView.java` (zero jargon, async login, no self-registration button) and `CarteraApplication.java` (automatic 30s silent background sync + view refresh).
- [x] T006 Add `DesktopCloudSyncServiceTest.java`, run `.\gradlew.bat compileJava test installDist`, close old PID 23432, and verify clean launch.
