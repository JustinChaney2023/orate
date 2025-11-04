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
  deleteTranscript,
} from "./api/client";
import Recorder from "./components/Recorder";
import ProgressBar from "./components/ProgressBar";

function formatDate(iso?: string) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
function shortId(full: string) { return full.replace(/^(rec_|tr_)/, ""); }

function Dots({ active }: { active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => (x + 1) % 4), 500);
    return () => clearInterval(t);
  }, [active]);
  return <span>{active ? ".".repeat(n) : ""}</span>;
}

type TabKey = "transcribe" | "translate";

export default function App() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pickedName, setPickedName] = useState<string>("No file chosen");

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
    diarize: null, // UI-only (kept visible)
  });

  // Tabs
  const [tab, setTab] = useState<TabKey>("transcribe");

  // Context menu for history (right-click)
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTid, setMenuTid] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!menuOpen) return;
      const el = menuRef.current;
      if (el && !el.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

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
      const maybeOpts = advancedOpen ? opts : undefined;
      const job = await startTranscription(recordingId, maybeOpts);
      setJobId(job.job_id); setJob(null);
    } catch (e: any) { alert(e?.message || "Failed to start transcription"); }
  }

  // Poll job
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const jid = jobId;

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

  function renderEta() {
    if (!job?.eta_seconds || job.eta_seconds <= 0) return "-";
    const s = job.eta_seconds;
    if (s <= 30) return `${Math.ceil(s)}s`;
    return `${Math.ceil(s / 60)} min`;
  }

  // Advanced UI helpers
  function setOpt<K extends keyof TranscribeOptions>(k: K, v: TranscribeOptions[K]) {
    setOpts(prev => ({ ...prev, [k]: v }));
  }
  function numOrNull(v: string) {
    if (!v.trim()) return null;
    const n = Number(v);
    return Number.isFinite(n) ? (n as number) : null;
  }

  // Right-click handler for history items
  function onHistoryContext(e: React.MouseEvent, tid: string) {
    e.preventDefault();
    setMenuTid(tid);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }

  async function doDelete(tid: string) {
    try {
      await deleteTranscript(tid);
      if (activeTranscriptId === tid) {
        setActiveTranscriptId(null);
        setTranscriptText("");
        setTitle("");
        setNotes("");
        setJob(null);
      }
      const data = await listTranscripts();
      setHistory(data.items);
    } catch (e: any) {
      alert(e?.message || "Delete failed");
    }
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
              <div
                key={item.id}
                className={`list-item ${activeTranscriptId === item.id ? "active" : ""}`}
                onContextMenu={(e) => onHistoryContext(e, item.id)}
              >
                <button
                  onClick={() => openTranscript(item.id)}
                  className="list-item-btn"
                  title={item.text_preview}
                >
                  <div className="item-title">
                    {item.title || item.text_preview || "(no text)"}
                  </div>
                  <div className="item-meta">
                    {formatDate(item.created_at)} • {item.model}{item.language ? ` • ${item.language}` : ""}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="tabs">
            <button className={`tab ${tab === "transcribe" ? "active" : ""}`} onClick={() => setTab("transcribe")}>
              Transcribe
            </button>
            <button className={`tab ${tab === "translate" ? "active" : ""}`} onClick={() => setTab("translate")}>
              Translate
            </button>
          </div>
        </header>

        {tab === "translate" && (
          <section className="panel">
            <div className="panel-title">Translate</div>
            <p style={{ color: "var(--muted)" }}>Coming soon.</p>
          </section>
        )}

        {tab === "transcribe" && (
          <>
            <section className="panel">
              <div className="row" style={{ alignItems: "stretch", gap: 12, justifyContent: "space-between" }}>
                {/* File picker (shows name immediately) */}
                <div className="filepicker">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: "none" }}
                    id="file-input"
                    onChange={(e) => {
                      const name = e.currentTarget.files?.[0]?.name || "No file chosen";
                      setPickedName(name);
                    }}
                  />
                  <label htmlFor="file-input" className="btn ghost">Choose file</label>
                  <span className="filename">{pickedName}</span>
                  <button className="btn" onClick={handleUpload} style={{ marginLeft: 8 }}>Upload</button>
                </div>

                {/* Start */}
                <button className="btn primary" onClick={handleTranscribe} disabled={!recordingId}>Start</button>

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

                    <div className="field">
                      <label>Diarization (UI only)</label>
                      <select
                        value={opts.diarize == null ? "null" : String(!!opts.diarize)}
                        onChange={e => {
                          const v = e.target.value;
                          setOpt("diarize", v === "null" ? null : v === "true");
                        }}
                      >
                        <option value="null">(default)</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </div>

                    <div className="field" style={{ gridColumn: "1 / -1" }}>
                      <label>Prompt</label>
                      <input
                        placeholder="Optional initial prompt"
                        value={opts.prompt ?? ""}
                        onChange={e => setOpt("prompt", e.target.value || null)}
                      />
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
                <div className="job" style={{marginTop: 8, width: "100%"}}>
                  <div>status: <b>{job.status}</b> <Dots active={job.status === "running"} /></div>
                  <div>stage: {job.stage || "-"}</div>
                  {/* visual progress bar */}
                  <div style={{ marginTop: 6, marginBottom: 2 }}>
                    <ProgressBar value={job.progress} />
                  </div>
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
          </>
        )}

        {/* Context menu (right-click) */}
        {menuOpen && menuTid && (
          <div
            ref={menuRef}
            className="context-menu"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button className="menu-item" onClick={() => { openTranscript(menuTid); setMenuOpen(false); }}>
              Open
            </button>
            <button
              className="menu-item danger"
              onClick={() => { doDelete(menuTid); setMenuOpen(false); }}
            >
              Delete
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
