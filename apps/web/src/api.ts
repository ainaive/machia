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
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
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

export type UserRole = "user" | "admin";

export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface ContestSummary {
  id: string;
  title: string;
  gameId: string;
  status: "open" | "running" | "finished";
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ContestEntry {
  id: string;
  userId: string;
  username: string;
  botName: string | null;
  status: "pending" | "approved" | "rejected";
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContestMatch {
  id: string;
  entryAId: string;
  entryBId: string;
  status: string;
  matchId: string | null;
  winnerEntryId: string | null;
  scoreA: number | null;
  scoreB: number | null;
  error: string | null;
}

export interface ContestStanding {
  entryId: string;
  username: string;
  botName: string | null;
  wins: number;
  draws: number;
  losses: number;
  scoreSum: number;
  rank: number;
}

export interface ContestDetail {
  contest: ContestSummary;
  game: GameInfo;
  entries: ContestEntry[];
  myEntry: ContestEntry | null;
  matches: ContestMatch[];
  standings: ContestStanding[];
}

export function fetchMe() {
  return api<{ user: PublicUser | null }>("/api/auth/me");
}

export interface PublicInvite {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

export function fetchInvites() {
  return api<{ invites: PublicInvite[] }>("/api/admin/invites");
}

export function createInvite(input: { note?: string; maxUses?: number; expiresAt?: string }) {
  return api<{ invite: PublicInvite }>("/api/admin/invites", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteInvite(id: string) {
  return api<{ ok: boolean }>(`/api/admin/invites/${id}`, { method: "DELETE" });
}

export function fetchContests() {
  return api<{ contests: ContestSummary[] }>("/api/contests");
}

export function fetchContest(id: string) {
  return api<ContestDetail>(`/api/contests/${id}`);
}

export function createContest(title: string, gameId: string) {
  return api<{ contest: ContestSummary }>("/api/contests", {
    method: "POST",
    body: JSON.stringify({ title, gameId }),
  });
}

export function enterContest(id: string) {
  return api<{ entry: ContestEntry }>(`/api/contests/${id}/enter`, {
    method: "POST",
  });
}

export function submitContestBot(id: string, files: Record<string, string>) {
  return api<{ entry: ContestEntry }>(`/api/contests/${id}/bot`, {
    method: "POST",
    body: JSON.stringify({ files }),
  });
}

export function approveEntry(contestId: string, entryId: string) {
  return api<{ entry: ContestEntry }>(
    `/api/contests/${contestId}/entries/${entryId}/approve`,
    { method: "POST" },
  );
}

export function rejectEntry(contestId: string, entryId: string, reason: string) {
  return api<{ entry: ContestEntry }>(
    `/api/contests/${contestId}/entries/${entryId}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function startContest(id: string) {
  return api<ContestDetail>(`/api/contests/${id}/start`, { method: "POST" });
}
