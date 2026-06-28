"""Local background-removal module for the Game Image Toolkit web app.

Runs entirely on your machine using rembg. The web app connects to this over
HTTP (default http://localhost:8765) as an alternative to the in-browser AI.
No image ever leaves your computer.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from rembg import remove, new_session

MODEL = "isnet-general-use"

app = FastAPI(title="Local BG Removal", version="1.0")

# Permissive CORS: this is a local tool you run yourself, and the web app may be
# served from any origin (localhost dev, a static host, etc.).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_session = new_session(MODEL)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}


@app.post("/remove-bg")
async def remove_bg(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    try:
        out = remove(data, session=_session)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))
    return Response(content=out, media_type="image/png")
