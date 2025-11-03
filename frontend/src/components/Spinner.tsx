export default function Spinner() {
  return (
    <div
      aria-label="Loading"
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "2px solid #2a3552",
        borderTopColor: "#72f1b8",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
