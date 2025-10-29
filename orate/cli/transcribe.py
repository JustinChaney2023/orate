#!/usr/bin/env python3
"""
Transcribe audio to text (and optional SRT) using faster-whisper via the shared services layer.

Examples:
  python -m orate.cli.transcribe data/audio.mp3
  python orate/cli/transcribe.py data/lecture.wav --srt
  python orate/cli/transcribe.py data/clip.mp3 --model small --device cuda
  python orate/cli/transcribe.py data/clip.mp3 --out-prefix out/notes --language en
"""

from __future__ import annotations
import argparse
from pathlib import Path
import sys
import time

from orate.services.whisper import TranscribeOpts, transcribe_audio


def _s_to_srt_ts(t: float) -> str:
    # Kept for parity with previous output if needed in the future
    if t is None:
        t = 0.0
    ms = int(round((t - int(t)) * 1000))
    s = int(t) % 60
    m = (int(t) // 60) % 60
    h = int(t) // 3600
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="transcribe",
        description="Convert an audio file (mp3/wav/m4a/…) to text (and optionally SRT) with faster-whisper.",
    )
    p.add_argument("audio_path", type=Path, help="Path to audio file (MP3 recommended for storage).")
    p.add_argument("--model", default="small", help="tiny, base, small, medium, large-v3, distil-large-v3, turbo, etc.")
    p.add_argument("--device", choices=["cpu", "cuda"], default="cpu", help="CPU or NVIDIA GPU (CUDA).")
    p.add_argument("--compute", choices=["int8", "float16"], help="Override compute type. Default: cpu→int8, cuda→float16.")
    p.add_argument("--beam-size", type=int, default=5)
    p.add_argument("--language", default=None, help="Force language (e.g., en, es).")
    p.add_argument("--prompt", default=None, help="Initial decoding prompt to bias output.")
    p.add_argument("--word-timestamps", action="store_true", help="Emit word-level timestamps to console.")
    p.add_argument("--no-vad", action="store_true", help="Disable VAD filtering.")
    p.add_argument("--srt", action="store_true", help="Also write an .srt subtitle file.")
    p.add_argument("--out-prefix", type=Path, default=None, help="Output path prefix (no extension).")
    p.add_argument("-v", "--verbose", action="store_true", help="Verbose console logs.")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    in_path: Path = args.audio_path
    if not in_path.exists() or not in_path.is_file():
        print(f"[error] Input file not found: {in_path.resolve()}", file=sys.stderr)
        return 2

    # Determine output prefix: same folder, filename sans extension unless provided
    out_prefix: Path = args.out_prefix if args.out_prefix else in_path.with_suffix("")

    # Build shared opts
    opts = TranscribeOpts(
        model=args.model,
        device=args.device,
        compute=args.compute,
        beam_size=args.beam_size,
        language=args.language,
        prompt=args.prompt,
        word_timestamps=bool(args.word_timestamps),
        vad=not args.no_vad,
    )

    if args.verbose:
        comp = args.compute if args.compute else ("float16" if args.device == "cuda" else "int8")
        print(f"[info] model={opts.model} device={opts.device} compute={comp}")
        print(f"[info] input={in_path.resolve()}")
        print(f"[info] out_prefix={out_prefix}")

    t0 = time.time()
    try:
        text, info = transcribe_audio(
            audio_path=in_path,
            out_prefix=out_prefix,
            opts=opts,
            write_srt=bool(args.srt),
        )
    except FileNotFoundError:
        print(f"[error] Could not open input file (FileNotFoundError). Check the path: {in_path.resolve()}", file=sys.stderr)
        return 2
    except Exception as e:
        # If decoding non-WAVs fails, ensure ffmpeg/PyAV are installed and on PATH.
        hint = ""
        if in_path.suffix.lower() not in (".wav", ".wave"):
            hint = " (hint: for MP3/M4A ensure ffmpeg/ffprobe are installed and on PATH)"
        print(f"[error] Transcribe failed: {e}{hint}", file=sys.stderr)
        return 4

    # Console summary
    t1 = time.time()
    lang = getattr(info, "language", None)
    prob = getattr(info, "language_probability", None)
    dur = getattr(info, "duration", None)

    if lang is not None and prob is not None:
        print(f"Detected language '{lang}' with probability {prob:.3f}")
    if dur is not None:
        print(f"Audio duration: {dur:.2f}s")
    print(f"Wrote: {out_prefix.with_suffix('.txt')}")
    if args.srt:
        print(f"Wrote: {out_prefix.with_suffix('.srt')}")
    print(f"Processing time: {t1 - t0:.2f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
