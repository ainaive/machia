import type { PlayerResult } from "@machia/game-api";
import type { BotManifest } from "@machia/protocol";

/** How well a bot kept to the protocol during one match. */
export interface BotStats {
  /** Observations not answered in time; the game used its default action. */
  timeouts: number;
  /** Replies that were not valid JSON (or exceeded the line limit). */
  invalidReplies: number;
  /** The process exited while it was still being asked for actions. */
  crashed: boolean;
}

export interface BotHandle {
  playerId: number;
  botId: string;
  name: string;
  sendStart(info: Record<string, unknown>): Promise<void>;
  /** Returns raw bot reply (object or action string); caller normalizes via game plugin */
  requestAction(obs: unknown): Promise<unknown>;
  sendEnd(results: PlayerResult[]): Promise<void>;
  destroy(): Promise<void>;
  stats(): BotStats;
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
