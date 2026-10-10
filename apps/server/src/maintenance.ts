/**
 * Daily upkeep, run by deploy/machia-maintenance.timer:
 *
 *   bun run --filter @machia/server maintenance
 *
 * Backs up the database (a consistent snapshot, safe while the API runs)
 * and uploaded bots, keeps the newest backups, and deletes practice replays
 * past their retention. Contest replays are kept.
 */
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { defaultDbPath, defaultUploadsDir } from "./db";
import { replaysDir } from "./matches";

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

/**
 * Writes a backup under a hidden temporary name and publishes it only once
 * complete: a failed run must never leave a file that retention would count
 * as a backup (and keep in place of a good, older one).
 */
function publish(file: string, write: (partial: string) => void): string {
  const partial = path.join(path.dirname(file), `.${path.basename(file)}.partial`);
  try {
    write(partial);
    renameSync(partial, file);
    return file;
  } catch (err) {
    rmSync(partial, { force: true });
    throw err;
  }
}

/** Snapshot of the database via VACUUM INTO, read-only on the live file. */
export function backupDatabase(dbPath: string, backupDir: string, now = new Date()): string {
  mkdirSync(backupDir, { recursive: true });
  return publish(path.join(backupDir, `machia-${stamp(now)}.db`), (partial) => {
    const db = new Database(dbPath, { readonly: true });
    try {
      db.run("VACUUM INTO ?", [partial]);
    } finally {
      db.close();
    }
  });
}

/** tar.gz of every uploaded bot, or null if nothing was ever uploaded. */
export function backupUploads(uploadsDir: string, backupDir: string, now = new Date()): string | null {
  if (!existsSync(uploadsDir)) return null;
  mkdirSync(backupDir, { recursive: true });
  return publish(path.join(backupDir, `uploads-${stamp(now)}.tar.gz`), (partial) => {
    const tar = spawnSync("tar", ["-czf", partial, "-C", uploadsDir, "."], { encoding: "utf8" });
    if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr || tar.error?.message}`);
  });
}

const BACKUP_RE = /^(machia|uploads)-\d{8}-\d{6}\.(db|tar\.gz)$/;

/** Deletes all but the newest `keep` backups of each kind; returns what it deleted. */
export function pruneBackups(backupDir: string, keep: number): string[] {
  if (!existsSync(backupDir)) return [];
  const byKind = new Map<string, string[]>();
  for (const name of readdirSync(backupDir)) {
    const match = BACKUP_RE.exec(name);
    if (match) byKind.set(match[1]!, [...(byKind.get(match[1]!) ?? []), name]);
  }
  const deleted: string[] = [];
  for (const names of byKind.values()) {
    for (const name of names.sort().reverse().slice(keep)) {
      rmSync(path.join(backupDir, name));
      deleted.push(name);
    }
  }
  return deleted;
}

/** Deletes replays older than `maxAgeDays` unless a contest game uses them; returns their ids. */
export function pruneReplays(
  dir: string,
  contestMatchIds: Set<string>,
  maxAgeDays: number,
  now = new Date(),
): string[] {
  if (!existsSync(dir)) return [];
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  const deleted: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    const file = path.join(dir, name);
    if (contestMatchIds.has(id) || statSync(file).mtimeMs >= cutoff) continue;
    rmSync(file);
    deleted.push(id);
  }
  return deleted;
}

function count(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number`);
  return value;
}

export function main(env: NodeJS.ProcessEnv = process.env): void {
  const dbPath = defaultDbPath();
  const backupDir = env.MACHIA_BACKUP_DIR?.trim() || path.join(path.dirname(dbPath), "backups");
  const keep = count(env, "MACHIA_BACKUP_KEEP", 14);
  const replayDays = count(env, "MACHIA_REPLAY_DAYS", 30);

  console.log(`backed up database → ${backupDatabase(dbPath, backupDir)}`);
  const uploads = backupUploads(defaultUploadsDir(), backupDir);
  console.log(uploads ? `backed up uploads → ${uploads}` : "no uploads to back up");
  console.log(`pruned ${pruneBackups(backupDir, keep).length} old backups (keeping ${keep} of each)`);

  if (replayDays > 0) {
    const db = new Database(dbPath, { readonly: true });
    const contestIds = new Set(
      db
        .query<{ match_id: string }, []>(
          `SELECT match_id FROM contest_matches WHERE match_id IS NOT NULL`,
        )
        .all()
        .map((r) => r.match_id),
    );
    db.close();
    const removed = pruneReplays(replaysDir(), contestIds, replayDays);
    console.log(`deleted ${removed.length} practice replays older than ${replayDays} days`);
  }
}

if (import.meta.main) main();
