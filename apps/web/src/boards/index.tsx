import type { ComponentType } from "react";
import type { MatchReplay } from "../api";
import { BoardArena } from "./BoardArena";
import { BoardBomber } from "./BoardBomber";
import { BoardHoldem } from "./BoardHoldem";
import { BoardQuoridor } from "./BoardQuoridor";
import { BoardSokoban } from "./BoardSokoban";
import { BoardTanks } from "./BoardTanks";

interface BoardProps {
  replay: MatchReplay;
  tickIndex: number;
}

/** Each game's board, by game id. A new game plugin adds its board here. */
const BOARDS: Record<string, ComponentType<BoardProps>> = {
  arena: BoardArena,
  bomber: BoardBomber,
  tanks: BoardTanks,
  sokoban: BoardSokoban,
  holdem: BoardHoldem,
  quoridor: BoardQuoridor,
};

export function Board({ replay, tickIndex }: BoardProps) {
  const GameBoard = Object.hasOwn(BOARDS, replay.gameId) ? BOARDS[replay.gameId]! : BoardArena;
  return <GameBoard replay={replay} tickIndex={tickIndex} />;
}
