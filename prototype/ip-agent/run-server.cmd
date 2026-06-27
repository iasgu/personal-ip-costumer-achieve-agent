@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  ) else (
    if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
      set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
    ) else (
      echo Node.js was not found. Please install Node.js 20 or later first.
      pause
      exit /b 1
    )
  )
)

echo Starting IP Agent Demo...
echo Open http://127.0.0.1:8765/ after the server starts.
"%NODE_EXE%" server.js
pause
