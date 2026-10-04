export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect x="2" y="3" width="31" height="31" rx="9" fill="var(--edge)" />
      <rect x="2" y="1.5" width="31" height="30" rx="9" fill="var(--pen)" stroke="var(--edge)" strokeWidth="2" />
      <path d="M9.5 9.5l7 7M16.5 9.5l-7 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="23" r="4.2" fill="none" stroke="var(--sun)" strokeWidth="3" />
      <circle cx="26.5" cy="10" r="2.2" fill="var(--coral)" />
      <circle cx="10" cy="24.5" r="2.2" fill="var(--lime)" />
    </svg>
  );
}
