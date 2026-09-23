/** Skeleton shown while a files view streams in. Mirrors the title + list layout. */
export default function Loading() {
  return (
    <div className="paper h-full animate-pulse px-6 pt-6 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="mb-1 h-3 w-20 rounded bg-surface-2" />
      <div className="mb-6 h-8 w-56 rounded bg-surface-2" />
      <div className="space-y-px border-t border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border py-3">
            <div className="h-5 w-5 rounded bg-surface-2" />
            <div className="h-3 rounded bg-surface-2" style={{ width: `${30 + ((i * 13) % 40)}%` }} />
            <div className="ml-auto hidden h-3 w-24 rounded bg-surface-2 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
