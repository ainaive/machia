import { describe, expect, test } from "bun:test";
import {
  computeStandings,
  generatePairs,
  winnerFromRanks,
} from "./standings";

describe("generatePairs", () => {
  test("empty and singleton", () => {
    expect(generatePairs([])).toEqual([]);
    expect(generatePairs(["a"])).toEqual([]);
  });

  test("three entries yield three unordered pairs", () => {
    const pairs = generatePairs(["c", "a", "b"]);
    expect(pairs).toEqual([
      { entryAId: "a", entryBId: "b" },
      { entryAId: "a", entryBId: "c" },
      { entryAId: "b", entryBId: "c" },
    ]);
  });
});

describe("winnerFromRanks", () => {
  test("lower rank wins", () => {
    expect(winnerFromRanks("a", "b", 1, 2)).toBe("a");
    expect(winnerFromRanks("a", "b", 2, 1)).toBe("b");
    expect(winnerFromRanks("a", "b", 1, 1)).toBeNull();
  });
});

describe("computeStandings", () => {
  test("sorts by wins, then draws, then score sum", () => {
    const rows = computeStandings(
      ["a", "b", "c"],
      [
        {
          entryAId: "a",
          entryBId: "b",
          status: "done",
          rankA: 1,
          rankB: 2,
          scoreA: 10,
          scoreB: 3,
          winnerEntryId: "a",
        },
        {
          entryAId: "a",
          entryBId: "c",
          status: "done",
          rankA: 1,
          rankB: 2,
          scoreA: 8,
          scoreB: 4,
          winnerEntryId: "a",
        },
        {
          entryAId: "b",
          entryBId: "c",
          status: "done",
          rankA: 1,
          rankB: 1,
          scoreA: 5,
          scoreB: 5,
          winnerEntryId: null,
        },
      ],
    );
    expect(rows.map((r) => r.entryId)).toEqual(["a", "c", "b"]);
    expect(rows[0]).toMatchObject({ wins: 2, draws: 0, losses: 0, rank: 1 });
    expect(rows[1]).toMatchObject({ wins: 0, draws: 1, losses: 1, rank: 2 });
    expect(rows[2]).toMatchObject({ wins: 0, draws: 1, losses: 1, rank: 3 });
    expect(rows[1]!.scoreSum).toBeGreaterThan(rows[2]!.scoreSum);
  });

  test("ignores pending matches and ties equal records", () => {
    const rows = computeStandings(
      ["x", "y"],
      [
        {
          entryAId: "x",
          entryBId: "y",
          status: "pending",
          rankA: null,
          rankB: null,
          scoreA: null,
          scoreB: null,
          winnerEntryId: null,
        },
      ],
    );
    expect(rows[0]!.rank).toBe(1);
    expect(rows[1]!.rank).toBe(1);
  });
});
