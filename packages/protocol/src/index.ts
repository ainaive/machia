import type { Action, GameObservation, PlayerResult, Position } from "@machia/engine";

export type ServerMessage =
  | {
      type: "game_start";
      playerId: number;
      mapSize: number;
      playerCount: number;
      spawn: Position;
    }
  | ({ type: "observation" } & GameObservation)
  | {
      type: "game_end";
      results: PlayerResult[];
    };

export type BotMessage = {
  type?: "action";
  action: Action;
};

export interface BotManifest {
  name: string;
  runtime: "node";
  entry: string;
}

export const DEFAULT_BOT_TIMEOUT_MS = 100;
