// Mỗi mảnh có class riêng để màn mở đầu (Splash.tsx) ráp từng mảnh và logo đầu trang nhún khi rê chuột (.logo-home).
// `lm-top` gom mặt logo với các nét vẽ để nhấc / ấn cả khối khỏi tấm đế. pathLength=1 cho hiệu ứng vẽ nét.
export function LogoMark({ className = "h-9 w-9", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 36 36" className={`logo-mark ${className}`} style={style} aria-hidden="true">
      <rect className="lm-base" x="2" y="3" width="31" height="31" rx="9" fill="var(--edge)" />
      <g className="lm-top">
        <rect className="lm-face" x="2" y="1.5" width="31" height="30" rx="9" fill="var(--pen)" stroke="var(--edge)" strokeWidth="2" />
        <g className="lm-x" stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <path d="M9.5 9.5l7 7" pathLength={1} />
          <path d="M16.5 9.5l-7 7" pathLength={1} />
        </g>
        <circle className="lm-ring" cx="24" cy="23" r="4.2" fill="none" stroke="var(--sun)" strokeWidth="3" pathLength={1} />
        <circle className="lm-dot lm-coral" cx="26.5" cy="10" r="2.2" fill="var(--coral)" />
        <circle className="lm-dot lm-lime" cx="10" cy="24.5" r="2.2" fill="var(--lime)" />
      </g>
    </svg>
  );
}
