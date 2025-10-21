# Orate

**Orate** is a audio recorder that transcribes speech into text using **OpenAI Whisper** (via `faster-whisper`) — all processed on a local GPU, not in the cloud.

Later, it will include **Orator**, an AI assistant that can discuss and reason about your recorded notes.

---
###### subject to change.
### Features
- Transcription with `faster-whisper`
- Optional **VAD** (voice activity detection) for clean segments
- Simple **Web UI** for recording or playback
- **SQLite + FTS5** search across your transcribed notes
- Future: chat with your notes via Orator

---

### Requirements
- Python 3.11+
- CUDA GPU or CPU(4 testing)
- `ffmpeg`, `faster-whisper`

---

### ⚙️ Quick start

```bash
git clone https://github.com/JustinChaney2023/orate.git
cd orate
pip install -r requirements.txt
# not ready