from __future__ import annotations
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pathlib import Path
import json

from orate.schemas.transcribe import TranscribeRequest
from orate.schemas.jobs import JobCreateResponse
from orate.services import storage, whisper
from orate.db.session import init_db
from orate.db import crud
from orate.db.models import JobStatus

router = APIRouter(prefix="/api", tags=["transcribe"])

def _run_transcription_job(job_id: str, payload: TranscribeRequest):
    """Background task: run faster-whisper, write files, and update DB rows."""
    # 1) lookup recording
    rec = crud.get_recording(payload.recording_id)
    if not rec:
        crud.update_job_status(job_id, status=JobStatus.error, error="recording_not_found")
        return

    # 2) resolve original file path
    orig_path = Path(rec.original_path)
    if not orig_path.exists():
        crud.update_job_status(job_id, status=JobStatus.error, error="original_missing")
        return

    crud.update_job_status(job_id, status=JobStatus.running)

    try:
        # 3) transcribe directly from original
        out_prefix = storage.recording_dir(payload.recording_id) / "transcript"
        opts = whisper.TranscribeOpts(
            model=payload.model,
            device=payload.device,
            compute=payload.compute,
            beam_size=payload.beam_size,
            language=payload.language,
            prompt=payload.prompt,
            word_timestamps=payload.word_timestamps,
            vad=payload.vad,
        )
        text, info = whisper.transcribe_audio(
            audio_path=orig_path,
            out_prefix=out_prefix,
            opts=opts,
            write_srt=payload.srt,
        )

        # 4) create transcript row
        tr_id = storage.new_id("tr")
        tr = crud.create_transcript(
            id=tr_id,
            recording_id=payload.recording_id,
            text_path=str(out_prefix.with_suffix(".txt")),
            srt_path=str(out_prefix.with_suffix(".srt")) if payload.srt else None,
            language=getattr(info, "language", None),
            language_probability=getattr(info, "language_probability", None),
            model=opts.model,
            device=opts.device,
            compute=("float16" if opts.device == "cuda" and not opts.compute else (opts.compute or "int8")),
            duration_s=getattr(info, "duration", None),
        )

        # 5) update job → done
        crud.update_job_status(job_id, status=JobStatus.done, result_ref=tr.id)

    except Exception as e:
        crud.update_job_status(job_id, status=JobStatus.error, error=str(e))


@router.post("/transcribe", response_model=JobCreateResponse)
def create_transcription_job(payload: TranscribeRequest, background: BackgroundTasks):
    init_db()

    # quick validation of recording existence
    rec = crud.get_recording(payload.recording_id)
    if not rec:
        raise HTTPException(status_code=404, detail="recording_id not found")

    # create job row
    job_id = storage.new_id("job")
    crud.create_job(
        id=job_id,
        kind="transcribe",
        payload_json=json.dumps(payload.model_dump()),
        status=JobStatus.queued,
    )

    # schedule background task
    background.add_task(_run_transcription_job, job_id, payload)

    return JobCreateResponse(job_id=job_id, status="queued")
