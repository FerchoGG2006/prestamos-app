# Bug Assessment & Fix: `desktop-update-404`

**Reported**: 2026-11-27  
**Symptom**: Clicking `⬆ Actualizar v1.2.5` in Desktop opened `https://fmcotpmydstyrwcmqazb.supabase.co/storage/v1/object/public/desktop-updates/Instalador-SistemaCartera-v1.2.0.exe` in Chrome, returning `404 NoSuchKey`.

## Root Causes
1. **Stale Dev Launcher Shortcut (`iniciar-desktop.bat`)**: Windows shortcuts (`Desktop\Sistema de Cartera.lnk`, `Start Menu\Sistema de Cartera.lnk`) executed `iniciar-desktop.bat`, which launched `desktop\build\install\sistema-cartera-desktop\lib\*` directly via `javaw.exe` (missing `-Dkredia.shell.version=1.2.0` and `KrediaLauncher`), even though `C:\Program Files\SistemaCartera\SistemaCartera.exe` (v1.2.0 OTA shell) was already installed. Without `KrediaLauncher`, `AppVersion.isOtaLauncherPresent()` returned `false` and fell back to opening `installer_url` in the browser instead of applying the 1.3 MB `kredia-app-1.2.5.jar` OTA patch.
2. **404 on `installer_url` (`Instalador-SistemaCartera-v1.2.0.exe`)**: The full Windows setup `.exe` is `85.78 MB`, exceeding Supabase Free Storage's 50 MB single-file upload limit, so it does not exist in `desktop-updates` (which hosts `latest.json` and ~1.3 MB `kredia-app-X.Y.Z.jar` patches).

## Fix Applied
1. Updated `iniciar-desktop.bat` to prioritize launching `C:\Program Files\SistemaCartera\SistemaCartera.exe` (and `%LOCALAPPDATA%\Programs\SistemaCartera\SistemaCartera.exe`) whenever installed so every existing desktop/start-menu shortcut launches with `KrediaLauncher` and 2-second 1.3 MB OTA updates.
2. Verified `C:\Program Files\SistemaCartera\app\libs` parity for `kredia-app-1.2.5.jar`.
3. Recommended/ready next step for external client PCs downloading the 85 MB base `.exe`: host `Instalador-SistemaCartera-v1.2.0.exe` on GitHub Releases (`github.com/FerchoGG2006/prestamos-app/releases`) and update `installer_url` in `build.gradle` + `latest.json`.
