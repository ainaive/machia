import type {
  GameCreateConfig,
  GameInstance,
  GamePlugin,
  GameResult,
  PlayerResult,
  Position,
  TickSnapshot,
} from "@machia/game-api";

export const BOMBER_ACTIONS = [
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "PLACE_BOMB",
  "WAIT",
] as const;

export type BomberAction = (typeof BOMBER_ACTIONS)[number];
export type Tile = "empty" | "hard" | "soft";
export type PowerUpKind = "FIRE_UP" | "BOMB_UP";

export interface Bomb {
  id: number;
  ownerId: number;
  pos: Position;
  fuse: number;
  power: number;
}

export interface PowerUp {
  kind: PowerUpKind;
  pos: Position;
}

export interface BomberPlayer {
  id: number;
  pos: Position;
  alive: boolean;
  bombsMax: number;
  power: number;
  kills: number;
  wallsBroken: number;
  deathTick: number | null;
}

const FUSE_TICKS = 4;
const MAX_POWER = 5;
const MAX_BOMBS = 3;
/** After this many 1v1 (≤2 alive) ticks, hazard ring grows by 1. */
const DUEL_SHRINK_EVERY = 18;
/** Hard stop so open-map duels cannot fill maxTicks with tug-of-war. */
const DUEL_MAX_TICKS = 90;

export function inHazardRing(
  pos: Position,
  mapSize: number,
  hazardRing: number,
): boolean {
  if (hazardRing <= 0) return false;
  // Ring 1 = first playable row/col next to hard border (x=1 / x=size-2).
  const edge = hazardRing;
  return (
    pos.x <= edge ||
    pos.y <= edge ||
    pos.x >= mapSize - 1 - edge ||
    pos.y >= mapSize - 1 - edge
  );
}

export function mapSizeForPlayers(n: number): number {
  if (n <= 2) return 11;
  return 13;
}

export function spawnSlots(mapSize: number): Position[] {
  const last = mapSize - 1;
  return [
    { x: 1, y: 1 },
    { x: last - 1, y: 1 },
    { x: last - 1, y: last - 1 },
    { x: 1, y: last - 1 },
  ];
}

export function buildTiles(
  mapSize: number,
  spawns: Position[],
  random: () => number = Math.random,
): Tile[][] {
  const clear = new Set<string>();
  for (const s of spawns) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
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
        row.push(random() < 0.45 ? "soft" : "empty");
      }
    }
    tiles.push(row);
  }
  return tiles;
}

function posKey(p: Position) {
  return `${p.x},${p.y}`;
}

function moveDelta(action: BomberAction): Position | null {
  switch (action) {
    case "MOVE_UP":
      return { x: 0, y: -1 };
    case "MOVE_DOWN":
      return { x: 0, y: 1 };
    case "MOVE_LEFT":
      return { x: -1, y: 0 };
    case "MOVE_RIGHT":
      return { x: 1, y: 0 };
    default:
      return null;
  }
}

export function normalizeBomberAction(raw: unknown): BomberAction {
  if (
    typeof raw === "string" &&
    (BOMBER_ACTIONS as readonly string[]).includes(raw)
  ) {
    return raw as BomberAction;
  }
  if (raw && typeof raw === "object" && "action" in raw) {
    const a = (raw as { action: unknown }).action;
    if (
      typeof a === "string" &&
      (BOMBER_ACTIONS as readonly string[]).includes(a)
    ) {
      return a as BomberAction;
    }
  }
  return "WAIT";
}

export class BomberEngine implements GameInstance {
  readonly mapSize: number;
  readonly maxTicks: number;
  tick = 0;
  finished = false;
  players: BomberPlayer[];
  tiles: Tile[][];
  bombs: Bomb[] = [];
  powerups: PowerUp[] = [];
  /** Extra lethal border during ≤2-player overtime (0 = off). */
  hazardRing = 0;
  private duelTicks = 0;
  private nextBombId = 1;
  private readonly random: () => number;

  constructor(
    config: GameCreateConfig,
    options?: { tiles?: Tile[][]; random?: () => number },
  ) {
    const n = config.playerCount;
    if (n < 2 || n > 4) throw new Error("bomber supports 2..4 players");
    this.random = options?.random ?? Math.random;
    this.mapSize = mapSizeForPlayers(n);
    this.maxTicks = config.maxTicks ?? 300;
    const spawns = spawnSlots(this.mapSize).slice(0, n);
    this.tiles = options?.tiles ?? buildTiles(this.mapSize, spawns, this.random);
    this.players = spawns.map((pos, id) => ({
      id,
      pos: { ...pos },
      alive: true,
      bombsMax: 1,
      power: 1,
      kills: 0,
      wallsBroken: 0,
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
      hazardRing: this.hazardRing,
      duelTicks: this.duelTicks,
      tiles: this.tiles,
      bombs: this.bombs.map((b) => ({ ...b, pos: { ...b.pos } })),
      powerups: this.powerups.map((p) => ({ ...p, pos: { ...p.pos } })),
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        alive: p.alive,
        bombsMax: p.bombsMax,
        power: p.power,
        bombsLeft:
          p.bombsMax - this.bombs.filter((b) => b.ownerId === p.id).length,
      })),
    };
  }

  normalizeAction(raw: unknown): BomberAction {
    return normalizeBomberAction(raw);
  }

  startInfo(playerId: number) {
    return {
      mapSize: this.mapSize,
      spawn: { ...this.players[playerId]!.pos },
    };
  }

  step(actions: Record<number, unknown>): TickSnapshot {
    if (this.finished) throw new Error("game already finished");

    const executed: Record<number, BomberAction> = {};
    for (const p of this.players) {
      if (!p.alive) continue;
      executed[p.id] = this.normalizeAction(actions[p.id]);
    }

    const events: Array<Record<string, unknown>> = [];

    // Place bombs
    for (const p of this.players) {
      if (!p.alive || executed[p.id] !== "PLACE_BOMB") continue;
      const active = this.bombs.filter((b) => b.ownerId === p.id).length;
      if (active >= p.bombsMax) continue;
      if (this.bombs.some((b) => b.pos.x === p.pos.x && b.pos.y === p.pos.y)) {
        continue;
      }
      this.bombs.push({
        id: this.nextBombId++,
        ownerId: p.id,
        pos: { ...p.pos },
        fuse: FUSE_TICKS,
        power: p.power,
      });
      events.push({ type: "place_bomb", playerId: p.id, pos: { ...p.pos } });
    }

    // Move
    const proposed = new Map<number, Position>();
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = moveDelta(executed[p.id]!);
      let dest = { ...p.pos };
      if (d) {
        const next = { x: p.pos.x + d.x, y: p.pos.y + d.y };
        if (this.canEnter(next)) dest = next;
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

    // Pickups
    for (const p of this.players) {
      if (!p.alive) continue;
      const idx = this.powerups.findIndex(
        (u) => u.pos.x === p.pos.x && u.pos.y === p.pos.y,
      );
      if (idx < 0) continue;
      const up = this.powerups.splice(idx, 1)[0]!;
      if (up.kind === "FIRE_UP") p.power = Math.min(MAX_POWER, p.power + 1);
      if (up.kind === "BOMB_UP") p.bombsMax = Math.min(MAX_BOMBS, p.bombsMax + 1);
      events.push({ type: "pickup", playerId: p.id, kind: up.kind });
    }

    // Fuse + explosions
    for (const b of this.bombs) b.fuse -= 1;

    const cellOwners = new Map<string, Set<number>>();
    const explodedIds = new Set<number>();

    const mark = (cell: Position, ownerId: number) => {
      const k = posKey(cell);
      const set = cellOwners.get(k) ?? new Set();
      set.add(ownerId);
      cellOwners.set(k, set);
    };

    const explodeBomb = (bomb: Bomb) => {
      if (explodedIds.has(bomb.id)) return;
      explodedIds.add(bomb.id);
      events.push({
        type: "explode",
        bombId: bomb.id,
        ownerId: bomb.ownerId,
        pos: { ...bomb.pos },
      });
      mark(bomb.pos, bomb.ownerId);

      for (const dir of [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]) {
        for (let dist = 1; dist <= bomb.power; dist++) {
          const cell = {
            x: bomb.pos.x + dir.x * dist,
            y: bomb.pos.y + dir.y * dist,
          };
          if (
            cell.x < 0 ||
            cell.y < 0 ||
            cell.x >= this.mapSize ||
            cell.y >= this.mapSize
          ) {
            break;
          }
          const tile = this.tiles[cell.y]![cell.x]!;
          if (tile === "hard") break;

          mark(cell, bomb.ownerId);

          const chained = this.bombs.find(
            (b) =>
              !explodedIds.has(b.id) &&
              b.pos.x === cell.x &&
              b.pos.y === cell.y,
          );
          if (chained) explodeBomb(chained);

          if (tile === "soft") {
            this.tiles[cell.y]![cell.x] = "empty";
            const owner = this.players[bomb.ownerId];
            if (owner) owner.wallsBroken += 1;
            events.push({
              type: "break_wall",
              pos: { ...cell },
              ownerId: bomb.ownerId,
            });
            if (this.random() < 0.35) {
              const kind: PowerUpKind =
                this.random() < 0.5 ? "FIRE_UP" : "BOMB_UP";
              if (
                !this.powerups.some(
                  (u) => u.pos.x === cell.x && u.pos.y === cell.y,
                )
              ) {
                this.powerups.push({ kind, pos: { ...cell } });
                events.push({
                  type: "spawn_powerup",
                  kind,
                  pos: { ...cell },
                });
              }
            }
            break;
          }
        }
      }
    };

    for (const b of this.bombs.filter((b) => b.fuse <= 0)) {
      explodeBomb(b);
    }
    this.bombs = this.bombs.filter((b) => !explodedIds.has(b.id));

    // Deaths from blast
    for (const p of this.players) {
      if (!p.alive) continue;
      const owners = cellOwners.get(posKey(p.pos));
      if (!owners || owners.size === 0) continue;
      p.alive = false;
      p.deathTick = this.tick;
      events.push({ type: "death", playerId: p.id, pos: { ...p.pos } });
      for (const ownerId of owners) {
        if (ownerId === p.id) continue;
        const attacker = this.players[ownerId];
        if (attacker) attacker.kills += 1;
      }
    }

    // 1v1 overtime: shrink + hard cap (stops open-map tug forever)
    if (this.aliveCount() === 2) {
      this.duelTicks += 1;
      if (this.duelTicks > 0 && this.duelTicks % DUEL_SHRINK_EVERY === 0) {
        const maxRing = Math.floor((this.mapSize - 1) / 2) - 1;
        if (this.hazardRing < maxRing) {
          this.hazardRing += 1;
          events.push({
            type: "hazard_shrink",
            hazardRing: this.hazardRing,
          });
        }
      }
    } else if (this.aliveCount() > 2) {
      this.duelTicks = 0;
      this.hazardRing = 0;
    }

    if (this.hazardRing > 0) {
      for (const p of this.players) {
        if (!p.alive) continue;
        if (!inHazardRing(p.pos, this.mapSize, this.hazardRing)) continue;
        p.alive = false;
        p.deathTick = this.tick;
        events.push({
          type: "death",
          playerId: p.id,
          pos: { ...p.pos },
          cause: "hazard",
        });
      }
    }

    const blast = [...cellOwners.keys()].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x: x!, y: y! };
    });

    const snapshot: TickSnapshot = {
      tick: this.tick,
      executed,
      submitted: { ...executed },
      events,
      players: this.players.map((p) => ({
        id: p.id,
        pos: { ...p.pos },
        alive: p.alive,
        bombsMax: p.bombsMax,
        power: p.power,
      })),
      tiles: this.tiles.map((row) => [...row]),
      bombs: this.bombs.map((b) => ({ ...b, pos: { ...b.pos } })),
      powerups: this.powerups.map((u) => ({ ...u, pos: { ...u.pos } })),
      blast,
      hazardRing: this.hazardRing,
      duelTicks: this.duelTicks,
    };

    this.tick += 1;
    if (
      this.aliveCount() <= 1 ||
      this.tick >= this.maxTicks ||
      this.duelTicks >= DUEL_MAX_TICKS
    ) {
      this.finished = true;
    }

    return snapshot;
  }

  results(): GameResult {
    const scored: PlayerResult[] = this.players.map((p) => {
      const survivalTicks = p.deathTick === null ? this.tick : p.deathTick;
      const score = 50 * p.kills + 0.1 * survivalTicks + 5 * p.wallsBroken;
      return {
        playerId: p.id,
        score,
        rank: 0,
        survivalTicks,
        deathTick: p.deathTick,
        kills: p.kills,
        wallsBroken: p.wallsBroken,
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

  private canEnter(pos: Position): boolean {
    if (
      pos.x < 0 ||
      pos.y < 0 ||
      pos.x >= this.mapSize ||
      pos.y >= this.mapSize
    ) {
      return false;
    }
    const tile = this.tiles[pos.y]![pos.x]!;
    if (tile === "hard" || tile === "soft") return false;
    if (this.bombs.some((b) => b.pos.x === pos.x && b.pos.y === pos.y)) {
      return false;
    }
    return true;
  }
}

export const bomberPlugin: GamePlugin = {
  id: "bomber",
  name: "Bomber",
  description: "放炸弹、炸软墙、连锁爆炸 · 最后存活者获胜",
  minPlayers: 2,
  maxPlayers: 4,
  create(config) {
    return new BomberEngine(config);
  },
};
