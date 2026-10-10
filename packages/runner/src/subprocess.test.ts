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

  test("destroy kills a bot that ignores SIGTERM, and its children", async () => {
    const runner = new SubprocessRunner({ timeoutMs: 5000 });
    const bot = await runner.spawn(fixture("stubborn"));
    const reply = (await bot.requestAction({ tick: 0 })) as {
      pid: number;
      childPid: number;
    };
    expect(isRunning(reply.pid)).toBe(true);
    expect(isRunning(reply.childPid)).toBe(true);

    await bot.destroy();

    expect(await waitUntilGone(reply.pid)).toBe(true);
    expect(await waitUntilGone(reply.childPid)).toBe(true);
  });

  test("destroy returns at once when the bot process never started", async () => {
    const runner = new SubprocessRunner({ nodePath: "/nonexistent/node" });
    const bot = await runner.spawn(fixture("echo-tick"));
    expect(await bot.requestAction({ tick: 0 })).toBeNull();
    const started = Date.now();
    await bot.destroy();
    expect(Date.now() - started).toBeLessThan(250);
  });

  test("late replies are dropped instead of answering the next tick", async () => {
    const runner = new SubprocessRunner({ timeoutMs: 100, startupTimeoutMs: 100 });
    const bot = await runner.spawn(fixture("slow-start"));
    try {
      expect(await bot.requestAction({ tick: 0 })).toBeNull();
      expect(await bot.requestAction({ tick: 1 })).toBeNull();
      // Both late replies arrive while nothing is pending.
      await Bun.sleep(600);
      expect(await bot.requestAction({ tick: 2 })).toMatchObject({ tick: 2 });
      expect(await bot.requestAction({ tick: 3 })).toMatchObject({ tick: 3 });
    } finally {
      await bot.destroy();
    }
  });

  test("the first observation gets the longer startup budget", async () => {
    const runner = new SubprocessRunner({ timeoutMs: 100 });
    const bot = await runner.spawn(fixture("slow-start"));
    try {
      expect(await bot.requestAction({ tick: 0 })).toMatchObject({ tick: 0 });
      expect(await bot.requestAction({ tick: 1 })).toMatchObject({ tick: 1 });
    } finally {
      await bot.destroy();
    }
  });

  test("an oversized reply line counts as invalid without desyncing", async () => {
    const runner = new SubprocessRunner({ timeoutMs: 5000 });
    const bot = await runner.spawn(fixture("bloated"));
    try {
      expect(await bot.requestAction({ tick: 0 })).toBeNull();
      expect(await bot.requestAction({ tick: 1 })).toMatchObject({ tick: 1 });
    } finally {
      await bot.destroy();
    }
  });
});

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntilGone(pid: number, ms = 2000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isRunning(pid)) return true;
    await Bun.sleep(25);
  }
  return !isRunning(pid);
}
