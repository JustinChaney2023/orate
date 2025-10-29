# orate/db/models.py
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field

# ---------- Recording ----------
class Recording(SQLModel, table=True):
    id: str = Field(primary_key=True)              # recording_id (uuid hex)
    original_ext: str                              # ".mp3", ".wav", etc.
    original_path: str                             # absolute or repo-relative path
    duration_s: float
    sha256: str
    created_at: datetime

# ---------- Transcript ----------
class Transcript(SQLModel, table=True):
    id: str = Field(primary_key=True)              # transcript_id (uuid hex)
    recording_id: str = Field(foreign_key="recording.id")
    text_path: str
    srt_path: Optional[str] = None
    language: Optional[str] = None
    language_probability: Optional[float] = None
    model: str
    device: str
    compute: str
    duration_s: Optional[float] = None
    created_at: datetime

# ---------- Job ----------
class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    error = "error"

class Job(SQLModel, table=True):
    id: str = Field(primary_key=True)              # job_id (uuid hex)
    kind: str                                      # "transcribe"|"summarize"|...
    payload_json: str                              # small JSON string
    status: JobStatus = Field(default=JobStatus.queued)
    result_ref: Optional[str] = None               # e.g., transcript_id
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
