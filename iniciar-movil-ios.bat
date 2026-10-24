@echo off
title Servidor Movil Cartera - iOS / Android
chcp 65001 >nul
cls
echo ======================================================================
echo       SISTEMA DE CARTERA - SERVIDOR MOVIL (iOS y Android)
echo ======================================================================
echo.
echo Para abrir la aplicacion en iPhone (iOS):
echo   1. Descarga gratis la app "Expo Go" desde la App Store en tu iPhone.
echo   2. Abre la camara del iPhone o la app Expo Go y escanea el codigo QR
echo      que se mostrara a continuacion.
echo.
echo Nota: Tambien puedes iniciar sesion en Expo Go con tu cuenta
echo       "ferchogg2007" y el proyecto aparecera listo para abrir.
echo.
echo Presiona cualquier tecla para generar el codigo QR de conexion...
pause >nul
cd /d "%~dp0mobile"
call npx expo start --tunnel
