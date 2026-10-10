import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMatch } from "./index";
import { BwrapSandbox, bwrapArgs, detectDelegatedCgroup } from "./sandbox";
import { SubprocessRunner } from "./subprocess";

const fixtures = path.resolve(import.meta.dir, "../test-fixtures");
const samples = path.resolve(import.meta.dir, "../../../bots");
const mergedUsr = [
  { name: "bin", symlinkTo: "usr/bin" },
  { name: "lib", symlinkTo: "usr/lib" },
];

describe("sandbox arguments", () => {
  test("expose only system dirs, /proc, /dev, a private /tmp and the mount dir", () => {
    const args = bwrapArgs("/srv/bots", [...mergedUsr, { name: "lib64" }], "/app/turtle");
    expect(args.slice(0, 3)).toEqual(["--unshare-all", "--die-with-parent", "--new-session"]);
    const binds = args.flatMap((a, i) => (a === "--ro-bind" || a === "--bind" ? [`${args[i + 1]}->${args[i + 2]}`] : []));
    expect(binds).toEqual(["/usr->/usr", "/lib64->/lib64", "/srv/bots->/app"]);
    expect(args).not.toContain("--bind"); // nothing writable from the host
    expect(args.join(" ")).toContain("--symlink usr/lib /lib");
    expect(args.join(" ")).toContain("--tmpfs /tmp");
    expect(args.slice(-2)).toEqual(["--chdir", "/app/turtle"]);
  });

  test("without cgroups, bwrap runs the bot directly", () => {
    const sandbox = new BwrapSandbox({ layout: mergedUsr });
    const { command, args } = sandbox.wrap("/srv/bot", ["node", "/app/bot.js"]);
    expect(command).toBe("bwrap");
    expect(args.slice(-2)).toEqual(["node", "/app/bot.js"]);
  });

  test("with cgroups, the bot enters its own limited cgroup before bwrap starts", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "machia-cg-"));
    const sandbox = new BwrapSandbox({ layout: mergedUsr, cgroupRoot: root, limits: { memoryMb: 64 } });
    sandbox.setupCgroups();
    expect(readFileSync(path.join(root, "cgroup.subtree_control"), "utf8")).toBe("+memory +pids +cpu");
    const { command, args } = sandbox.wrap("/srv/bot", ["node", "/app/bot.js"]);
    expect(command).toBe("/bin/sh");
    const cgroup = args[3]!;
    expect(path.dirname(cgroup)).toBe(path.join(root, "bots"));
    expect(readFileSync(path.join(cgroup, "memory.max"), "utf8")).toBe(String(64 * 1024 * 1024));
    expect(readFileSync(path.join(cgroup, "pids.max"), "utf8")).toBe("32");
    expect(readFileSync(path.join(cgroup, "cpu.max"), "utf8")).toBe("100000 100000");
    expect(args.slice(4, 5)).toEqual(["bwrap"]);
    expect(args.slice(-2)).toEqual(["node", "/app/bot.js"]);
  });

  test("finds the delegated cgroup above the process's own", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "machia-cg-")), "cgroup");
    writeFileSync(file, "0::/system.slice/machia.service/server\n");
    expect(detectDelegatedCgroup(file)).toBe("/sys/fs/cgroup/system.slice/machia.service");
  });
});

// The real thing needs Linux, bubblewrap and (on Ubuntu 24.04+) its AppArmor profile.
const sandboxWorks = (() => {
  if (process.platform !== "linux") return false;
  try {
    new BwrapSandbox().selfTest();
    return true;
  } catch {
    return false;
  }
})();

function probe(sandbox: BwrapSandbox) {
  return new SubprocessRunner({ sandbox, timeoutMs: 5000 }).spawn({
    playerId: 0,
    botId: "sandbox-probe",
    botDir: path.join(fixtures, "sandbox-probe"),
    manifest: { name: "probe", runtime: "node", entry: "bot.js" },
  });
}

describe.skipIf(!sandboxWorks)("bwrap sandbox (Linux)", () => {
  test("a bot sees only its own folder, read-only, and has no network", async () => {
    const bot = await probe(new BwrapSandbox());
    try {
      const reply = (await bot.requestAction({ tick: 0, hostPath: fixtures })) as {
        action: Record<string, unknown>;
      };
      expect(reply.action).toEqual({
        cwd: "/app",
        ownFolder: true,
        writeOwnFolder: false,
        tmp: true,
        hostPath: false,
        etc: false,
        network: expect.not.stringMatching(/^connected$/),
      });
      expect(existsSync(path.join(fixtures, "sandbox-probe", "written"))).toBe(false);
    } finally {
      await bot.destroy();
    }
  });

  test("sample bots still load their shared helpers when bots/ is the mount", async () => {
    const spec = {
      botId: "quoridor-rush",
      botDir: path.join(samples, "quoridor-rush"),
      mountDir: samples,
      manifest: { name: "rush", runtime: "node" as const, entry: "bot.js" },
    };
    const replay = await runMatch({
      id: "sandboxed",
      gameId: "quoridor",
      seed: 5,
      maxTicks: 40,
      players: [spec, spec],
      runner: new SubprocessRunner({ sandbox: new BwrapSandbox() }),
    });
    expect(replay.players.map((p) => p.stats)).toEqual([
      { timeouts: 0, invalidReplies: 0, crashed: false },
      { timeouts: 0, invalidReplies: 0, crashed: false },
    ]);
  }, 30_000);
});

// Resource limits also need a delegated cgroup, e.g. inside
// `systemd-run -p Delegate=yes -p DelegateSubgroup=server ...` (see docs/deploy.md).
const cgroupRoot = process.env.MACHIA_TEST_CGROUP_ROOT;

describe.skipIf(!sandboxWorks || !cgroupRoot)("bwrap sandbox cgroup limits (Linux)", () => {
  const limited = () => {
    const sandbox = new BwrapSandbox({ cgroupRoot, limits: { memoryMb: 128, pids: 32 } });
    sandbox.setupCgroups();
    return sandbox;
  };

  test("a bot over its memory limit is killed and reported as crashed", async () => {
    const bot = await probe(limited());
    try {
      expect(await bot.requestAction({ tick: 0, mode: "memory" })).toBeNull();
      expect(bot.stats().crashed).toBe(true);
    } finally {
      await bot.destroy();
    }
  }, 30_000);

  test("a bot cannot start more processes than its limit", async () => {
    const bot = await probe(limited());
    try {
      const reply = (await bot.requestAction({ tick: 0, mode: "fork" })) as {
        action: { failed: number };
      };
      expect(reply.action.failed).toBeGreaterThan(50);
    } finally {
      await bot.destroy();
    }
  }, 30_000);
});
