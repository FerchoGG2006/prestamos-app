@echo off
title Sistema de Prestamos y Cobros - Escritorio
echo =========================================================
echo   Iniciando Sistema de Prestamos y Cobros (Escritorio)
echo =========================================================
cd /d "%~dp0"
start "" "node_modules\electron\dist\electron.exe" electron\main.js
exit
