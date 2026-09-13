import {
  GameEngine,
  type Action,
  type GameResult,
  type TickSnapshot,
} from "@machia/engine";
import type { BotManifest } from "@machia/protocol";
import { SubprocessRunner } from "./subprocess";
import type { BotHandle, BotRunner } from "./types";

export interface MatchPlayerSpec {
  botId: string;
  botDir: string;
  manifest: BotManifest;
}

export interface MatchReplay {
  id: string;
  createdAt: string;
  mapSize: number;
  players: Array<{ playerId: number; botId: string; name: string }>;
  ticks: TickSnapshot[];
  results: GameResult["results"];
  totalTicks: number;
}

export interface RunMatchOptions {
  id: string;
  players: MatchPlayerSpec[];
  runner?: BotRunner;
  maxTicks?: number;
}

export async function runMatch(options: RunMatchOptions): Promise<MatchReplay> {
  const n = options.players.length;
  if (n < 2 || n > 8) {
    throw new Error("match requires 2..8 players");
  }

  const runner = options.runner ?? new SubprocessRunner();
  const engine = new GameEngine({
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
        playerId: i,
        mapSize: engine.mapSize,
        playerCount: n,
        spawn: { ...engine.players[i]!.pos },
      });
    }

    const ticks: TickSnapshot[] = [];
    while (!engine.finished) {
      const submitted: Record<number, Action> = {};
      await Promise.all(
        handles.map(async (h) => {
          if (!engine.players[h.playerId]?.alive) return;
          const obs = engine.observationFor(h.playerId);
          submitted[h.playerId] = await h.requestAction(obs);
        }),
      );
      ticks.push(engine.step(submitted));
    }

    const gameResult = engine.results();
    await Promise.all(handles.map((h) => h.sendEnd(gameResult.results)));

    return {
      id: options.id,
      createdAt: new Date().toISOString(),
      mapSize: engine.mapSize,
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
