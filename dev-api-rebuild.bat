@echo off
cd /d "D:\Custom Feed Builder"

echo Stopping API...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

timeout /t 1 /nobreak >nul

echo Building API packages...
call pnpm --filter @cfb/core-types build
call pnpm --filter @cfb/storage-postgres build
call pnpm --filter @cfb/l2-worker build
call pnpm --filter @cfb/api build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

echo Starting API (port 3000)...
start "CFB-API" cmd /k "cd /d D:\Custom Feed Builder\apps\api && node dist\main.js"

echo.
echo API rebuilt and restarted:
echo   API → http://localhost:3000
