// In production (built app served by FastAPI), use same-origin so there's no CORS.
// In dev, use VITE_API_BASE if provided (e.g., http://127.0.0.1:8000).
const isProd = import.meta.env.PROD;
export const API_BASE = isProd ? "" : (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000");

/** ----- Types ----- */
export type RecordingCreateResponse = {
  recording_id: string;
  original_ext: string;
  duration_s: number | null;
};

export type JobCreateResponse = {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
};

export type JobGetResponse = {
  job_id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  stage?: string | null;
  eta_seconds?: number | null;
  result_ref?: string | null; // transcript_id
  error?: string | null;
};

export type TranscriptGetResponse = {
  transcript_id: string;
  recording_id: string;
  text_path: string;
  srt_path?: string | null;
  language?: string | null;
  language_probability?: number | null;
  model: string;
  device: string;
  compute: string;
  duration_s?: number | null;
  created_at: string;
  text?: string | null;
  title?: string | null;
  notes?: string | null;
};

export type RecordingItem = {
  id: string;
  created_at: string;
  duration_s: number;
  original_ext: string;
  original_path: string;
};
export type RecordingListResponse = { items: RecordingItem[] };

export type TranscriptItem = {
  id: string;
  recording_id: string;
  created_at: string;
  language?: string | null;
  model: string;
  text_preview: string;
  title?: string | null;
};
export type TranscriptListResponse = { items: TranscriptItem[] };

export type TranscriptUpdateRequest = {
  title?: string | null;
  notes?: string | null;
};
export type TranscriptUpdateResponse = {
  transcript_id: string;
  title?: string | null;
  notes?: string | null;
};

/** Transcribe options (match backend schema; all optional) */
export type TranscribeOptions = {
  model?: string | null;                 // tiny/base/small/medium/large-v3 or custom path
  device?: "cpu" | "cuda" | string | null;
  compute?: "int8" | "float16" | string | null;
  language?: string | null;
  srt?: boolean | null;

  beam_size?: number | null;
  best_of?: number | null;
  temperature?: number | null;
  prompt?: string | null;
  condition_on_previous_text?: boolean | null;
  vad?: boolean | null;
  word_timestamps?: boolean | null;

  /** UI-only for now; intentionally not sent to backend until integration lands */
  diarize?: boolean | null;
};

/** ----- API calls ----- */
export async function uploadAudio(file: File): Promise<RecordingCreateResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/recordings`, { method: "POST", body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`);
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`Upload: invalid JSON: ${text.slice(0, 200)}`); }
}

/** Start transcription with optional advanced options. If opts omitted, backend defaults apply. */
export async function startTranscription(
  recording_id: string,
  opts?: TranscribeOptions
): Promise<JobCreateResponse> {
  const body: any = { recording_id };
  if (opts) {
    for (const [k, v] of Object.entries(opts)) {
      if (v === undefined) continue;
      if (k === "diarize") continue; // UI-only: do not send to backend yet
      body[k] = v;
    }
  }
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Transcribe start failed: ${res.status}`);
  return res.json();
}

export async function getJob(job_id: string): Promise<JobGetResponse> {
  const res = await fetch(`${API_BASE}/api/jobs/${job_id}`);
  if (!res.ok) throw new Error(`Job fetch failed: ${res.status}`);
  return res.json();
}

export async function getTranscript(transcript_id: string): Promise<TranscriptGetResponse> {
  const res = await fetch(`${API_BASE}/api/transcripts/${transcript_id}?include_text=true`);
  if (!res.ok) throw new Error(`Transcript fetch failed: ${res.status}`);
  return res.json();
}

export async function listRecordings(): Promise<RecordingListResponse> {
  const res = await fetch(`${API_BASE}/api/recordings`);
  if (!res.ok) throw new Error(`Recordings fetch failed: ${res.status}`);
  return res.json();
}

export async function listTranscripts(): Promise<TranscriptListResponse> {
  const res = await fetch(`${API_BASE}/api/transcripts`);
  if (!res.ok) throw new Error(`Transcripts fetch failed: ${res.status}`);
  return res.json();
}

export function downloadTranscriptUrl(transcript_id: string, format: "txt" | "srt"): string {
  return `${API_BASE}/api/transcripts/${transcript_id}/download?format=${format}`;
}

export async function updateTranscript(
  transcript_id: string,
  payload: TranscriptUpdateRequest
): Promise<TranscriptUpdateResponse> {
  const res = await fetch(`${API_BASE}/api/transcripts/${transcript_id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Transcript update failed: ${res.status}`);
  return res.json();
}

/** Optional: delete transcript */
export async function deleteTranscript(transcript_id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/transcripts/${transcript_id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Transcript delete failed: ${res.status}`);
}
