@echo off
title Sistema de Prestamos y Cobros - Escritorio
echo =========================================================
echo   Iniciando Sistema de Prestamos y Cobros (Escritorio)
echo =========================================================
if "%JAVA_HOME%"=="" (
    if exist "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot" (
        set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
    )
)
if not "%JAVA_HOME%"=="" set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0desktop"
call gradlew.bat run
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Hubo un problema al iniciar el sistema.
    pause
)
exit
