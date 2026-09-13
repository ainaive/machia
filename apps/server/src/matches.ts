import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { BotManifest } from "@machia/protocol";
import { runMatch, type MatchReplay } from "@machia/runner";

const ROOT = path.resolve(import.meta.dir, "../../..");
export const BOTS_DIR = path.join(ROOT, "bots");
export const REPLAYS_DIR = path.join(ROOT, "data/replays");

export interface BotInfo {
  id: string;
  name: string;
  runtime: string;
  entry: string;
  dir: string;
}

let running = false;

export function isMatchRunning(): boolean {
  return running;
}

export async function listBots(): Promise<BotInfo[]> {
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
      bots.push({
        id: ent.name,
        name: manifest.name || ent.name,
        runtime: manifest.runtime,
        entry: manifest.entry,
        dir,
      });
    } catch {
      // skip invalid bot folders
    }
  }
  bots.sort((a, b) => a.id.localeCompare(b.id));
  return bots;
}

export async function loadBot(id: string): Promise<BotInfo> {
  const bots = await listBots();
  const bot = bots.find((b) => b.id === id);
  if (!bot) throw new Error(`Unknown bot: ${id}`);
  return bot;
}

async function withMatchLock<T>(fn: () => Promise<T>): Promise<T> {
  if (running) {
    throw new Error("A match is already running");
  }
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

export async function startMatch(botIds: string[]): Promise<MatchReplay> {
  if (botIds.length < 2 || botIds.length > 8) {
    throw new Error("Select 2 to 8 bots");
  }
  return withMatchLock(async () => {
    const players = [];
    for (const id of botIds) {
      const bot = await loadBot(id);
      players.push({
        botId: bot.id,
        botDir: bot.dir,
        manifest: {
          name: bot.name,
          runtime: "node" as const,
          entry: bot.entry,
        },
      });
    }
    const id = newMatchId();
    const replay = await runMatch({ id, players });
    await mkdir(REPLAYS_DIR, { recursive: true });
    await writeFile(
      path.join(REPLAYS_DIR, `${id}.json`),
      JSON.stringify(replay),
      "utf8",
    );
    return replay;
  });
}

export const DEMO_BOT_IDS = [
  "random-walker",
  "core-rusher",
  "turtle",
  "queue-dodger",
] as const;

export async function startDemoMatch(): Promise<MatchReplay> {
  return startMatch([...DEMO_BOT_IDS]);
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
  Array<{ id: string; createdAt: string; players: MatchReplay["players"] }>
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
      createdAt: replay.createdAt,
      players: replay.players,
    });
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}
