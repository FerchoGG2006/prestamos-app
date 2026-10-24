@echo off
title Servidor Cartera Movil - Conectar Celulares
echo =========================================================
echo    Cartera Movil - Conectar Celulares de Cobradores
echo =========================================================
echo.
echo 1. Instala "Expo Go" en el celular Android desde Google Play Store.
echo 2. Escanea el codigo QR que aparecera a continuacion con la camara
echo    o desde la aplicacion Expo Go.
echo 3. La aplicacion se abrira al instante en el telefono.
echo.

cd /d "%~dp0mobile"
call npx expo start
pause
