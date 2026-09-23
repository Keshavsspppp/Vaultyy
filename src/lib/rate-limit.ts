import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/errors";

/**
 * In-process fixed-window rate limiter.
 *
 * Deliberately dependency-free: the app runs as a single instance (SQLite is
 * single-writer), so an in-memory counter is the right scope. Behind several
 * instances this would need a shared store such as Redis — see README.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Drops expired buckets occasionally so the map cannot grow without bound. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}

export type Limit = { limit: number; windowMs: number };

/** Named limits, tuned per route family. */
export const LIMITS = {
  /** Sign-in / sign-up: slow down credential stuffing. */
  auth: { limit: 10, windowMs: 60_000 },
  /** AI routes cost money per call. */
  ai: { limit: 20, windowMs: 60_000 },
  /** Upload negotiation (cheap, but keep bulk abuse bounded). */
  upload: { limit: 120, windowMs: 60_000 },
  /** Everything else that mutates state. */
  write: { limit: 240, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

/** Best-effort client address: the proxy header the host sets, else a constant. */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "local";
}

/**
 * Consumes one token for `bucket` + caller identity. Throws 429 when exhausted.
 * Signed-in users are limited per account, anonymous callers per IP.
 */
export async function rateLimit(name: keyof typeof LIMITS, identifier?: string): Promise<void> {
  const { limit, windowMs } = LIMITS[name];
  const who = identifier ?? (await callerIdentity());
  const key = `${name}:${who}`;
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    throw new HttpError(429, `Too many requests. Try again in ${retryAfter}s.`);
  }
}

async function callerIdentity(): Promise<string> {
  const session = await auth().catch(() => null);
  return session?.user?.id ? `u:${session.user.id}` : `ip:${await clientKey()}`;
}

/** Test seam: clears all counters. */
export function resetRateLimits() {
  buckets.clear();
}
