@echo off
cd /d "%~dp0"
echo Installing YOLO support (needs internet, large download, 5-10 minutes)...
venv\Scripts\python.exe -m pip install -U ultralytics
echo.
echo Done. Now put your trained model in the "models" folder as best.pt and run run.bat
pause
