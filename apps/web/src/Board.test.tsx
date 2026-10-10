import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { MatchReplay, TickSnapshot } from "./api";
import { Board } from "./Board";

/** Replays shaped like the engines' (see each game's snapshot), but tiny. */
function replay(gameId: string, mapSize: number, snap: Partial<TickSnapshot>): MatchReplay {
  return {
    id: "m_test",
    gameId,
    createdAt: "2026-10-10T00:00:00Z",
    mapSize,
    players: [
      { playerId: 0, botId: "a", name: "A" },
      { playerId: 1, botId: "b", name: "B" },
    ],
    ticks: [{ tick: 0, executed: {}, submitted: {}, events: [], players: [], ...snap }],
    results: [],
    totalTicks: 1,
  };
}

const render = (r: MatchReplay, tickIndex = 0) =>
  renderToStaticMarkup(<Board replay={r} tickIndex={tickIndex} />);
const count = (html: string, needle: string) => html.split(needle).length - 1;
const ROBOT = 'viewBox="0 0 48 48"';
const grid = (size: number, fill: string) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => fill));

describe("Board", () => {
  test("arena shows living robots with their hit points", () => {
    const html = render(
      replay("arena", 5, {
        players: [
          { id: 0, hp: 3, pos: { x: 2, y: 0 }, facing: "DOWN", alive: true },
          { id: 1, hp: 2, pos: { x: 2, y: 4 }, facing: "UP", alive: true },
          { id: 2, hp: 0, pos: { x: 0, y: 0 }, facing: "UP", alive: false },
        ],
        safe: { minX: 0, minY: 0, maxX: 4, maxY: 4 },
      }),
    );
    expect(html).toContain("Arena");
    expect(count(html, ROBOT)).toBe(2);
    expect(html).toContain("repeat(5, 36px)");
  });

  test("bomber shows walls, bombs and players", () => {
    const tiles = grid(5, "empty");
    tiles[0]![0] = "hard";
    tiles[0]![1] = "soft";
    const html = render(
      replay("bomber", 5, {
        players: [
          { id: 0, pos: { x: 1, y: 1 }, alive: true },
          { id: 1, pos: { x: 3, y: 3 }, alive: true },
        ],
        tiles,
        bombs: [{ id: 1, ownerId: 0, pos: { x: 2, y: 2 }, fuse: 3, power: 1 }],
        powerups: [],
        blast: [],
        hazardRing: 0,
      }),
    );
    expect(html).toContain("Bomber");
    expect(count(html, ROBOT)).toBe(2);
    expect(count(html, 'viewBox="0 0 40 40"')).toBe(1); // the bomb
  });

  test("tanks shows tanks and bullets", () => {
    const html = render(
      replay("tanks", 5, {
        players: [
          { id: 0, pos: { x: 1, y: 1 }, facing: "RIGHT", alive: true },
          { id: 1, pos: { x: 3, y: 1 }, facing: "LEFT", alive: false },
        ],
        tiles: grid(5, "empty"),
        bullets: [{ id: 1, ownerId: 0, pos: { x: 2, y: 1 }, facing: "RIGHT" }],
      }),
    );
    expect(html).toContain("Tanks");
    expect(count(html, 'viewBox="0 0 24 24"')).toBe(1); // the bullet
  });

  test("sokoban shows each player's own board and progress", () => {
    const cells = grid(4, "empty");
    const html = render(
      replay("sokoban", 4, {
        width: 4,
        height: 3,
        cells,
        goals: [{ x: 2, y: 1 }],
        players: [
          { id: 0, pos: { x: 1, y: 1 }, boxes: [{ x: 2, y: 2 }], boxesOnGoal: 0, goalCount: 1, done: false, steps: 3 },
          { id: 1, pos: { x: 1, y: 1 }, boxes: [{ x: 2, y: 1 }], boxesOnGoal: 1, goalCount: 1, done: true, steps: 5 },
        ],
      }),
    );
    expect(html).toContain("0/1 · 3 步");
    expect(html).toContain("完成 · 5 步");
  });

  test("hold'em shows the street, pot, cards and folds", () => {
    const html = render(
      replay("holdem", 2, {
        street: "flop",
        pot: 40,
        toAct: 0,
        community: ["As", "7d", "Th"],
        players: [
          { id: 0, stack: 80, bet: 10, folded: false, allIn: false, hole: ["8h", "2c"] },
          { id: 1, stack: 90, bet: 0, folded: true, allIn: false, hole: [] },
        ],
      }),
    );
    expect(html).toContain("flop");
    expect(html).toContain("Pot 40");
    expect(html).toContain("♠");
    expect(html).toContain("注 10");
    expect(html).toContain("弃牌");
  });

  test("quoridor shows pawns and every fence", () => {
    const html = render(
      replay("quoridor", 7, {
        toAct: 1,
        walls: [
          { orient: "H", x: 1, y: 1 },
          { orient: "V", x: 3, y: 2 },
        ],
        players: [
          { id: 0, pos: { x: 3, y: 6 }, fences: 7, goal: "N", finished: false },
          { id: 1, pos: { x: 3, y: 0 }, fences: 7, goal: "S", finished: false },
        ],
      }),
    );
    expect(html).toContain("Quoridor");
    expect(count(html, ROBOT)).toBe(2);
    expect(count(html, "bg-[#3a2a18]")).toBe(2);
  });

  test("clamps the tick and survives replays with no ticks", () => {
    const arena = replay("arena", 5, {
      players: [{ id: 0, hp: 3, pos: { x: 0, y: 0 }, facing: "UP", alive: true }],
    });
    expect(count(render(arena, 99), ROBOT)).toBe(1);
    for (const gameId of ["arena", "bomber", "tanks", "sokoban", "holdem", "quoridor", "unknown"]) {
      expect(() => render({ ...replay(gameId, 5, {}), ticks: [] })).not.toThrow();
    }
  });
});
