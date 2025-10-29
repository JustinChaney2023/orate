from __future__ import annotations
from fastapi import FastAPI
from orate.api.recordings import router as recordings_router
from orate.api.transcribe import router as transcribe_router
from orate.api.jobs import router as jobs_router
from orate.api.transcripts import router as transcripts_router

app = FastAPI(title="Orate API", version="0.0.1")

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

app.include_router(recordings_router)
app.include_router(transcribe_router)
app.include_router(jobs_router)
app.include_router(transcripts_router)
