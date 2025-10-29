# orate/services/whisper.py
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple, List

from faster_whisper import WhisperModel

@dataclass
class TranscribeOpts:
    model: str = "small"            # tiny, base, small, medium, large-v3, etc.
    device: str = "cpu"             # "cpu" or "cuda"
    compute: Optional[str] = None   # "int8" (cpu) or "float16" (cuda); None = auto
    beam_size: int = 5
    language: Optional[str] = None
    prompt: Optional[str] = None
    word_timestamps: bool = False
    vad: bool = True

def _compute_type(device: str, override: Optional[str]) -> str:
    if override:
        return override
    return "float16" if device == "cuda" else "int8"

def transcribe_audio(
    audio_path: Path,
    out_prefix: Optional[Path] = None,
    opts: Optional[TranscribeOpts] = None,
    write_srt: bool = False,
) -> Tuple[str, object]:
    """
    Transcribe an audio file (mp3/wav/m4a/…) directly with faster-whisper.
    Returns (plain_text, info_obj). Optionally writes <out_prefix>.txt and .srt.
    """
    if opts is None:
        opts = TranscribeOpts()

    compute_type = _compute_type(opts.device, opts.compute)
    model = WhisperModel(opts.model, device=opts.device, compute_type=compute_type)

    segments, info = model.transcribe(
        str(audio_path),
        beam_size=opts.beam_size,
        vad_filter=opts.vad,
        vad_parameters=dict(min_silence_duration_ms=500),
        word_timestamps=opts.word_timestamps,
        language=opts.language,
        initial_prompt=opts.prompt,
    )

    seg_list = list(segments)
    lines: List[str] = []
    for seg in seg_list:
        t = (seg.text or "").strip()
        if t:
            lines.append(t)

    text = "\n".join(lines) + ("\n" if lines else "")

    if out_prefix is not None:
        # write .txt
        txt_path = Path(f"{out_prefix}.txt")
        txt_path.parent.mkdir(parents=True, exist_ok=True)
        txt_path.write_text(text, encoding="utf-8")

        # write .srt
        if write_srt:
            srt_path = Path(f"{out_prefix}.srt")
            _write_srt(seg_list, srt_path)

    return text, info

def _s_to_srt_ts(t: float) -> str:
    if t is None:
        t = 0.0
    ms = int(round((t - int(t)) * 1000))
    s = int(t) % 60
    m = (int(t) // 60) % 60
    h = int(t) // 3600
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def _write_srt(segments, srt_path: Path) -> None:
    idx = 1
    lines = []
    for seg in segments:
        start = _s_to_srt_ts(seg.start)
        end = _s_to_srt_ts(seg.end)
        text = (seg.text or "").strip()
        if not text:
            continue
        lines.append(str(idx))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
        idx += 1
    srt_path.write_text("\n".join(lines), encoding="utf-8")
