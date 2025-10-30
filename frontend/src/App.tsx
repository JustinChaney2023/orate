// frontend/src/App.tsx
import { useEffect, useRef, useState } from "react";
import type { JobGetResponse } from "./api/client";
import {
  uploadAudio,
  startTranscription,
  getJob,
  getTranscript,
} from "./api/client";

export default function App() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobGetResponse | null>(null);
  const [transcriptText, setTranscriptText] = useState<string>("");

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      alert("Pick an audio file first.");
      return;
    }
    setTranscriptText("");
    setJob(null);
    setJobId(null);
    setRecordingId(null);

    try {
      const rec = await uploadAudio(file);
      setRecordingId(rec.recording_id);
      alert(`Uploaded. recording_id = ${rec.recording_id}`);
    } catch (e: any) {
      alert(e?.message || "Upload failed");
    }
  }

  async function handleTranscribe() {
    if (!recordingId) {
      alert("Upload something first.");
      return;
    }
    try {
      const job = await startTranscription(recordingId!);
      setJobId(job.job_id);
      setJob(null);
    } catch (e: any) {
      alert(e?.message || "Failed to start transcription");
    }
  }

  // poll job if we have one
useEffect(() => {
  if (!jobId) return;           // runtime guard
  let cancelled = false;
  const jid: string = jobId;     // <= non-null local copy

  async function poll(id: string) {
    try {
      const j = await getJob(id);   // id is always string here
      if (cancelled) return;
      setJob(j);

      if (j.status === "done" && j.result_ref) {
        const tr = await getTranscript(j.result_ref);
        if (!cancelled) setTranscriptText(tr.text || "");
        return; // stop polling
      }
      if (j.status === "error") {
        alert(`Job error: ${j.error || "unknown"}`);
        return;
      }
      setTimeout(() => poll(id), 1500);
    } catch (e) {
      console.error(e);
      setTimeout(() => poll(id), 2000);
    }
  }

  poll(jid);
  return () => { cancelled = true; };
}, [jobId]);


  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>Orate</h1>

      <section style={{ marginBottom: 24 }}>
        <h2>1) Upload audio</h2>
        <input ref={fileRef} type="file" accept="audio/*" />
        <button onClick={handleUpload} style={{ marginLeft: 12 }}>Upload</button>
        {recordingId && <div style={{ marginTop: 6 }}>recording_id: <code>{recordingId}</code></div>}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2>2) Transcribe</h2>
        <button onClick={handleTranscribe} disabled={!recordingId}>Start transcription</button>
        {jobId && (
          <div style={{ marginTop: 8 }}>
            job_id: <code>{jobId}</code>
          </div>
        )}
        {job && (
          <div style={{ marginTop: 8 }}>
            <div>status: <b>{job.status}</b></div>
            <div>stage: {job.stage || "-"}</div>
            <div>progress: {(job.progress * 100).toFixed(1)}%</div>
            <div>ETA: {job.eta_seconds != null ? `${job.eta_seconds.toFixed(1)}s` : "-"}</div>
            {job.result_ref && <div>transcript_id: <code>{job.result_ref}</code></div>}
            {job.error && <div style={{ color: "crimson" }}>error: {job.error}</div>}
          </div>
        )}
      </section>

      <section>
        <h2>3) Transcript</h2>
        <textarea
          value={transcriptText}
          onChange={() => {}}
          rows={16}
          style={{ width: "100%", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}
          placeholder="Transcript will appear here after the job finishes…"
        />
      </section>
    </div>
  );
}
