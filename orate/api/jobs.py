from __future__ import annotations
from fastapi import APIRouter, HTTPException
from orate.db import crud
from orate.schemas.jobs import JobGetResponse

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

@router.get("/{job_id}", response_model=JobGetResponse)
def get_job(job_id: str):
    job = crud.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return JobGetResponse(
        job_id=job.id,
        status=job.status.value if hasattr(job.status, "value") else str(job.status),
        result_ref=job.result_ref,
        error=job.error,
    )
