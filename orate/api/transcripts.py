from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from datetime import timezone
import re

from orate.db import crud
from orate.schemas.transcripts import (
    TranscriptGetResponse,
    TranscriptListResponse,
    TranscriptItem,
    TranscriptUpdateRequest,
    TranscriptUpdateResponse,
)

router = APIRouter(prefix="/api/transcripts", tags=["transcripts"])

def _safe_filename(name: str, fallback: str) -> str:
    """
    Create a safe filename from a title; fall back to provided fallback if
    the result is empty. Keeps letters, numbers, spaces, dashes, underscores,
    and dots; collapses whitespace; trims length.
    """
    # collapse whitespace
    name = " ".join((name or "").strip().split())
    # remove invalid chars
    name = re.sub(r"[^A-Za-z0-9\-\._ ]+", "", name)
    # if empty after cleaning, use fallback
    if not name:
        name = fallback
    # hard cap length so we don't hit OS limits
    return name[:120]

@router.get("", response_model=TranscriptListResponse)
def list_transcripts(limit: int = Query(50, ge=1, le=200), recording_id: str | None = None):
    rows = crud.list_transcripts_for_recording(recording_id, limit) if recording_id else crud.list_transcripts(limit)
    items: list[TranscriptItem] = []

    for t in rows:
        preview = ""
        try:
            if t.text_path and Path(t.text_path).exists():
                preview = Path(t.text_path).read_text(encoding="utf-8")[:200].replace("\n", " ")
        except Exception:
            preview = ""

        items.append(
            TranscriptItem(
                id=t.id,
                recording_id=t.recording_id,
                created_at=t.created_at.replace(tzinfo=timezone.utc).isoformat(),
                language=t.language,
                model=t.model,
                text_preview=preview,
                title=t.title,
            )
        )

    return TranscriptListResponse(items=items)

@router.get("/{transcript_id}", response_model=TranscriptGetResponse)
def get_transcript(transcript_id: str, include_text: bool = True):
    tr = crud.get_transcript(transcript_id)
    if not tr:
        raise HTTPException(status_code=404, detail="transcript not found")

    text_content = None
    if include_text and tr.text_path and Path(tr.text_path).exists():
        text_content = Path(tr.text_path).read_text(encoding="utf-8")

    created_iso = tr.created_at.replace(tzinfo=timezone.utc).isoformat() if tr.created_at else ""

    return TranscriptGetResponse(
        transcript_id=tr.id,
        recording_id=tr.recording_id,
        text_path=tr.text_path,
        srt_path=tr.srt_path,
        language=tr.language,
        language_probability=tr.language_probability,
        model=tr.model,
        device=tr.device,
        compute=tr.compute,
        duration_s=tr.duration_s,
        created_at=created_iso,
        text=text_content,
        title=tr.title,
        notes=tr.notes,
    )

@router.get("/{transcript_id}/download")
def download_transcript(transcript_id: str, format: str = Query("txt", regex="^(txt|srt)$")):
    tr = crud.get_transcript(transcript_id)
    if not tr:
        raise HTTPException(status_code=404, detail="transcript not found")

    # Construct preferred filename from title (or fallback to transcript_id)
    base_name = _safe_filename(tr.title or "", fallback=transcript_id)

    if format == "txt":
        path = Path(tr.text_path)
        filename = f"{base_name}.txt"
    else:
        if not tr.srt_path:
            raise HTTPException(status_code=404, detail="srt not available")
        path = Path(tr.srt_path)
        filename = f"{base_name}.srt"

    if not path.exists():
        raise HTTPException(status_code=404, detail="file not found on disk")

    return FileResponse(path, filename=filename, media_type="text/plain")

@router.patch("/{transcript_id}", response_model=TranscriptUpdateResponse)
def update_transcript(transcript_id: str, payload: TranscriptUpdateRequest):
    tr = crud.get_transcript(transcript_id)
    if not tr:
        raise HTTPException(status_code=404, detail="transcript not found")

    title = payload.title if payload.title is not None else tr.title
    notes = payload.notes if payload.notes is not None else tr.notes

    # write via crud
    from orate.db.session import get_session
    from orate.db.models import Transcript as TranscriptModel

    with get_session() as s:
        obj = s.get(TranscriptModel, transcript_id)
        if not obj:
            raise HTTPException(status_code=404, detail="transcript not found")
        obj.title = title
        obj.notes = notes
        s.add(obj)
        s.commit()

    return TranscriptUpdateResponse(transcript_id=transcript_id, title=title, notes=notes)
