@echo off
setlocal
cd /d "%~dp0"

REM Builds a standalone Windows .exe of the local BG-removal module.
REM Output: dist\LocalBGModule.exe  (upload this to your GitHub Release)

echo [build] creating build virtualenv (.venv-build)...
if not exist ".venv-build\Scripts\python.exe" (
  python -m venv .venv-build
  if errorlevel 1 goto error
)

echo [build] installing dependencies + PyInstaller (first run: several minutes)...
".venv-build\Scripts\python.exe" -m pip install --upgrade pip
".venv-build\Scripts\python.exe" -m pip install -r requirements.txt pyinstaller
if errorlevel 1 goto error

echo [build] running PyInstaller...
".venv-build\Scripts\python.exe" -m PyInstaller ^
  --noconfirm --clean --onefile --console ^
  --name "LocalBGModule" ^
  --collect-all rembg ^
  --collect-all onnxruntime ^
  --collect-all pymatting ^
  --collect-all numba ^
  --collect-all llvmlite ^
  --copy-metadata onnxruntime ^
  --copy-metadata rembg ^
  --copy-metadata tqdm ^
  --copy-metadata numpy ^
  app_entry.py
if errorlevel 1 goto error

echo.
echo [done] Built: dist\LocalBGModule.exe
echo        Upload that file to a GitHub Release.
pause
goto end

:error
echo.
echo [error] build failed - see the messages above.
pause

:end
