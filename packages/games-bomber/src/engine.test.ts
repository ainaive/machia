import { describe, expect, test } from "bun:test";
import {
  BomberEngine,
  buildTiles,
  mapSizeForPlayers,
  spawnSlots,
  type Tile,
} from "./index";

function openArena(size: number): Tile[][] {
  const spawns = spawnSlots(size);
  const tiles = buildTiles(size, spawns, () => 1); // all empty soft rolls fail → empty
  // force a corridor of soft walls for tests
  return tiles;
}

describe("bomber basics", () => {
  test("map sizes", () => {
    expect(mapSizeForPlayers(2)).toBe(11);
    expect(mapSizeForPlayers(4)).toBe(13);
  });

  test("place bomb explodes after fuse ticks", () => {
    const size = 11;
    const spawns = spawnSlots(size).slice(0, 2);
    const tiles = openArena(size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (!(x % 2 === 0 && y % 2 === 0)) tiles[y]![x] = "empty";
      }
    }

    const engine = new BomberEngine(
      { playerCount: 2, maxTicks: 20 },
      { tiles, random: () => 0 },
    );
    engine.players[0]!.pos = { x: 1, y: 1 };
    engine.players[1]!.pos = { x: 9, y: 9 };

    engine.step({ 0: "PLACE_BOMB", 1: "WAIT" });
    expect(engine.bombs).toHaveLength(1);
    expect(engine.bombs[0]!.fuse).toBe(3);

    engine.step({ 0: "MOVE_RIGHT", 1: "WAIT" });
    engine.step({ 0: "MOVE_RIGHT", 1: "WAIT" });
    engine.step({ 0: "MOVE_RIGHT", 1: "WAIT" });
    expect(engine.bombs).toHaveLength(0);
  });

  test("soft wall breaks and chain works", () => {
    const size = 11;
    const tiles: Tile[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => "empty" as Tile),
    );
    for (let i = 0; i < size; i++) {
      tiles[0]![i] = "hard";
      tiles[size - 1]![i] = "hard";
      tiles[i]![0] = "hard";
      tiles[i]![size - 1] = "hard";
    }
    tiles[1]![3] = "soft";

    const engine = new BomberEngine(
      { playerCount: 2, maxTicks: 30 },
      { tiles, random: () => 0.99 },
    );
    engine.players[0]!.pos = { x: 1, y: 1 };
    engine.players[0]!.power = 2;
    engine.players[1]!.pos = { x: 9, y: 9 };

    engine.step({ 0: "PLACE_BOMB", 1: "WAIT" });
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });
    // explode
    expect(engine.tiles[1]![3]).toBe("empty");
    expect(engine.players[0]!.wallsBroken).toBe(1);
  });

  test("blast kills and credits kill", () => {
    const size = 11;
    const tiles: Tile[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => "empty" as Tile),
    );
    for (let i = 0; i < size; i++) {
      tiles[0]![i] = "hard";
      tiles[size - 1]![i] = "hard";
      tiles[i]![0] = "hard";
      tiles[i]![size - 1] = "hard";
    }

    const engine = new BomberEngine(
      { playerCount: 2, maxTicks: 20 },
      { tiles, random: () => 0.99 },
    );
    engine.players[0]!.pos = { x: 1, y: 1 };
    engine.players[0]!.power = 3;
    engine.players[1]!.pos = { x: 3, y: 1 };

    engine.step({ 0: "PLACE_BOMB", 1: "WAIT" });
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });
    engine.step({ 0: "MOVE_DOWN", 1: "WAIT" });

    expect(engine.players[1]!.alive).toBe(false);
    expect(engine.players[0]!.kills).toBe(1);
    expect(engine.finished).toBe(true);
  });

  test("1v1 overtime shrinks hazard and can finish duel", () => {
    const size = 11;
    const tiles: Tile[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => "empty" as Tile),
    );
    for (let i = 0; i < size; i++) {
      tiles[0]![i] = "hard";
      tiles[size - 1]![i] = "hard";
      tiles[i]![0] = "hard";
      tiles[i]![size - 1] = "hard";
    }

    const engine = new BomberEngine(
      { playerCount: 2, maxTicks: 200 },
      { tiles, random: () => 0 },
    );
    engine.players[0]!.pos = { x: 1, y: 1 };
    engine.players[1]!.pos = { x: 9, y: 9 };

    for (let i = 0; i < 18; i++) {
      engine.step({ 0: "WAIT", 1: "WAIT" });
    }
    expect(engine.hazardRing).toBe(1);
    expect(engine.players[0]!.alive).toBe(false);
    expect(engine.players[1]!.alive).toBe(false);
    expect(engine.finished).toBe(true);
  });
});
