@echo off
setlocal
start "PharmaFind Backend" cmd /k "cd /d %~dp0backend && npm install && npm run dev"
timeout /t 3 /nobreak >nul
start "PharmaFind Frontend" cmd /k "cd /d %~dp0frontend && npm install && npm run dev"
echo.
echo PharmaFind is starting. Open the frontend URL shown in its terminal, normally http://localhost:5173
pause
