@echo off
title Publicacion Google Play Store (.AAB) y APK Independiente (Sin Expo Go)
echo ====================================================================
echo    Cartera Movil - Lanzamiento a Play Store y APK Sin Expo Go
echo ====================================================================
echo.
echo Selecciona que tipo de paquete autonomo deseas generar:
echo.
echo   [1] Generar paquete .AAB Oficial para subir a GOOGLE PLAY STORE
echo   [2] Generar instalador .APK Directo (WhatsApp / Sin Expo Go)
echo   [3] Generar AMBOS (.AAB para Play Store y .APK directo)
echo.
set /p OPCION="Ingresa una opcion (1, 2 o 3): "

cd /d "%~dp0mobile"

if "%OPCION%"=="1" (
    echo.
    echo [1/1] Compilando Android App Bundle (.aab) para Google Play Console...
    call npx --yes eas-cli build -p android --profile production
    goto FIN
)

if "%OPCION%"=="2" (
    echo.
    echo [1/1] Compilando APK instalable directo sin necesidad de Expo Go...
    call npx --yes eas-cli build -p android --profile preview
    goto FIN
)

if "%OPCION%"=="3" (
    echo.
    echo [1/2] Compilando Android App Bundle (.aab) para Google Play Store...
    call npx --yes eas-cli build -p android --profile production
    echo.
    echo [2/2] Compilando APK instalable directo sin Expo Go...
    call npx --yes eas-cli build -p android --profile preview
    goto FIN
)

echo Opcion no valida. Ejecutando compilacion para Google Play Store (.aab) por defecto...
call npx --yes eas-cli build -p android --profile production

:FIN
echo.
echo ====================================================================
echo Proceso finalizado. Descarga el archivo desde el enlace mostrado arriba.
echo ====================================================================
pause
