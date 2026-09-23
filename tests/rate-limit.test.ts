import { beforeEach, describe, expect, it, vi } from "vitest";

// The limiter falls back to session/IP lookup only when no identifier is passed;
// these tests always pass one, so the auth module is stubbed to keep them isolated.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { LIMITS, rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { HttpError } from "@/lib/errors";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  it("allows requests up to the limit, then throws 429", async () => {
    const { limit } = LIMITS.ai;
    for (let i = 0; i < limit; i++) await expect(rateLimit("ai", "user-a")).resolves.toBeUndefined();

    await expect(rateLimit("ai", "user-a")).rejects.toBeInstanceOf(HttpError);
    await expect(rateLimit("ai", "user-a")).rejects.toMatchObject({ status: 429 });
  });

  it("keeps separate counters per identity and per bucket", async () => {
    for (let i = 0; i < LIMITS.ai.limit; i++) await rateLimit("ai", "user-a");

    // A different user is unaffected...
    await expect(rateLimit("ai", "user-b")).resolves.toBeUndefined();
    // ...and so is a different bucket for the same user.
    await expect(rateLimit("write", "user-a")).resolves.toBeUndefined();
  });

  it("refills after the window elapses", async () => {
    vi.useFakeTimers();
    for (let i = 0; i < LIMITS.auth.limit; i++) await rateLimit("auth", "ip-1");
    await expect(rateLimit("auth", "ip-1")).rejects.toMatchObject({ status: 429 });

    vi.advanceTimersByTime(LIMITS.auth.windowMs + 1);
    await expect(rateLimit("auth", "ip-1")).resolves.toBeUndefined();
  });

  it("reports how long to wait", async () => {
    for (let i = 0; i < LIMITS.upload.limit; i++) await rateLimit("upload", "user-c");
    await expect(rateLimit("upload", "user-c")).rejects.toThrow(/Try again in \d+s/);
  });
});
