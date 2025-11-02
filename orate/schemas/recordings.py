from __future__ import annotations
from pydantic import BaseModel

class RecordingCreateResponse(BaseModel):
    recording_id: str
    original_ext: str
    duration_s: float | None = None

class RecordingItem(BaseModel):
    id: str
    created_at: str
    duration_s: float
    original_ext: str
    original_path: str

class RecordingListResponse(BaseModel):
    items: list[RecordingItem]
