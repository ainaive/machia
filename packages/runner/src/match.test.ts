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

function sokobanPlayer(id: string) {
  const botDir = path.join(botsRoot, id);
  return {
    botId: id,
    botDir,
    manifest: {
      name: id,
      runtime: "node" as const,
      entry: "bot.js",
      games: ["sokoban"],
    },
  };
}

describe("runMatch sokoban", () => {
  test("completes a short 2-player match", async () => {
    const replay = await runMatch({
      id: "test-match-sokoban",
      gameId: "sokoban",
      maxTicks: 80,
      players: [
        sokobanPlayer("sokoban-pusher"),
        sokobanPlayer("sokoban-hauler"),
      ],
    });

    expect(replay.gameId).toBe("sokoban");
    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.ticks.length).toBeLessThanOrEqual(80);
    expect(replay.results).toHaveLength(2);
    expect(replay.ticks[0]?.cells).toBeDefined();
  }, 25_000);
});

function holdemPlayer(id: string) {
  const botDir = path.join(botsRoot, id);
  return {
    botId: id,
    botDir,
    manifest: {
      name: id,
      runtime: "node" as const,
      entry: "bot.js",
      games: ["holdem"],
    },
  };
}

describe("runMatch holdem", () => {
  test("completes a short heads-up hand", async () => {
    const replay = await runMatch({
      id: "test-match-holdem",
      gameId: "holdem",
      maxTicks: 120,
      players: [holdemPlayer("holdem-tight"), holdemPlayer("holdem-loose")],
    });

    expect(replay.gameId).toBe("holdem");
    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.results).toHaveLength(2);
    expect(replay.ticks[0]?.street).toBeDefined();
    const stacks = replay.results.reduce((a, r) => a + r.score, 0);
    expect(stacks).toBe(200);
  }, 25_000);
});

function quoridorPlayer(id: string) {
  const botDir = path.join(botsRoot, id);
  return {
    botId: id,
    botDir,
    manifest: {
      name: id,
      runtime: "node" as const,
      entry: "bot.js",
      games: ["quoridor"],
    },
  };
}

describe("runMatch quoridor", () => {
  test("completes a short heads-up race", async () => {
    const replay = await runMatch({
      id: "test-match-quoridor",
      gameId: "quoridor",
      maxTicks: 80,
      players: [
        quoridorPlayer("quoridor-rush"),
        quoridorPlayer("quoridor-blocker"),
      ],
    });

    expect(replay.gameId).toBe("quoridor");
    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.results).toHaveLength(2);
    expect(replay.ticks[0]?.walls).toBeDefined();
    expect(replay.mapSize).toBe(7);
  }, 25_000);
});
