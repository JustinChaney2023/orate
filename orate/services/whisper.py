# orate/services/whisper.py
from __future__ import annotations

from typing import Optional, Dict, Any, Tuple
from pathlib import Path
import time
import hashlib

from pydantic import BaseModel, ConfigDict, field_validator
from faster_whisper import WhisperModel


class TranscribeOpts(BaseModel):
    model: Optional[str] = None
    device: Optional[str] = None
    compute: Optional[str] = None
    language: Optional[str] = None
    srt: Optional[bool] = False

    # accepted but optional; ignored if None
    vad: Optional[bool] = None
    beam_size: Optional[int] = None
    best_of: Optional[int] = None
    temperature: Optional[float] = None
    prompt: Optional[str] = None
    condition_on_previous_text: Optional[bool] = None
    word_timestamps: Optional[bool] = None

    # ignore future/unknown keys so UI changes don't break API
    model_config = ConfigDict(extra="ignore")

    @field_validator("model", "device", "compute")
    @classmethod
    def _lower(cls, v: Optional[str]) -> Optional[str]:
        return v.lower() if isinstance(v, str) else v

    def resolved(self) -> "TranscribeOpts":
        # choose device/compute defaults if omitted
        dev = (self.device or "cpu").lower()
        comp = self.compute or ("float16" if dev == "cuda" else "int8")
        return TranscribeOpts(
            model=self.model or "small",
            device=dev,
            compute=comp,
            language=self.language,
            srt=bool(self.srt),
            vad=self.vad,
            beam_size=self.beam_size,
            best_of=self.best_of,
            temperature=self.temperature,
            prompt=self.prompt,
            condition_on_previous_text=self.condition_on_previous_text,
            word_timestamps=self.word_timestamps,
        )


class TranscribeResult(BaseModel):
    text: str
    srt: Optional[str]
    language: str
    duration_sec: float
    processing_sec: float
    sha256: str


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


_model_cache: Dict[Tuple[str, str, str], WhisperModel] = {}


def load_model(opts: TranscribeOpts) -> WhisperModel:
    o = opts.resolved()
    key = (o.model, o.device, o.compute)
    m = _model_cache.get(key)
    if m is not None:
        return m
    m = WhisperModel(
        model_size_or_path=o.model,
        device=o.device,
        compute_type=o.compute,
    )
    _model_cache[key] = m
    return m


def transcribe_audio(
    audio_path: Path,
    out_prefix: Path,
    opts: TranscribeOpts,
    write_srt: bool = False,
    progress_cb=None,  # optional: progress_cb(decoded_seconds: float)
) -> TranscribeResult:
    t0 = time.time()
    _ensure_dir(out_prefix.parent)

    o = opts.resolved()
    model = load_model(o)

    # Build kwargs passed to faster-whisper
    tx_kwargs: Dict[str, Any] = {
        "language": o.language,
        "vad_filter": False,  # keep disabled for now even if o.vad is True
        "word_timestamps": bool(o.word_timestamps) if o.word_timestamps is not None else False,
    }
    if o.beam_size is not None:
        tx_kwargs["beam_size"] = o.beam_size
    if o.best_of is not None:
        tx_kwargs["best_of"] = o.best_of
    if o.temperature is not None:
        tx_kwargs["temperature"] = o.temperature
    if o.prompt:
        tx_kwargs["initial_prompt"] = o.prompt
    if o.condition_on_previous_text is not None:
        tx_kwargs["condition_on_previous_text"] = o.condition_on_previous_text

    # Progress proxy (best-effort)
    def _proxy_progress(seg):
        if progress_cb and hasattr(seg, "end"):
            try:
                progress_cb(float(seg.end))
            except Exception:
                pass

    segments, info = model.transcribe(str(audio_path), **tx_kwargs)

    txt_lines = []
    srt_lines = []
    seg_index = 1

    for seg in segments:
        _proxy_progress(seg)
        txt_lines.append(seg.text.strip())

        if write_srt:
            def fmt(ts: float) -> str:
                h = int(ts // 3600)
                m = int((ts % 3600) // 60)
                s = int(ts % 60)
                ms = int((ts - int(ts)) * 1000)
                return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

            srt_lines.append(str(seg_index))
            srt_lines.append(f"{fmt(seg.start)} --> {fmt(seg.end)}")
            srt_lines.append(seg.text.strip())
            srt_lines.append("")
            seg_index += 1

    text_out = "\n".join(txt_lines).strip()
    srt_out = "\n".join(srt_lines).strip() if write_srt else None

    (out_prefix.with_suffix(".txt")).write_text(text_out, encoding="utf-8")
    if srt_out is not None:
        (out_prefix.with_suffix(".srt")).write_text(srt_out, encoding="utf-8")

    processing = time.time() - t0
    sha = _sha256_file(audio_path)

    lang = getattr(info, "language", None) or o.language or "unknown"
    dur = float(getattr(info, "duration", 0.0) or 0.0)

    return TranscribeResult(
        text=text_out,
        srt=srt_out,
        language=lang,
        duration_sec=dur,
        processing_sec=processing,
        sha256=sha,
    )
