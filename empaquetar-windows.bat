@echo off
title Empaquetador Windows - Sistema Cartera
echo =========================================================
echo   Generando Paquete Descargable e Instalable (Windows)
echo =========================================================

if "%JAVA_HOME%"=="" (
    if exist "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot" (
        set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
    )
)
if not "%JAVA_HOME%"=="" set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0desktop"
echo Compilando ejecutable nativo, ZIP portable e Instalador Setup EXE...
call gradlew.bat packageAll

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Hubo un problema al generar el paquete.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =========================================================
echo [OK] Paquetes para Oficinas generados con exito en /dist:
echo.
echo 1. Instalador Oficial para Oficinas (Recomendado):
echo    dist\Instalador-SistemaCartera-v1.0.0.exe
echo.
echo 2. Version Comprimida Portable (Para USB / Sin Instalacion):
echo    dist\SistemaCartera-v1.0.0-Windows-x64.zip
echo =========================================================
pause
