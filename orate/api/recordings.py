from __future__ import annotations
from fastapi import APIRouter, UploadFile, File, HTTPException
from pathlib import Path
from datetime import timezone

from orate.services import storage, audio
from orate.db.session import init_db
from orate.db import crud
from orate.schemas.recordings import (
    RecordingCreateResponse,
    RecordingListResponse,
    RecordingItem,
)

router = APIRouter(prefix="/api/recordings", tags=["recordings"])


@router.post("", response_model=RecordingCreateResponse)
async def create_recording(file: UploadFile = File(...)):
    init_db()

    filename = file.filename or "audio.mp3"
    ext = Path(filename).suffix or ".mp3"
    # ✅ Added ".webm" here
    if ext.lower() not in {".mp3", ".wav", ".m4a", ".mp4", ".aac", ".flac", ".ogg", ".webm"}:
        ext = ".mp3"

    rec_id = storage.new_id("rec")
    dst = storage.original_path(rec_id, ext)
    storage.ensure_dir(dst.parent)

    try:
        with dst.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {e}")

    try:
        duration = audio.probe_duration(dst)
    except Exception:
        duration = None
    sha = storage.sha256_file(dst)

    crud.create_recording(
        id=rec_id,
        original_ext=ext,
        original_path=str(dst),
        duration_s=float(duration) if duration is not None else 0.0,
        sha256=sha,
    )

    storage.write_json(
        storage.manifest_path(rec_id),
        {
            "recording_id": rec_id,
            "original": str(dst),
            "duration_s": duration,
            "sha256": sha,
            "created_at": storage.utc_now_iso(),
        },
    )

    return RecordingCreateResponse(
        recording_id=rec_id,
        original_ext=ext,
        duration_s=duration,
    )


@router.get("", response_model=RecordingListResponse)
def list_recordings(limit: int = 50):
    rows = crud.list_recordings(limit=limit)
    items: list[RecordingItem] = []
    for r in rows:
        items.append(
            RecordingItem(
                id=r.id,
                created_at=r.created_at.replace(tzinfo=timezone.utc).isoformat(),
                duration_s=r.duration_s,
                original_ext=r.original_ext,
                original_path=r.original_path,
            )
        )
    return RecordingListResponse(items=items)
