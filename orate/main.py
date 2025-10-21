from faster_whisper import WhisperModel
import sys
from pathlib import Path

# pick something smaller first on CPU; you can switch to "large-v3" after
MODEL = "base.en"   # try: "small.en", "base.en", or "large-v3", "medium.en", "turbo"

# accept filename as arg or default to audi.mp3
audio_path = Path(__file__).with_name("audio.mp3")

if not audio_path.exists():
    raise FileNotFoundError(f"Couldn't find {audio_path}")

# CPU + INT8
model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=8)
# Run on GPU with FP16
#model = WhisperModel(model_size, device="cuda", compute_type="float16")
# or run on GPU with INT8
# model = WhisperModel(model_size, device="cuda", compute_type="int8_float16")

# beam_size=1 is faster on CPU; bump later for accuracy
segments, info = model.transcribe(
    str(audio_path),
    beam_size=1,
    vad_filter=True,                # helps with long files / silence
    condition_on_previous_text=True # better continuity
)

print(f"Detected language: {info.language} (p={info.language_probability:.2f})")
for seg in segments:
    print(f"[{seg.start:.2f}s -> {seg.end:.2f}s] {seg.text}")
