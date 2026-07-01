@echo off
cd /d "%~dp0"
echo Starting Caregiver.ai chat server...
echo Open http://localhost:3000 in your browser after it starts.
echo.
node server.js
pause
