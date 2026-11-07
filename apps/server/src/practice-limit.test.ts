import { describe, expect, test } from "bun:test";
import {
  createRateLimiter,
  DEFAULT_PRACTICE_LIMIT,
  practiceClientKey,
  practiceLimitFromEnv,
} from "./practice-limit";

describe("practice rate limiter", () => {
  test("allows a client up to the limit, then reports when to retry", () => {
    const limiter = createRateLimiter(2, 1000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 10).allowed).toBe(true);
    const denied = limiter.check("a", 20);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(980);
  });

  test("tracks clients separately and refills after the window", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 10).allowed).toBe(true);
    expect(limiter.check("a", 20).allowed).toBe(false);
    expect(limiter.check("a", 1000).allowed).toBe(true);
  });

  test("bounds tracked clients instead of scanning an unbounded map", () => {
    const limiter = createRateLimiter(5, 1000, 2);
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("c", 0)).toMatchObject({ allowed: false, retryAfterMs: 1000 });
    // An existing client is still served at capacity.
    expect(limiter.check("a", 10).allowed).toBe(true);
    // Once the window passes, a new client can take an expired slot.
    expect(limiter.check("c", 1000).allowed).toBe(true);
  });

  test("reads the limit from the environment", () => {
    expect(practiceLimitFromEnv({})).toEqual({
      limit: DEFAULT_PRACTICE_LIMIT,
      windowMs: 60_000,
    });
    expect(practiceLimitFromEnv({ MACHIA_PRACTICE_RATE_LIMIT: "3" })?.limit).toBe(3);
    expect(practiceLimitFromEnv({ MACHIA_PRACTICE_RATE_LIMIT: "0" })).toBeNull();
    expect(() => practiceLimitFromEnv({ MACHIA_PRACTICE_RATE_LIMIT: "-1" })).toThrow(
      /MACHIA_PRACTICE_RATE_LIMIT/,
    );
    expect(() => practiceLimitFromEnv({ MACHIA_PRACTICE_RATE_LIMIT: "2.5" })).toThrow(
      /MACHIA_PRACTICE_RATE_LIMIT/,
    );
  });

  test("prefers the proxy's real client address only when trusted", () => {
    expect(practiceClientKey(new Headers({ "x-real-ip": "203.0.113.7" }), true)).toBe(
      "203.0.113.7",
    );
    expect(
      practiceClientKey(new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" }), true),
    ).toBe("203.0.113.8");
    expect(practiceClientKey(new Headers(), true)).toBe("local");
    expect(practiceClientKey(new Headers({ "x-real-ip": "203.0.113.7" }), false)).toBe("local");
  });
});
