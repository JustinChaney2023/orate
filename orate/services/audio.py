# orate/services/audio.py
from __future__ import annotations
from pathlib import Path
import subprocess
import json

def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True)

def probe_duration(path: Path) -> float:
    """
    Return duration in seconds using ffprobe.
    Requires ffmpeg/ffprobe to be on PATH.
    """
    cmd = [
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_entries", "format=duration",
        str(path),
    ]
    out = _run(cmd).stdout.decode("utf-8", errors="replace")
    data = json.loads(out)
    return float(data["format"]["duration"])
