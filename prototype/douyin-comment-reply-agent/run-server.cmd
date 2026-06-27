@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 20 or later first.
  pause
  exit /b 1
)
node server.js
pause
