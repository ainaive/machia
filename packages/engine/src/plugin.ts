import {
  GameEngine,
  normalizeAction as normalizeArenaAction,
  type Action,
} from "./game";
import type {
  GameCreateConfig,
  GameInstance,
  GamePlugin,
  TickSnapshot,
} from "@machia/game-api";

class ArenaInstance implements GameInstance {
  private readonly engine: GameEngine;

  constructor(config: GameCreateConfig) {
    this.engine = new GameEngine({
      playerCount: config.playerCount,
      maxTicks: config.maxTicks,
    });
  }

  get mapSize() {
    return this.engine.mapSize;
  }

  get finished() {
    return this.engine.finished;
  }

  isAlive(playerId: number): boolean {
    return this.engine.players[playerId]?.alive ?? false;
  }

  observation(playerId: number) {
    return this.engine.observationFor(playerId);
  }

  normalizeAction(raw: unknown): Action {
    return normalizeArenaAction(raw);
  }

  step(actions: Record<number, unknown>): TickSnapshot {
    const typed: Record<number, Action> = {};
    for (const [k, v] of Object.entries(actions)) {
      typed[Number(k)] = this.normalizeAction(v);
    }
    const snap = this.engine.step(typed);
    return {
      tick: snap.tick,
      executed: snap.executed,
      submitted: snap.submitted,
      events: snap.events as unknown as Array<Record<string, unknown>>,
      players: snap.players,
      safe: snap.safe,
    };
  }

  results() {
    return this.engine.results();
  }

  startInfo(playerId: number) {
    const p = this.engine.players[playerId]!;
    return {
      mapSize: this.engine.mapSize,
      spawn: { ...p.pos },
    };
  }
}

export const arenaPlugin: GamePlugin = {
  id: "arena",
  name: "Arena",
  description: "两拍延迟公开动作 · 缩圈争夺核心区",
  minPlayers: 2,
  maxPlayers: 8,
  create(config) {
    return new ArenaInstance(config);
  },
};
