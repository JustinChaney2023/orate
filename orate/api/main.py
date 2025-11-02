# orate/api/main.py
# uvicorn orate.api.main:app --reload
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from pathlib import Path

from orate.api.recordings import router as recordings_router
from orate.api.transcribe import router as transcribe_router
from orate.api.jobs import router as jobs_router
from orate.api.transcripts import router as transcripts_router

app = FastAPI(title="Orate API", version="0.0.1")

# --- CORS setup ---
origins = [
    "http://localhost:3000",   # React dev server
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ------------------

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

# mount routes
app.include_router(recordings_router)
app.include_router(transcribe_router)
app.include_router(jobs_router)
app.include_router(transcripts_router)

DIST_DIR = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="app")
    index_file = DIST_DIR / "index.html"

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if not full_path.startswith("api/") and index_file.exists():
            return FileResponse(str(index_file))
        return {"detail": "Not Found"}, 404