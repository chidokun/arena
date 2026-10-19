export function Spinner({ label = "Đang kết nối…", className = "" }: { label?: string | null; className?: string }) {
  return label == null ? (
    <span className={`spinner ${className}`} aria-hidden="true" />
  ) : (
    <span className={`spinner ${className}`} role="status" aria-label={label} />
  );
}
