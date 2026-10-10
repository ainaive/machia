import type { Database } from "bun:sqlite";
import { getGame, randomSeed, type MatchPlayerSpec } from "@machia/runner";
import type { PublicUser } from "./auth";
import { botDirForEntry, parseBotFiles, readBotFiles, writeBotFiles } from "./botFiles";
import { defaultUploadsDir, getDb } from "./db";
import { HttpError } from "./errors";
import { newId } from "./ids";
import { runPlayersMatch } from "./matches";
import {
  computeStandings,
  generateFixtures,
  winnerFromRanks,
  type StandingRow,
} from "./standings";

export type ContestStatus = "open" | "running" | "finished";
export type EntryStatus = "pending" | "approved" | "rejected";

interface ContestRow {
  id: string;
  title: string;
  game_id: string;
  status: ContestStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  created_by: string;
}

interface EntryRow {
  id: string;
  contest_id: string;
  user_id: string;
  status: EntryStatus;
  bot_name: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  username: string;
}

interface ContestMatchRow {
  id: string;
  contest_id: string;
  entry_a_id: string;
  entry_b_id: string;
  status: string;
  match_id: string | null;
  winner_entry_id: string | null;
  score_a: number | null;
  score_b: number | null;
  rank_a: number | null;
  rank_b: number | null;
  error: string | null;
  seed: number | null;
  created_at: string;
}

let contestQueueRunning = false;

export function isContestWorkerBusy(): boolean {
  return contestQueueRunning;
}

export async function waitForContestWorkerIdle(): Promise<void> {
  while (contestQueueRunning) {
    await Bun.sleep(25);
  }
}

function contestMaxTicks(): number | undefined {
  const raw = process.env.MACHIA_CONTEST_MAX_TICKS;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function contestById(id: string): Promise<ContestRow> {
  const db = await getDb();
  const row = db
    .query<ContestRow, [string]>(`SELECT * FROM contests WHERE id = ?`)
    .get(id);
  if (!row) throw new HttpError(404, "Contest not found");
  return row;
}

function publicContest(row: ContestRow) {
  return {
    id: row.id,
    title: row.title,
    gameId: row.game_id,
    status: row.status,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function publicEntry(row: EntryRow) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    botName: row.bot_name,
    status: row.status,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listContests() {
  const db = await getDb();
  const rows = db
    .query<ContestRow, []>(
      `SELECT * FROM contests ORDER BY created_at DESC`,
    )
    .all();
  return rows.map(publicContest);
}

export async function createContest(
  admin: PublicUser,
  title: string,
  gameId: string,
) {
  const trimmed = title.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new HttpError(400, "Title must be 1–80 characters");
  }
  try {
    getGame(gameId);
  } catch {
    throw new HttpError(400, `Unknown game: ${gameId}`);
  }
  const db = await getDb();
  const id = newId("c");
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO contests (id, title, game_id, status, created_at, created_by)
     VALUES (?, ?, ?, 'open', ?, ?)`,
    [id, trimmed, gameId, now, admin.id],
  );
  return publicContest(await contestById(id));
}

async function listEntries(contestId: string): Promise<EntryRow[]> {
  const db = await getDb();
  return db
    .query<EntryRow, [string]>(
      `SELECT e.*, u.username
       FROM entries e
       JOIN users u ON u.id = e.user_id
       WHERE e.contest_id = ?
       ORDER BY e.created_at ASC`,
    )
    .all(contestId);
}

async function listContestMatches(contestId: string): Promise<ContestMatchRow[]> {
  const db = await getDb();
  return db
    .query<ContestMatchRow, [string]>(
      `SELECT * FROM contest_matches WHERE contest_id = ? ORDER BY created_at ASC, rowid ASC`,
    )
    .all(contestId);
}

function standingsFor(
  entries: EntryRow[],
  matches: ContestMatchRow[],
): Array<StandingRow & { username: string; botName: string | null }> {
  const approved = entries.filter((e) => e.status === "approved");
  const rows = computeStandings(
    approved.map((e) => e.id),
    matches.map((m) => ({
      entryAId: m.entry_a_id,
      entryBId: m.entry_b_id,
      status: m.status,
      rankA: m.rank_a,
      rankB: m.rank_b,
      scoreA: m.score_a,
      scoreB: m.score_b,
      winnerEntryId: m.winner_entry_id,
    })),
  );
  const byId = new Map(entries.map((e) => [e.id, e]));
  return rows.map((row) => {
    const entry = byId.get(row.entryId);
    return {
      ...row,
      username: entry?.username ?? "?",
      botName: entry?.bot_name ?? null,
    };
  });
}

export async function getContestDetail(id: string, viewer: PublicUser | null) {
  const contest = await contestById(id);
  const game = getGame(contest.game_id);
  const entries = await listEntries(id);
  const matches = await listContestMatches(id);
  return {
    contest: publicContest(contest),
    game: {
      id: game.id,
      name: game.name,
      description: game.description,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
    },
    entries: entries.map(publicEntry),
    myEntry: (() => {
      const mine = viewer
        ? entries.find((e) => e.user_id === viewer.id)
        : undefined;
      return mine ? publicEntry(mine) : null;
    })(),
    matches: matches.map((m) => ({
      id: m.id,
      entryAId: m.entry_a_id,
      entryBId: m.entry_b_id,
      status: m.status,
      matchId: m.match_id,
      winnerEntryId: m.winner_entry_id,
      scoreA: m.score_a,
      scoreB: m.score_b,
      // Raw errors can expose server paths; only admins see them.
      error: m.error === null ? null : viewer?.role === "admin" ? m.error : "Match failed",
    })),
    standings: standingsFor(entries, matches),
  };
}

async function getOrCreateEntry(contestId: string, user: PublicUser): Promise<EntryRow> {
  const contest = await contestById(contestId);
  if (contest.status !== "open") {
    throw new HttpError(409, "Contest is not open for enrollment");
  }
  const db = await getDb();
  const existing = db
    .query<EntryRow, [string, string]>(
      `SELECT e.*, u.username
       FROM entries e
       JOIN users u ON u.id = e.user_id
       WHERE e.contest_id = ? AND e.user_id = ?`,
    )
    .get(contestId, user.id);
  if (existing) return existing;
  const id = newId("e");
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO entries (id, contest_id, user_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`,
    [id, contestId, user.id, now, now],
  );
  return db
    .query<EntryRow, [string]>(
      `SELECT e.*, u.username FROM entries e JOIN users u ON u.id = e.user_id WHERE e.id = ?`,
    )
    .get(id)!;
}

export async function enterContest(contestId: string, user: PublicUser) {
  const entry = await getOrCreateEntry(contestId, user);
  return publicEntry(entry);
}

// Uploads and approvals of one entry run one at a time, so an approval
// can't check the reviewed files and then mark the entry approved after an
// upload replaced them in between. In-memory: the API is one process.
const entryLocks = new Map<string, Promise<unknown>>();

async function withEntryLock<T>(entryId: string, fn: () => Promise<T>): Promise<T> {
  const prev = entryLocks.get(entryId) ?? Promise.resolve();
  const run = prev.then(fn);
  const tail = run.catch(() => undefined);
  entryLocks.set(entryId, tail);
  try {
    return await run;
  } finally {
    if (entryLocks.get(entryId) === tail) entryLocks.delete(entryId);
  }
}

export async function submitBot(
  contestId: string,
  user: PublicUser,
  files: Record<string, string>,
) {
  const contest = await contestById(contestId);
  const created = await getOrCreateEntry(contestId, user);
  return withEntryLock(created.id, async () => {
    // Re-read under the lock: an approval may have finished meanwhile.
    const entry = await contestEntry(contestId, created.id);
    if (entry.status === "approved") {
      throw new HttpError(409, "Approved bot cannot be changed");
    }
    const parsed = parseBotFiles(files, contest.game_id);
    const dir = botDirForEntry(defaultUploadsDir(), user.id, entry.id);
    await writeBotFiles(dir, parsed.files);
    const db = await getDb();
    db.run(
      `UPDATE entries
       SET status = 'pending', bot_name = ?, reject_reason = NULL, approved_hash = NULL, updated_at = ?
       WHERE id = ?`,
      [parsed.manifest.name, new Date().toISOString(), entry.id],
    );
    return publicEntry(await contestEntry(contestId, entry.id));
  });
}

export type ReviewDecision =
  | { action: "approve"; hash?: string }
  | { action: "reject"; reason?: string };

async function contestEntry(contestId: string, entryId: string): Promise<EntryRow> {
  const db = await getDb();
  const entry = db
    .query<EntryRow, [string, string]>(
      `SELECT e.*, u.username
       FROM entries e
       JOIN users u ON u.id = e.user_id
       WHERE e.id = ? AND e.contest_id = ?`,
    )
    .get(entryId, contestId);
  if (!entry) throw new HttpError(404, "Entry not found");
  return entry;
}

/** An entry's uploaded files and their hash, for admins and the bot's owner. */
export async function getEntryFiles(contestId: string, entryId: string, viewer: PublicUser) {
  await contestById(contestId);
  const entry = await contestEntry(contestId, entryId);
  if (viewer.role !== "admin" && viewer.id !== entry.user_id) {
    throw new HttpError(403, "Only admins and the bot's owner can read its files");
  }
  if (!entry.bot_name) throw new HttpError(404, "No bot uploaded yet");
  return readBotFiles(botDirForEntry(defaultUploadsDir(), entry.user_id, entry.id));
}

export async function reviewEntry(contestId: string, entryId: string, decision: ReviewDecision) {
  const contest = await contestById(contestId);
  const db = await getDb();
  return withEntryLock(entryId, async () => {
    const entry = await contestEntry(contestId, entryId);
    // Once a contest starts its field is fixed. The one exception is
    // re-approving an approved bot, which re-pins the files an admin just
    // reviewed, e.g. after a restore left them differing from the pin.
    const reapproval = decision.action === "approve" && entry.status === "approved";
    if (contest.status !== "open" && !reapproval) {
      throw new HttpError(409, "Can only review entries while the contest is open");
    }
    if (decision.action === "approve") {
      if (!entry.bot_name) {
        throw new HttpError(400, "Cannot approve an entry without a bot");
      }
      // Approval is for the exact code the admin read: the files' hash must
      // still match, or the owner re-uploaded after the review.
      if (!decision.hash) {
        throw new HttpError(400, "Approve with the hash of the files you reviewed");
      }
      const dir = botDirForEntry(defaultUploadsDir(), entry.user_id, entry.id);
      const current = await readBotFiles(dir);
      if (current.hash !== decision.hash) {
        throw new HttpError(409, "The bot changed after you reviewed it; review it again");
      }
      db.run(
        `UPDATE entries
         SET status = 'approved', reject_reason = NULL, approved_hash = ?, updated_at = ?
         WHERE id = ?`,
        [current.hash, new Date().toISOString(), entryId],
      );
    } else {
      const why = (decision.reason ?? "").trim();
      if (!why) throw new HttpError(400, "Reject reason is required");
      db.run(
        `UPDATE entries
         SET status = 'rejected', reject_reason = ?, approved_hash = NULL, updated_at = ?
         WHERE id = ?`,
        [why, new Date().toISOString(), entryId],
      );
    }
    return publicEntry(await contestEntry(contestId, entryId));
  });
}

export async function startContest(contestId: string) {
  await contestById(contestId);
  const db = await getDb();
  const now = new Date().toISOString();
  // One transaction: of two concurrent starts, only one finds the contest
  // open, and a failed start leaves no status change or half-made fixtures.
  db.transaction(() => {
    const claimed = db.run(
      `UPDATE contests SET status = 'running', started_at = ? WHERE id = ? AND status = 'open'`,
      [now, contestId],
    );
    if (claimed.changes === 0) throw new HttpError(409, "Contest already started");
    const approved = db
      .query<{ id: string }, [string]>(
        `SELECT id FROM entries WHERE contest_id = ? AND status = 'approved'`,
      )
      .all(contestId);
    if (approved.length < 2) {
      throw new HttpError(400, "Need at least two approved bots to start");
    }
    for (const fixture of generateFixtures(approved.map((e) => e.id), randomSeed)) {
      db.run(
        `INSERT INTO contest_matches
          (id, contest_id, entry_a_id, entry_b_id, status, seed, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
        [newId("cm"), contestId, fixture.entryAId, fixture.entryBId, fixture.seed, now],
      );
    }
  })();
  kickContestWorker();
  return getContestDetail(contestId, null);
}

/** Queues a contest's failed games again and reopens the contest if it had finished. */
export async function rerunFailedMatches(contestId: string, admin: PublicUser) {
  await contestById(contestId);
  const db = await getDb();
  const requeued = db.transaction(() => {
    const reset = db.run(
      `UPDATE contest_matches SET status = 'pending', error = NULL
       WHERE contest_id = ? AND status = 'error'`,
      [contestId],
    );
    if (reset.changes > 0) {
      db.run(`UPDATE contests SET status = 'running', finished_at = NULL WHERE id = ?`, [
        contestId,
      ]);
    }
    return reset.changes;
  })();
  if (requeued === 0) throw new HttpError(400, "No failed matches to rerun");
  kickContestWorker();
  return getContestDetail(contestId, admin);
}

async function loadEntryPlayer(entryId: string): Promise<MatchPlayerSpec> {
  const db = await getDb();
  const row = db
    .query<
      {
        id: string;
        user_id: string;
        bot_name: string | null;
        contest_id: string;
        game_id: string;
        approved_hash: string | null;
      },
      [string]
    >(
      `SELECT e.id, e.user_id, e.bot_name, e.contest_id, c.game_id, e.approved_hash
       FROM entries e JOIN contests c ON c.id = e.contest_id WHERE e.id = ?`,
    )
    .get(entryId);
  if (!row || !row.bot_name) throw new Error(`Entry ${entryId} has no bot`);
  const dir = botDirForEntry(defaultUploadsDir(), row.user_id, row.id);
  // Only the reviewed bytes may run: files that differ from the approved
  // hash (a mismatched backup restore, a manual edit) fail the game instead.
  const current = await readBotFiles(dir).catch(() => null);
  if (!row.approved_hash || current?.hash !== row.approved_hash) {
    throw new Error(
      `${row.bot_name}: bot files changed since they were approved; restore the reviewed version, or review and re-approve it, then rerun`,
    );
  }
  const manifestFile = current.files.find((f) => f.name === "manifest.json");
  if (!manifestFile) throw new Error(`${row.bot_name}: manifest.json is missing`);
  const manifest = JSON.parse(manifestFile.content) as MatchPlayerSpec["manifest"];
  return {
    botId: row.id,
    botDir: dir,
    manifest,
  };
}

/** Marks a running contest finished once none of its matches are left to play. */
function finishContestIfDone(db: Database, contestId: string): void {
  const left = db
    .query(
      `SELECT id FROM contest_matches
       WHERE contest_id = ? AND status IN ('pending', 'running')
       LIMIT 1`,
    )
    .get(contestId);
  if (left) return;
  db.run(
    `UPDATE contests SET status = 'finished', finished_at = ? WHERE id = ? AND status = 'running'`,
    [new Date().toISOString(), contestId],
  );
}

async function finishReadyContests(): Promise<void> {
  const db = await getDb();
  const running = db
    .query<{ id: string }, []>(`SELECT id FROM contests WHERE status = 'running'`)
    .all();
  for (const contest of running) finishContestIfDone(db, contest.id);
}

async function processNextContestMatch(): Promise<boolean> {
  const db = await getDb();
  const next = db
    .query<ContestMatchRow, []>(
      `SELECT * FROM contest_matches WHERE status = 'pending' ORDER BY created_at ASC, rowid ASC LIMIT 1`,
    )
    .get();
  if (!next) {
    await finishReadyContests();
    return false;
  }

  db.run(`UPDATE contest_matches SET status = 'running' WHERE id = ?`, [next.id]);
  // Everything after claiming the match is inside the try, so a failure
  // records an error instead of leaving the match stuck in 'running'.
  try {
    const contest = await contestById(next.contest_id);
    const players = [
      await loadEntryPlayer(next.entry_a_id),
      await loadEntryPlayer(next.entry_b_id),
    ];
    const replay = await runPlayersMatch(contest.game_id, players, {
      maxTicks: contestMaxTicks(),
      seed: next.seed ?? undefined,
    });
    const resultA = replay.results.find((r) => r.playerId === 0);
    const resultB = replay.results.find((r) => r.playerId === 1);
    if (!resultA || !resultB) throw new Error("Match missing results");
    const winner = winnerFromRanks(
      next.entry_a_id,
      next.entry_b_id,
      resultA.rank,
      resultB.rank,
    );
    db.run(
      `UPDATE contest_matches
       SET status = 'done', match_id = ?, winner_entry_id = ?,
           score_a = ?, score_b = ?, rank_a = ?, rank_b = ?, error = NULL
       WHERE id = ?`,
      [
        replay.id,
        winner,
        resultA.score,
        resultB.score,
        resultA.rank,
        resultB.rank,
        next.id,
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Match failed";
    db.run(
      `UPDATE contest_matches SET status = 'error', error = ? WHERE id = ?`,
      [message, next.id],
    );
  }
  // Finish this contest now, not when the whole queue drains.
  finishContestIfDone(db, next.contest_id);
  return true;
}

export function kickContestWorker(): void {
  if (contestQueueRunning) return;
  contestQueueRunning = true;
  void (async () => {
    try {
      while (await processNextContestMatch()) {
        // keep draining
      }
    } finally {
      contestQueueRunning = false;
    }
  })();
}
