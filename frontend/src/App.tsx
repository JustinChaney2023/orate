import { useEffect, useRef, useState } from "react";
import type { JobGetResponse, TranscribeOptions } from "./api/client";
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

  // Auto-save status for notes
  const [notesSaving, setNotesSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNotesRef = useRef<string>("");
  const currentNotesRequestId = useRef<number>(0);

  // Advanced panel
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [opts, setOpts] = useState<TranscribeOptions>({
    // sensible defaults; Start will still work even if you close Advanced
    model: "small",
    device: "cpu",
    compute: "int8",
    language: null,
    srt: true,

    beam_size: null,
    best_of: null,
    temperature: null,
    prompt: null,
    condition_on_previous_text: null,
    vad: null,
    word_timestamps: null,
  });

  // NEW: remember which job we've already notified for
  const notifiedJobRef = useRef<string | null>(null);

  // Load recent transcripts
  useEffect(() => {
    (async () => {
      try {
        const data = await listTranscripts();
        setHistory(data.items);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // NEW: ask for Notification permission once (best-effort, non-blocking)
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      setTimeout(() => {
        try { Notification.requestPermission(); } catch {}
      }, 300);
    }
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
      // If Advanced is open, pass options; otherwise let backend use defaults
      const maybeOpts = advancedOpen ? opts : undefined;
      const job = await startTranscription(recordingId, maybeOpts);
      setJobId(job.job_id); setJob(null);

      // NEW: reset notification guard for this job
      notifiedJobRef.current = null;
    } catch (e: any) { alert(e?.message || "Failed to start transcription"); }
  }

  // Poll job
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const jid: string = jobId;

    // NEW: small helpers for notifications
    function notifyDone(transcriptId: string) {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      const n = new Notification("Orate — Transcription complete", { body: "Click to open the transcript." });
      n.onclick = () => {
        window.focus();
        openTranscript(transcriptId);
        try { n.close(); } catch {}
      };
    }
    function notifyError(msg?: string) {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      const n = new Notification("Orate — Transcription failed", { body: msg || "Unknown error." });
      n.onclick = () => {
        window.focus();
        try { n.close(); } catch {}
      };
    }

    async function poll(id: string) {
      try {
        const j = await getJob(id);
        if (cancelled) return;
        setJob(j);

        // NEW: fire desktop notification exactly once per job when terminal
        if ((j.status === "done" || j.status === "error") && notifiedJobRef.current !== id) {
          notifiedJobRef.current = id;
          if (j.status === "done" && j.result_ref) notifyDone(j.result_ref);
          else if (j.status === "error") notifyError(j.error || undefined);
        }

        if (j.status === "done" && j.result_ref) {
          const tr = await getTranscript(j.result_ref);
          if (!cancelled) {
            setTranscriptText(tr.text || "");
            setActiveTranscriptId(j.result_ref);

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

  // Manual save for Title
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

  // Auto-save Notes (debounced)
  useEffect(() => {
    if (!activeTranscriptId) return;
    if (notes === lastSavedNotesRef.current) {
      setNotesSaving("idle");
      return;
    }

    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    setNotesSaving("saving");
    const requestId = ++currentNotesRequestId.current;

    notesTimerRef.current = setTimeout(async () => {
      try {
        await updateTranscript(activeTranscriptId, { notes });
        if (requestId !== currentNotesRequestId.current) return;

        lastSavedNotesRef.current = notes;
        setNotesSaving("saved");
        try {
          const data = await listTranscripts();
          setHistory(data.items);
        } catch {}
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

  // NEW: auto-refresh history periodically (fast while running, slow when idle)
  useEffect(() => {
    let cancelled = false;
    let interval: any;

    async function refreshNow() {
      try {
        const data = await listTranscripts();
        if (!cancelled) setHistory(data.items);
      } catch {
        // ignore best-effort failures
      }
    }

    const running = job?.status === "running";
    refreshNow(); // refresh immediately when this effect runs
    interval = setInterval(refreshNow, running ? 5000 : 20000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [job?.status]);

  function renderEta() {
    if (!job?.eta_seconds || job.eta_seconds <= 0) return "-";
    const s = job.eta_seconds;
    if (s <= 30) return `${Math.ceil(s)}s`;
    return `${Math.ceil(s / 60)} min`;
  }

  // Advanced UI helper
  function setOpt<K extends keyof TranscribeOptions>(k: K, v: TranscribeOptions[K]) {
    setOpts(prev => ({ ...prev, [k]: v }));
  }
  function numOrNull(v: string) {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? (n as number) : null;
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

          {/* Advanced toggle + panel */}
          <div className="advanced">
            <button className="btn" onClick={() => setAdvancedOpen(v => !v)}>
              {advancedOpen ? "Hide Advanced" : "Show Advanced"}
            </button>
            {advancedOpen && (
              <div className="advanced-grid">
                <div className="field">
                  <label>Model</label>
                  <select value={opts.model || ""} onChange={e => setOpt("model", e.target.value || null)}>
                    <option value="tiny">tiny</option>
                    <option value="base">base</option>
                    <option value="small">small</option>
                    <option value="medium">medium</option>
                    <option value="large-v3">large-v3</option>
                  </select>
                </div>

                <div className="field">
                  <label>Device</label>
                  <select value={opts.device || ""} onChange={e => setOpt("device", (e.target.value || "cpu") as any)}>
                    <option value="cpu">cpu</option>
                    <option value="cuda">cuda</option>
                  </select>
                </div>

                <div className="field">
                  <label>Compute</label>
                  <select value={opts.compute || ""} onChange={e => setOpt("compute", (e.target.value || "int8") as any)}>
                    <option value="int8">int8</option>
                    <option value="float16">float16</option>
                  </select>
                </div>

                <div className="field">
                  <label>Language (ISO-639-1 or blank)</label>
                  <input
                    placeholder="e.g. en"
                    value={opts.language ?? ""}
                    onChange={e => setOpt("language", e.target.value.trim() || null)}
                  />
                </div>

                <div className="field">
                  <label>Write SRT</label>
                  <select value={String(!!opts.srt)} onChange={e => setOpt("srt", e.target.value === "true")}>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>

                <div className="field">
                  <label>Word timestamps</label>
                  <select
                    value={opts.word_timestamps == null ? "null" : String(!!opts.word_timestamps)}
                    onChange={e => {
                      const v = e.target.value;
                      setOpt("word_timestamps", v === "null" ? null : v === "true");
                    }}
                  >
                    <option value="null">(default)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>

                <div className="field">
                  <label>VAD</label>
                  <select
                    value={opts.vad == null ? "null" : String(!!opts.vad)}
                    onChange={e => {
                      const v = e.target.value;
                      setOpt("vad", v === "null" ? null : v === "true");
                    }}
                  >
                    <option value="null">(default)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>

                <div className="field">
                  <label>Beam size</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="(default)"
                    value={opts.beam_size ?? ""}
                    onChange={e => setOpt("beam_size", numOrNull(e.target.value))}
                  />
                </div>

                <div className="field">
                  <label>Best of</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="(default)"
                    value={opts.best_of ?? ""}
                    onChange={e => setOpt("best_of", numOrNull(e.target.value))}
                  />
                </div>

                <div className="field">
                  <label>Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="(default)"
                    value={opts.temperature ?? ""}
                    onChange={e => setOpt("temperature", numOrNull(e.target.value))}
                  />
                </div>

                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Prompt</label>
                  <input
                    placeholder="Optional initial prompt"
                    value={opts.prompt ?? ""}
                    onChange={e => setOpt("prompt", e.target.value || null)}
                  />
                </div>

                <div className="field">
                  <label>Condition on previous text</label>
                  <select
                    value={opts.condition_on_previous_text == null ? "null" : String(!!opts.condition_on_previous_text)}
                    onChange={e => {
                      const v = e.target.value;
                      setOpt("condition_on_previous_text", v === "null" ? null : v === "true");
                    }}
                  >
                    <option value="null">(default)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </div>
              </div>
            )}
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
