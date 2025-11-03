import { useEffect, useRef, useState } from "react";
import type { JobGetResponse } from "./api/client";
import {
  uploadAudio,
  startTranscription,
  getJob,
  getTranscript,
  listTranscripts,
  type TranscriptItem,
  updateTranscript,
  downloadTranscriptUrl,
} from "./api/client";
import Recorder from "./components/Recorder";

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

  // Title (manual save) + Notes (auto-save)
  const [title, setTitle] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // --- Auto-save state for notes ---
  const [notesSaving, setNotesSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNotesRef = useRef<string>(""); // to avoid redundant PATCHes
  const currentNotesRequestId = useRef<number>(0); // cancel outdated saves

  // Load recent transcripts
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
    setNotesSaving("idle"); lastSavedNotesRef.current = "";
    try {
      const rec = await uploadAudio(file);
      setRecordingId(rec.recording_id);
    } catch (e: any) { alert(e?.message || "Upload failed"); }
  }

  async function handleTranscribe() {
    if (!recordingId) { alert("Upload something first."); return; }
    try {
      const job = await startTranscription(recordingId);
      setJobId(job.job_id); setJob(null);
    } catch (e: any) { alert(e?.message || "Failed to start transcription"); }
  }

  // Poll job
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

            // Initialize title/notes for editing
            setTitle(tr.title || "");
            setNotes(tr.notes || "");
            lastSavedNotesRef.current = tr.notes || "";
            setNotesSaving("idle");

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
    // Cancel any pending notes save for the previous transcript
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    currentNotesRequestId.current++;

    try {
      const tr = await getTranscript(tid);
      setTranscriptText(tr.text || "");
      setActiveTranscriptId(tid);
      setJob(null);
      setTitle(tr.title || "");
      setNotes(tr.notes || "");
      lastSavedNotesRef.current = tr.notes || "";
      setNotesSaving("idle");
    } catch (e) { console.error(e); }
  }

  // Manual save for Title (kept as-is)
  async function saveMeta() {
    if (!activeTranscriptId) return;
    try {
      await updateTranscript(activeTranscriptId, { title });
      const data = await listTranscripts();
      setHistory(data.items);
    } catch (e: any) {
      alert(e?.message || "Failed to save");
    }
  }

  // --- Auto-save for Notes on change (debounced) ---
  useEffect(() => {
    if (!activeTranscriptId) return;
    if (notes === lastSavedNotesRef.current) {
      setNotesSaving("idle");
      return;
    }

    // debounce 600ms after last keystroke
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    setNotesSaving("saving");
    const requestId = ++currentNotesRequestId.current;

    notesTimerRef.current = setTimeout(async () => {
      try {
        await updateTranscript(activeTranscriptId, { notes });
        // If a newer request started since we began, ignore this completion
        if (requestId !== currentNotesRequestId.current) return;

        lastSavedNotesRef.current = notes;
        setNotesSaving("saved");
        // refresh history snippet/titles
        try {
          const data = await listTranscripts();
          setHistory(data.items);
        } catch {}
        // fade "saved" back to idle after a moment
        setTimeout(() => { if (notesSaving === "saved") setNotesSaving("idle"); }, 1200);
      } catch (e) {
        if (requestId !== currentNotesRequestId.current) return;
        console.error(e);
        setNotesSaving("error");
      }
    }, 600);

    return () => {
      if (notesTimerRef.current) {
        clearTimeout(notesTimerRef.current);
        notesTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, activeTranscriptId]);

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
          <div className="row" style={{ alignItems: "stretch" }}>
            {/* File upload */}
            <div className="row" style={{ gap: 8 }}>
              <input ref={fileRef} type="file" accept="audio/*" />
              <button className="btn" onClick={handleUpload}>Upload</button>
              <button className="btn primary" onClick={handleTranscribe} disabled={!recordingId}>Start</button>
            </div>

            {/* Mic recorder */}
            <div style={{ marginLeft: "auto" }}>
              <Recorder
                autoStartTranscribe={true}
                onUploaded={(recId, job) => {
                  setRecordingId(recId);
                  if (job) setJobId(job.job_id);
                }}
              />
            </div>
          </div>

          {recordingId && (
            <div className="hint">
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

          {/* Title (manual save) + Download dropdown */}
          {activeTranscriptId && (
            <div className="row" style={{marginBottom: 8, gap: 8, alignItems: "stretch"}}>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Title (optional)"
                style={{flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "#0f1320", color: "var(--text)"}}
              />
              <button className="btn" onClick={saveMeta}>Save</button>

              <div className="dropdown">
                <button className="btn">Download</button>
                <div className="dropdown-menu">
                  <a href={downloadTranscriptUrl(activeTranscriptId, "txt")} download>Download .txt</a>
                  <a href={downloadTranscriptUrl(activeTranscriptId, "srt")} download>Download .srt</a>
                </div>
              </div>
            </div>
          )}

          <textarea
            value={transcriptText}
            onChange={() => {}}
            rows={18}
            className="transcript-box"
            placeholder="Transcript will appear here after the job finishes…"
          />

          {/* Notes (auto-save) */}
          {activeTranscriptId && (
            <div style={{marginTop: 10}}>
              <div className="panel-title" style={{marginBottom: 6}}>
                Notes
                <span className={`autosave ${notesSaving}`}>
                  {notesSaving === "saving" && "Saving…"}
                  {notesSaving === "saved" && "Saved"}
                  {notesSaving === "error" && "Error"}
                </span>
              </div>
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
