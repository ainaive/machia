import { describe, expect, test } from "bun:test";
import { evaluateFive, bestHand, type Card } from "./cards";
import { HoldemEngine } from "./engine";

function C(rank: Card["rank"], suit: Card["suit"]): Card {
  return { rank, suit };
}

describe("hand eval", () => {
  test("flush beats straight", () => {
    const flush = evaluateFive([
      C(2, "h"),
      C(5, "h"),
      C(9, "h"),
      C(11, "h"),
      C(13, "h"),
    ]);
    const straight = evaluateFive([
      C(5, "c"),
      C(6, "d"),
      C(7, "h"),
      C(8, "s"),
      C(9, "c"),
    ]);
    expect(flush).toBeGreaterThan(straight);
  });

  test("bestHand uses hole+board", () => {
    const hole = [C(14, "s"), C(14, "h")];
    const board = [C(14, "d"), C(2, "c"), C(5, "c"), C(7, "d"), C(9, "h")];
    const trips = bestHand(hole, board);
    const weak = bestHand([C(3, "c"), C(8, "d")], board);
    expect(trips).toBeGreaterThan(weak);
  });
});

describe("holdem engine", () => {
  test("deal and fold wins pot", () => {
    // deterministic-ish: use Math.random but force folds
    const eng = new HoldemEngine(
      { playerCount: 2, maxTicks: 50 },
      { button: 0 },
    );
    expect(eng.seats[0]!.hole).toHaveLength(2);
    expect(eng.street).toBe("preflop");

    // act until someone can fold the other out or showdown
    let guard = 0;
    while (!eng.finished && guard++ < 40) {
      const id = eng.toAct;
      eng.step({ [id]: "FOLD" });
    }
    expect(eng.finished).toBe(true);
    const stacks = eng.seats.map((s) => s.stack);
    expect(stacks[0]! + stacks[1]!).toBe(200);
  });

  test("check/call reaches showdown with stacks conserved", () => {
    const eng = new HoldemEngine(
      { playerCount: 2, maxTicks: 80 },
      { button: 0 },
    );
    let guard = 0;
    while (!eng.finished && guard++ < 60) {
      const id = eng.toAct;
      const legal = eng.observation(id).legal as string[];
      const action = legal.includes("CHECK")
        ? "CHECK"
        : legal.includes("CALL")
          ? "CALL"
          : "FOLD";
      eng.step({ [id]: action });
    }
    expect(eng.finished).toBe(true);
    expect(eng.seats[0]!.stack + eng.seats[1]!.stack).toBe(200);
  });
});
