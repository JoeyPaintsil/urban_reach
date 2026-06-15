@echo off
echo Installing Node dependencies...
cd /d "%~dp0frontend"
npm install
echo.
echo Starting McReach frontend on http://localhost:3000
echo.
npm run dev
pause
