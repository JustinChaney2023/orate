import { useEffect, useRef, useState } from "react";
import { uploadAudio, startTranscription, type JobCreateResponse } from "../api/client";

type Props = {
  /** If true, call startTranscription automatically after successful upload */
  autoStartTranscribe?: boolean;
  /** Callback when upload finishes (recording id + optional job if auto-started) */
  onUploaded?: (recordingId: string, job?: JobCreateResponse) => void;
};

export default function Recorder({ autoStartTranscribe = true, onUploaded }: Props) {
  const [recSupported, setRecSupported] = useState<boolean>(!!(navigator.mediaDevices && window.MediaRecorder));
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  const startTsRef = useRef<number>(0);
  const pausedAtRef = useRef<number | null>(null);
  const pausedAccumRef = useRef<number>(0);

  useEffect(() => {
    setRecSupported(!!(navigator.mediaDevices && window.MediaRecorder));
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startTimer() {
    startTsRef.current = performance.now();
    pausedAccumRef.current = 0;
    pausedAtRef.current = null;
    setElapsedMs(0);
    tickTimerRef.current = window.setInterval(() => {
      const now = performance.now();
      const pausedDelta = pausedAccumRef.current;
      const base = now - startTsRef.current - pausedDelta;
      setElapsedMs(Math.max(0, Math.floor(base)));
    }, 200);
  }

  function pauseTimer() {
    if (pausedAtRef.current == null) {
      pausedAtRef.current = performance.now();
    }
  }

  function resumeTimer() {
    if (pausedAtRef.current != null) {
      pausedAccumRef.current += performance.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
  }

  function stopTimer() {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }

  async function startRec() {
    if (!recSupported || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mrRef.current = mr;

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      source.connect(analyser);

      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.start(250); // collect small chunks periodically

      setRecording(true);
      setPaused(false);
      startTimer();
      startMeter();
    } catch (e) {
      console.error(e);
      alert("Microphone permission or recording failed.");
    }
  }

  function pauseRec() {
    const mr = mrRef.current;
    if (!mr || !recording || paused) return;
    try {
      mr.pause();
      setPaused(true);
      pauseTimer();
    } catch (e) {
      console.error(e);
    }
  }

  function resumeRec() {
    const mr = mrRef.current;
    if (!mr || !recording || !paused) return;
    try {
      mr.resume();
      setPaused(false);
      resumeTimer();
    } catch (e) {
      console.error(e);
    }
  }

  async function stopRec() {
    const mr = mrRef.current;
    if (!mr || !recording) return;
    try {
      mr.stop();
      mr.stream.getTracks().forEach((t) => t.stop());
    } catch {}
    stopAll();

    // Build final Blob (webm/opus most common)
    const blob = new Blob(chunksRef.current, { type: mr?.mimeType || "audio/webm" });
    chunksRef.current = [];

    // Upload
    setUploading(true);
    try {
      const file = new File([blob], "recording.webm", { type: blob.type || "audio/webm" });
      const rec = await uploadAudio(file);

      let job: JobCreateResponse | undefined;
      if (autoStartTranscribe) {
        job = await startTranscription(rec.recording_id);
      }
      onUploaded?.(rec.recording_id, job);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function stopAll() {
    setRecording(false);
    setPaused(false);
    stopTimer();
    stopMeter();

    try { mrRef.current?.stream.getTracks().forEach(t => t.stop()); } catch {}
    mrRef.current = null;

    try { analyserRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    analyserRef.current = null;
    sourceRef.current = null;

    try { ctxRef.current?.close(); } catch {}
    ctxRef.current = null;
  }

  function startMeter() {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const buf = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      // Rough amplitude estimate
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i] - 128) / 128;
        if (v > peak) peak = v;
      }
      setLevel(Math.min(1, peak * 2));
      meterTimerRef.current = window.requestAnimationFrame(tick);
    };
    meterTimerRef.current = window.requestAnimationFrame(tick);
  }

  function stopMeter() {
    if (meterTimerRef.current) {
      cancelAnimationFrame(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    setLevel(0);
  }

  function fmt(ms: number) {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div className="rec">
      <div className="rec-row">
        {!recording && (
          <button className="btn" onClick={startRec} disabled={!recSupported}>
            Record
          </button>
        )}
        {recording && !paused && (
          <button className="btn" onClick={pauseRec}>
            Pause
          </button>
        )}
        {recording && paused && (
          <button className="btn" onClick={resumeRec}>
            Resume
          </button>
        )}
        {recording && (
          <button className="btn danger" onClick={stopRec}>
            Stop & Upload
          </button>
        )}

        <div className="rec-timer">{recording ? fmt(elapsedMs) : "0:00"}</div>
      </div>

      <div className="rec-row">
        <div className="rec-meter"><span style={{ width: `${Math.floor(level * 100)}%` }} /></div>
        <div className="rec-upload">
          {uploading ? <span className="spinner" /> : null}
          {uploading ? "Uploading…" : ""}
        </div>
      </div>
    </div>
  );
}
