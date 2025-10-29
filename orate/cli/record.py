#!/usr/bin/env python3
"""
Record microphone to 16 kHz, mono, 16-bit PCM WAV.

Examples:
  python orate/cli/record.py --out data/test.wav --interactive
  python orate/cli/record.py --list-devices
"""

from __future__ import annotations
import argparse
from pathlib import Path
import sys
import time
import threading
import queue

import sounddevice as sd
import soundfile as sf


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="record",
        description="Record microphone to WAV (16kHz mono PCM16).",
    )
    p.add_argument("--out", type=Path, required=False, default=Path("data/recording.wav"),
                   help="Output WAV path (parent dirs are created).")
    p.add_argument("--interactive", action="store_true",
                   help="Press Enter to start, Enter again to stop.")
    p.add_argument("--samplerate", type=int, default=16000, help="Sample rate Hz (default 16000).")
    p.add_argument("--device", type=str, default=None,
                   help="Input device name/index (as in --list-devices).")
    p.add_argument("--list-devices", action="store_true", help="List input devices and exit.")
    return p.parse_args()


def list_devices() -> None:
    print(sd.query_devices())


def interactive_record(out_path: Path, samplerate: int, device: str | None) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)

    print("Press Enter to START recording…")
    input()
    print("Recording… Press Enter to STOP.")

    q: queue.Queue = queue.Queue()
    frames_written = 0
    stop_flag = threading.Event()

    def callback(indata, frames, time_info, status):
        if status:
            # Print XRuns etc. but keep going
            print(f"[audio] {status}", file=sys.stderr)
        q.put(indata.copy())

    def stopper():
        input()
        stop_flag.set()

    try:
        with sf.SoundFile(str(out_path), mode="w", samplerate=samplerate, channels=1,
                          subtype="PCM_16", format="WAV") as wav, \
             sd.InputStream(samplerate=samplerate, channels=1, dtype="int16",
                            callback=callback, device=device):
            t0 = time.time()
            thread = threading.Thread(target=stopper, daemon=True)
            thread.start()
            while not stop_flag.is_set():
                try:
                    data = q.get(timeout=0.1)
                except queue.Empty:
                    continue
                wav.write(data)
                frames_written += len(data)
            t1 = time.time()
            elapsed = t1 - t0
    except sd.PortAudioError as e:
        print(f"[error] Audio device error: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"[error] Recording failed: {e}", file=sys.stderr)
        return 3

    if frames_written == 0:
        # Zero-length guard
        try:
            out_path.unlink(missing_ok=True)
        except Exception:
            pass
        print("[warn] Zero-length recording; nothing written.")
        return 1

    print(f"Saved {out_path}  |  duration ≈ {frames_written / samplerate:.2f}s")
    return 0


def main() -> int:
    args = parse_args()

    if args.list_devices:
        list_devices()
        return 0

    if args.interactive:
        return interactive_record(args.out, args.samplerate, args.device)

    # Non-interactive mode (simple 5s sample as an example—you can extend later)
    print("Tip: use --interactive for practical recording.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
