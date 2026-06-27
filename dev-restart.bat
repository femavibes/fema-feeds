@echo off
cd /d "D:\Custom Feed Builder"

echo Stopping old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

timeout /t 1 /nobreak >nul

echo Building API...
call pnpm --filter @cfb/api build
if errorlevel 1 (
    echo BUILD FAILED
    pause
    exit /b 1
)

:: Start API
start "CFB-API" cmd /k "cd /d D:\Custom Feed Builder\apps\api && node dist\main.js"

:: Start Web dev server
start "CFB-WEB" cmd /k "cd /d D:\Custom Feed Builder && pnpm --filter @cfb/web dev"

echo.
echo Restarted:
echo   API  → http://localhost:3000
echo   Web  → http://localhost:5173
