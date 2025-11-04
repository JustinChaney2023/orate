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
  status_val = job.status.value if hasattr(job.status, "value") else str(job.status)
  return JobGetResponse(
      job_id=job.id,
      status=status_val,
      progress=float(job.progress or 0.0),
      stage=job.stage,
      eta_seconds=float(job.eta_seconds) if job.eta_seconds is not None else None,
      result_ref=job.result_ref,
      error=job.error,
  )

# NEW: delete job
@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: str):
  ok = crud.delete_job(job_id)
  if not ok:
    raise HTTPException(status_code=404, detail="job not found")
  return
