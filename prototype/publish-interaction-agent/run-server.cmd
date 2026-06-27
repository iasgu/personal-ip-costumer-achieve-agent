@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 20 or later first.
  pause
  exit /b 1
)
echo Starting Publish Interaction Agent...
echo Open http://127.0.0.1:8891/
"%NODE_EXE%" server.js
pause

