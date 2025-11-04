export default function ProgressBar({
  value,
  label,
}: {
  value: number | undefined | null; // expects 0..1
  label?: string;
}) {
  const v = Number.isFinite(value as number) ? Math.max(0, Math.min(1, Number(value))) : 0;
  const pct = Math.round(v * 100);

  return (
    <div
      className="pbar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="pbar-fill" style={{ width: `${pct}%` }} />
      <span className="pbar-text">{label ?? `${pct}%`}</span>
    </div>
  );
}
