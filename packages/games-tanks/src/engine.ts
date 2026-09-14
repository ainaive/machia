import type {
  GameCreateConfig,
  GameInstance,
  GamePlugin,
  GameResult,
  PlayerResult,
  Position,
  TickSnapshot,
} from "@machia/game-api";

export const TANKS_ACTIONS = [
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "FIRE",
  "WAIT",
] as const;

export type TanksAction = (typeof TANKS_ACTIONS)[number];
export type Facing = "UP" | "DOWN" | "LEFT" | "RIGHT";
export type Tile = "empty" | "hard";

export interface Bullet {
  id: number;
  ownerId: number;
  pos: Position;
  facing: Facing;
}

export interface TankPlayer {
  id: number;
  pos: Position;
  facing: Facing;
  alive: boolean;
  kills: number;
  deathTick: number | null;
}

const FACING_DELTA: Record<Facing, Position> = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const MOVE_TO_FACING: Partial<Record<TanksAction, Facing>> = {
  MOVE_UP: "UP",
  MOVE_DOWN: "DOWN",
  MOVE_LEFT: "LEFT",
  MOVE_RIGHT: "RIGHT",
};

function posKey(p: Position) {
  return `${p.x},${p.y}`;
}

export function mapSizeForPlayers(_n: number): number {
  return 13;
}

export function spawnSlots(mapSize: number): Array<{
  pos: Position;
  facing: Facing;
}> {
  const last = mapSize - 1;
  return [
    { pos: { x: 1, y: 1 }, facing: "RIGHT" },
    { pos: { x: last - 1, y: 1 }, facing: "LEFT" },
    { pos: { x: last - 1, y: last - 1 }, facing: "LEFT" },
    { pos: { x: 1, y: last - 1 }, facing: "RIGHT" },
  ];
}

/** Border + pillar hard walls; open corridors for tank fights. */
export function buildTiles(mapSize: number, spawns: Position[]): Tile[][] {
  const clear = new Set<string>();
  for (const s of spawns) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [0, 2],
    ] as const) {
      clear.add(`${s.x + dx},${s.y + dy}`);
    }
  }

  const tiles: Tile[][] = [];
  for (let y = 0; y < mapSize; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < mapSize; x++) {
      if (x === 0 || y === 0 || x === mapSize - 1 || y === mapSize - 1) {
        row.push("hard");
      } else if (x % 2 === 0 && y % 2 === 0) {
        row.push("hard");
      } else if (clear.has(`${x},${y}`)) {
        row.push("empty");
      } else {
        row.push("empty");
      }
    }
    tiles.push(row);
  }
  return tiles;
}

export function normalizeTanksAction(raw: unknown): TanksAction {
  if (
    typeof raw === "string" &&
    (TANKS_ACTIONS as readonly string[]).includes(raw)
  ) {
    return raw as TanksAction;
  }
  if (raw && typeof raw === "object" && "action" in raw) {
    const a = (raw as { action: unknown }).action;
    if (
      typeof a === "string" &&
      (TANKS_ACTIONS as readonly string[]).includes(a)
    ) {
      return a as TanksAction;
    }
  }
  return "WAIT";
}

export class TanksEngine implements GameInstance {
  readonly mapSize: number;
  readonly maxTicks: number;
  tick = 0;
  finished = false;
  players: TankPlayer[];
  tiles: Tile[][];
  bullets: Bullet[] = [];
  private nextBulletId = 1;

  constructor(
    config: GameCreateConfig,
    options?: { tiles?: Tile[][] },
  ) {
    const n = config.playerCount;
    if (n < 2 || n > 4) throw new Error("tanks supports 2..4 players");
    this.mapSize = mapSizeForPlayers(n);
    this.maxTicks = config.maxTicks ?? 300;
    const slots = spawnSlots(this.mapSize).slice(0, n);
    const spawnPos = slots.map((s) => s.pos);
    this.tiles = options?.tiles ?? buildTiles(this.mapSize, spawnPos);
    this.players = slots.map((s, id) => ({
      id,
      pos: { ...s.pos },
      facing: s.facing,
      alive: true,
      kills: 0,
      deathTick: null,
    }));
  }

  isAlive(playerId: number): boolean {
    return this.players[playerId]?.alive ?? false;
  }

  observation(playerId: number) {
    return {
      tick: this.tick,
      selfId: playerId,
      mapSize: this.mapSize,
      tiles: this.tiles,
      bullets: this.bullets.map((b) => ({ ...b, pos: { ...b.pos } })),
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        facing: p.facing,
        alive: p.alive,
      })),
    };
  }

  normalizeAction(raw: unknown): TanksAction {
    return normalizeTanksAction(raw);
  }

  startInfo(playerId: number) {
    return {
      mapSize: this.mapSize,
      spawn: { ...this.players[playerId]!.pos },
      facing: this.players[playerId]!.facing,
    };
  }

  step(actions: Record<number, unknown>): TickSnapshot {
    if (this.finished) throw new Error("game already finished");

    const executed: Record<number, TanksAction> = {};
    for (const p of this.players) {
      if (!p.alive) continue;
      executed[p.id] = this.normalizeAction(actions[p.id]);
    }

    const events: Array<Record<string, unknown>> = [];

    // Face + move
    const proposed = new Map<number, Position>();
    for (const p of this.players) {
      if (!p.alive) continue;
      const action = executed[p.id]!;
      const face = MOVE_TO_FACING[action];
      if (face) p.facing = face;

      let dest = { ...p.pos };
      if (face) {
        const d = FACING_DELTA[face];
        const next = { x: p.pos.x + d.x, y: p.pos.y + d.y };
        if (this.canTankEnter(next, p.id)) dest = next;
      }
      proposed.set(p.id, dest);
    }

    const byTarget = new Map<string, number[]>();
    for (const [id, dest] of proposed) {
      const k = posKey(dest);
      const list = byTarget.get(k) ?? [];
      list.push(id);
      byTarget.set(k, list);
    }
    for (const ids of byTarget.values()) {
      if (ids.length <= 1) continue;
      for (const id of ids) {
        proposed.set(id, { ...this.players[id]!.pos });
      }
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const dest = proposed.get(p.id)!;
      if (dest.x !== p.pos.x || dest.y !== p.pos.y) {
        const from = { ...p.pos };
        p.pos = dest;
        events.push({ type: "move", playerId: p.id, from, to: { ...dest } });
      }
    }

    // Fire (one live bullet per owner); bullet starts on tank, advances below
    for (const p of this.players) {
      if (!p.alive || executed[p.id] !== "FIRE") continue;
      if (this.bullets.some((b) => b.ownerId === p.id)) continue;
      this.bullets.push({
        id: this.nextBulletId++,
        ownerId: p.id,
        pos: { ...p.pos },
        facing: p.facing,
      });
      events.push({
        type: "fire",
        playerId: p.id,
        pos: { ...p.pos },
        facing: p.facing,
      });
    }

    // Advance bullets (may kill)
    const remaining: Bullet[] = [];
    for (const b of this.bullets) {
      const d = FACING_DELTA[b.facing];
      const next = { x: b.pos.x + d.x, y: b.pos.y + d.y };
      if (!this.inBounds(next) || this.tiles[next.y]![next.x] === "hard") {
        events.push({
          type: "bullet_hit_wall",
          bulletId: b.id,
          pos: { ...b.pos },
        });
        continue;
      }
      b.pos = next;
      const victim = this.players.find(
        (p) => p.alive && p.pos.x === next.x && p.pos.y === next.y,
      );
      if (victim) {
        victim.alive = false;
        victim.deathTick = this.tick;
        events.push({
          type: "death",
          playerId: victim.id,
          pos: { ...victim.pos },
          killerId: b.ownerId,
          bulletId: b.id,
        });
        if (b.ownerId !== victim.id) {
          const attacker = this.players[b.ownerId];
          if (attacker) attacker.kills += 1;
        }
        continue;
      }
      remaining.push(b);
    }
    this.bullets = remaining;

    // Same-cell spawn fire: bullet sitting on tank from previous logic already handled.
    // Also kill if tank ends turn on a bullet that didn't move onto them (edge): re-check
    for (const b of [...this.bullets]) {
      const victim = this.players.find(
        (p) => p.alive && p.pos.x === b.pos.x && p.pos.y === b.pos.y,
      );
      if (!victim) continue;
      victim.alive = false;
      victim.deathTick = this.tick;
      events.push({
        type: "death",
        playerId: victim.id,
        pos: { ...victim.pos },
        killerId: b.ownerId,
        bulletId: b.id,
      });
      if (b.ownerId !== victim.id) {
        const attacker = this.players[b.ownerId];
        if (attacker) attacker.kills += 1;
      }
      this.bullets = this.bullets.filter((x) => x.id !== b.id);
    }

    const snapshot: TickSnapshot = {
      tick: this.tick,
      executed,
      submitted: { ...executed },
      events,
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        facing: p.facing,
        alive: p.alive,
      })),
      tiles: this.tiles.map((row) => [...row]),
      bullets: this.bullets.map((b) => ({ ...b, pos: { ...b.pos } })),
    };

    this.tick += 1;
    if (this.aliveCount() <= 1 || this.tick >= this.maxTicks) {
      this.finished = true;
    }

    return snapshot;
  }

  results(): GameResult {
    const scored: PlayerResult[] = this.players.map((p) => {
      const survivalTicks = p.deathTick === null ? this.tick : p.deathTick;
      const score = 50 * p.kills + 0.1 * survivalTicks;
      return {
        playerId: p.id,
        score,
        rank: 0,
        survivalTicks,
        deathTick: p.deathTick,
        kills: p.kills,
      };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.deathTick === null ? Number.POSITIVE_INFINITY : a.deathTick;
      const db = b.deathTick === null ? Number.POSITIVE_INFINITY : b.deathTick;
      return db - da;
    });
    scored.forEach((r, i) => {
      r.rank = i + 1;
    });
    return { ticks: this.tick, results: scored };
  }

  private aliveCount() {
    return this.players.filter((p) => p.alive).length;
  }

  private inBounds(pos: Position) {
    return (
      pos.x >= 0 &&
      pos.y >= 0 &&
      pos.x < this.mapSize &&
      pos.y < this.mapSize
    );
  }

  private canTankEnter(pos: Position, selfId: number): boolean {
    if (!this.inBounds(pos)) return false;
    if (this.tiles[pos.y]![pos.x] === "hard") return false;
    if (
      this.players.some(
        (p) =>
          p.alive &&
          p.id !== selfId &&
          p.pos.x === pos.x &&
          p.pos.y === pos.y,
      )
    ) {
      return false;
    }
    return true;
  }
}

export const tanksPlugin: GamePlugin = {
  id: "tanks",
  name: "Tanks",
  description: "迷宫坦克对战：移动转向、开火射击 · 最后存活者获胜",
  minPlayers: 2,
  maxPlayers: 4,
  create(config) {
    return new TanksEngine(config);
  },
};
