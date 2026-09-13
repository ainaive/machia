export type Action =
  | "MOVE_UP"
  | "MOVE_DOWN"
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "ATTACK"
  | "BLOCK"
  | "WAIT";

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

export interface TickSnapshot {
  tick: number;
  executed: Record<number, Action>;
  submitted: Record<number, Action>;
  players: PublicPlayerView[];
  safe: Rect;
  events: Array<{ type: string; playerId: number; targetId?: number }>;
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

export interface MatchReplay {
  id: string;
  createdAt: string;
  mapSize: number;
  players: Array<{ playerId: number; botId: string; name: string }>;
  ticks: TickSnapshot[];
  results: PlayerResult[];
  totalTicks: number;
}

export interface BotInfo {
  id: string;
  name: string;
  runtime: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

export function fetchBots() {
  return api<{ bots: BotInfo[] }>("/api/bots");
}

export function startMatch(botIds: string[]) {
  return api<{ matchId: string; results: PlayerResult[]; totalTicks: number }>(
    "/api/matches",
    { method: "POST", body: JSON.stringify({ botIds }) },
  );
}

export function startDemo() {
  return api<{ matchId: string; results: PlayerResult[]; totalTicks: number }>(
    "/api/matches/demo",
    { method: "POST" },
  );
}

export function fetchReplay(id: string) {
  return api<MatchReplay>(`/api/matches/${id}/replay`);
}
