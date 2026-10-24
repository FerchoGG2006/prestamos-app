@echo off
title Instalador de Accesos Directos - Sistema Cartera
echo ========================================================
echo    Sistema de Cartera y Cobros - Instalador de Acceso
echo ========================================================
set "TARGET=%~dp0SistemaCartera.exe"
set "ICON=%~dp0SistemaCartera.exe"
set "WORKING=%~dp0"

powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'Sistema de Cartera.lnk')); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%WORKING%'; $s.IconLocation = '%ICON%,0'; $s.Description = 'Sistema de Cartera y Cobros'; $s.Save()"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [OK] Acceso directo "Sistema de Cartera" creado en tu Escritorio.
    echo Ya puedes abrir el sistema desde tu escritorio o haciendo doble clic en SistemaCartera.exe.
    echo.
) else (
    echo.
    echo [AVISO] Puedes abrir el sistema directamente ejecutando SistemaCartera.exe
    echo.
)
pause
