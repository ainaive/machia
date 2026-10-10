/**
 * Run a match locally, without the server:
 *
 *   bun run match <game> <bot> <bot> [...more bots] [--seed N] [--ticks N] [--no-save]
 *
 * A <bot> is a folder containing manifest.json, or the id of a sample bot in
 * bots/. Bot stderr is shown as the match runs; the replay is saved where the
 * local web app (`bun run dev`) can play it back.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BotManifest } from "@machia/protocol";
import { runMatch, type MatchPlayerSpec, type MatchReplay } from "./index";
import { getGame, listGames } from "./registry";

const ROOT = path.resolve(import.meta.dir, "../../..");
const SAMPLE_BOTS = path.join(ROOT, "bots");

export interface MatchArgs {
  gameId: string;
  bots: string[];
  seed?: number;
  maxTicks?: number;
  save: boolean;
}

export function usage(): string {
  return [
    "Usage: bun run match <game> <bot> <bot> [...more bots] [--seed N] [--ticks N] [--no-save]",
    "  <bot>      a folder containing manifest.json, or a sample bot id from bots/",
    `  <game>     one of: ${listGames().map((g) => g.id).join(", ")}`,
    "  --seed N   replay a match exactly (default: random, printed after the match)",
    "  --ticks N  stop after N ticks (default: the game's own limit)",
    "  --no-save  don't write the replay file",
  ].join("\n");
}

function integerFlag(name: string, value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || !Number.isInteger(n) || n < 0) {
    throw new Error(`${name} needs a non-negative integer`);
  }
  return n;
}

export function parseMatchArgs(argv: string[]): MatchArgs {
  const positional: string[] = [];
  const args: MatchArgs = { gameId: "", bots: [], save: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--seed") args.seed = integerFlag("--seed", argv[++i]);
    else if (arg === "--ticks") args.maxTicks = integerFlag("--ticks", argv[++i]);
    else if (arg === "--no-save") args.save = false;
    else if (arg.startsWith("--")) throw new Error(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  const [gameId, ...bots] = positional;
  if (!gameId) throw new Error("Name a game to play");
  if (bots.length < 2) throw new Error("Name at least two bots");
  return { ...args, gameId, bots };
}

/** A bot folder path, or the id of a sample bot in bots/. */
export function resolveBot(ref: string, cwd = process.cwd()): MatchPlayerSpec {
  const candidates = [path.resolve(cwd, ref), path.join(SAMPLE_BOTS, ref)];
  const dir = candidates.find((d) => existsSync(path.join(d, "manifest.json")));
  if (!dir) {
    throw new Error(`No bot "${ref}": expected a folder with manifest.json or a sample bot id`);
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as BotManifest;
  return { botId: path.basename(dir), botDir: dir, manifest };
}

function trouble(stats: MatchReplay["players"][number]["stats"]): string {
  const parts: string[] = [];
  if (stats.crashed) parts.push("crashed");
  if (stats.timeouts > 0) parts.push(`${stats.timeouts} timeouts`);
  if (stats.invalidReplies > 0) parts.push(`${stats.invalidReplies} invalid replies`);
  return parts.length > 0 ? `  ! ${parts.join(", ")}` : "";
}

export function summarize(replay: MatchReplay): string[] {
  const lines = [`${replay.gameId} · seed ${replay.seed} · ${replay.totalTicks} ticks`];
  const byPlayer = new Map(replay.players.map((p) => [p.playerId, p]));
  for (const result of replay.results) {
    const player = byPlayer.get(result.playerId)!;
    const name = `${player.botId} (seat ${player.playerId})`;
    lines.push(
      `  #${result.rank}  ${name.padEnd(28)} ${result.score.toFixed(1).padStart(9)}${trouble(player.stats)}`,
    );
  }
  return lines;
}

function replaysDir(): string {
  return process.env.MACHIA_REPLAYS_DIR ?? path.join(ROOT, "data/replays");
}

function newMatchId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function main(
  argv: string[],
  print: (line: string) => void = console.log,
): Promise<number> {
  let args: MatchArgs;
  let players: MatchPlayerSpec[];
  try {
    args = parseMatchArgs(argv);
    getGame(args.gameId);
    players = args.bots.map((ref) => resolveBot(ref));
  } catch (err) {
    print(`${(err as Error).message}\n\n${usage()}`);
    return 1;
  }
  for (const p of players) {
    const games = p.manifest.games ?? ["arena"];
    if (!games.includes(args.gameId)) {
      print(`warning: ${p.botId}'s manifest.json does not list "${args.gameId}" in games`);
    }
  }

  const replay = await runMatch({
    id: newMatchId(),
    gameId: args.gameId,
    players,
    seed: args.seed,
    maxTicks: args.maxTicks,
  });
  for (const line of summarize(replay)) print(line);

  if (args.save) {
    const dir = replaysDir();
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${replay.id}.json`);
    writeFileSync(file, JSON.stringify(replay));
    print(`replay ${replay.id} → ${path.relative(process.cwd(), file)}`);
    print(`  watch it at http://localhost:5173/matches/${replay.id} while \`bun run dev\` is running`);
  }
  return 0;
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
