@echo off
title Adams World MUD Server
cd /d "%~dp0"

echo.
echo  ==========================================
echo   ADAMS WORLD MUD - Starting Server...
echo  ==========================================
echo.

:: Kill any existing node server.js process so we get a clean restart
echo  Stopping any existing server instance...
taskkill /F /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq Adams World MUD Server" >nul 2>&1
:: Also kill by checking for server.js in command line (belt and suspenders)
for /f "tokens=2" %%i in ('wmic process where "name='node.exe' and commandline like '%%server.js%%'" get processid ^| findstr /r "[0-9]"') do (
    taskkill /F /PID %%i >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  Server running at: http://localhost:3000
echo  Open that address in your browser to play.
echo.
echo  DO NOT close this window while playing!
echo  Press Ctrl+C to stop the server.
echo.
node server.js
pause
