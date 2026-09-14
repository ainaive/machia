import { describe, expect, test } from "bun:test";
import { app } from "./index";

describe("API", () => {
  test("GET /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; running: boolean };
    expect(body.ok).toBe(true);
    expect(typeof body.running).toBe("boolean");
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

  test("POST /api/matches/demo rejects unknown game", async () => {
    const res = await app.request("/api/matches/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId: "chess" }),
    });
    expect(res.status).toBe(400);
  });
});
