@echo off
setlocal
cd /d "%~dp0"
title Weedeleo dashboard

set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY goto nopython

echo.
echo [1/3] Python found:
%PY% --version
if errorlevel 1 goto nopython

echo [2/3] Preparing virtual environment...
if not exist venv\Scripts\python.exe %PY% -m venv venv
if not exist venv\Scripts\python.exe goto venvfail

if exist venv\.installed goto start
echo      Installing packages from the local wheels folder (no internet needed)...
venv\Scripts\python.exe -m pip install --no-index --find-links wheels -r requirements.txt
if errorlevel 1 (
  echo      Local install failed, trying the internet instead...
  venv\Scripts\python.exe -m pip install -r requirements.txt
)
if errorlevel 1 goto installfail
echo done> venv\.installed

:start
echo [3/3] Starting the dashboard...
echo      Your browser will open at http://localhost:5000
echo      Keep this window open. Press Ctrl+C to stop.
echo.
venv\Scripts\python.exe app.py
echo.
echo The dashboard has stopped. Read any error above.
pause
exit /b 0

:nopython
echo.
echo Python was not found. Install Python 3.12 from python.org and tick "Add python.exe to PATH", then run this file again.
pause
exit /b 1

:venvfail
echo.
echo Could not create the virtual environment. Delete the "venv" folder if it exists and try again.
pause
exit /b 1

:installfail
echo.
echo Package installation failed. Check the red error above (or your internet connection).
pause
exit /b 1
