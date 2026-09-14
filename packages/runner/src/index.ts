import type { GameResult, TickSnapshot } from "@machia/game-api";
import type { BotManifest } from "@machia/protocol";
import { getGame } from "./registry";
import { SubprocessRunner } from "./subprocess";
import type { BotHandle, BotRunner } from "./types";

export interface MatchPlayerSpec {
  botId: string;
  botDir: string;
  manifest: BotManifest;
}

export interface MatchReplay {
  id: string;
  gameId: string;
  createdAt: string;
  mapSize: number;
  players: Array<{ playerId: number; botId: string; name: string }>;
  ticks: TickSnapshot[];
  results: GameResult["results"];
  totalTicks: number;
}

export interface RunMatchOptions {
  id: string;
  gameId: string;
  players: MatchPlayerSpec[];
  runner?: BotRunner;
  maxTicks?: number;
}

export async function runMatch(options: RunMatchOptions): Promise<MatchReplay> {
  const plugin = getGame(options.gameId);
  const n = options.players.length;
  if (n < plugin.minPlayers || n > plugin.maxPlayers) {
    throw new Error(
      `${plugin.name} requires ${plugin.minPlayers}..${plugin.maxPlayers} players`,
    );
  }

  const runner = options.runner ?? new SubprocessRunner();
  const game = plugin.create({
    playerCount: n,
    maxTicks: options.maxTicks,
  });

  const handles: BotHandle[] = [];
  try {
    for (let i = 0; i < n; i++) {
      const spec = options.players[i]!;
      const handle = await runner.spawn({
        playerId: i,
        botId: spec.botId,
        botDir: spec.botDir,
        manifest: spec.manifest,
      });
      handles.push(handle);
      await handle.sendStart({
        gameId: plugin.id,
        playerId: i,
        playerCount: n,
        ...game.startInfo(i),
      });
    }

    const ticks: TickSnapshot[] = [];
    while (!game.finished) {
      const submitted: Record<number, unknown> = {};
      await Promise.all(
        handles.map(async (h) => {
          if (!game.isAlive(h.playerId)) return;
          const obs = game.observation(h.playerId);
          const raw = await h.requestAction(obs);
          submitted[h.playerId] = game.normalizeAction(raw);
        }),
      );
      ticks.push(game.step(submitted));
    }

    const gameResult = game.results();
    await Promise.all(handles.map((h) => h.sendEnd(gameResult.results)));

    return {
      id: options.id,
      gameId: plugin.id,
      createdAt: new Date().toISOString(),
      mapSize: game.mapSize,
      players: handles.map((h) => ({
        playerId: h.playerId,
        botId: h.botId,
        name: h.name,
      })),
      ticks,
      results: gameResult.results,
      totalTicks: gameResult.ticks,
    };
  } finally {
    await Promise.all(handles.map((h) => h.destroy()));
  }
}

export * from "./types";
export { SubprocessRunner } from "./subprocess";
export { listGames, getGame } from "./registry";
