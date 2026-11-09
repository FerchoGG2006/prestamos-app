@echo off
cd /d "%~dp0"
title Sistema de Cartera - Desktop JavaFX
echo ========================================================
echo       INICIANDO SISTEMA DE CARTERA (DESKTOP JAVAFX)
echo ========================================================
echo.
call desktop\build\install\sistema-cartera-desktop\bin\sistema-cartera-desktop.bat
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocurrio un error al iniciar. Intentando con Gradle...
    call gradlew.bat :desktop:run
)
pause
