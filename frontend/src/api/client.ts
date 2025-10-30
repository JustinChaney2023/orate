// frontend/src/api/client.ts
export const API_BASE = import.meta.env.VITE_API_BASE || window.location.origin;

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
};

export async function uploadAudio(file: File): Promise<RecordingCreateResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/recordings`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function startTranscription(recording_id: string): Promise<JobCreateResponse> {
  const res = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recording_id,
      model: "small",
      device: "cpu",
      srt: true,
    }),
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
