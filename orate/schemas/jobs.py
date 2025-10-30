from __future__ import annotations
from pydantic import BaseModel
from typing import Optional, Literal

JobStatus = Literal["queued", "running", "done", "error"]

class JobCreateResponse(BaseModel):
    job_id: str
    status: JobStatus

class JobGetResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: float
    stage: Optional[str] = None
    eta_seconds: Optional[float] = None
    result_ref: Optional[str] = None
    error: Optional[str] = None
