@echo off
cd /d "%~dp0"

if "%JAVA_HOME%"=="" (
    if exist "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot" (
        set "JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
    )
)

set "JAVAW_EXE=javaw.exe"
if not "%JAVA_HOME%"=="" (
    if exist "%JAVA_HOME%\bin\javaw.exe" set "JAVAW_EXE=%JAVA_HOME%\bin\javaw.exe"
)

set "APP_LIB=%~dp0desktop\build\install\sistema-cartera-desktop\lib"
if not exist "%APP_LIB%" (
    set "APP_LIB=%~dp0desktop\build\install\desktop\lib"
)

if exist "%APP_LIB%" (
    start "" "%JAVAW_EXE%" -Dfile.encoding=UTF-8 -Duser.timezone=America/Bogota -Duser.language=es -Duser.country=CO -cp "%APP_LIB%\*" com.cartera.ui.CarteraMain
    exit /b 0
)

cd /d "%~dp0desktop"
start "" /b cmd /c "gradlew.bat -q run >nul 2>&1"
exit /b 0
