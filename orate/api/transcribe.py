# orate/api/transcribe.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pathlib import Path
import json, time

from orate.schemas.transcribe import TranscribeRequest
from orate.schemas.jobs import JobCreateResponse
from orate.services import storage, whisper
from orate.services.audio import probe_duration
from orate.db.session import init_db
from orate.db import crud
from orate.db.models import JobStatus

router = APIRouter(prefix="/api", tags=["transcribe"])


def _run_transcription_job(job_id: str, payload: TranscribeRequest):
    rec = crud.get_recording(payload.recording_id)
    if not rec:
        crud.update_job_status(job_id, status=JobStatus.error, error="recording_not_found")
        return

    orig_path = Path(rec.original_path)
    if not orig_path.exists():
        crud.update_job_status(job_id, status=JobStatus.error, error="original_missing")
        return

    crud.mark_job_running(job_id)

    total = float(rec.duration_s or 0.0)
    if total <= 0:
        try:
            total = float(probe_duration(orig_path))
        except Exception:
            total = 0.0

    t0 = time.time()

    def _progress_cb(decoded_s: float):
        if total > 0:
            prog = min(decoded_s / total, 0.99)
            elapsed = time.time() - t0
            eta = (elapsed / max(prog, 1e-3)) * (1.0 - prog)
            crud.update_job_progress(job_id, progress=prog, stage="decoding", eta_seconds=eta)
        else:
            elapsed = time.time() - t0
            prog = min(0.9, elapsed / 60.0)
            crud.update_job_progress(job_id, progress=prog, stage="decoding", eta_seconds=None)

    try:
        out_prefix = storage.recording_dir(payload.recording_id) / "transcript"
        opts = whisper.TranscribeOpts(
            model=payload.model,
            device=payload.device,
            compute=payload.compute,
            language=payload.language,
            srt=payload.srt,
            beam_size=payload.beam_size,
            best_of=payload.best_of,
            temperature=payload.temperature,
            prompt=payload.prompt,
            condition_on_previous_text=payload.condition_on_previous_text,
            vad=payload.vad,
            word_timestamps=payload.word_timestamps,
            diarize=payload.diarize,  # NEW
        )

        crud.update_job_progress(job_id, progress=0.01, stage="loading_model", eta_seconds=None)

        result = whisper.transcribe_audio(
            audio_path=orig_path,
            out_prefix=out_prefix,
            opts=opts,
            write_srt=bool(payload.srt),
            progress_cb=_progress_cb,
        )

        crud.update_job_progress(job_id, progress=0.99, stage="writing_output", eta_seconds=0)

        tr_id = storage.new_id("tr")
        crud.create_transcript(
            id=tr_id,
            recording_id=payload.recording_id,
            text_path=str(out_prefix.with_suffix(".txt")),
            srt_path=str(out_prefix.with_suffix(".srt")) if payload.srt else None,
            language=result.language,
            language_probability=None,
            model=opts.resolved().model,
            device=opts.resolved().device,
            compute=opts.resolved().compute,
            duration_s=result.duration_sec,
        )

        crud.update_job_status(job_id, status=JobStatus.done, result_ref=tr_id)

    except Exception as e:
        crud.update_job_status(job_id, status=JobStatus.error, error=str(e))


@router.post("/transcribe", response_model=JobCreateResponse)
def create_transcription_job(payload: TranscribeRequest, background: BackgroundTasks):
    init_db()

    rec = crud.get_recording(payload.recording_id)
    if not rec:
        raise HTTPException(status_code=404, detail="recording_id not found")

    job_id = storage.new_id("job")
    crud.create_job(
        id=job_id,
        kind="transcribe",
        payload_json=json.dumps(payload.model_dump()),
        status=JobStatus.queued,
    )

    background.add_task(_run_transcription_job, job_id, payload)
    return JobCreateResponse(job_id=job_id, status="queued")
