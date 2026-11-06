import { describe, expect, test } from "bun:test";
import { authSecret, corsOrigins } from "./auth";
import { app, serverListenConfig } from "./index";

describe("API", () => {
  test("GET /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; running: boolean; sandbox: string };
    expect(body.ok).toBe(true);
    expect(typeof body.running).toBe("boolean");
    expect(body.sandbox).toBe("off");
  });

  test("GET /api/games includes all registered games", async () => {
    const res = await app.request("/api/games");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { games: Array<{ id: string }> };
    const ids = body.games.map((g) => g.id).sort();
    expect(ids).toEqual([
      "arena",
      "bomber",
      "holdem",
      "quoridor",
      "sokoban",
      "tanks",
    ]);
  });

  test("GET /api/bots?game=bomber returns bomber bots", async () => {
    const res = await app.request("/api/bots?game=bomber");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bots: Array<{ id: string; games: string[] }>;
    };
    expect(body.bots.length).toBeGreaterThan(0);
    expect(body.bots.every((b) => b.games.includes("bomber"))).toBe(true);
    expect(body.bots.some((b) => b.id.startsWith("bomber-"))).toBe(true);
  });

  test("GET /api/bots?game=arena excludes bomber-only bots", async () => {
    const res = await app.request("/api/bots?game=arena");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bots: Array<{ id: string }> };
    expect(body.bots.every((b) => !b.id.startsWith("bomber-"))).toBe(true);
  });

  test("GET /api/matches returns a paged replay list", async () => {
    const res = await app.request("/api/matches?limit=10&offset=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matches: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
    expect(Array.isArray(body.matches)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(body.matches.length);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  test("GET /api/matches rejects unknown games and bad paging", async () => {
    expect((await app.request("/api/matches?game=chess")).status).toBe(400);
    expect((await app.request("/api/matches?limit=0")).status).toBe(400);
    expect((await app.request("/api/matches?limit=101")).status).toBe(400);
    expect((await app.request("/api/matches?offset=-1")).status).toBe(400);
  });

  test("POST /api/matches rejects empty bot list", async () => {
    const res = await app.request("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: "bomber", botIds: [] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("POST /api/matches rejects unknown game", async () => {
    const res = await app.request("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: "chess", botIds: ["a", "b"] }),
    });
    expect(res.status).toBe(400);
  });

  test("GET /api/matches/:id returns 404 for missing", async () => {
    const res = await app.request("/api/matches/does-not-exist");
    expect(res.status).toBe(404);
  });

  test("GET /api/matches/:id/replay returns 404 for missing", async () => {
    const res = await app.request("/api/matches/does-not-exist/replay");
    expect(res.status).toBe(404);
  });

  test("GET /api/matches/:id rejects path traversal ids", async () => {
    const res = await app.request("/api/matches/..%2F..%2Fpackage");
    expect(res.status).toBe(404);
  });

  test("GET /api/matches/:id/replay rejects path traversal ids", async () => {
    const res = await app.request("/api/matches/..%2F..%2Fpackage/replay");
    expect(res.status).toBe(404);
  });

  test("POST /api/matches/demo rejects unknown game", async () => {
    const res = await app.request("/api/matches/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: "chess" }),
    });
    expect(res.status).toBe(400);
  });

  test("practice endpoints rate-limit one client", async () => {
    const previous = process.env.MACHIA_TRUST_PROXY;
    process.env.MACHIA_TRUST_PROXY = "1";
    try {
      const headers = {
        "Content-Type": "application/json",
        "x-real-ip": "198.51.100.42",
      };
      for (let i = 0; i < 20; i++) {
        const res = await app.request("/api/matches", {
          method: "POST",
          headers,
          body: JSON.stringify({ gameId: "bomber", botIds: [] }),
        });
        expect(res.status).toBe(400);
      }
      const blocked = await app.request("/api/matches/demo", {
        method: "POST",
        headers,
        body: JSON.stringify({ gameId: "bomber" }),
      });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    } finally {
      if (previous === undefined) delete process.env.MACHIA_TRUST_PROXY;
      else process.env.MACHIA_TRUST_PROXY = previous;
    }
  });

  test("serverListenConfig defaults to port 3001 on all interfaces", () => {
    expect(serverListenConfig({})).toEqual({ port: 3001 });
  });

  test("serverListenConfig honors PORT and HOST", () => {
    expect(serverListenConfig({ PORT: "3010", HOST: "127.0.0.1" })).toEqual({
      port: 3010,
      hostname: "127.0.0.1",
    });
  });
});

describe("auth config", () => {
  const PUBLIC = { MACHIA_PUBLIC_URL: "https://arena.example.com" };

  test("local setups trust the dev origins", () => {
    const origins = corsOrigins({});
    expect(origins).toContain("http://localhost:5173");
    expect(origins).toContain("http://localhost:3001");
  });

  test("a public origin trusts only itself", () => {
    expect(corsOrigins(PUBLIC)).toEqual(["https://arena.example.com"]);
  });

  test("local setups may use the built-in dev secret", () => {
    expect(authSecret({}).length).toBeGreaterThanOrEqual(32);
    expect(authSecret({ MACHIA_PUBLIC_URL: "http://127.0.0.1:3001" }).length).toBeGreaterThanOrEqual(32);
  });

  test("a public origin requires a real secret", () => {
    expect(() => authSecret(PUBLIC)).toThrow(/MACHIA_AUTH_SECRET/);
    expect(() => authSecret({ ...PUBLIC, MACHIA_AUTH_SECRET: "too-short" })).toThrow(
      /MACHIA_AUTH_SECRET/,
    );
    const secret = "s".repeat(32);
    expect(authSecret({ ...PUBLIC, MACHIA_AUTH_SECRET: secret })).toBe(secret);
    expect(authSecret({ ...PUBLIC, BETTER_AUTH_SECRET: secret })).toBe(secret);
  });
});
