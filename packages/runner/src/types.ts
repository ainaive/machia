import type { Action, GameObservation, PlayerResult, Position } from "@machia/engine";
import type { BotManifest } from "@machia/protocol";

export interface BotHandle {
  playerId: number;
  botId: string;
  name: string;
  sendStart(info: {
    playerId: number;
    mapSize: number;
    playerCount: number;
    spawn: Position;
  }): Promise<void>;
  requestAction(obs: GameObservation): Promise<Action>;
  sendEnd(results: PlayerResult[]): Promise<void>;
  destroy(): Promise<void>;
}

export interface BotRunner {
  spawn(args: {
    playerId: number;
    botId: string;
    botDir: string;
    manifest: BotManifest;
  }): Promise<BotHandle>;
}

/** Placeholder for future Docker isolation. */
export type RunnerKind = "subprocess" | "docker";
