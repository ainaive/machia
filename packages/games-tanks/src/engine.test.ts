import { describe, expect, test } from "bun:test";
import {
  TanksEngine,
  buildTiles,
  mapSizeForPlayers,
  spawnSlots,
  type Tile,
} from "./index";

describe("tanks basics", () => {
  test("map size is 13", () => {
    expect(mapSizeForPlayers(2)).toBe(13);
    expect(mapSizeForPlayers(4)).toBe(13);
  });

  test("move turns and advances one cell", () => {
    const size = 13;
    const slots = spawnSlots(size).slice(0, 2);
    const tiles = buildTiles(
      size,
      slots.map((s) => s.pos),
    );
    const engine = new TanksEngine(
      { playerCount: 2, maxTicks: 20 },
      { tiles },
    );
    engine.players[0]!.pos = { x: 1, y: 1 };
    engine.players[0]!.facing = "RIGHT";
    engine.players[1]!.pos = { x: 11, y: 11 };

    engine.step({ 0: "MOVE_RIGHT", 1: "WAIT" });
    expect(engine.players[0]!.pos).toEqual({ x: 2, y: 1 });
    expect(engine.players[0]!.facing).toBe("RIGHT");
  });

  test("fire kills tank in line after bullet flight", () => {
    const size = 13;
    const tiles: Tile[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => "empty" as Tile),
    );
    for (let i = 0; i < size; i++) {
      tiles[0]![i] = "hard";
      tiles[size - 1]![i] = "hard";
      tiles[i]![0] = "hard";
      tiles[i]![size - 1] = "hard";
    }

    const engine = new TanksEngine(
      { playerCount: 2, maxTicks: 30 },
      { tiles },
    );
    engine.players[0]!.pos = { x: 1, y: 5 };
    engine.players[0]!.facing = "RIGHT";
    engine.players[1]!.pos = { x: 4, y: 5 };
    engine.players[1]!.facing = "LEFT";

    // FIRE spawns on tank then advances to (2,5)
    engine.step({ 0: "FIRE", 1: "WAIT" });
    expect(engine.bullets).toHaveLength(1);
    expect(engine.bullets[0]!.pos).toEqual({ x: 2, y: 5 });

    // (3,5)
    engine.step({ 0: "WAIT", 1: "WAIT" });
    expect(engine.bullets[0]!.pos).toEqual({ x: 3, y: 5 });

    // (4,5) kills p1
    engine.step({ 0: "WAIT", 1: "WAIT" });
    expect(engine.players[1]!.alive).toBe(false);
    expect(engine.players[0]!.kills).toBe(1);
    expect(engine.finished).toBe(true);
  });

  test("hard wall blocks move", () => {
    const engine = new TanksEngine({ playerCount: 2, maxTicks: 10 });
    engine.players[0]!.pos = { x: 1, y: 1 };
    engine.players[0]!.facing = "UP";
    engine.step({ 0: "MOVE_UP", 1: "WAIT" });
    expect(engine.players[0]!.pos).toEqual({ x: 1, y: 1 });
  });
});
