# orate/services/storage.py
from __future__ import annotations
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import uuid
from typing import Any, Dict, Optional

# Root for all recordings
DATA_ROOT = Path("data")

def ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def new_id(prefix: Optional[str] = None) -> str:
    rid = uuid.uuid4().hex  # 32 hex chars, lowercase
    return f"{prefix}_{rid}" if prefix else rid

# ---------- Per-recording paths ----------

def recording_dir(recording_id: str) -> Path:
    return DATA_ROOT / recording_id

def original_path(recording_id: str, ext: str) -> Path:
    """Stored original file, e.g. original.mp3 (we keep user-provided ext)."""
    if not ext.startswith("."):
        ext = "." + ext
    return recording_dir(recording_id) / f"original{ext}"

def transcript_txt_path(recording_id: str) -> Path:
    return recording_dir(recording_id) / "transcript.txt"

def transcript_srt_path(recording_id: str) -> Path:
    return recording_dir(recording_id) / "transcript.srt"

def manifest_path(recording_id: str) -> Path:
    return recording_dir(recording_id) / "manifest.json"

# Optional scratch area (handy later)
def tmp_dir(recording_id: str) -> Path:
    return recording_dir(recording_id) / ".tmp"

# ---------- File ops ----------

def write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    path.write_text(text, encoding="utf-8")

def write_json(path: Path, obj: Dict[str, Any]) -> None:
    ensure_dir(path.parent)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))

def sha256_file(path: Path, chunk_size: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    return h.hexdigest()

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
