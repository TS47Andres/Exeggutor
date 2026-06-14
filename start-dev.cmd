@echo off
cd /d "%~dp0"

echo Starting Exeggutor servers with custom ports...
echo Backend port: 17492
echo Frontend port: 17493

set EXEGGUTOR_BACKEND_PORT=17492
set EXEGGUTOR_FRONTEND_PORT=17493

echo Starting backend...
start "Exeggutor Backend" cmd /c "npm run dev -w packages/backend"

timeout /t 3 /nobreak >nul

echo Starting frontend...
start "Exeggutor Frontend" cmd /c "npm run dev -w packages/frontend"

echo Both servers started in background windows.
echo Dashboard: http://localhost:17493
echo Close those windows to stop the servers.
