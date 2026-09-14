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

export interface PlayerResult {
  playerId: number;
  score: number;
  rank: number;
  kills: number;
  survivalTicks: number;
  deathTick: number | null;
  coreTicks?: number;
  wallsBroken?: number;
}

export interface TickSnapshot {
  tick: number;
  executed: Record<number, string>;
  submitted: Record<number, string>;
  events: Array<Record<string, unknown>>;
  players: Array<Record<string, unknown>>;
  safe?: Rect;
  tiles?: string[][];
  bombs?: Array<{ id: number; ownerId: number; pos: Position; fuse: number; power: number }>;
  powerups?: Array<{ kind: string; pos: Position }>;
  blast?: Position[];
  [key: string]: unknown;
}

export interface MatchReplay {
  id: string;
  gameId: string;
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
  games: string[];
}

export interface GameInfo {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
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

export function fetchGames() {
  return api<{ games: GameInfo[] }>("/api/games");
}

export function fetchBots(gameId?: string) {
  const q = gameId ? `?game=${encodeURIComponent(gameId)}` : "";
  return api<{ bots: BotInfo[] }>(`/api/bots${q}`);
}

export function startMatch(gameId: string, botIds: string[]) {
  return api<{ matchId: string; gameId: string; results: PlayerResult[]; totalTicks: number }>(
    "/api/matches",
    { method: "POST", body: JSON.stringify({ gameId, botIds }) },
  );
}

export function startDemo(gameId: string) {
  return api<{ matchId: string; gameId: string; results: PlayerResult[]; totalTicks: number }>(
    "/api/matches/demo",
    { method: "POST", body: JSON.stringify({ gameId }) },
  );
}

export function fetchReplay(id: string) {
  return api<MatchReplay>(`/api/matches/${id}/replay`);
}
