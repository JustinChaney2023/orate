# orate/api/recordings.py
from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path

from orate.services import storage, audio
from orate.db.session import init_db
from orate.db import crud
from orate.schemas.recordings import RecordingCreateResponse

router = APIRouter(prefix="/api/recordings", tags=["recordings"])

@router.post("", response_model=RecordingCreateResponse)
async def create_recording(file: UploadFile = File(...)):
    # 0) make sure tables exist (cheap no-op after first call)
    init_db()

    # 1) figure out extension
    filename = file.filename or "audio.mp3"
    ext = Path(filename).suffix or ".mp3"
    if ext.lower() not in {".mp3", ".wav", ".m4a", ".mp4", ".aac", ".flac", ".ogg"}:
        # we still accept it, but normalize uncommon ones to .mp3 on disk
        # (optional: you can just keep the original suffix if you prefer)
        ext = ".mp3"

    # 2) allocate a new recording id + target path
    rec_id = storage.new_id("rec")
    dst = storage.original_path(rec_id, ext)
    storage.ensure_dir(dst.parent)

    # 3) stream write to disk to avoid huge RAM usage
    try:
        with dst.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB
                if not chunk:
                    break
                out.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    # 4) probe duration (best-effort) + hash
    try:
        duration = audio.probe_duration(dst)
    except Exception:
        duration = None
    sha = storage.sha256_file(dst)

    # 5) insert DB row
    rec = crud.create_recording(
        id=rec_id,
        original_ext=ext,
        original_path=str(dst),
        duration_s=float(duration) if duration is not None else 0.0,
        sha256=sha,
    )

    # 6) optional manifest for debugging/provenance
    storage.write_json(storage.manifest_path(rec_id), {
        "recording_id": rec_id,
        "original": str(dst),
        "duration_s": duration,
        "sha256": sha,
        "created_at": storage.utc_now_iso(),
    })

    return RecordingCreateResponse(
        recording_id=rec_id,
        original_ext=ext,
        duration_s=duration,
    )
