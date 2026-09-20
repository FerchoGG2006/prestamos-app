@echo off
title Sistema de Cartera - JavaFX
echo =========================================================
echo   Iniciando Sistema de Cartera y Cobros (JavaFX Desktop)
echo =========================================================
set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"
cd /d "%~dp0\desktop"
call gradlew.bat run
pause
