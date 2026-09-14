import { arenaPlugin } from "@machia/engine";
import { bomberPlugin } from "@machia/games-bomber";
import type { GameInfo, GamePlugin } from "@machia/game-api";

const plugins: GamePlugin[] = [arenaPlugin, bomberPlugin];

const byId = new Map(plugins.map((p) => [p.id, p]));

export function listGames(): GameInfo[] {
  return plugins.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    minPlayers: p.minPlayers,
    maxPlayers: p.maxPlayers,
  }));
}

export function getGame(gameId: string): GamePlugin {
  const plugin = byId.get(gameId);
  if (!plugin) throw new Error(`Unknown game: ${gameId}`);
  return plugin;
}
