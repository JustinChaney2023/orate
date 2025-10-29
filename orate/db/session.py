# orate/db/session.py
from __future__ import annotations
from sqlmodel import SQLModel, create_engine, Session
from pathlib import Path
import os

# store db under the repo root by default
DB_PATH = Path(os.getenv("ORATE_DB", "orate.db")).resolve()
DB_URL = f"sqlite:///{DB_PATH}"

# check_same_thread=False allows using sessions in background tasks later
engine = create_engine(DB_URL, echo=False, connect_args={"check_same_thread": False})

def init_db() -> None:
    """Create tables if they don't exist."""
    SQLModel.metadata.create_all(engine)

def get_session() -> Session:
    return Session(engine)
