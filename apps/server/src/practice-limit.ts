/**
 * A small per-client limit for the two public practice endpoints. Bots are
 * untrusted and a match is CPU-bound, so one client must not be able to keep
 * the practice runner busy (or queue a pile of demos) for everyone.
 *
 * In memory on purpose: the API is one process, and the limit is a speed
 * bump, not an accounting record. Contest matches don't go through here.
 */
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitDecision;
  reset(): void;
}

/** Enough for a self-hosted deployment; a full map rejects new clients. */
export const DEFAULT_MAX_TRACKED_CLIENTS = 10_000;

export function createRateLimiter(
  limit: number,
  windowMs: number,
  maxClients = DEFAULT_MAX_TRACKED_CLIENTS,
): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (!hits.has(key) && hits.size >= maxClients) {
          // Only pay for a scan when the map is full, then refuse a new key
          // rather than evicting a client that is still within its window.
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
          if (hits.size >= maxClients) {
            return { allowed: false, retryAfterMs: windowMs };
          }
        }
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (entry.count < limit) {
        entry.count += 1;
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    },
    reset() {
      hits.clear();
    },
  };
}

export interface PracticeLimit {
  limit: number;
  windowMs: number;
}

export const DEFAULT_PRACTICE_LIMIT = 20;

/** `MACHIA_PRACTICE_RATE_LIMIT=0` turns the limit off; the default is 20/minute. */
export function practiceLimitFromEnv(env: NodeJS.ProcessEnv = process.env): PracticeLimit | null {
  const raw = env.MACHIA_PRACTICE_RATE_LIMIT?.trim();
  if (raw === "0") return null;
  const limit = raw ? Number(raw) : DEFAULT_PRACTICE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`MACHIA_PRACTICE_RATE_LIMIT must be a positive whole number or 0, not "${raw}"`);
  }
  return { limit, windowMs: 60_000 };
}

/**
 * Behind nginx, X-Real-IP is set by the proxy; X-Forwarded-For is the fallback.
 * Trusting those headers is opt-in (`MACHIA_TRUST_PROXY=1`): on a directly
 * reachable API a caller could otherwise rotate them to bypass the limit.
 */
export function practiceClientKey(
  headers: Headers,
  trustProxy = process.env.MACHIA_TRUST_PROXY === "1",
): string {
  if (!trustProxy) return "local";
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}
