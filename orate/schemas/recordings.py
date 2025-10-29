# orate/schemas/recordings.py
from __future__ import annotations
from pydantic import BaseModel

class RecordingCreateResponse(BaseModel):
    recording_id: str
    original_ext: str
    duration_s: float | None = None
