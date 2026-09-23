"use client";

import { useSyncExternalStore } from "react";
import { formatDate } from "@/lib/format";

const subscribe = () => () => {};

/**
 * Renders a timestamp in the viewer's locale/timezone without hydration
 * mismatches: the server (and the hydration pass) print a neutral ISO date,
 * then the client swaps in the localized form.
 */
export function DateText({ iso, className }: { iso: string; className?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <time dateTime={iso} className={className}>
      {mounted ? formatDate(iso) : iso.slice(0, 10)}
    </time>
  );
}

/** Full date + time, same hydration-safe approach. */
export function DateTimeText({ iso, className }: { iso: string; className?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <time dateTime={iso} className={className}>
      {mounted ? new Date(iso).toLocaleString() : iso.replace("T", " ").slice(0, 16)}
    </time>
  );
}
