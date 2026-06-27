@echo off
setlocal
cd /d "%~dp0"

if not exist ".env.example" (
  echo Missing .env.example
  exit /b 1
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
)

echo.
echo Please paste your Alibaba Model Studio / DashScope API key.
echo Example: sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
echo.
set /p DASHSCOPE_KEY=DASHSCOPE_API_KEY: 

if "%DASHSCOPE_KEY%"=="" (
  echo API key is empty. .env was not changed.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = Join-Path (Get-Location) '.env'; $key = $env:DASHSCOPE_KEY; $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8; $content = $content -replace '(?m)^DASHSCOPE_API_KEY=.*$', ('DASHSCOPE_API_KEY=' + $key); if ($content -notmatch '(?m)^DASHSCOPE_API_KEY=') { $content += \"`r`nDASHSCOPE_API_KEY=$key`r`n\" }; Set-Content -LiteralPath $path -Value $content -Encoding UTF8"

echo.
echo Done. .env has been created/updated.
echo MODEL_API_KEY can stay empty; the server will reuse DASHSCOPE_API_KEY.
echo.
pause
