import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows requests up to the limit within the window", () => {
    const limiter = createRateLimiter(3, 60_000, () => 1_000);
    expect(limiter("a").allowed).toBe(true);
    expect(limiter("a").allowed).toBe(true);
    expect(limiter("a").allowed).toBe(true);
    expect(limiter("a").allowed).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter(1, 60_000, () => 1_000);
    expect(limiter("a").allowed).toBe(true);
    expect(limiter("b").allowed).toBe(true);
    expect(limiter("a").allowed).toBe(false);
  });

  it("resets after the window elapses", () => {
    let now = 1_000;
    const limiter = createRateLimiter(1, 60_000, () => now);
    expect(limiter("a").allowed).toBe(true);
    expect(limiter("a").allowed).toBe(false);

    now = 1_000 + 60_001;
    expect(limiter("a").allowed).toBe(true);
  });

  it("reports a sane retry-after when blocked", () => {
    let now = 1_000;
    const limiter = createRateLimiter(1, 60_000, () => now);
    limiter("a");
    const result = limiter("a");
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 60 });

    now = 1_000 + 30_000;
    const later = limiter("a");
    expect(later).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });
});
