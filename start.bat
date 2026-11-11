@echo off
rem Double-click to start Thock. Installs its two dependencies the first time.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required. Install it from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing... & call npm install --no-audit --no-fund || (pause & exit /b 1))
node server\index.js %*
pause
