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
    text: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None

class TranscriptItem(BaseModel):
    id: str
    recording_id: str
    created_at: str
    language: Optional[str] = None
    model: str
    text_preview: str
    title: Optional[str] = None

class TranscriptListResponse(BaseModel):
    items: list[TranscriptItem]

class TranscriptUpdateRequest(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None

class TranscriptUpdateResponse(BaseModel):
    transcript_id: str
    title: Optional[str] = None
    notes: Optional[str] = None
