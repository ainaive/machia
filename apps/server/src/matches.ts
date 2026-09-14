import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { BotManifest } from "@machia/protocol";
import {
  getGame,
  listGames,
  runMatch,
  type MatchReplay,
} from "@machia/runner";

const ROOT = path.resolve(import.meta.dir, "../../..");
export const BOTS_DIR = path.join(ROOT, "bots");
export const REPLAYS_DIR = path.join(ROOT, "data/replays");

export interface BotInfo {
  id: string;
  name: string;
  runtime: string;
  entry: string;
  dir: string;
  games: string[];
}

let running = false;

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

export async function startMatch(
  gameId: string,
  botIds: string[],
): Promise<MatchReplay> {
  const plugin = getGame(gameId);
  if (botIds.length < plugin.minPlayers || botIds.length > plugin.maxPlayers) {
    throw new Error(
      `Select ${plugin.minPlayers} to ${plugin.maxPlayers} bots for ${plugin.name}`,
    );
  }
  return withMatchLock(async () => {
    const players = [];
    for (const id of botIds) {
      const bot = await loadBot(id, gameId);
      players.push({
        botId: bot.id,
        botDir: bot.dir,
        manifest: {
          name: bot.name,
          runtime: "node" as const,
          entry: bot.entry,
          games: bot.games,
        },
      });
    }
    const id = newMatchId();
    const replay = await runMatch({ id, gameId, players });
    await mkdir(REPLAYS_DIR, { recursive: true });
    await writeFile(
      path.join(REPLAYS_DIR, `${id}.json`),
      JSON.stringify(replay),
      "utf8",
    );
    return replay;
  });
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
};

export async function startDemoMatch(gameId = "arena"): Promise<MatchReplay> {
  const ids = DEMO_BOTS[gameId];
  if (!ids) throw new Error(`No demo configured for ${gameId}`);
  return startMatch(gameId, ids);
}

export async function readReplay(id: string): Promise<MatchReplay | null> {
  try {
    const raw = await readFile(path.join(REPLAYS_DIR, `${id}.json`), "utf8");
    return JSON.parse(raw) as MatchReplay;
  } catch {
    return null;
  }
}

export async function listReplays(): Promise<
  Array<{
    id: string;
    gameId: string;
    createdAt: string;
    players: MatchReplay["players"];
  }>
> {
  await mkdir(REPLAYS_DIR, { recursive: true });
  const files = await readdir(REPLAYS_DIR);
  const out = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const replay = await readReplay(file.replace(/\.json$/, ""));
    if (!replay) continue;
    out.push({
      id: replay.id,
      gameId: replay.gameId ?? "arena",
      createdAt: replay.createdAt,
      players: replay.players,
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}
