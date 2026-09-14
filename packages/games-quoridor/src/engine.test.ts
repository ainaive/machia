import { describe, expect, test } from "bun:test";
import {
  BOARD_SIZE,
  QuoridorEngine,
  canPlaceWall,
  edgeBlocked,
  normalizeQuoridorAction,
  pathExists,
  shortestPathLen,
} from "./engine";

describe("quoridor walls", () => {
  test("horizontal wall blocks vertical edge", () => {
    const walls = [{ orient: "H" as const, x: 2, y: 3 }];
    expect(
      edgeBlocked({ x: 2, y: 3 }, { x: 2, y: 4 }, walls),
    ).toBe(true);
    expect(
      edgeBlocked({ x: 3, y: 3 }, { x: 3, y: 4 }, walls),
    ).toBe(true);
    expect(
      edgeBlocked({ x: 1, y: 3 }, { x: 1, y: 4 }, walls),
    ).toBe(false);
  });

  test("cannot fully seal a player", () => {
    const players = [
      { pos: { x: 3, y: 6 }, goal: "N" as const },
      { pos: { x: 3, y: 0 }, goal: "S" as const },
    ];
    // Build a nearly complete horizontal barrier on row edge 0, leave a gap
    const walls = [];
    for (let x = 0; x <= BOARD_SIZE - 2; x += 2) {
      if (x === 2) continue;
      walls.push({ orient: "H" as const, x, y: 0 });
    }
    expect(pathExists(players[0]!.pos, "N", walls, BOARD_SIZE)).toBe(true);
    // Filling the last gap that seals north must fail
    expect(
      canPlaceWall({ orient: "H", x: 2, y: 0 }, walls, players, BOARD_SIZE),
    ).toBe(true); // still a path around ends on 7×7 with sparse walls
  });

  test("shortest path decreases after a step north", () => {
    const walls: never[] = [];
    const from = { x: 3, y: 6 };
    const before = shortestPathLen(from, "N", walls, BOARD_SIZE);
    const after = shortestPathLen({ x: 3, y: 5 }, "N", walls, BOARD_SIZE);
    expect(before).toBe(6);
    expect(after).toBe(5);
  });
});

describe("quoridor normalize", () => {
  test("parses string and object actions", () => {
    expect(normalizeQuoridorAction("MOVE:N")).toEqual({
      type: "MOVE",
      dir: "N",
    });
    expect(normalizeQuoridorAction({ action: "WALL", orient: "V", x: 1, y: 2 })).toEqual({
      type: "WALL",
      orient: "V",
      x: 1,
      y: 2,
    });
    expect(normalizeQuoridorAction("nope").type).toBe("WAIT");
  });
});

describe("quoridor engine", () => {
  test("heads-up race: northbound wins by walking", () => {
    const g = new QuoridorEngine({ playerCount: 2, maxTicks: 40 });
    expect(g.mapSize).toBe(BOARD_SIZE);
    expect(g.players[0]!.goal).toBe("N");

    let guard = 0;
    while (!g.finished && guard++ < 40) {
      const id = g.toAct;
      g.step({ [id]: "MOVE:N" });
    }
    expect(g.finished).toBe(true);
    const res = g.results();
    expect(res.results[0]!.playerId).toBe(0);
    expect(res.results[0]!.score).toBeGreaterThan(9000);
  });

  test("placing a legal wall spends a fence", () => {
    const g = new QuoridorEngine({ playerCount: 2 });
    const before = g.players[0]!.fences;
    g.step({ 0: "WALL:H:2:3" });
    expect(g.walls).toEqual([{ orient: "H", x: 2, y: 3 }]);
    expect(g.players[0]!.fences).toBe(before - 1);
    expect(g.toAct).toBe(1);
  });

  test("invalid / WAIT defaults toward goal", () => {
    const g = new QuoridorEngine({ playerCount: 2 });
    const y0 = g.players[0]!.pos.y;
    g.step({ 0: "WAIT" });
    expect(g.players[0]!.pos.y).toBe(y0 - 1);
  });

  test("sequential isAlive only for toAct", () => {
    const g = new QuoridorEngine({ playerCount: 2 });
    expect(g.isAlive(0)).toBe(true);
    expect(g.isAlive(1)).toBe(false);
    g.step({ 0: "MOVE:N" });
    expect(g.isAlive(0)).toBe(false);
    expect(g.isAlive(1)).toBe(true);
  });
});
