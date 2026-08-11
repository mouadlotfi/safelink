export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now
): (key: string) => RateLimitResult {
  const hits = new Map<string, number[]>();

  return (key: string): RateLimitResult => {
    const timestamp = now();
    const recent = (hits.get(key) ?? []).filter((t) => timestamp - t < windowMs);

    if (recent.length >= limit) {
      hits.set(key, recent);
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (timestamp - recent[0])) / 1000)
      );
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(timestamp);
    hits.set(key, recent);

    if (hits.size > 5000) {
      for (const [candidate, times] of hits) {
        if (times.every((t) => timestamp - t >= windowMs)) {
          hits.delete(candidate);
        }
      }
    }

    return { allowed: true };
  };
}
