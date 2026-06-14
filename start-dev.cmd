@echo off
cd /d "%~dp0"

echo Starting backend...
start "Exeggutor Backend" cmd /c "npm run dev -w packages/backend"

timeout /t 2 /nobreak >nul

echo Starting frontend...
start "Exeggutor Frontend" cmd /c "npm run dev -w packages/frontend"

echo Both servers started in background windows.
echo Close those windows to stop the servers.
