@echo off
title Sistema Cartera Desktop - JavaFX
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Sistema de Cartera y Cobros (JavaFX Desktop)
echo ========================================================
echo.
call gradlew.bat run
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Hubo un problema al iniciar el programa.
    pause
)
