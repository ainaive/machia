import type { PlayerResult } from "@machia/game-api";

export type ServerMessage =
  | ({ type: "game_start" } & Record<string, unknown>)
  | ({ type: "observation" } & Record<string, unknown>)
  | {
      type: "game_end";
      results: PlayerResult[];
    };

export type BotMessage = {
  type?: "action";
  action: unknown;
};

export interface BotManifest {
  name: string;
  runtime: "node";
  entry: string;
  /** Games this bot supports; default ["arena"] if omitted */
  games?: string[];
}

export const DEFAULT_BOT_TIMEOUT_MS = 100;
