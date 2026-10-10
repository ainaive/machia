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
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { defaultDbPath, defaultUploadsDir } from "./db";
import { replaysDir } from "./matches";

/** UTC time plus a random suffix: two runs in the same second must not share a file. */
function stamp(now: Date): string {
  const time = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${time}-${randomBytes(2).toString("hex")}`;
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

// Older backups have no random suffix; keep rotating them too.
const BACKUP_RE = /^(machia|uploads)-\d{8}-\d{6}(?:-[0-9a-f]{4})?\.(db|tar\.gz)$/;

/** What a cleanup pass removed, and what it couldn't (it carries on past those). */
export interface Pruned {
  deleted: string[];
  failed: string[];
}

/** Deletes all but the newest `keep` backups of each kind. */
export function pruneBackups(backupDir: string, keep: number): Pruned {
  const pruned: Pruned = { deleted: [], failed: [] };
  if (!existsSync(backupDir)) return pruned;
  const byKind = new Map<string, string[]>();
  for (const name of readdirSync(backupDir)) {
    const match = BACKUP_RE.exec(name);
    if (match) byKind.set(match[1]!, [...(byKind.get(match[1]!) ?? []), name]);
  }
  for (const names of byKind.values()) {
    for (const name of names.sort().reverse().slice(keep)) {
      try {
        rmSync(path.join(backupDir, name));
        pruned.deleted.push(name);
      } catch {
        pruned.failed.push(name);
      }
    }
  }
  return pruned;
}

/** Deletes replays older than `maxAgeDays` unless a contest game uses them (by id). */
export function pruneReplays(
  dir: string,
  contestMatchIds: Set<string>,
  maxAgeDays: number,
  now = new Date(),
): Pruned {
  const pruned: Pruned = { deleted: [], failed: [] };
  if (!existsSync(dir)) return pruned;
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    if (contestMatchIds.has(id)) continue;
    try {
      const file = path.join(dir, name);
      if (statSync(file).mtimeMs >= cutoff) continue;
      rmSync(file);
      pruned.deleted.push(id);
    } catch {
      pruned.failed.push(id);
    }
  }
  return pruned;
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
  const failed: string[] = [];
  const backups = pruneBackups(backupDir, keep);
  failed.push(...backups.failed.map((name) => `backup ${name}`));
  console.log(`pruned ${backups.deleted.length} old backups (keeping ${keep} of each)`);

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
    const replays = pruneReplays(replaysDir(), contestIds, replayDays);
    failed.push(...replays.failed.map((id) => `replay ${id}`));
    console.log(`deleted ${replays.deleted.length} practice replays older than ${replayDays} days`);
  }

  // Both passes ran to the end; now make the run fail so systemd records it.
  if (failed.length > 0) {
    console.error(`could not remove: ${failed.join(", ")}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
