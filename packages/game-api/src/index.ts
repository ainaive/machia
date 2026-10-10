export interface Position {
  x: number;
  y: number;
}

export interface PlayerResult {
  playerId: number;
  score: number;
  rank: number;
  survivalTicks: number;
  deathTick: number | null;
  kills: number;
  /** Arena-specific */
  coreTicks?: number;
  /** Bomber-specific */
  wallsBroken?: number;
}

export interface GameResult {
  ticks: number;
  results: PlayerResult[];
}

/** Opaque per-game tick record stored in replays. */
export interface TickSnapshot {
  tick: number;
  executed: Record<number, unknown>;
  submitted: Record<number, unknown>;
  events: Array<Record<string, unknown>>;
  /** Game-specific public state for the board renderer */
  [key: string]: unknown;
}

export interface GameCreateConfig {
  playerCount: number;
  maxTicks?: number;
  /** Seeds the game's randomness: the same seed and actions replay the same match. */
  seed?: number;
}

/** Deterministic PRNG (mulberry32): floats in [0, 1) from a 32-bit seed. */
export function createRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GameInstance {
  readonly mapSize: number;
  readonly finished: boolean;
  isAlive(playerId: number): boolean;
  observation(playerId: number): unknown;
  /** Normalize bot output; invalid → default action */
  normalizeAction(raw: unknown): unknown;
  step(actions: Record<number, unknown>): TickSnapshot;
  results(): GameResult;
  /** Extra fields merged into game_start (besides gameId/playerId/playerCount) */
  startInfo(playerId: number): Record<string, unknown>;
}

export interface GamePlugin {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  create(config: GameCreateConfig): GameInstance;
}

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
}
