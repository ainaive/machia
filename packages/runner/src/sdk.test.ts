import { describe, expect, test } from "bun:test";
import path from "node:path";
import { SubprocessRunner } from "./subprocess";

// bots/machia.js is the SDK bot authors use; drive it through the real runner.
async function sdkBot() {
  const runner = new SubprocessRunner({ timeoutMs: 2000 });
  return runner.spawn({
    playerId: 0,
    botId: "sdk-bot",
    botDir: path.resolve(import.meta.dir, "../test-fixtures/sdk-bot"),
    manifest: { name: "sdk-bot", runtime: "node", entry: "bot.js" },
  });
}

describe("bot SDK (bots/machia.js)", () => {
  test("passes game_start to start() and replies with act()'s action", async () => {
    const bot = await sdkBot();
    try {
      await bot.sendStart({ playerId: 3 });
      expect(await bot.requestAction({ tick: 0 })).toEqual({
        action: { tick: 0, startedAs: 3 },
      });
    } finally {
      await bot.destroy();
    }
  });

  test("still replies exactly once when act() throws or returns nothing", async () => {
    const bot = await sdkBot();
    try {
      expect(await bot.requestAction({ tick: 0, mode: "throw" })).toEqual({ action: "WAIT" });
      expect(await bot.requestAction({ tick: 1, mode: "nothing" })).toEqual({ action: "WAIT" });
      expect(await bot.requestAction({ tick: 2 })).toMatchObject({ action: { tick: 2 } });
      expect(bot.stats()).toEqual({ timeouts: 0, invalidReplies: 0, crashed: false });
    } finally {
      await bot.destroy();
    }
  });

  test("an async act() answers observations in order", async () => {
    const bot = await sdkBot();
    try {
      for (let tick = 0; tick < 3; tick++) {
        expect(await bot.requestAction({ tick, mode: "slow" })).toMatchObject({
          action: { tick },
        });
      }
    } finally {
      await bot.destroy();
    }
  });
});
