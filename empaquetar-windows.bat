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
echo Compilando y empaquetando con jpackage...
call gradlew.bat packageZip

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Hubo un problema al generar el paquete.
    pause
    exit /b %ERRORLEVEL%
)

echo.
echo =========================================================
echo [OK] Paquete generado exitosamente en:
echo      dist\SistemaCartera-v1.0.0-Windows-x64.zip
echo      dist\SistemaCartera\SistemaCartera.exe
echo =========================================================
pause
