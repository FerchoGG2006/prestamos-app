@echo off
title Servidor de App para iPhone (iOS)
chcp 65001 >nul
cls
echo ======================================================================
echo       CARTERA MOVIL - INSTALACION DIRECTA EN IPHONE (iOS)
echo ======================================================================
echo.
echo Para tener la aplicacion como APP PURA en el iPhone (sin Expo Go):
echo.
echo 1. Desde el iPhone, abre Safari y entra a:
echo    http://192.168.1.11:8082
echo    (o http://192.168.1.18:8082 segun la IP que tenga tu PC)
echo    (O tambien por la nube publica permanente: https://cartera-movil.expo.app)
echo    (Asegurate de que el iPhone este conectado a la misma red Wi-Fi si usas la IP local)
echo.
echo 2. En Safari, toca el boton Compartir (el cuadrito con la flecha hacia arriba).
echo 3. Desliza hacia abajo y toca "Añadir a pantalla de inicio".
echo 4. Toca "Añadir" arriba a la derecha.
echo.
echo Resultado:
echo - Queda instalada en el escritorio de tu iPhone con su icono propio.
echo - Abre a pantalla completa (sin barra de navegador) como app nativa.
echo - No requiere pagar 99 USD a Apple ni instalar Expo Go.
echo.
echo Iniciando servidor local en el puerto 8082...
echo Presiona Ctrl+C para detener el servidor cuando termines.
echo.
call npx serve -s mobile\dist -l 8082
pause
