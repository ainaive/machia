import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { main, parseMatchArgs, resolveBot, summarize } from "./cli";
import type { MatchReplay } from "./index";

describe("match CLI", () => {
  test("parses game, bots and flags", () => {
    expect(parseMatchArgs(["sokoban", "a", "./b", "--seed", "7", "--ticks", "50", "--no-save"])).toEqual({
      gameId: "sokoban",
      bots: ["a", "./b"],
      seed: 7,
      maxTicks: 50,
      save: false,
    });
    expect(parseMatchArgs(["arena", "a", "b"])).toEqual({
      gameId: "arena",
      bots: ["a", "b"],
      save: true,
    });
  });

  test("rejects bad arguments", () => {
    expect(() => parseMatchArgs([])).toThrow(/game/);
    expect(() => parseMatchArgs(["arena", "a"])).toThrow(/at least two bots/);
    expect(() => parseMatchArgs(["arena", "a", "b", "--seed", "x"])).toThrow(/--seed/);
    expect(() => parseMatchArgs(["arena", "a", "b", "--fast"])).toThrow(/--fast/);
  });

  test("resolves a sample bot id or a bot folder", () => {
    const sample = resolveBot("turtle");
    expect(sample.botId).toBe("turtle");
    expect(sample.manifest.entry).toBe("bot.js");
    const folder = resolveBot(path.resolve(import.meta.dir, "../test-fixtures/echo-tick"));
    expect(folder.botId).toBe("echo-tick");
    expect(() => resolveBot("no-such-bot")).toThrow(/no-such-bot/);
  });

  test("runs a match, prints the result and saves a replay", async () => {
    const lines: string[] = [];
    const code = await main(["sokoban", "sokoban-pusher", "sokoban-hauler", "--seed", "1"], (l) =>
      lines.push(l),
    );
    const out = lines.join("\n");
    expect(code).toBe(0);
    expect(out).toContain("sokoban · seed 1");
    expect(out).toContain("sokoban-pusher");
    const id = out.match(/\b(m_[a-z0-9]+_[a-z0-9]+)\b/)![1]!;
    const file = path.join(process.env.MACHIA_REPLAYS_DIR!, `${id}.json`);
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).seed).toBe(1);
  }, 30_000);

  test("flags bots that broke the protocol", () => {
    const replay = {
      gameId: "arena",
      seed: 9,
      totalTicks: 40,
      players: [
        { playerId: 0, botId: "good", name: "good", stats: { timeouts: 0, invalidReplies: 0, crashed: false } },
        { playerId: 1, botId: "bad", name: "bad", stats: { timeouts: 3, invalidReplies: 1, crashed: true } },
      ],
      results: [
        { playerId: 0, rank: 1, score: 10 },
        { playerId: 1, rank: 2, score: 2 },
      ],
    } as unknown as MatchReplay;
    const [header, good, bad] = summarize(replay);
    expect(header).toBe("arena · seed 9 · 40 ticks");
    expect(good).not.toContain("!");
    expect(bad).toContain("! crashed, 3 timeouts, 1 invalid replies");
  });

  test("prints usage and fails on bad input", async () => {
    const lines: string[] = [];
    expect(await main(["chess", "a", "b"], (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toMatch(/Usage: bun run match/);
  });
});
