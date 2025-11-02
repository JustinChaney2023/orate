from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import SQLModel, Field


class Recording(SQLModel, table=True):
    __tablename__ = "recording"

    id: str = Field(primary_key=True, index=True)
    original_ext: str
    original_path: str
    duration_s: float = 0.0
    sha256: str
    created_at: datetime
    # NOTE: intentionally no Relationship field here


class Transcript(SQLModel, table=True):
    __tablename__ = "transcript"

    id: str = Field(primary_key=True, index=True)
    recording_id: str = Field(foreign_key="recording.id", index=True)

    # artifacts
    text_path: str
    srt_path: Optional[str] = None

    # metadata
    language: Optional[str] = None
    language_probability: Optional[float] = None
    model: str
    device: str
    compute: str
    duration_s: Optional[float] = None
    created_at: datetime

    # user-facing metadata
    title: Optional[str] = None
    notes: Optional[str] = None
    # NOTE: intentionally no Relationship backref


class JobStatus(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    error = "error"


class Job(SQLModel, table=True):
    __tablename__ = "job"

    id: str = Field(primary_key=True, index=True)
    kind: str
    payload_json: str

    status: JobStatus
    progress: float = 0.0
    stage: Optional[str] = None
    eta_seconds: Optional[float] = None

    started_at: Optional[datetime] = None
    result_ref: Optional[str] = None
    error: Optional[str] = None

    created_at: datetime
    updated_at: datetime
