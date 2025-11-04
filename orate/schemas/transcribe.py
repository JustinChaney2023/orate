# orate/schemas/transcribe.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class TranscribeRequest(BaseModel):
    # required
    recording_id: str

    # optional knobs (nullable is OK)
    model: Optional[str] = None            # e.g. tiny, base, small, medium, large-v3
    device: Optional[str] = None           # "cpu" | "cuda"
    compute: Optional[str] = None          # "int8" | "float16"
    language: Optional[str] = None
    srt: Optional[bool] = False

    # advanced (all optional; safe to ignore if unsupported)
    beam_size: Optional[int] = None
    best_of: Optional[int] = None
    temperature: Optional[float] = None
    prompt: Optional[str] = None
    condition_on_previous_text: Optional[bool] = None
    vad: Optional[bool] = None
    word_timestamps: Optional[bool] = None

    # NEW: speaker diarization (pyannote) – optional
    diarize: Optional[bool] = None
