from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import desc
from sqlmodel import select

from .session import get_session
from .models import Recording, Transcript, Job, JobStatus


def _now() -> datetime:
    # store naive UTC in DB for simplicity
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ---------- Recordings ----------
def create_recording(
    *,
    id: str,
    original_ext: str,
    original_path: str,
    duration_s: float,
    sha256: str,
) -> Recording:
    rec = Recording(
        id=id,
        original_ext=original_ext,
        original_path=original_path,
        duration_s=duration_s,
        sha256=sha256,
        created_at=_now(),
    )
    with get_session() as s:
        s.add(rec)
        s.commit()
        s.refresh(rec)
    return rec


def get_recording(rec_id: str) -> Optional[Recording]:
    with get_session() as s:
        return s.get(Recording, rec_id)


def list_recordings(limit: int = 50) -> List[Recording]:
    with get_session() as s:
        stmt = select(Recording).order_by(desc(Recording.created_at)).limit(limit)
        return list(s.exec(stmt))


# ---------- Transcripts ----------
def create_transcript(
    *,
    id: str,
    recording_id: str,
    text_path: str,
    srt_path: Optional[str],
    language: Optional[str],
    language_probability: Optional[float],
    model: str,
    device: str,
    compute: str,
    duration_s: Optional[float],
) -> Transcript:
    tr = Transcript(
        id=id,
        recording_id=recording_id,
        text_path=text_path,
        srt_path=srt_path,
        language=language,
        language_probability=language_probability,
        model=model,
        device=device,
        compute=compute,
        duration_s=duration_s,
        created_at=_now(),
    )
    with get_session() as s:
        s.add(tr)
        s.commit()
        s.refresh(tr)
    return tr


def get_transcript(tr_id: str) -> Optional[Transcript]:
    with get_session() as s:
        return s.get(Transcript, tr_id)


def list_transcripts(limit: int = 50) -> List[Transcript]:
    with get_session() as s:
        stmt = select(Transcript).order_by(desc(Transcript.created_at)).limit(limit)
        return list(s.exec(stmt))


def list_transcripts_for_recording(rec_id: str, limit: int = 50) -> List[Transcript]:
    with get_session() as s:
        stmt = (
            select(Transcript)
            .where(Transcript.recording_id == rec_id)
            .order_by(desc(Transcript.created_at))
            .limit(limit)
        )
        return list(s.exec(stmt))


def delete_transcript(tr_id: str) -> bool:
    """Delete the transcript row. Returns True if deleted, False if not found."""
    with get_session() as s:
        obj = s.get(Transcript, tr_id)
        if not obj:
            return False
        s.delete(obj)
        s.commit()
        return True


# ---------- Jobs ----------
def create_job(
    *,
    id: str,
    kind: str,
    payload_json: str,
    status: JobStatus = JobStatus.queued,
) -> Job:
    job = Job(
        id=id,
        kind=kind,
        payload_json=payload_json,
        status=status,
        progress=0.0,
        stage="queued",
        eta_seconds=None,
        started_at=None,
        result_ref=None,
        error=None,
        created_at=_now(),
        updated_at=_now(),
    )
    with get_session() as s:
        s.add(job)
        s.commit()
        s.refresh(job)
    return job


def mark_job_running(job_id: str) -> None:
    with get_session() as s:
        job = s.get(Job, job_id)
        if not job:
            return
        job.status = JobStatus.running
        job.stage = "loading_model"
        job.progress = 0.0
        job.started_at = _now()
        job.updated_at = _now()
        s.add(job)
        s.commit()


def update_job_progress(
    job_id: str,
    *,
    progress: float,
    stage: str | None = None,
    eta_seconds: float | None = None,
) -> None:
    p = max(0.0, min(1.0, float(progress)))
    with get_session() as s:
        job = s.get(Job, job_id)
        if not job:
            return
        job.progress = p
        if stage is not None:
            job.stage = stage
        job.eta_seconds = float(eta_seconds) if eta_seconds is not None else job.eta_seconds
        job.updated_at = _now()
        s.add(job)
        s.commit()


def update_job_status(
    job_id: str,
    *,
    status: JobStatus,
    result_ref: Optional[str] = None,
    error: Optional[str] = None,
) -> Optional[Job]:
    with get_session() as s:
        job = s.get(Job, job_id)
        if not job:
            return None
        job.status = status
        job.result_ref = result_ref
        job.error = error
        job.updated_at = _now()
        s.add(job)
        s.commit()
        s.refresh(job)
        return job


def get_job(job_id: str) -> Optional[Job]:
    with get_session() as s:
        return s.get(Job, job_id)
