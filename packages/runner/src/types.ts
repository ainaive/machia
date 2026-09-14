import type { PlayerResult } from "@machia/game-api";
import type { BotManifest } from "@machia/protocol";

export interface BotHandle {
  playerId: number;
  botId: string;
  name: string;
  sendStart(info: Record<string, unknown>): Promise<void>;
  /** Returns raw bot reply (object or action string); caller normalizes via game plugin */
  requestAction(obs: unknown): Promise<unknown>;
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

export type RunnerKind = "subprocess" | "docker";
