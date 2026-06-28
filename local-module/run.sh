#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  echo "[setup] creating virtual environment..."
  python3 -m venv .venv
  source .venv/bin/activate
  echo "[setup] installing dependencies (first run only)..."
  pip install -r requirements.txt
else
  source .venv/bin/activate
fi
echo "[run] starting local BG removal on http://localhost:8765"
python -m uvicorn server:app --host 127.0.0.1 --port 8765
