from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

class TranscriptGetResponse(BaseModel):
    transcript_id: str
    recording_id: str
    text_path: str
    srt_path: Optional[str] = None
    language: Optional[str] = None
    language_probability: Optional[float] = None
    model: str
    device: str
    compute: str
    duration_s: Optional[float] = None
    created_at: str
    # optional inline text (handy for quick UI)
    text: Optional[str] = None
