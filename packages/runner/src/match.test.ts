import { describe, expect, test } from "bun:test";
import path from "node:path";
import { runMatch } from "./index";

const botsRoot = path.resolve(import.meta.dir, "../../../bots");

function arenaPlayer() {
  const botDir = path.join(botsRoot, "random-walker");
  return {
    botId: "random-walker",
    botDir,
    manifest: {
      name: "Scout",
      runtime: "node" as const,
      entry: "bot.js",
      games: ["arena"],
    },
  };
}

function bomberPlayer(id: string) {
  const botDir = path.join(botsRoot, id);
  return {
    botId: id,
    botDir,
    manifest: {
      name: id,
      runtime: "node" as const,
      entry: "bot.js",
      games: ["bomber"],
    },
  };
}

function tanksPlayer(id: string) {
  const botDir = path.join(botsRoot, id);
  return {
    botId: id,
    botDir,
    manifest: {
      name: id,
      runtime: "node" as const,
      entry: "bot.js",
      games: ["tanks"],
    },
  };
}

describe("runMatch arena", () => {
  test("completes a short 2-player match", async () => {
    const replay = await runMatch({
      id: "test-match-arena",
      gameId: "arena",
      maxTicks: 20,
      players: [arenaPlayer(), arenaPlayer()],
    });

    expect(replay.gameId).toBe("arena");
    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.ticks.length).toBeLessThanOrEqual(20);
    expect(replay.results).toHaveLength(2);
    expect(replay.mapSize).toBe(15);
  }, 15_000);
});

describe("runMatch bomber", () => {
  test("completes a short 2-player match", async () => {
    const replay = await runMatch({
      id: "test-match-bomber",
      gameId: "bomber",
      maxTicks: 25,
      players: [bomberPlayer("bomber-rusher"), bomberPlayer("bomber-turtle")],
    });

    expect(replay.gameId).toBe("bomber");
    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.ticks.length).toBeLessThanOrEqual(25);
    expect(replay.results).toHaveLength(2);
    expect(replay.mapSize).toBe(11);
    expect(replay.ticks[0]?.tiles).toBeDefined();
  }, 20_000);

  test("rejects wrong player count", async () => {
    await expect(
      runMatch({
        id: "bad",
        gameId: "bomber",
        maxTicks: 5,
        players: [bomberPlayer("bomber-rusher")],
      }),
    ).rejects.toThrow(/requires/);
  });
});

describe("runMatch tanks", () => {
  test("completes a short 2-player match", async () => {
    const replay = await runMatch({
      id: "test-match-tanks",
      gameId: "tanks",
      maxTicks: 30,
      players: [tanksPlayer("tanks-hunter"), tanksPlayer("tanks-turtle")],
    });

    expect(replay.gameId).toBe("tanks");
    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.ticks.length).toBeLessThanOrEqual(30);
    expect(replay.results).toHaveLength(2);
    expect(replay.mapSize).toBe(13);
    expect(replay.ticks[0]?.bullets).toBeDefined();
  }, 20_000);
});
