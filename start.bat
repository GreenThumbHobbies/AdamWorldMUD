@echo off
title Shadowmere MUD Server
color 0A

echo.
echo  ============================================
echo    SHADOWMERE MUD v10 - Starting Server
echo  ============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js not installed!
    echo  Download from: https://nodejs.org
    pause
    exit /b 1
)

echo  Node.js: 
node --version

if not exist "node_modules\" (
    echo.
    echo  Installing dependencies (one time only)...
    npm install
    echo.
)

echo.
echo  Server running at: http://localhost:3000
echo  Keep this window open while playing.
echo  Press Ctrl+C to stop.
echo.

node server.js

echo.
echo  Server stopped. Press any key to exit.
pause >nul
