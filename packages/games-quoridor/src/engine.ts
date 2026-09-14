import type {
  GameCreateConfig,
  GameInstance,
  GamePlugin,
  GameResult,
  PlayerResult,
  Position,
  TickSnapshot,
} from "@machia/game-api";

/** Demo-friendly board (classic Quoridor is 9). */
export const BOARD_SIZE = 7;

export type Orient = "H" | "V";
export type Dir = "N" | "S" | "E" | "W";
export type JumpDir = Dir | "NE" | "NW" | "SE" | "SW";

export interface Wall {
  orient: Orient;
  x: number;
  y: number;
}

export interface QuoridorPlayer {
  id: number;
  pos: Position;
  fences: number;
  /** Goal: reach this edge. */
  goal: "N" | "S" | "E" | "W";
  finished: boolean;
  finishTick: number | null;
}

export type QuoridorAction =
  | { type: "MOVE"; dir: Dir }
  | { type: "JUMP"; dir: JumpDir }
  | { type: "WALL"; orient: Orient; x: number; y: number }
  | { type: "WAIT" };

const DIR_DELTA: Record<Dir, Position> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};

const JUMP_DELTA: Record<JumpDir, Position> = {
  ...DIR_DELTA,
  NE: { x: 1, y: -1 },
  NW: { x: -1, y: -1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
};

function inBounds(p: Position, size: number) {
  return p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
}

function fencesForPlayers(n: number): number {
  if (n === 2) return 8;
  if (n === 3) return 6;
  return 5;
}

function startsFor(n: number, size: number): Array<{
  pos: Position;
  goal: QuoridorPlayer["goal"];
}> {
  const mid = Math.floor(size / 2);
  if (n === 2) {
    return [
      { pos: { x: mid, y: size - 1 }, goal: "N" },
      { pos: { x: mid, y: 0 }, goal: "S" },
    ];
  }
  if (n === 3) {
    return [
      { pos: { x: mid, y: size - 1 }, goal: "N" },
      { pos: { x: mid, y: 0 }, goal: "S" },
      { pos: { x: 0, y: mid }, goal: "E" },
    ];
  }
  return [
    { pos: { x: mid, y: size - 1 }, goal: "N" },
    { pos: { x: mid, y: 0 }, goal: "S" },
    { pos: { x: 0, y: mid }, goal: "E" },
    { pos: { x: size - 1, y: mid }, goal: "W" },
  ];
}

function reachedGoal(pos: Position, goal: QuoridorPlayer["goal"], size: number) {
  if (goal === "N") return pos.y === 0;
  if (goal === "S") return pos.y === size - 1;
  if (goal === "E") return pos.x === size - 1;
  return pos.x === 0;
}

/** Does a horizontal wall at (wx,wy) block vertical passage between row wy and wy+1 at column cx? */
function hBlocksVertical(wx: number, wy: number, cx: number, edgeY: number) {
  return edgeY === wy && (cx === wx || cx === wx + 1);
}

/** Does a vertical wall at (wx,wy) block horizontal passage between col wx and wx+1 at row cy? */
function vBlocksHorizontal(wx: number, wy: number, edgeX: number, cy: number) {
  return edgeX === wx && (cy === wy || cy === wy + 1);
}

export function edgeBlocked(
  from: Position,
  to: Position,
  walls: Wall[],
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return true;
  for (const w of walls) {
    if (w.orient === "H" && dy !== 0) {
      const edgeY = Math.min(from.y, to.y);
      if (hBlocksVertical(w.x, w.y, from.x, edgeY)) return true;
    }
    if (w.orient === "V" && dx !== 0) {
      const edgeX = Math.min(from.x, to.x);
      if (vBlocksHorizontal(w.x, w.y, edgeX, from.y)) return true;
    }
  }
  return false;
}

export function pathExists(
  from: Position,
  goal: QuoridorPlayer["goal"],
  walls: Wall[],
  size: number,
): boolean {
  if (reachedGoal(from, goal, size)) return true;
  const q: Position[] = [from];
  const seen = new Set(`${from.x},${from.y}`);
  while (q.length) {
    const cur = q.shift()!;
    for (const d of Object.values(DIR_DELTA)) {
      const next = { x: cur.x + d.x, y: cur.y + d.y };
      if (!inBounds(next, size)) continue;
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      if (edgeBlocked(cur, next, walls)) continue;
      if (reachedGoal(next, goal, size)) return true;
      seen.add(key);
      q.push(next);
    }
  }
  return false;
}

export function shortestPathLen(
  from: Position,
  goal: QuoridorPlayer["goal"],
  walls: Wall[],
  size: number,
): number {
  if (reachedGoal(from, goal, size)) return 0;
  const q: Array<{ p: Position; d: number }> = [{ p: from, d: 0 }];
  const seen = new Set(`${from.x},${from.y}`);
  while (q.length) {
    const { p: cur, d } = q.shift()!;
    for (const delta of Object.values(DIR_DELTA)) {
      const next = { x: cur.x + delta.x, y: cur.y + delta.y };
      if (!inBounds(next, size)) continue;
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      if (edgeBlocked(cur, next, walls)) continue;
      if (reachedGoal(next, goal, size)) return d + 1;
      seen.add(key);
      q.push({ p: next, d: d + 1 });
    }
  }
  return 999;
}

function wallsOverlap(a: Wall, b: Wall): boolean {
  if (a.orient === b.orient) {
    if (a.orient === "H") {
      return a.y === b.y && Math.abs(a.x - b.x) <= 1;
    }
    return a.x === b.x && Math.abs(a.y - b.y) <= 1;
  }
  // Cross at same intersection
  return a.x === b.x && a.y === b.y;
}

export function canPlaceWall(
  wall: Wall,
  existing: Wall[],
  players: Array<{ pos: Position; goal: QuoridorPlayer["goal"] }>,
  size: number,
): boolean {
  if (wall.x < 0 || wall.y < 0 || wall.x > size - 2 || wall.y > size - 2) {
    return false;
  }
  for (const w of existing) {
    if (wallsOverlap(wall, w)) return false;
  }
  const next = [...existing, wall];
  return players.every((p) => pathExists(p.pos, p.goal, next, size));
}

function pawnAt(players: QuoridorPlayer[], pos: Position, exceptId?: number) {
  return players.find(
    (p) =>
      !p.finished &&
      p.id !== exceptId &&
      p.pos.x === pos.x &&
      p.pos.y === pos.y,
  );
}

export function legalMoves(
  playerId: number,
  players: QuoridorPlayer[],
  walls: Wall[],
  size: number,
): Array<{ type: "MOVE" | "JUMP"; dir: JumpDir; to: Position }> {
  const me = players[playerId]!;
  if (me.finished) return [];
  const out: Array<{ type: "MOVE" | "JUMP"; dir: JumpDir; to: Position }> = [];

  for (const dir of Object.keys(DIR_DELTA) as Dir[]) {
    const d = DIR_DELTA[dir];
    const step = { x: me.pos.x + d.x, y: me.pos.y + d.y };
    if (!inBounds(step, size) || edgeBlocked(me.pos, step, walls)) continue;
    const blocker = pawnAt(players, step, me.id);
    if (!blocker) {
      out.push({ type: "MOVE", dir, to: step });
      continue;
    }
    // Jump straight
    const behind = { x: step.x + d.x, y: step.y + d.y };
    if (
      inBounds(behind, size) &&
      !edgeBlocked(step, behind, walls) &&
      !pawnAt(players, behind, me.id)
    ) {
      out.push({ type: "JUMP", dir, to: behind });
      continue;
    }
    // Diagonal side-jumps when straight is blocked
    const sides: JumpDir[] =
      dir === "N" || dir === "S"
        ? ([`${dir === "N" ? "N" : "S"}E`, `${dir === "N" ? "N" : "S"}W`] as JumpDir[])
        : ([`N${dir}`, `S${dir}`] as JumpDir[]);
    for (const jd of sides) {
      const jdDelta = JUMP_DELTA[jd];
      const land = { x: me.pos.x + jdDelta.x, y: me.pos.y + jdDelta.y };
      // Must be adjacent to opponent
      if (Math.abs(land.x - step.x) + Math.abs(land.y - step.y) !== 1) continue;
      if (!inBounds(land, size)) continue;
      if (pawnAt(players, land, me.id)) continue;
      if (edgeBlocked(step, land, walls)) continue;
      out.push({ type: "JUMP", dir: jd, to: land });
    }
  }
  return out;
}

export function actionKey(a: QuoridorAction): string {
  if (a.type === "WAIT") return "WAIT";
  if (a.type === "MOVE") return `MOVE:${a.dir}`;
  if (a.type === "JUMP") return `JUMP:${a.dir}`;
  return `WALL:${a.orient}:${a.x}:${a.y}`;
}

export function normalizeQuoridorAction(raw: unknown): QuoridorAction {
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const t = (o.type ?? o.action) as unknown;
    if (t === "WAIT" || t === "wait") return { type: "WAIT" };
    if (t === "MOVE" || t === "move") {
      const dir = String(o.dir ?? "").toUpperCase() as Dir;
      if (dir in DIR_DELTA) return { type: "MOVE", dir };
    }
    if (t === "JUMP" || t === "jump") {
      const dir = String(o.dir ?? "").toUpperCase() as JumpDir;
      if (dir in JUMP_DELTA) return { type: "JUMP", dir };
    }
    if (t === "WALL" || t === "wall") {
      const orient = String(o.orient ?? "").toUpperCase() as Orient;
      const x = Number(o.x);
      const y = Number(o.y);
      if ((orient === "H" || orient === "V") && Number.isInteger(x) && Number.isInteger(y)) {
        return { type: "WALL", orient, x, y };
      }
    }
  }
  if (typeof raw === "string") {
    const s = raw.trim().toUpperCase();
    if (s === "WAIT") return { type: "WAIT" };
    const move = /^MOVE:([NSEW])$/.exec(s);
    if (move) return { type: "MOVE", dir: move[1] as Dir };
    const jump = /^JUMP:([NSEW]|NE|NW|SE|SW)$/.exec(s);
    if (jump) return { type: "JUMP", dir: jump[1] as JumpDir };
    const wall = /^WALL:([HV]):(-?\d+):(-?\d+)$/.exec(s);
    if (wall) {
      return {
        type: "WALL",
        orient: wall[1] as Orient,
        x: Number(wall[2]),
        y: Number(wall[3]),
      };
    }
  }
  return { type: "WAIT" };
}

export class QuoridorEngine implements GameInstance {
  readonly mapSize: number;
  readonly maxTicks: number;
  tick = 0;
  finished = false;
  toAct = 0;
  walls: Wall[] = [];
  players: QuoridorPlayer[] = [];

  constructor(config: GameCreateConfig) {
    const n = config.playerCount;
    if (n < 2 || n > 4) throw new Error("quoridor supports 2..4 players");
    this.mapSize = BOARD_SIZE;
    this.maxTicks = config.maxTicks ?? 300;
    const fences = fencesForPlayers(n);
    const starts = startsFor(n, BOARD_SIZE);
    this.players = starts.map((s, id) => ({
      id,
      pos: { ...s.pos },
      fences,
      goal: s.goal,
      finished: false,
      finishTick: null,
    }));
    this.toAct = 0;
  }

  isAlive(playerId: number): boolean {
    if (this.finished) return false;
    const p = this.players[playerId];
    if (!p || p.finished) return false;
    return this.toAct === playerId;
  }

  observation(playerId: number) {
    return {
      tick: this.tick,
      selfId: playerId,
      mapSize: this.mapSize,
      toAct: this.toAct,
      walls: this.walls.map((w) => ({ ...w })),
      legal: this.legalActions(playerId).map(actionKey),
      self: {
        pos: { ...this.players[playerId]!.pos },
        fences: this.players[playerId]!.fences,
        goal: this.players[playerId]!.goal,
        finished: this.players[playerId]!.finished,
      },
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        fences: p.fences,
        goal: p.goal,
        finished: p.finished,
      })),
    };
  }

  normalizeAction(raw: unknown): QuoridorAction {
    return normalizeQuoridorAction(raw);
  }

  startInfo(playerId: number) {
    const p = this.players[playerId]!;
    return {
      mapSize: this.mapSize,
      seat: playerId,
      goal: p.goal,
      fences: p.fences,
      start: { ...p.pos },
    };
  }

  step(actions: Record<number, unknown>): TickSnapshot {
    if (this.finished) throw new Error("game already finished");
    const events: Array<Record<string, unknown>> = [];
    const executed: Record<number, string> = {};

    const actorId = this.toAct;
    let action = this.normalizeAction(actions[actorId]);
    const legal = this.legalActions(actorId);
    const match = legal.find((a) => actionKey(a) === actionKey(action));
    if (!match || action.type === "WAIT") {
      action = this.defaultAction(actorId, legal);
    } else {
      action = match;
    }

    executed[actorId] = actionKey(action);
    this.apply(actorId, action, events);

    for (const p of this.players) {
      if (p.id !== actorId) executed[p.id] ??= "WAIT";
    }

    if (!this.finished) {
      this.advanceToAct();
    }

    const snapshot: TickSnapshot = {
      tick: this.tick,
      executed,
      submitted: { ...executed },
      events,
      toAct: this.toAct,
      walls: this.walls.map((w) => ({ ...w })),
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        fences: p.fences,
        goal: p.goal,
        finished: p.finished,
        finishTick: p.finishTick,
        alive: !p.finished,
      })),
    };

    this.tick += 1;
    if (this.tick >= this.maxTicks && !this.finished) {
      this.finished = true;
      events.push({ type: "timeout" });
    }
    return snapshot;
  }

  results(): GameResult {
    const scored: PlayerResult[] = this.players.map((p) => {
      const dist = shortestPathLen(p.pos, p.goal, this.walls, this.mapSize);
      const score = p.finished
        ? 10_000 - 10 * (p.finishTick ?? this.tick)
        : Math.max(0, 500 - 10 * dist) + 0.1 * this.tick;
      return {
        playerId: p.id,
        score,
        rank: 0,
        survivalTicks: p.finishTick ?? this.tick,
        deathTick: p.finished ? p.finishTick : null,
        kills: 0,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    scored.forEach((r, i) => {
      r.rank = i + 1;
    });
    return { ticks: this.tick, results: scored };
  }

  legalActions(playerId: number): QuoridorAction[] {
    if (this.toAct !== playerId || this.finished) return [{ type: "WAIT" }];
    const me = this.players[playerId]!;
    if (me.finished) return [{ type: "WAIT" }];
    const moves = legalMoves(playerId, this.players, this.walls, this.mapSize);
    const out: QuoridorAction[] = moves.map((m) =>
      m.type === "MOVE"
        ? { type: "MOVE", dir: m.dir as Dir }
        : { type: "JUMP", dir: m.dir },
    );
    if (me.fences > 0) {
      for (let y = 0; y <= this.mapSize - 2; y++) {
        for (let x = 0; x <= this.mapSize - 2; x++) {
          for (const orient of ["H", "V"] as Orient[]) {
            const wall = { orient, x, y };
            if (
              canPlaceWall(
                wall,
                this.walls,
                this.players.filter((p) => !p.finished),
                this.mapSize,
              )
            ) {
              out.push({ type: "WALL", orient, x, y });
            }
          }
        }
      }
    }
    out.push({ type: "WAIT" });
    return out;
  }

  private defaultAction(
    playerId: number,
    legal: QuoridorAction[],
  ): QuoridorAction {
    const me = this.players[playerId]!;
    const moves = legal.filter((a) => a.type === "MOVE" || a.type === "JUMP");
    let best: QuoridorAction | null = null;
    let bestDist = Infinity;
    for (const a of moves) {
      const land =
        a.type === "MOVE"
          ? {
              x: me.pos.x + DIR_DELTA[a.dir].x,
              y: me.pos.y + DIR_DELTA[a.dir].y,
            }
          : {
              x: me.pos.x + JUMP_DELTA[a.dir].x,
              y: me.pos.y + JUMP_DELTA[a.dir].y,
            };
      const d = shortestPathLen(land, me.goal, this.walls, this.mapSize);
      if (d < bestDist) {
        bestDist = d;
        best = a;
      }
    }
    if (best) return best;
    const wait = legal.find((a) => a.type === "WAIT");
    return wait ?? { type: "WAIT" };
  }

  private apply(
    playerId: number,
    action: QuoridorAction,
    events: Array<Record<string, unknown>>,
  ) {
    const me = this.players[playerId]!;
    if (action.type === "MOVE" || action.type === "JUMP") {
      const delta =
        action.type === "MOVE" ? DIR_DELTA[action.dir] : JUMP_DELTA[action.dir];
      me.pos = { x: me.pos.x + delta.x, y: me.pos.y + delta.y };
      events.push({
        type: action.type === "MOVE" ? "move" : "jump",
        playerId,
        dir: action.dir,
        to: { ...me.pos },
      });
      if (reachedGoal(me.pos, me.goal, this.mapSize)) {
        me.finished = true;
        me.finishTick = this.tick;
        this.finished = true;
        events.push({ type: "win", playerId });
      }
      return;
    }
    if (action.type === "WALL") {
      this.walls.push({ orient: action.orient, x: action.x, y: action.y });
      me.fences -= 1;
      events.push({
        type: "wall",
        playerId,
        wall: { orient: action.orient, x: action.x, y: action.y },
      });
    }
  }

  private advanceToAct() {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const next = (this.toAct + i) % n;
      if (!this.players[next]!.finished) {
        this.toAct = next;
        return;
      }
    }
    this.finished = true;
  }
}

export const quoridorPlugin: GamePlugin = {
  id: "quoridor",
  name: "Quoridor",
  description:
    "Path race with fences: reach the opposite side first. Place walls that never fully cut anyone off.",
  minPlayers: 2,
  maxPlayers: 4,
  create(config) {
    return new QuoridorEngine(config);
  },
};
