import { describe, expect, test } from "bun:test";
import path from "node:path";
import { runMatch } from "./index";

const botsRoot = path.resolve(import.meta.dir, "../../../bots");

describe("runMatch with random-walker", () => {
  test("completes a short 2-player match", async () => {
    const botDir = path.join(botsRoot, "random-walker");
    const replay = await runMatch({
      id: "test-match",
      maxTicks: 20,
      players: [
        {
          botId: "random-walker",
          botDir,
          manifest: { name: "Random Walker", runtime: "node", entry: "bot.js" },
        },
        {
          botId: "random-walker",
          botDir,
          manifest: { name: "Random Walker", runtime: "node", entry: "bot.js" },
        },
      ],
    });

    expect(replay.ticks.length).toBeGreaterThan(0);
    expect(replay.ticks.length).toBeLessThanOrEqual(20);
    expect(replay.results).toHaveLength(2);
    expect(replay.mapSize).toBe(15);
  }, 15_000);
});
