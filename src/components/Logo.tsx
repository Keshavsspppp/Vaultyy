/** Vaultly mark: a vault dial — a ring with a notch and a centre pin. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <circle cx="16" cy="16" r="13.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="6" stroke="currentColor" strokeWidth="2" />
      <path d="M16 2.5v5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** Wordmark in the display serif, optionally with the mark. */
export function Wordmark({ withMark = true, className = "" }: { withMark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {withMark && <Logo className="h-7 w-7 text-primary" />}
      <span className="font-display text-[22px] font-medium leading-none tracking-tight">Vaultly</span>
    </span>
  );
}
