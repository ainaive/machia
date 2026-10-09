import { describe, expect, test } from "bun:test";
import path from "node:path";
import { SubprocessRunner } from "./subprocess";

const fixturesRoot = path.resolve(import.meta.dir, "../test-fixtures");

function fixture(id: string, entry = "bot.js") {
  return {
    playerId: 0,
    botId: id,
    botDir: path.join(fixturesRoot, id),
    manifest: { name: id, runtime: "node" as const, entry },
  };
}

describe("SubprocessRunner", () => {
  test("refuses an entry outside the bot folder", async () => {
    const runner = new SubprocessRunner();
    await expect(
      runner.spawn(fixture("echo-tick", "../echo-tick/../../src/index.ts")),
    ).rejects.toThrow(/inside its folder/);
    await expect(
      runner.spawn(fixture("echo-tick", "/etc/passwd")),
    ).rejects.toThrow(/inside its folder/);
  });

  test("does not leak the server environment to bots", async () => {
    process.env.MACHIA_TEST_SECRET = "do-not-leak";
    try {
      const runner = new SubprocessRunner({ timeoutMs: 5000 });
      const bot = await runner.spawn(fixture("env-probe"));
      try {
        const reply = (await bot.requestAction({ tick: 0 })) as { env: string[] };
        expect(reply.env).toContain("MACHIA_PLAYER_ID");
        expect(reply.env).toContain("PATH");
        expect(reply.env).not.toContain("MACHIA_TEST_SECRET");
      } finally {
        await bot.destroy();
      }
    } finally {
      delete process.env.MACHIA_TEST_SECRET;
    }
  });
});
