@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Hace falta instalar Node.js para abrir la web en local.
  pause
  exit /b 1
)
start "Nuestra casa - servidor local" /D "%~dp0" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "" http://localhost:4173/
