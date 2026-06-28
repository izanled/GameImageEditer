@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [setup] creating virtual environment...
  python -m venv .venv
  if errorlevel 1 goto error
  echo [setup] installing dependencies, first run only, may take a few minutes...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto error
)

echo [run] starting local BG removal on http://localhost:8765  - press Ctrl+C to stop
".venv\Scripts\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8765
goto end

:error
echo.
echo [error] setup failed - see the messages above.
pause

:end
