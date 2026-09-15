import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { newId } from "./ids";

const ROOT = path.resolve(import.meta.dir, "../../..");
const DEFAULT_DB = path.join(ROOT, "data/machia.db");

let sqlite: Database | null = null;

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_contest ON entries(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_matches_contest ON contest_matches(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_matches_status ON contest_matches(status);
`;

function defaultDbPath(): string {
  return process.env.MACHIA_DB ?? DEFAULT_DB;
}

export function defaultUploadsDir(): string {
  return process.env.MACHIA_UPLOADS_DIR ?? path.join(ROOT, "data/uploads");
}

function migrate(db: Database): void {
  db.exec(SCHEMA);
  db.run(
    `UPDATE contest_matches SET status = 'pending', error = NULL WHERE status = 'running'`,
  );
}

async function seedAdmin(db: Database): Promise<void> {
  const username = process.env.MACHIA_ADMIN_USERNAME?.trim();
  const password = process.env.MACHIA_ADMIN_PASSWORD;
  if (!username || !password) return;

  const existing = db
    .query<{ id: string; role: string }, [string]>(
      `SELECT id, role FROM users WHERE username = ?`,
    )
    .get(username);
  const hash = await Bun.password.hash(password);
  if (existing) {
    db.run(`UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?`, [
      hash,
      existing.id,
    ]);
    return;
  }
  db.run(
    `INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`,
    [newId("u"), username, hash, new Date().toISOString()],
  );
}

export async function openDatabase(filePath?: string): Promise<Database> {
  const resolved = filePath ?? defaultDbPath();
  mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  await seedAdmin(db);
  return db;
}

export async function getDb(): Promise<Database> {
  if (!sqlite) sqlite = await openDatabase();
  return sqlite;
}

export async function resetDatabase(filePath: string): Promise<Database> {
  sqlite?.close();
  sqlite = null;
  sqlite = await openDatabase(filePath);
  return sqlite;
}

export function closeDatabase(): void {
  sqlite?.close();
  sqlite = null;
}
