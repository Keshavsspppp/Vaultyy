"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

/** Route-level error boundary: keeps the Vaultly shell instead of a raw stack trace. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="paper flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        The page could not be loaded. Trying again often helps; if it keeps happening, the issue is on our side.
      </p>
      {error.digest && <p className="font-mono text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-primary"
        >
          <RotateCcw size={14} /> Try again
        </button>
        <Link href="/files" className="text-sm font-medium underline underline-offset-4">
          Back to files
        </Link>
      </div>
    </div>
  );
}
