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

/** Total size limit for an uploaded contest bot (all files). */
export const MAX_BOT_UPLOAD_BYTES = 256 * 1024;

export const DEFAULT_BOT_TIMEOUT_MS = 100;
/** Budget for a bot's first observation, which also pays for process startup. */
export const DEFAULT_BOT_STARTUP_TIMEOUT_MS = 1000;
