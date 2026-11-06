import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { BotManifest } from "@machia/protocol";
import {
  getGame,
  listGames,
  runMatch,
  type BotRunner,
  type MatchPlayerSpec,
  type MatchReplay,
} from "@machia/runner";

const ROOT = path.resolve(import.meta.dir, "../../..");
export const BOTS_DIR = path.join(ROOT, "bots");
export function replaysDir(): string {
  return process.env.MACHIA_REPLAYS_DIR ?? path.join(ROOT, "data/replays");
}

export interface BotInfo {
  id: string;
  name: string;
  runtime: string;
  entry: string;
  dir: string;
  games: string[];
}

let running = false;
let botRunner: BotRunner | undefined;

/** Runner for every match (e.g. a sandboxed one, set at boot); default: plain child processes. */
export function setBotRunner(runner: BotRunner | undefined): void {
  botRunner = runner;
}

export function isMatchRunning(): boolean {
  return running;
}

export { listGames };

function botGames(manifest: BotManifest): string[] {
  if (manifest.games && manifest.games.length > 0) return manifest.games;
  return ["arena"];
}

export async function listBots(gameId?: string): Promise<BotInfo[]> {
  const entries = await readdir(BOTS_DIR, { withFileTypes: true });
  const bots: BotInfo[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(BOTS_DIR, ent.name);
    const manifestPath = path.join(dir, "manifest.json");
    try {
      const raw = await readFile(manifestPath, "utf8");
      const manifest = JSON.parse(raw) as BotManifest;
      if (manifest.runtime !== "node" || !manifest.entry) continue;
      const games = botGames(manifest);
      if (gameId && !games.includes(gameId)) continue;
      bots.push({
        id: ent.name,
        name: manifest.name || ent.name,
        runtime: manifest.runtime,
        entry: manifest.entry,
        dir,
        games,
      });
    } catch {
      // skip
    }
  }
  bots.sort((a, b) => a.id.localeCompare(b.id));
  return bots;
}

export async function loadBot(id: string, gameId: string): Promise<BotInfo> {
  const bots = await listBots(gameId);
  const bot = bots.find((b) => b.id === id);
  if (!bot) throw new Error(`Unknown bot for ${gameId}: ${id}`);
  return bot;
}

async function withMatchLock<T>(fn: () => Promise<T>): Promise<T> {
  if (running) throw new Error("A match is already running");
  running = true;
  try {
    return await fn();
  } finally {
    running = false;
  }
}

function newMatchId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function runPlayersMatch(
  gameId: string,
  players: MatchPlayerSpec[],
  options?: { maxTicks?: number; seed?: number },
): Promise<MatchReplay> {
  const plugin = getGame(gameId);
  if (players.length < plugin.minPlayers || players.length > plugin.maxPlayers) {
    throw new Error(
      `Select ${plugin.minPlayers} to ${plugin.maxPlayers} bots for ${plugin.name}`,
    );
  }
  const id = newMatchId();
  const replay = await runMatch({
    id,
    gameId,
    players,
    maxTicks: options?.maxTicks,
    seed: options?.seed,
    runner: botRunner,
  });
  await mkdir(replaysDir(), { recursive: true });
  await writeFile(
    path.join(replaysDir(), `${id}.json`),
    JSON.stringify(replay),
    "utf8",
  );
  return replay;
}

export async function startMatch(
  gameId: string,
  botIds: string[],
): Promise<MatchReplay> {
  const players: MatchPlayerSpec[] = [];
  for (const id of botIds) {
    const bot = await loadBot(id, gameId);
    players.push({
      botId: bot.id,
      botDir: bot.dir,
      // Sample bots share helpers (../machia.js, ../<game>-lib.js) in bots/.
      mountDir: BOTS_DIR,
      manifest: {
        name: bot.name,
        runtime: "node" as const,
        entry: bot.entry,
        games: bot.games,
      },
    });
  }
  // Practice matches need no login, so they run one at a time. Contest
  // matches call runPlayersMatch directly and never wait on this lock.
  return withMatchLock(() => runPlayersMatch(gameId, players));
}

export const DEMO_BOTS: Record<string, string[]> = {
  arena: ["random-walker", "core-rusher", "turtle", "queue-dodger"],
  bomber: [
    "bomber-rusher",
    "bomber-turtle",
    "bomber-ambusher",
    "bomber-sniper",
  ],
  tanks: ["tanks-hunter", "tanks-turtle", "tanks-scout", "tanks-gunner"],
  sokoban: [
    "sokoban-pusher",
    "sokoban-hauler",
    "sokoban-planner",
    "sokoban-sprint",
  ],
  holdem: ["holdem-tight", "holdem-loose", "holdem-maniac", "holdem-rock"],
  quoridor: [
    "quoridor-rush",
    "quoridor-blocker",
    "quoridor-balanced",
    "quoridor-sprinter",
  ],
};

export async function startDemoMatch(gameId = "arena"): Promise<MatchReplay> {
  const ids = DEMO_BOTS[gameId];
  if (!ids) throw new Error(`No demo configured for ${gameId}`);
  return startMatch(gameId, ids);
}

// Replay ids come from URLs; only plain ids may reach the filesystem.
const REPLAY_ID_RE = /^[A-Za-z0-9_-]+$/;

async function readReplayAt(dir: string, id: string): Promise<MatchReplay | null> {
  if (!REPLAY_ID_RE.test(id)) return null;
  try {
    const raw = await readFile(path.join(dir, `${id}.json`), "utf8");
    return JSON.parse(raw) as MatchReplay;
  } catch {
    return null;
  }
}

export async function readReplay(id: string): Promise<MatchReplay | null> {
  return readReplayAt(replaysDir(), id);
}

/** The fields the replay library needs, without the (large) tick snapshots. */
export interface ReplaySummary {
  id: string;
  gameId: string;
  createdAt: string;
  totalTicks: number;
  players: MatchReplay["players"];
  results: MatchReplay["results"];
}

export interface ReplayPage {
  matches: ReplaySummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReplayQuery {
  gameId?: string;
  limit?: number;
  offset?: number;
}

/** Reads and filters every replay in `dir`; exported so tests can use a temp dir. */
export async function listReplaysIn(dir: string, query: ReplayQuery = {}): Promise<ReplayPage> {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  await mkdir(dir, { recursive: true });
  const files = await readdir(dir);
  const out: ReplaySummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const replay = await readReplayAt(dir, file.replace(/\.json$/, ""));
    if (!replay) continue;
    const gameId = replay.gameId ?? "arena";
    if (query.gameId && gameId !== query.gameId) continue;
    out.push({
      id: replay.id,
      gameId,
      createdAt: replay.createdAt,
      totalTicks: replay.totalTicks,
      players: replay.players,
      results: replay.results,
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    matches: out.slice(offset, offset + limit),
    total: out.length,
    limit,
    offset,
  };
}

export async function listReplays(query: ReplayQuery = {}): Promise<ReplayPage> {
  return listReplaysIn(replaysDir(), query);
}
