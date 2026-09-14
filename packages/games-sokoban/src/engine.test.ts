import { describe, expect, test } from "bun:test";
import { SokobanEngine, parseLevel, DEFAULT_LEVEL_ROWS } from "./index";

describe("sokoban basics", () => {
  test("parses default level", () => {
    const level = parseLevel(DEFAULT_LEVEL_ROWS);
    expect(level.boxes.length).toBe(level.goals.length);
    expect(level.start).toBeTruthy();
  });

  test("push box onto goal and solve", () => {
    const rows = ["#####", "#@$.#", "#####"] as const;
    const engine = new SokobanEngine(
      { playerCount: 2, maxTicks: 20 },
      { levelRows: rows },
    );

    engine.step({ 0: "MOVE_RIGHT", 1: "WAIT" });
    expect(engine.players[0]!.boxes[0]).toEqual({ x: 3, y: 1 });
    expect(engine.players[0]!.done).toBe(true);
    expect(engine.players[0]!.finishTick).toBe(0);
  });

  test("cannot push box into wall", () => {
    const level = ["#####", "#@$##", "# . #", "#####"] as const;
    const engine = new SokobanEngine(
      { playerCount: 2, maxTicks: 10 },
      { levelRows: level },
    );
    const before = { ...engine.players[0]!.pos };
    const boxBefore = { ...engine.players[0]!.boxes[0]! };
    engine.step({ 0: "MOVE_RIGHT", 1: "WAIT" });
    expect(engine.players[0]!.pos).toEqual(before);
    expect(engine.players[0]!.boxes[0]).toEqual(boxBefore);
  });

  test("independent boards — p1 solve does not finish p0", () => {
    const rows = ["#####", "#@$.#", "#####"] as const;
    const engine = new SokobanEngine(
      { playerCount: 2, maxTicks: 20 },
      { levelRows: rows },
    );
    engine.step({ 0: "WAIT", 1: "MOVE_RIGHT" });
    expect(engine.players[1]!.done).toBe(true);
    expect(engine.players[0]!.done).toBe(false);
    expect(engine.isAlive(0)).toBe(true);
    expect(engine.isAlive(1)).toBe(false);
  });
});
