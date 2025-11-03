type Props = { value?: number }; // value in [0,1]

export default function ProgressBar({ value = 0 }: Props) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      style={{
        height: 10,
        borderRadius: 8,
        background: "#1b2236",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "#7180ff",
          transition: "width 400ms",
        }}
      />
    </div>
  );
}
