@echo off
cd /d "D:\Custom Feed Builder"

echo Stopping dev server...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1

timeout /t 1 /nobreak >nul

echo Starting dev server (hot-reload)...
start "CFB-DEV" cmd /k "cd /d D:\Custom Feed Builder && pnpm --filter @cfb/web dev"

echo.
echo Dev server started:
echo   Hot-reload → http://localhost:5173 (local dev)
echo   Uses API on port 3000 (start with prod-start.bat)
