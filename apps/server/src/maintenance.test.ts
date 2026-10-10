import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { backupDatabase, backupUploads, pruneBackups, pruneReplays } from "./maintenance";

const temp = () => mkdtempSync(path.join(tmpdir(), "machia-maint-"));
const NOW = new Date("2026-10-10T04:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("maintenance", () => {
  test("backs up the database as a consistent copy while it stays open", () => {
    const dir = temp();
    const dbPath = path.join(dir, "machia.db");
    const live = new Database(dbPath);
    live.run("CREATE TABLE contests (id TEXT)");
    live.run("INSERT INTO contests VALUES ('c1')");

    const file = backupDatabase(dbPath, path.join(dir, "backups"), NOW);
    expect(path.basename(file)).toMatch(/^machia-20261010-040000-[0-9a-f]{4}\.db$/);
    expect(new Database(file, { readonly: true }).query("SELECT id FROM contests").all()).toEqual([
      { id: "c1" },
    ]);
    // Two runs in the same second must not share (and clobber) a file.
    const again = backupDatabase(dbPath, path.join(dir, "backups"), NOW);
    expect(again).not.toBe(file);
    expect(readdirSync(path.join(dir, "backups"))).toHaveLength(2);
    live.close();
  });

  test("archives uploaded bots", () => {
    const dir = temp();
    mkdirSync(path.join(dir, "uploads", "u1", "e1"), { recursive: true });
    writeFileSync(path.join(dir, "uploads", "u1", "e1", "bot.js"), "// bot");

    const file = backupUploads(path.join(dir, "uploads"), path.join(dir, "backups"), NOW)!;
    expect(path.basename(file)).toMatch(/^uploads-20261010-040000-[0-9a-f]{4}\.tar\.gz$/);
    const listing = spawnSync("tar", ["-tzf", file], { encoding: "utf8" }).stdout;
    expect(listing).toContain("u1/e1/bot.js");
    expect(backupUploads(path.join(dir, "missing"), path.join(dir, "backups"), NOW)).toBeNull();
  });

  test("backups are readable only by the user that made them", () => {
    const dir = temp();
    const dbPath = path.join(dir, "machia.db");
    new Database(dbPath).close();
    mkdirSync(path.join(dir, "uploads", "u1"), { recursive: true });
    writeFileSync(path.join(dir, "uploads", "u1", "bot.js"), "// bot");
    // Somewhere outside data/, which is what would otherwise keep them private.
    const backupDir = path.join(dir, "elsewhere", "backups");

    const mode = (file: string) => statSync(file).mode & 0o777;
    expect(mode(backupDatabase(dbPath, backupDir, NOW))).toBe(0o600);
    expect(mode(backupUploads(path.join(dir, "uploads"), backupDir, NOW)!)).toBe(0o600);
    expect(mode(backupDir)).toBe(0o700);
    expect(mode(path.join(dir, "elsewhere"))).toBe(0o700);
  });

  // Root can read anything, so the unreadable-file failure can't be staged.
  test.skipIf(process.getuid?.() === 0)("a failed archive leaves nothing that looks like a backup", () => {
    const dir = temp();
    const bot = path.join(dir, "uploads", "u1", "e1");
    mkdirSync(bot, { recursive: true });
    writeFileSync(path.join(bot, "bot.js"), "// bot");
    chmodSync(path.join(bot, "bot.js"), 0o000);
    try {
      expect(() => backupUploads(path.join(dir, "uploads"), path.join(dir, "backups"), NOW)).toThrow(/tar failed/);
      // A partial archive here would count toward retention and push out a good one.
      expect(readdirSync(path.join(dir, "backups"))).toEqual([]);
    } finally {
      chmodSync(path.join(bot, "bot.js"), 0o644);
    }
  });

  test("keeps the newest backups of each kind", () => {
    const dir = temp();
    const names = [
      "machia-20261001-040000-a1b2.db",
      "machia-20261002-040000-c3d4.db",
      "machia-20261003-040000-e5f6.db",
      "uploads-20261001-040000-0a0b.tar.gz",
      "uploads-20261003-040000-0c0d.tar.gz",
      "notes.txt",
    ];
    for (const n of names) writeFileSync(path.join(dir, n), "");

    expect(pruneBackups(dir, 2)).toEqual({ deleted: ["machia-20261001-040000-a1b2.db"], failed: [] });
    expect(readdirSync(dir).sort()).toEqual([
      "machia-20261002-040000-c3d4.db",
      "machia-20261003-040000-e5f6.db",
      "notes.txt",
      "uploads-20261001-040000-0a0b.tar.gz",
      "uploads-20261003-040000-0c0d.tar.gz",
    ]);
  });

  test("one backup that can't be removed doesn't stop the rest of the cleanup", () => {
    const dir = temp();
    writeFileSync(path.join(dir, "machia-20261001-040000-0001.db"), "");
    // A directory with a backup's name: rmSync without recursive refuses it.
    mkdirSync(path.join(dir, "machia-20261002-040000-0002.db", "x"), { recursive: true });
    writeFileSync(path.join(dir, "machia-20261003-040000-0003.db"), "");
    writeFileSync(path.join(dir, "machia-20261004-040000-0004.db"), "");

    expect(pruneBackups(dir, 1)).toEqual({
      deleted: ["machia-20261003-040000-0003.db", "machia-20261001-040000-0001.db"],
      failed: ["machia-20261002-040000-0002.db"],
    });
  });

  test("deletes old practice replays but never a contest's", () => {
    const dir = temp();
    const replay = (id: string, age: number) => {
      const file = path.join(dir, `${id}.json`);
      writeFileSync(file, "{}");
      utimesSync(file, daysAgo(age), daysAgo(age));
    };
    replay("m_old_practice", 40);
    replay("m_old_contest", 40);
    replay("m_new_practice", 3);

    const pruned = pruneReplays(dir, new Set(["m_old_contest"]), 30, NOW);
    expect(pruned).toEqual({ deleted: ["m_old_practice"], failed: [] });
    expect(readdirSync(dir).sort()).toEqual(["m_new_practice.json", "m_old_contest.json"]);
  });
});
