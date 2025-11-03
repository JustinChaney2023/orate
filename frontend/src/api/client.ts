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

/** Upload with progress (0–100). Falls back to plain upload if XHR fails. */
export function uploadAudioWithProgress(
  file: File,
  onProgress: (pct: number) => void
): Promise<RecordingCreateResponse> {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/recordings`);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error(`Upload: invalid JSON: ${xhr.responseText?.slice(0,200)}`)); }
        } else {
          reject(new Error(`Upload failed (${xhr.status}): ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Upload network error"));
      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) { onProgress(-1); return; }
        const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        onProgress(pct);
      };
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    } catch (e) {
      // Fallback
      uploadAudio(file).then(resolve).catch(reject);
    }
  });
}

export async function startTranscription(recording_id: string): Promise<JobCreateResponse> {
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recording_id, model: "small", device: "cpu", srt: true }),
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
