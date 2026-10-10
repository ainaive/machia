import { describe, expect, test } from "bun:test";
import { evaluateFive, bestHand, type Card } from "./cards";
import { createRandom, type TickSnapshot } from "@machia/game-api";
import { HoldemEngine, holdemPlugin } from "./engine";

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

  test("all-in players run out the board instead of folding", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const eng = new HoldemEngine(
        { playerCount: 2, maxTicks: 200 },
        { button: 0, random: createRandom(seed) },
      );
      const events: Array<{ type: string; playerId?: number }> = [];
      let guard = 0;
      while (!eng.finished && guard++ < 200) {
        const id = eng.toAct;
        const legal = eng.observation(id).legal as string[];
        // Shove: raise while possible, then call; WAIT once nobody can act.
        const action = legal.includes("RAISE")
          ? "RAISE"
          : legal.includes("CALL")
            ? "CALL"
            : "WAIT";
        const snap = eng.step({ [id]: action });
        events.push(...(snap.events as typeof events));
      }
      expect(eng.finished).toBe(true);
      expect(eng.seats.every((s) => s.allIn)).toBe(true);
      expect(events.some((e) => e.type === "fold")).toBe(false);
      expect(eng.community).toHaveLength(5);

      const [a, b] = eng.seats.map((s) => bestHand(s.hole, eng.community));
      const stacks = eng.seats.map((s) => s.stack);
      expect(stacks[0]! + stacks[1]!).toBe(200);
      if (a! > b!) expect(stacks).toEqual([200, 0]);
      else if (b! > a!) expect(stacks).toEqual([0, 200]);
      else expect(stacks).toEqual([100, 100]);
    }
  });

  test("all-in players are not asked to act", () => {
    const eng = new HoldemEngine(
      { playerCount: 2, maxTicks: 200 },
      { button: 0, random: createRandom(7) },
    );
    let guard = 0;
    while (!eng.seats.every((s) => s.allIn) && guard++ < 100) {
      const id = eng.toAct;
      const legal = eng.observation(id).legal as string[];
      eng.step({ [id]: legal.includes("RAISE") ? "RAISE" : "CALL" });
    }
    expect(eng.finished).toBe(false);
    expect(eng.isAlive(0)).toBe(false);
    expect(eng.isAlive(1)).toBe(false);
    expect(eng.observation(0).legal).toEqual(["WAIT"]);
  });

  test("a showdown forced by maxTicks deals the full board", () => {
    const eng = new HoldemEngine(
      { playerCount: 2, maxTicks: 2 },
      { button: 0, random: createRandom(3) },
    );
    let last: TickSnapshot | undefined;
    while (!eng.finished) {
      const id = eng.toAct;
      const legal = eng.observation(id).legal as string[];
      last = eng.step({ [id]: legal.includes("CHECK") ? "CHECK" : "CALL" });
    }
    expect(eng.community).toHaveLength(5);
    expect(eng.seats[0]!.stack + eng.seats[1]!.stack).toBe(200);

    // The replay's final frame must show the run-out and the payout.
    const final = last as TickSnapshot & {
      street: string;
      pot: number;
      community: string[];
      players: Array<{ stack: number }>;
    };
    expect(final.street).toBe("done");
    expect(final.community).toHaveLength(5);
    expect(final.pot).toBe(0);
    expect(final.players.map((p) => p.stack)).toEqual(eng.seats.map((s) => s.stack));
  });

  test("the plugin seed fixes the deal", () => {
    const deal = (seed: number) =>
      (holdemPlugin.create({ playerCount: 2, seed }) as HoldemEngine).seats.map((s) =>
        s.hole.map((c) => `${c.rank}${c.suit}`),
      );
    expect(deal(42)).toEqual(deal(42));
    expect(deal(42)).not.toEqual(deal(43));
  });
});

describe("holdem ranking", () => {
  test("players with identical results share a rank", () => {
    const game = holdemPlugin.create({ playerCount: 2, seed: 1 });
    for (let t = 0; t < 6 && !game.finished; t++) {
      const actions: Record<number, unknown> = {};
      for (const id of [0, 1]) if (game.isAlive(id)) actions[id] = game.normalizeAction("WAIT");
      game.step(actions);
    }
    const [first, second] = game.results().results;
    expect(first!.score).toBe(second!.score);
    expect([first!.rank, second!.rank]).toEqual([1, 1]);
  });
});
