from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pathlib import Path
from datetime import datetime, timezone

from orate.db import crud
from orate.schemas.transcripts import TranscriptGetResponse

router = APIRouter(prefix="/api/transcripts", tags=["transcripts"])

@router.get("/{transcript_id}", response_model=TranscriptGetResponse)
def get_transcript(transcript_id: str, include_text: bool = True):
    tr = crud.get_transcript(transcript_id)
    if not tr:
        raise HTTPException(status_code=404, detail="transcript not found")

    text_content = None
    if include_text and tr.text_path and Path(tr.text_path).exists():
        text_content = Path(tr.text_path).read_text(encoding="utf-8")

    created_iso = tr.created_at.replace(tzinfo=timezone.utc).isoformat() if tr.created_at else None

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
        created_at=created_iso or "",
        text=text_content,
    )
