import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import path from "node:path";
import { DEMO_BOTS, REPLAYS_DIR, listBots, loadBot, runPlayersMatch, startMatch } from "./matches";

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
      await rm(path.join(REPLAYS_DIR, `${id}.json`), { force: true });
    }
  }, 30_000);
});
