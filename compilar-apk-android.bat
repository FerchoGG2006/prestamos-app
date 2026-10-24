@echo off
title Compilador de APK Android - Cartera Movil
echo =========================================================
echo    Generacion de APK para Celulares Android (Cobradores)
echo =========================================================
echo.
echo Este proceso genera el archivo .APK instalable que se puede
echo enviar por WhatsApp a los celulares de los cobradores.
echo.
echo NOTA: Requiere una cuenta gratuita de Expo (expo.dev).
echo Si no has iniciado sesion, te pedira tus datos o crear una.
echo.

cd /d "%~dp0mobile"
call npx --yes eas-cli build -p android --profile preview

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [INFO] Para iniciar sesion manualmente en Expo ejecuta:
    echo        npx eas-cli login
    echo.
)
pause
