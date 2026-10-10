import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { APP_SCHEMA_VERSION, migrateApp } from "./db";

function userVersion(db: Database): number {
  return db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
}

function tables(db: Database): string[] {
  return db
    .query<{ name: string }, []>(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((r) => r.name);
}

describe("app schema migrations", () => {
  test("a fresh database migrates to the latest version", () => {
    const db = new Database(":memory:");
    migrateApp(db);
    expect(userVersion(db)).toBe(APP_SCHEMA_VERSION);
    expect(tables(db)).toEqual(
      expect.arrayContaining(["contests", "entries", "contest_matches", "invite_codes"]),
    );
  });

  test("a database from before versioning is adopted with its data", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE contests (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, game_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('open', 'running', 'finished')),
        created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
        created_by TEXT NOT NULL
      );
    `);
    db.run(
      `INSERT INTO contests (id, title, game_id, status, created_at, created_by)
       VALUES ('c1', 'Old Cup', 'arena', 'finished', '2026-09-01', 'u1')`,
    );
    expect(userVersion(db)).toBe(0);
    migrateApp(db);
    expect(userVersion(db)).toBe(APP_SCHEMA_VERSION);
    expect(db.query(`SELECT title FROM contests WHERE id = 'c1'`).get()).toEqual({
      title: "Old Cup",
    });
  });

  test("migrating twice is a no-op", () => {
    const db = new Database(":memory:");
    migrateApp(db);
    migrateApp(db);
    expect(userVersion(db)).toBe(APP_SCHEMA_VERSION);
  });

  test("refuses a database newer than the server", () => {
    const db = new Database(":memory:");
    db.exec(`PRAGMA user_version = ${APP_SCHEMA_VERSION + 1}`);
    expect(() => migrateApp(db)).toThrow(/newer than this server/);
  });

  test("contest matches record a seed and each fixture exists once", () => {
    const db = new Database(":memory:");
    migrateApp(db);
    const insert = (id: string) =>
      db.run(
        `INSERT INTO contest_matches (id, contest_id, entry_a_id, entry_b_id, status, seed, created_at)
         VALUES (?, 'c1', 'e1', 'e2', 'pending', 7, '2026-10-10')`,
        [id],
      );
    insert("cm1");
    expect(db.query(`SELECT seed FROM contest_matches WHERE id = 'cm1'`).get()).toEqual({ seed: 7 });
    expect(() => insert("cm2")).toThrow(/UNIQUE/);
  });

  test("an upgrade collapses duplicate fixtures left by the old start race", () => {
    const db = new Database(":memory:");
    // contest_matches as it existed before versioning (user_version 0).
    db.exec(`
      CREATE TABLE contest_matches (
        id TEXT PRIMARY KEY, contest_id TEXT NOT NULL,
        entry_a_id TEXT NOT NULL, entry_b_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'error')),
        match_id TEXT, winner_entry_id TEXT, score_a REAL, score_b REAL,
        rank_a INTEGER, rank_b INTEGER, error TEXT, created_at TEXT NOT NULL
      );
    `);
    const insert = (id: string, a: string, b: string, status: string) =>
      db.run(
        `INSERT INTO contest_matches (id, contest_id, entry_a_id, entry_b_id, status, created_at)
         VALUES (?, 'c1', ?, ?, ?, '2026-09-20')`,
        [id, a, b, status],
      );
    // Double start: every pair inserted twice. Some copies already played.
    insert("ab-1", "e1", "e2", "pending");
    insert("ab-2", "e1", "e2", "done");
    insert("ac-1", "e1", "e3", "done");
    insert("ac-2", "e1", "e3", "done");
    insert("bc-1", "e2", "e3", "error");
    insert("bc-2", "e2", "e3", "pending");
    insert("solo", "e3", "e4", "pending");

    migrateApp(db);

    expect(userVersion(db)).toBe(APP_SCHEMA_VERSION);
    const kept = db
      .query<{ id: string }, []>(`SELECT id FROM contest_matches ORDER BY id`)
      .all()
      .map((r) => r.id);
    // One row per fixture: a played game, else a queued one, else the oldest.
    expect(kept).toEqual(["ab-2", "ac-1", "bc-2", "solo"]);
  });

  test("entries record the hash of the files that were approved", () => {
    const db = new Database(":memory:");
    migrateApp(db);
    const columns = db
      .query<{ name: string }, []>(`SELECT name FROM pragma_table_info('entries')`)
      .all()
      .map((c) => c.name);
    expect(columns).toContain("approved_hash");
  });
});
