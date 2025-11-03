import { useCallback, useEffect, useRef, useState } from "react";
import { uploadAudio, startTranscription, type JobCreateResponse } from "../api/client";

type Props = {
  onUploaded?: (recordingId: string, job?: JobCreateResponse) => void;
  autoStartTranscribe?: boolean; // default true
};

export default function Recorder({ onUploaded, autoStartTranscribe = true }: Props) {
  const [recState, setRecState] = useState<"idle" | "recording" | "stopping" | "uploading">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);
  const [level, setLevel] = useState<number>(0);
  const [uploadPct, setUploadPct] = useState<number>(0);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  // audio meter
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
  };

  const tick = useCallback(() => {
    // timer
    if (recState === "recording" && startedAtRef.current > 0) {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }
    // meter
    const analyser = analyserRef.current;
    if (analyser) {
      const buf = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(buf);
      // crude RMS
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      setLevel(rms);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [recState]);

  useEffect(() => {
    if (recState === "recording" && !rafRef.current) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [recState, tick]);

  const start = async () => {
    setErr(null);
    setElapsed(0);
    setUploadPct(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // set up meter
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;

      const mime =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : (MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "");

      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        try {
          setRecState("uploading");
          stopMeter();

          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          const filename = `mic-${Date.now()}.webm`;
          const file = new File([blob], filename, { type: blob.type });

          // upload with progress
          // fetch doesn’t expose upload progress; use XHR here
          const form = new FormData();
          form.append("file", file);

          const uploadRes = await new Promise<Response>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("POST", "/api/recordings");
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
            };
            xhr.onload = () => {
              resolve(new Response(xhr.responseText, { status: xhr.status }));
            };
            xhr.onerror = reject;
            xhr.send(form);
          });

          if (!uploadRes.ok) {
            const txt = await uploadRes.text();
            throw new Error(`Upload failed (${uploadRes.status}): ${txt}`);
          }
          const rec = await uploadRes.json() as Awaited<ReturnType<typeof uploadAudio>>;

          let job;
          if (autoStartTranscribe) {
            job = await startTranscription(rec.recording_id);
          }
          setRecState("idle");
          onUploaded?.(rec.recording_id, job);
        } catch (e: any) {
          setErr(e?.message || String(e));
          setRecState("idle");
        } finally {
          // cleanup stream
          mediaStreamRef.current?.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
          mediaRecRef.current = null;
        }
      };

      mr.start(200); // collect chunks every 200ms
      mediaRecRef.current = mr;
      startedAtRef.current = Date.now();
      setRecState("recording");
    } catch (e: any) {
      setErr(e?.message || "Mic permission denied or unavailable");
      setRecState("idle");
    }
  };

  const stop = async () => {
    if (recState !== "recording") return;
    setRecState("stopping");
    try {
      mediaRecRef.current?.stop();
    } catch {
      setRecState("idle");
      stopMeter();
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
      mediaRecRef.current = null;
    }
  };

  const seconds = Math.floor(elapsed % 60);
  const minutes = Math.floor(elapsed / 60);
  const barWidth = Math.min(100, Math.max(2, Math.round(level * 100)));

  return (
    <div className="rec">
      <div className="rec-row">
        {recState === "recording" ? (
          <button className="btn danger" onClick={stop} title="Stop recording">■ Stop</button>
        ) : (
          <button className="btn" onClick={start} title="Start recording">● Record</button>
        )}
        <div className="rec-timer">{minutes}:{seconds.toString().padStart(2, "0")}</div>
        <div className="rec-meter" aria-hidden>
          <span style={{ width: `${barWidth}%` }} />
        </div>
      </div>

      {recState === "uploading" && (
        <div className="rec-upload">
          <div className="spinner" />
          <div>Uploading… {uploadPct}%</div>
        </div>
      )}

      {err && <div className="error" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}
