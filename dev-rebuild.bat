@echo off
cd /d "D:\Custom Feed Builder"

echo Stopping processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

timeout /t 1 /nobreak >nul

echo Building all packages...
call pnpm --filter @cfb/core-types build
call pnpm --filter @cfb/storage-postgres build
call pnpm --filter @cfb/l2-worker build
call pnpm --filter @cfb/api build
call pnpm --filter @cfb/web build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

echo Starting API (port 3000)...
start "CFB-API" cmd /k "cd /d D:\Custom Feed Builder\apps\api && node dist\main.js"

echo Starting Vite dev server (port 5173)...
start "CFB-DEV" cmd /k "cd /d D:\Custom Feed Builder && pnpm --filter @cfb/web dev"

echo.
echo Rebuilt and restarted:
echo   API + Prod UI  → http://localhost:3000
echo   Dev hot-reload → http://localhost:5173
