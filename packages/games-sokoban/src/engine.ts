import type {
  GameCreateConfig,
  GameInstance,
  GamePlugin,
  GameResult,
  PlayerResult,
  Position,
  TickSnapshot,
} from "@machia/game-api";

export const SOKOBAN_ACTIONS = [
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "WAIT",
] as const;

export type SokobanAction = (typeof SOKOBAN_ACTIONS)[number];
export type Cell = "empty" | "wall" | "goal";

export interface LevelData {
  width: number;
  height: number;
  cells: Cell[][];
  goals: Position[];
  start: Position;
  boxes: Position[];
}

/** Compact race level — one box, short path (demo-friendly). */
export const DEFAULT_LEVEL_ROWS = [
  "#######",
  "#     #",
  "# @$  #",
  "#  .  #",
  "#     #",
  "#######",
] as const;

const MOVE_DELTA: Record<string, Position> = {
  MOVE_UP: { x: 0, y: -1 },
  MOVE_DOWN: { x: 0, y: 1 },
  MOVE_LEFT: { x: -1, y: 0 },
  MOVE_RIGHT: { x: 1, y: 0 },
};

function posKey(p: Position) {
  return `${p.x},${p.y}`;
}

export function parseLevel(rows: readonly string[]): LevelData {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const cells: Cell[][] = [];
  const goals: Position[] = [];
  const boxes: Position[] = [];
  let start: Position | null = null;

  for (let y = 0; y < height; y++) {
    const row: Cell[] = [];
    const line = rows[y]!.padEnd(width, " ");
    for (let x = 0; x < width; x++) {
      const ch = line[x]!;
      if (ch === "#") {
        row.push("wall");
        continue;
      }
      let cell: Cell = "empty";
      if (ch === "." || ch === "*" || ch === "+") {
        cell = "goal";
        goals.push({ x, y });
      }
      if (ch === "$" || ch === "*") boxes.push({ x, y });
      if (ch === "@" || ch === "+") start = { x, y };
      row.push(cell);
    }
    cells.push(row);
  }
  if (!start) throw new Error("level missing player start");
  if (boxes.length === 0) throw new Error("level missing boxes");
  if (goals.length !== boxes.length) {
    throw new Error("goals/boxes count mismatch");
  }
  return { width, height, cells, goals, start, boxes };
}

export function normalizeSokobanAction(raw: unknown): SokobanAction {
  if (
    typeof raw === "string" &&
    (SOKOBAN_ACTIONS as readonly string[]).includes(raw)
  ) {
    return raw as SokobanAction;
  }
  if (raw && typeof raw === "object" && "action" in raw) {
    const a = (raw as { action: unknown }).action;
    if (
      typeof a === "string" &&
      (SOKOBAN_ACTIONS as readonly string[]).includes(a)
    ) {
      return a as SokobanAction;
    }
  }
  return "WAIT";
}

interface PlayerState {
  id: number;
  pos: Position;
  boxes: Position[];
  done: boolean;
  finishTick: number | null;
  steps: number;
}

function boxesOnGoals(boxes: Position[], goals: Position[]): number {
  const gset = new Set(goals.map(posKey));
  return boxes.filter((b) => gset.has(posKey(b))).length;
}

function isComplete(boxes: Position[], goals: Position[]): boolean {
  return boxesOnGoals(boxes, goals) === goals.length;
}

export class SokobanEngine implements GameInstance {
  readonly mapSize: number;
  readonly maxTicks: number;
  readonly level: LevelData;
  tick = 0;
  finished = false;
  players: PlayerState[];

  constructor(
    config: GameCreateConfig,
    options?: { levelRows?: readonly string[] },
  ) {
    const n = config.playerCount;
    if (n < 2 || n > 4) throw new Error("sokoban supports 2..4 players");
    this.level = parseLevel(options?.levelRows ?? DEFAULT_LEVEL_ROWS);
    this.mapSize = Math.max(this.level.width, this.level.height);
    this.maxTicks = config.maxTicks ?? 200;
    this.players = Array.from({ length: n }, (_, id) => ({
      id,
      pos: { ...this.level.start },
      boxes: this.level.boxes.map((b) => ({ ...b })),
      done: false,
      finishTick: null,
      steps: 0,
    }));
  }

  /** Still racing = "alive" for the runner action loop. */
  isAlive(playerId: number): boolean {
    const p = this.players[playerId];
    return p ? !p.done : false;
  }

  observation(playerId: number) {
    const self = this.players[playerId]!;
    return {
      tick: this.tick,
      selfId: playerId,
      mapSize: this.mapSize,
      width: this.level.width,
      height: this.level.height,
      cells: this.level.cells,
      goals: this.level.goals.map((g) => ({ ...g })),
      self: {
        pos: { ...self.pos },
        boxes: self.boxes.map((b) => ({ ...b })),
        boxesOnGoal: boxesOnGoals(self.boxes, this.level.goals),
        goalCount: this.level.goals.length,
        done: self.done,
        steps: self.steps,
      },
      rivals: this.players
        .filter((p) => p.id !== playerId)
        .map((p) => ({
          id: p.id,
          boxesOnGoal: boxesOnGoals(p.boxes, this.level.goals),
          done: p.done,
          steps: p.steps,
          finishTick: p.finishTick,
        })),
    };
  }

  normalizeAction(raw: unknown): SokobanAction {
    return normalizeSokobanAction(raw);
  }

  startInfo(playerId: number) {
    return {
      mapSize: this.mapSize,
      width: this.level.width,
      height: this.level.height,
      spawn: { ...this.players[playerId]!.pos },
      goalCount: this.level.goals.length,
    };
  }

  step(actions: Record<number, unknown>): TickSnapshot {
    if (this.finished) throw new Error("game already finished");

    const executed: Record<number, SokobanAction> = {};
    const events: Array<Record<string, unknown>> = [];

    for (const p of this.players) {
      if (p.done) continue;
      const action = this.normalizeAction(actions[p.id]);
      executed[p.id] = action;
      const d = MOVE_DELTA[action];
      if (!d) continue;

      const next = { x: p.pos.x + d.x, y: p.pos.y + d.y };
      if (!this.walkable(next)) continue;

      const boxIdx = p.boxes.findIndex(
        (b) => b.x === next.x && b.y === next.y,
      );
      if (boxIdx >= 0) {
        const beyond = { x: next.x + d.x, y: next.y + d.y };
        if (!this.walkable(beyond)) continue;
        if (p.boxes.some((b) => b.x === beyond.x && b.y === beyond.y)) continue;
        p.boxes[boxIdx] = beyond;
        events.push({
          type: "push",
          playerId: p.id,
          from: { ...next },
          to: { ...beyond },
        });
      }

      const from = { ...p.pos };
      p.pos = next;
      p.steps += 1;
      events.push({
        type: "move",
        playerId: p.id,
        from,
        to: { ...next },
      });

      if (isComplete(p.boxes, this.level.goals)) {
        p.done = true;
        p.finishTick = this.tick;
        events.push({ type: "solve", playerId: p.id, steps: p.steps });
      }
    }

    const snapshot: TickSnapshot = {
      tick: this.tick,
      executed,
      submitted: { ...executed },
      events,
      width: this.level.width,
      height: this.level.height,
      cells: this.level.cells.map((row) => [...row]),
      goals: this.level.goals.map((g) => ({ ...g })),
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        boxes: p.boxes.map((b) => ({ ...b })),
        boxesOnGoal: boxesOnGoals(p.boxes, this.level.goals),
        goalCount: this.level.goals.length,
        done: p.done,
        steps: p.steps,
        finishTick: p.finishTick,
        alive: !p.done,
      })),
    };

    this.tick += 1;
    const allDone = this.players.every((p) => p.done);
    if (allDone || this.tick >= this.maxTicks) {
      this.finished = true;
    }

    return snapshot;
  }

  results(): GameResult {
    const goalN = this.level.goals.length;
    const scored: PlayerResult[] = this.players.map((p) => {
      const onGoal = boxesOnGoals(p.boxes, this.level.goals);
      const survivalTicks = p.finishTick ?? this.tick;
      let score: number;
      if (p.done && p.finishTick != null) {
        score = 10_000 - p.finishTick * 10 - p.steps;
      } else {
        score = 100 * onGoal + 0.1 * survivalTicks;
      }
      return {
        playerId: p.id,
        score,
        rank: 0,
        survivalTicks,
        deathTick: p.finishTick,
        kills: 0,
        // reuse wallsBroken slot for boxes-on-goal progress in UI if needed
        wallsBroken: onGoal,
      };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.survivalTicks - b.survivalTicks;
    });
    scored.forEach((r, i) => {
      r.rank = i + 1;
    });
    void goalN;
    return { ticks: this.tick, results: scored };
  }

  private walkable(pos: Position): boolean {
    if (
      pos.x < 0 ||
      pos.y < 0 ||
      pos.x >= this.level.width ||
      pos.y >= this.level.height
    ) {
      return false;
    }
    return this.level.cells[pos.y]![pos.x] !== "wall";
  }
}

export const sokobanPlugin: GamePlugin = {
  id: "sokoban",
  name: "Sokoban",
  description: "同关推箱子竞速：谁先把箱子全部推上目标点谁赢",
  minPlayers: 2,
  maxPlayers: 4,
  create(config) {
    return new SokobanEngine(config);
  },
};
