import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { getMigrations } from "better-auth/db/migration";
import {
  createMachiaAuth,
  setAuth,
  withInviteBypass,
} from "./auth";

const ROOT = path.resolve(import.meta.dir, "../../..");
const DEFAULT_DB = path.join(ROOT, "data/machia.db");

let sqlite: Database | null = null;

const APP_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'running', 'finished')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  bot_name TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS contest_matches (
  id TEXT PRIMARY KEY,
  contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  entry_a_id TEXT NOT NULL REFERENCES entries(id),
  entry_b_id TEXT NOT NULL REFERENCES entries(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'error')),
  match_id TEXT,
  winner_entry_id TEXT,
  score_a REAL,
  score_b REAL,
  rank_a INTEGER,
  rank_b INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_contest ON entries(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_matches_contest ON contest_matches(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_matches_status ON contest_matches(status);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
`;

function defaultDbPath(): string {
  return process.env.MACHIA_DB ?? DEFAULT_DB;
}

export function defaultUploadsDir(): string {
  return process.env.MACHIA_UPLOADS_DIR ?? path.join(ROOT, "data/uploads");
}

function tableExists(db: Database, name: string): boolean {
  const row = db
    .query<{ name: string }, [string]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    )
    .get(name);
  return !!row;
}

function tableColumns(db: Database, name: string): Set<string> {
  const rows = db.query<{ name: string }, []>(`PRAGMA table_info(${name})`).all();
  return new Set(rows.map((row) => row.name));
}

function rebuildLegacyUsers(db: Database): void {
  if (!tableExists(db, "users")) return;
  const cols = tableColumns(db, "users");
  if (!cols.has("password_hash")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  if (tableExists(db, "sessions") && tableColumns(db, "sessions").has("user_id")) {
    db.exec(`DROP TABLE sessions`);
  }
  db.exec(`ALTER TABLE users RENAME TO users_legacy`);
  db.exec("PRAGMA foreign_keys = ON");
}

function copyLegacyUsers(db: Database): void {
  if (!tableExists(db, "users_legacy") || !tableExists(db, "users")) return;
  const dest = tableColumns(db, "users");
  const idCol = dest.has("id") ? "id" : null;
  if (!idCol) return;
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    INSERT OR IGNORE INTO users (id, name, email, emailVerified, image, createdAt, updatedAt, username, role)
    SELECT
      id,
      username,
      lower(username) || '@invalid.local',
      0,
      NULL,
      created_at,
      created_at,
      username,
      role
    FROM users_legacy
  `);
  db.exec(`DROP TABLE users_legacy`);
  db.exec("PRAGMA foreign_keys = ON");
}

async function migrateAuth(db: Database) {
  rebuildLegacyUsers(db);
  const auth = createMachiaAuth(db);
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
  copyLegacyUsers(db);
  return auth;
}

async function seedAdmin(
  db: Database,
  auth: ReturnType<typeof createMachiaAuth>,
): Promise<void> {
  const email = process.env.MACHIA_ADMIN_EMAIL?.trim().toLowerCase();
  const username = process.env.MACHIA_ADMIN_USERNAME?.trim();
  const password = process.env.MACHIA_ADMIN_PASSWORD;
  if (!email || !username || !password) return;

  const existing = db
    .query<{ id: string }, [string, string]>(
      `SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1`,
    )
    .get(email, username);

  if (!existing) {
    await withInviteBypass(async () => {
      await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: username,
          username,
        },
      });
    });
  } else {
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(password);
    db.run(`UPDATE accounts SET password = ? WHERE userId = ? AND providerId = 'credential'`, [
      hash,
      existing.id,
    ]);
    db.run(`UPDATE users SET email = ?, username = ?, name = ? WHERE id = ?`, [
      email,
      username,
      username,
      existing.id,
    ]);
  }

  db.run(`UPDATE users SET role = 'admin' WHERE email = ? OR username = ?`, [email, username]);
}

export async function openDatabase(filePath?: string): Promise<Database> {
  const resolved = filePath ?? defaultDbPath();
  mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.exec("PRAGMA foreign_keys = ON");
  const auth = await migrateAuth(db);
  db.exec(APP_SCHEMA);
  db.run(
    `UPDATE contest_matches SET status = 'pending', error = NULL WHERE status = 'running'`,
  );
  await seedAdmin(db, auth);
  setAuth(auth);
  return db;
}

export async function getDb(): Promise<Database> {
  if (!sqlite) sqlite = await openDatabase();
  return sqlite;
}

export async function resetDatabase(filePath: string): Promise<Database> {
  sqlite?.close();
  sqlite = null;
  setAuth(null);
  sqlite = await openDatabase(filePath);
  return sqlite;
}

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
  setAuth(null);
}
