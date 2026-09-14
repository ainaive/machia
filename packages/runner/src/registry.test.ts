import { describe, expect, test } from "bun:test";
import { getGame, listGames } from "./registry";

describe("game registry", () => {
  test("lists arena, bomber, and tanks", () => {
    const games = listGames();
    const ids = games.map((g) => g.id).sort();
    expect(ids).toEqual(["arena", "bomber", "tanks"]);
    for (const g of games) {
      expect(g.minPlayers).toBeGreaterThanOrEqual(2);
      expect(g.maxPlayers).toBeGreaterThanOrEqual(g.minPlayers);
      expect(g.name.length).toBeGreaterThan(0);
    }
  });

  test("getGame returns plugins", () => {
    expect(getGame("arena").id).toBe("arena");
    expect(getGame("bomber").id).toBe("bomber");
    expect(getGame("tanks").id).toBe("tanks");
  });

  test("getGame rejects unknown id", () => {
    expect(() => getGame("nope")).toThrow(/Unknown game/);
  });
});
