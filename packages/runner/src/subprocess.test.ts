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
});
