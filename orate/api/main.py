# orate/api/main.py
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
