import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEMO_BOTS,
  listBots,
  listReplaysIn,
  loadBot,
  replaysDir,
  runPlayersMatch,
  startMatch,
} from "./matches";

describe("matches helpers", () => {
  test("listBots finds sample bots", async () => {
    const bots = await listBots();
    expect(bots.some((b) => b.id === "random-walker")).toBe(true);
    expect(bots.some((b) => b.id === "bomber-rusher")).toBe(true);
  });

  test("listBots filters by game", async () => {
    const arena = await listBots("arena");
    const bomber = await listBots("bomber");
    expect(arena.every((b) => b.games.includes("arena"))).toBe(true);
    expect(bomber.every((b) => b.games.includes("bomber"))).toBe(true);
    expect(arena.some((b) => b.id === "bomber-rusher")).toBe(false);
  });

  test("loadBot validates game membership", async () => {
    await expect(loadBot("bomber-rusher", "arena")).rejects.toThrow(/Unknown bot/);
    const bot = await loadBot("bomber-rusher", "bomber");
    expect(bot.id).toBe("bomber-rusher");
  });

  test("demo bot ids exist for each game", async () => {
    for (const [gameId, ids] of Object.entries(DEMO_BOTS)) {
      const bots = await listBots(gameId);
      const have = new Set(bots.map((b) => b.id));
      for (const id of ids) {
        expect(have.has(id)).toBe(true);
      }
    }
  });
});

describe("replay list", () => {
  function replay(id: string, gameId: string, createdAt: string, totalTicks: number) {
    return {
      id,
      gameId,
      createdAt,
      mapSize: 13,
      totalTicks,
      seed: 1,
      players: [{ playerId: 0, botId: "a", name: "A" }],
      ticks: [],
      results: [{ playerId: 0, score: 1, rank: 1 }],
    };
  }

  test("filters by game and pages newest first", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "machia-replay-list-"));
    try {
      // The URL has to use the file that exists, even if the JSON's own id
      // disagrees (an old or hand-made replay).
      await writeFile(
        path.join(dir, "m_old.json"),
        JSON.stringify(replay("different-id", "arena", "2026-01-01T00:00:00Z", 10)),
      );
      await writeFile(
        path.join(dir, "m_new.json"),
        JSON.stringify(replay("m_new", "arena", "2026-01-03T00:00:00Z", 30)),
      );
      await writeFile(
        path.join(dir, "m_bomber.json"),
        JSON.stringify(replay("m_bomber", "bomber", "2026-01-02T00:00:00Z", 20)),
      );
      await writeFile(path.join(dir, "m_no_date.json"), JSON.stringify({ ...replay("m_no_date", "arena", "x", 1), createdAt: undefined }));
      await writeFile(path.join(dir, "notes.txt"), "not a replay");

      const all = await listReplaysIn(dir);
      expect(all.total).toBe(3);
      expect(all.matches.map((m) => m.id)).toEqual(["m_new", "m_bomber", "m_old"]);
      expect(all.matches.map((m) => m.id)).not.toContain("different-id");

      const arena = await listReplaysIn(dir, { gameId: "arena", limit: 1, offset: 1 });
      expect(arena.total).toBe(2);
      expect(arena.matches.map((m) => m.id)).toEqual(["m_old"]);
      expect(arena.matches[0]!.totalTicks).toBe(10);

      // A new replay invalidates the cached summary list.
      await writeFile(
        path.join(dir, "m_later.json"),
        JSON.stringify(replay("m_later", "arena", "2026-01-04T00:00:00Z", 5)),
      );
      const updated = await listReplaysIn(dir, { gameId: "arena" });
      expect(updated.total).toBe(3);
      expect(updated.matches[0]!.id).toBe("m_later");

      // Replacing one file with another keeps the JSON count the same, so the
      // cache must also notice the directory mtime. Pin it to avoid a
      // same-millisecond timing dependency.
      await unlink(path.join(dir, "m_new.json"));
      await writeFile(
        path.join(dir, "m_replaced.json"),
        JSON.stringify(replay("m_replaced", "arena", "2026-01-05T00:00:00Z", 7)),
      );
      const stamped = new Date("2026-01-06T00:00:00Z");
      await utimes(dir, stamped, stamped);
      const replaced = await listReplaysIn(dir, { gameId: "arena" });
      expect(replaced.total).toBe(3);
      expect(replaced.matches.map((m) => m.id)).toContain("m_replaced");
      expect(replaced.matches.map((m) => m.id)).not.toContain("m_new");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("match concurrency", () => {
  test("a practice match does not block a contest match", async () => {
    const bot = await loadBot("random-walker", "arena");
    const spec = {
      botId: bot.id,
      botDir: bot.dir,
      manifest: { name: bot.name, runtime: "node" as const, entry: bot.entry },
    };
    const [practice, contest] = await Promise.all([
      startMatch("arena", ["random-walker", "turtle"]),
      runPlayersMatch("arena", [spec, spec], { maxTicks: 5 }),
    ]);
    expect(practice.ticks.length).toBeGreaterThan(0);
    expect(contest.ticks.length).toBeGreaterThan(0);
    for (const id of [practice.id, contest.id]) {
      await rm(path.join(replaysDir(), `${id}.json`), { force: true });
    }
  }, 30_000);
});
