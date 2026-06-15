@echo off
echo Installing Python dependencies...
cd /d "%~dp0backend"
pip install -r requirements.txt
echo.
echo Starting McReach backend on http://localhost:8000
echo.
python main.py
pause
