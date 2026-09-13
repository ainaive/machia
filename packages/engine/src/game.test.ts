import { describe, expect, test } from "bun:test";
import {
  GameEngine,
  centerCoord,
  coreRect,
  mapSizeForPlayers,
  maxSafeInset,
  safeRectForTick,
  spawnPositions,
} from "./index";
import type { Action } from "./types";

function allWait(engine: GameEngine): Record<number, Action> {
  const out: Record<number, Action> = {};
  for (const p of engine.players) {
    if (p.alive) out[p.id] = "WAIT";
  }
  return out;
}

describe("mapSizeForPlayers", () => {
  test("matches spec", () => {
    expect(mapSizeForPlayers(2)).toBe(15);
    expect(mapSizeForPlayers(4)).toBe(19);
    expect(mapSizeForPlayers(8)).toBe(27);
  });
});

describe("spawns", () => {
  test("N=2 opposite slots", () => {
    const size = mapSizeForPlayers(2);
    const spawns = spawnPositions(2, size);
    expect(spawns).toHaveLength(2);
    expect(spawns[0]).toEqual({ x: centerCoord(size), y: 0 });
    expect(spawns[1]).toEqual({ x: centerCoord(size), y: size - 1 });
  });

  test("N=4 cardinal mids", () => {
    const size = mapSizeForPlayers(4);
    const mid = centerCoord(size);
    const last = size - 1;
    expect(spawnPositions(4, size)).toEqual([
      { x: mid, y: 0 },
      { x: last, y: mid },
      { x: mid, y: last },
      { x: 0, y: mid },
    ]);
  });
});

describe("core and safe", () => {
  test("core is center 3x3", () => {
    const size = 15;
    const mid = centerCoord(size);
    expect(coreRect(size)).toEqual({
      minX: mid - 1,
      minY: mid - 1,
      maxX: mid + 1,
      maxY: mid + 1,
    });
  });

  test("shrinks every 60 ticks until core", () => {
    const size = 15;
    expect(safeRectForTick(size, 0).minX).toBe(0);
    expect(safeRectForTick(size, 59).minX).toBe(0);
    expect(safeRectForTick(size, 60).minX).toBe(1);
    expect(safeRectForTick(size, 120).minX).toBe(2);
    const max = maxSafeInset(size);
    const minSafe = safeRectForTick(size, max * 60);
    expect(minSafe).toEqual(coreRect(size));
    expect(safeRectForTick(size, max * 60 + 60)).toEqual(coreRect(size));
  });
});

describe("action delay queue", () => {
  test("prefilled WAIT; submit at T executes at T+2", () => {
    const engine = new GameEngine({ playerCount: 2 });
    const p0 = engine.players[0]!;
    const start = { ...p0.pos };

    // Tick 0: submit MOVE_DOWN (for tick 2); execute WAIT
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });
    expect(engine.players[0]!.pos).toEqual(start);
    expect(engine.players[0]!.queue).toEqual(["WAIT", "MOVE_DOWN"]);

    // Tick 1: execute WAIT
    engine.step({ 0: "WAIT", 1: "WAIT" });
    expect(engine.players[0]!.pos).toEqual(start);
    expect(engine.players[0]!.queue).toEqual(["MOVE_DOWN", "WAIT"]);

    // Tick 2: execute MOVE_DOWN
    engine.step({ 0: "WAIT", 1: "WAIT" });
    expect(engine.players[0]!.pos).toEqual({ x: start.x, y: start.y + 1 });
    expect(engine.players[0]!.facing).toBe("DOWN");
  });
});

describe("movement conflicts", () => {
  test("same target cancels both", () => {
    const engine = new GameEngine({ playerCount: 2 });
    // Place both adjacent targeting same cell via forced state
    engine.players[0]!.pos = { x: 5, y: 5 };
    engine.players[1]!.pos = { x: 7, y: 5 };
    engine.players[0]!.queue = ["MOVE_RIGHT", "WAIT"];
    engine.players[1]!.queue = ["MOVE_LEFT", "WAIT"];

    engine.step(allWait(engine));
    expect(engine.players[0]!.pos).toEqual({ x: 5, y: 5 });
    expect(engine.players[1]!.pos).toEqual({ x: 7, y: 5 });
  });

  test("swap cancels both", () => {
    const engine = new GameEngine({ playerCount: 2 });
    engine.players[0]!.pos = { x: 5, y: 5 };
    engine.players[1]!.pos = { x: 6, y: 5 };
    engine.players[0]!.queue = ["MOVE_RIGHT", "WAIT"];
    engine.players[1]!.queue = ["MOVE_LEFT", "WAIT"];

    engine.step(allWait(engine));
    expect(engine.players[0]!.pos).toEqual({ x: 5, y: 5 });
    expect(engine.players[1]!.pos).toEqual({ x: 6, y: 5 });
  });

  test("wall blocks move", () => {
    const engine = new GameEngine({ playerCount: 2 });
    engine.players[0]!.pos = { x: 0, y: 5 };
    engine.players[0]!.queue = ["MOVE_LEFT", "WAIT"];
    engine.step(allWait(engine));
    expect(engine.players[0]!.pos).toEqual({ x: 0, y: 5 });
  });
});

describe("attack and block", () => {
  test("attack hits 1 and 2 in facing; block immunes", () => {
    const engine = new GameEngine({ playerCount: 2 });
    engine.players[0]!.pos = { x: 5, y: 5 };
    engine.players[0]!.facing = "RIGHT";
    engine.players[1]!.pos = { x: 7, y: 5 };
    engine.players[0]!.queue = ["ATTACK", "WAIT"];
    engine.players[1]!.queue = ["BLOCK", "WAIT"];

    engine.step(allWait(engine));
    expect(engine.players[1]!.hp).toBe(3);
    expect(engine.players[1]!.alive).toBe(true);
  });

  test("attack damages and can kill with attribution", () => {
    const engine = new GameEngine({ playerCount: 2 });
    engine.players[0]!.pos = { x: 5, y: 5 };
    engine.players[0]!.facing = "RIGHT";
    engine.players[1]!.pos = { x: 6, y: 5 };
    engine.players[1]!.hp = 1;
    engine.players[0]!.queue = ["ATTACK", "WAIT"];
    engine.players[1]!.queue = ["WAIT", "WAIT"];

    const snap = engine.step(allWait(engine));
    expect(engine.players[1]!.alive).toBe(false);
    expect(engine.players[1]!.deathTick).toBe(0);
    expect(engine.players[0]!.kills).toBe(1);
    expect(snap.events.some((e) => e.type === "death")).toBe(true);
  });
});

describe("scoring and end", () => {
  test("core ticks increment in core", () => {
    const engine = new GameEngine({ playerCount: 2 });
    const mid = centerCoord(engine.mapSize);
    engine.players[0]!.pos = { x: mid, y: mid };
    engine.step(allWait(engine));
    expect(engine.players[0]!.coreTicks).toBe(1);
  });

  test("ends when one alive or max ticks", () => {
    const engine = new GameEngine({ playerCount: 2, maxTicks: 3 });
    engine.step(allWait(engine));
    engine.step(allWait(engine));
    engine.step(allWait(engine));
    expect(engine.finished).toBe(true);
    expect(engine.tick).toBe(3);
    const results = engine.results();
    expect(results.results).toHaveLength(2);
    expect(results.results[0]!.rank).toBe(1);
  });
});
