/** Vòng quay chờ (vd. số liệu khi chưa nối được mạng P2P). `label={null}` khi chữ bên cạnh đã nói rõ trạng thái. */
export function Spinner({ label = "Đang kết nối…", className = "" }: { label?: string | null; className?: string }) {
  return label == null ? (
    <span className={`spinner ${className}`} aria-hidden="true" />
  ) : (
    <span className={`spinner ${className}`} role="status" aria-label={label} />
  );
}
