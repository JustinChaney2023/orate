import { useEffect, useRef, useState } from "react";
import type { JobGetResponse, TranscriptItem } from "./api/client";
import {
  uploadAudioWithProgress,
  startTranscription,
  getJob,
  getTranscript,
  listTranscripts,
  updateTranscript,
} from "./api/client";
import DownloadButton from "./components/DownloadButton";
import ProgressBar from "./components/ProgressBar";
import Spinner from "./components/Spinner";

function formatDate(iso?: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function shortId(full: string) {
  return full.replace(/^(rec_|tr_)/, "");
}
function Dots({ active }: { active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => (x + 1) % 4), 500);
    return () => clearInterval(t);
  }, [active]);
  return <span>{active ? ".".repeat(n) : ""}</span>;
}

export default function App() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobGetResponse | null>(null);
  const [transcriptText, setTranscriptText] = useState<string>("");
  const [history, setHistory] = useState<TranscriptItem[]>([]);
  const [activeTranscriptId, setActiveTranscriptId] = useState<string | null>(null);

  // meta
  const [title, setTitle] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // upload UX
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [uploading, setUploading] = useState<boolean>(false);

  // load history
  useEffect(() => {
    (async () => {
      try {
        const data = await listTranscripts();
        setHistory(data.items);
      } catch (e) { console.error(e); }
    })();
  }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert("Pick an audio file first."); return; }
    setTranscriptText(""); setJob(null); setJobId(null); setRecordingId(null);
    setActiveTranscriptId(null); setTitle(""); setNotes("");
    setUploadPct(0); setUploading(true);
    try {
      const rec = await uploadAudioWithProgress(file, (pct) => {
        if (pct >= 0) setUploadPct(pct);
      });
      setRecordingId(rec.recording_id);
    } catch (e: any) {
      alert(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleTranscribe() {
    if (!recordingId) { alert("Upload something first."); return; }
    try {
      const job = await startTranscription(recordingId);
      setJobId(job.job_id); setJob(null);
    } catch (e: any) { alert(e?.message || "Failed to start transcription"); }
  }

  // job polling
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const jid: string = jobId;

    async function poll(id: string) {
      try {
        const j = await getJob(id);
        if (cancelled) return;
        setJob(j);

        if (j.status === "done" && j.result_ref) {
          const tr = await getTranscript(j.result_ref);
          if (!cancelled) {
            setTranscriptText(tr.text || "");
            setActiveTranscriptId(j.result_ref);
            setTitle(tr.title || ""); setNotes(tr.notes || "");
            const data = await listTranscripts();
            if (!cancelled) setHistory(data.items);
          }
          return;
        }
        if (j.status === "error") { alert(`Job error: ${j.error || "unknown"}`); return; }
        setTimeout(() => poll(id), 1200);
      } catch (e) {
        console.error(e);
        setTimeout(() => poll(id), 1800);
      }
    }

    poll(jid);
    return () => { cancelled = true; };
  }, [jobId]);

  async function openTranscript(tid: string) {
    try {
      const tr = await getTranscript(tid);
      setTranscriptText(tr.text || "");
      setActiveTranscriptId(tid);
      setJob(null);
      setTitle(tr.title || ""); setNotes(tr.notes || "");
    } catch (e) { console.error(e); }
  }

  async function saveMeta() {
    if (!activeTranscriptId) return;
    try {
      await updateTranscript(activeTranscriptId, { title, notes });
      const data = await listTranscripts();
      setHistory(data.items);
    } catch (e: any) {
      alert(e?.message || "Failed to save");
    }
  }

  function renderEta() {
    if (!job?.eta_seconds || job.eta_seconds <= 0) return "-";
    const s = job.eta_seconds;
    if (s <= 30) return `${Math.ceil(s)}s`;
    return `${Math.ceil(s / 60)} min`;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Orate</div>
        <div className="sidebar-section">
          <div className="sidebar-title">Recent transcriptions</div>
          <div className="list">
            {history.length === 0 && <div className="empty">No transcripts yet</div>}
            {history.map(item => (
              <button
                key={item.id}
                onClick={() => openTranscript(item.id)}
                className={`list-item ${activeTranscriptId === item.id ? "active" : ""}`}
                title={item.text_preview}
              >
                <div className="item-title">
                  {item.title || item.text_preview || "(no text)"}
                </div>
                <div className="item-meta">
                  {formatDate(item.created_at)} • {item.model}{item.language ? ` • ${item.language}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">Transcribe</div>
        </header>

        <section className="panel">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <input ref={fileRef} type="file" accept="audio/*" />
            <button className="btn" onClick={handleUpload} disabled={uploading}>
              {uploading ? <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                <Spinner /> Uploading…
              </span> : "Upload"}
            </button>
            <button className="btn primary" onClick={handleTranscribe} disabled={!recordingId || uploading}>
              Start
            </button>
          </div>

          {/* Upload progress */}
          {uploading && (
            <div style={{ marginTop: 10 }}>
              <ProgressBar value={uploadPct} label={`Uploading ${uploadPct}%`} />
            </div>
          )}

          {recordingId && !uploading && (
            <div className="hint" style={{ marginTop: 8 }}>
              ID: <code>{shortId(recordingId)}</code>
            </div>
          )}

          {job && (
            <div className="job" style={{marginTop: 8}}>
              <div>status: <b>{job.status}</b> <Dots active={job.status === "running"} /></div>
              <div>stage: {job.stage || "-"}</div>
              <div>progress: {(job.progress * 100).toFixed(1)}%</div>
              <div>ETA: {renderEta()}</div>
              {job.result_ref && <div>transcript_id: <code>{shortId(job.result_ref)}</code></div>}
              {job.error && <div className="error">error: {job.error}</div>}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-title">Transcript</div>

          {activeTranscriptId && (
            <div className="row" style={{marginBottom: 8, gap: 8, alignItems: "stretch"}}>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (optional)"
                style={{flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#0f1320", color: "var(--text)"}}
              />
              <button className="btn" onClick={saveMeta}>Save</button>
              <DownloadButton transcriptId={activeTranscriptId} title={title} />
            </div>
          )}

          <textarea
            value={transcriptText}
            onChange={() => {}}
            rows={18}
            className="transcript-box"
            placeholder="Transcript will appear here after the job finishes…"
          />

          {activeTranscriptId && (
            <div style={{marginTop: 10}}>
              <div className="panel-title" style={{marginBottom: 6}}>Notes</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="transcript-box"
                placeholder="Add notes about this transcript…"
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
