from __future__ import annotations
from pathlib import Path
from typing import Optional, Callable, Tuple
from faster_whisper import WhisperModel

ProgressCB = Callable[[float], None]  # seconds decoded callback

class TranscribeOpts:
    def __init__(self, model="small", device="cpu", compute=None,
                 beam_size=5, language=None, prompt=None,
                 word_timestamps=False, vad=True):
        self.model = model
        self.device = device
        self.compute = compute
        self.beam_size = beam_size
        self.language = language
        self.prompt = prompt
        self.word_timestamps = word_timestamps
        self.vad = vad


def transcribe_audio(audio_path: Path,
                     out_prefix: Optional[Path] = None,
                     opts: Optional[TranscribeOpts] = None,
                     write_srt: bool = False,
                     progress_cb: Optional[ProgressCB] = None
                     ) -> Tuple[str, object]:
    """Run faster-whisper with optional progress callback."""
    opts = opts or TranscribeOpts()
    compute_type = opts.compute or ("float16" if opts.device == "cuda" else "int8")
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

    txt_lines = []
    seg_list = []
    for seg in segments:
        seg_list.append(seg)
        if progress_cb and getattr(seg, "end", None) is not None:
            try:
                progress_cb(float(seg.end))
            except Exception:
                pass
        if seg.text:
            txt_lines.append(seg.text.strip())

    # write outputs
    if out_prefix:
        txt_path = out_prefix.with_suffix(".txt")
        txt_path.write_text("\n".join(txt_lines), encoding="utf-8")

        if write_srt:
            srt_path = out_prefix.with_suffix(".srt")
            lines = []
            for i, seg in enumerate(seg_list, start=1):
                if not seg.text:
                    continue
                start = _s_to_srt_ts(seg.start)
                end = _s_to_srt_ts(seg.end)
                lines += [str(i), f"{start} --> {end}", seg.text.strip(), ""]
            srt_path.write_text("\n".join(lines), encoding="utf-8")

    return "\n".join(txt_lines), info


def _s_to_srt_ts(t: float) -> str:
    if t is None:
        t = 0.0
    ms = int(round((t - int(t)) * 1000))
    s = int(t) % 60
    m = (int(t) // 60) % 60
    h = int(t) // 3600
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
