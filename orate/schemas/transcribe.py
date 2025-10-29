from __future__ import annotations
from pydantic import BaseModel
from typing import Optional

class TranscribeRequest(BaseModel):
    recording_id: str
    model: str = "small"
    device: str = "cpu"         # "cpu" or "cuda"
    compute: Optional[str] = None  # "int8" or "float16"
    beam_size: int = 5
    language: Optional[str] = None
    prompt: Optional[str] = None
    word_timestamps: bool = False
    vad: bool = True
    srt: bool = True
