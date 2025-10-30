from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from sqlmodel import SQLModel, Field

# ---------- Recording ----------
class Recording(SQLModel, table=True):
    id: str = Field(primary_key=True)
    original_ext: str
    original_path: str
    duration_s: float
    sha256: str
    created_at: datetime


# ---------- Transcript ----------
class Transcript(SQLModel, table=True):
    id: str = Field(primary_key=True)
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
    id: str = Field(primary_key=True)
    kind: str
    payload_json: str
    status: JobStatus = Field(default=JobStatus.queued)

    # progress tracking
    progress: float = Field(default=0.0)          # 0..1
    stage: Optional[str] = None                   # e.g. "loading_model", "decoding"
    eta_seconds: Optional[float] = None
    started_at: Optional[datetime] = None

    result_ref: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
