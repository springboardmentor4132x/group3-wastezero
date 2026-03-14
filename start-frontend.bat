@echo off
echo Starting WasteZero Frontend...
cd /d "%~dp0frontend"
npx ng serve --open
pause
