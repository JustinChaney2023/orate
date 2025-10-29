#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import sys

from orate.services import storage, audio, whisper
from orate.db.session import init_db
from orate.db import crud

def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python -m orate.scripts.ingest_and_transcribe <path-to-audio>", file=sys.stderr)
        return 2

    src = Path(sys.argv[1]).resolve()
    if not src.exists():
        print(f"[error] file not found: {src}", file=sys.stderr)
        return 2

    # 0) ensure tables exist
    init_db()

    # 1) create a new recording id & copy original into data/<id>/
    rec_id = storage.new_id("rec")
    ext = src.suffix or ".mp3"
    orig = storage.original_path(rec_id, ext)
    storage.ensure_dir(orig.parent)
    orig.write_bytes(src.read_bytes())

    # 2) probe duration + sha
    try:
        dur = audio.probe_duration(orig)
    except Exception as e:
        print(f"[warn] ffprobe failed to read duration: {e}")
        dur = 0.0
    sha = storage.sha256_file(orig)

    # 3) insert Recording row
    rec = crud.create_recording(
        id=rec_id,
        original_ext=ext,
        original_path=str(orig),
        duration_s=dur,
        sha256=sha,
    )

    # 4) transcribe directly from the original file; write txt+srt next to it
    out_prefix = storage.recording_dir(rec_id) / "transcript"
    text, info = whisper.transcribe_audio(
        audio_path=orig,
        out_prefix=out_prefix,
        opts=whisper.TranscribeOpts(model="small", device="cpu"),
        write_srt=True,
    )

    # 5) write a small manifest (optional but handy)
    storage.write_json(storage.manifest_path(rec_id), {
        "recording_id": rec_id,
        "original": str(orig),
        "duration_s": dur,
        "sha256": sha,
        "model": "small",
        "device": "cpu",
        "compute": "int8",
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "created_at": storage.utc_now_iso(),
    })

    # 6) insert Transcript row
    tr_id = storage.new_id("tr")
    txt_path = str(out_prefix.with_suffix(".txt"))
    srt_path = str(out_prefix.with_suffix(".srt"))
    tr = crud.create_transcript(
        id=tr_id,
        recording_id=rec_id,
        text_path=txt_path,
        srt_path=srt_path,
        language=getattr(info, "language", None),
        language_probability=getattr(info, "language_probability", None),
        model="small",
        device="cpu",
        compute="int8",
        duration_s=getattr(info, "duration", None),
    )

    print("recording_id:", rec_id)
    print("transcript_id:", tr_id)
    print("txt:", txt_path)
    print("srt:", srt_path)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
