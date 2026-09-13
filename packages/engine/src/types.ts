export const ACTIONS = [
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "ATTACK",
  "BLOCK",
  "WAIT",
] as const;

export type Action = (typeof ACTIONS)[number];

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface Position {
  x: number;
  y: number;
}

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PlayerState {
  id: number;
  hp: number;
  pos: Position;
  facing: Direction;
  alive: boolean;
  coreTicks: number;
  kills: number;
  /** Tick when HP first dropped to <= 0; null if still alive at end. */
  deathTick: number | null;
  /** Pending actions: [executes this tick, executes next tick]. */
  queue: [Action, Action];
}

export interface GameConfig {
  playerCount: number;
  maxTicks?: number;
}

export interface TickEvent {
  type: "move" | "attack" | "zone" | "death" | "block";
  playerId: number;
  targetId?: number;
  from?: Position;
  to?: Position;
  pos?: Position;
}

export interface PublicPlayerView {
  id: number;
  hp: number;
  pos: Position;
  facing: Direction;
  alive: boolean;
  queue: [Action, Action];
  coreTicks: number;
  kills: number;
}

export interface GameObservation {
  tick: number;
  selfId: number;
  mapSize: number;
  core: Rect;
  safe: Rect;
  players: PublicPlayerView[];
}

export interface TickSnapshot {
  tick: number;
  executed: Record<number, Action>;
  submitted: Record<number, Action>;
  players: PublicPlayerView[];
  safe: Rect;
  events: TickEvent[];
}

export interface PlayerResult {
  playerId: number;
  score: number;
  rank: number;
  coreTicks: number;
  kills: number;
  survivalTicks: number;
  deathTick: number | null;
}

export interface GameResult {
  ticks: number;
  results: PlayerResult[];
}

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

export function mapSizeForPlayers(n: number): number {
  if (n < 2 || n > 8) {
    throw new Error(`playerCount must be 2..8, got ${n}`);
  }
  return 11 + 2 * n;
}
