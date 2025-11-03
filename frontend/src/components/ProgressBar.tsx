type Props = {
  value: number; // 0–100
  label?: string;
};

export default function ProgressBar({ value, label }: Props) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div style={{ width: "100%", gap: 8, display: "grid" }}>
      {label && <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>}
      <div style={{ background: "#1a2236", borderRadius: 10, height: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #4f8cff, #72f1b8)",
            transition: "width 160ms linear",
          }}
        />
      </div>
    </div>
  );
}
