# Quickstart Validation: Multi-Office Registry, Licensing & Device Linking

1. **Supabase Migration**: Apply `supabase/migrations/20261120000000_office_licensing_and_isolation.sql` to Supabase.
2. **Desktop Compilation & Tests**:
   ```powershell
   .\gradlew.bat compileJava test
   ```
   Verify all existing and new licensing/linking unit tests pass.
3. **Mobile Build & Tests**:
   ```powershell
   cd mobile
   npx tsc --noEmit
   npx expo export --platform web
   ```
   Verify clean startup (no "Inversiones FBV" or `admin-fbv` on fresh storage), device linking UI, and immutable `officeId` sync.
4. **End-to-End Check**:
   - Register a new office in the JavaFX Vendor Console -> receive `activationCode`.
   - Open a fresh mobile web session (`http://localhost:8082`) -> verify clean "Vincular Oficina" screen -> enter `activationCode` + credentials -> verify only that office's name, routes, and data appear.
