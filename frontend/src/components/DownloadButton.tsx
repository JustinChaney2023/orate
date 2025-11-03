import { useState, useRef, useEffect } from "react";
import { downloadTranscriptUrl } from "../api/client";

type Props = {
  transcriptId: string;
  title?: string | null;
};

export default function DownloadButton({ transcriptId, title }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, []);

  const baseName = (title ?? "").trim() || transcriptId;

  function download(format: "txt" | "srt") {
    const a = document.createElement("a");
    a.href = downloadTranscriptUrl(transcriptId, format);
    a.download = `${baseName}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setOpen(false);
  }

  return (
    <div className="dropdown" ref={ref} style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOpen(v => !v)}>
        Download ▾
      </button>
      {open && (
        <div className="menu" style={{
          position: "absolute",
          top: "100%",
          right: 0,
          background: "#0f1320",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 6,
          zIndex: 10,
          minWidth: 140
        }}>
          <button className="menu-item" onClick={() => download("txt")} style={{ display: "block", width: "100%" }}>
            .txt (plain text)
          </button>
          <button className="menu-item" onClick={() => download("srt")} style={{ display: "block", width: "100%" }}>
            .srt (subtitles)
          </button>
          <div style={{ fontSize: 12, opacity: 0.7, paddingTop: 6 }}>
            SRT files contain timestamped captions for video players.
          </div>
        </div>
      )}
    </div>
  );
}
