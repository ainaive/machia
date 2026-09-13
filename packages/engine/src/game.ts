import {
  actionToDirection,
  coreRect,
  dirDelta,
  facingTowardCenter,
  inRect,
  posKey,
  safeRectForTick,
  spawnPositions,
} from "./map";
import {
  type Action,
  type GameConfig,
  type GameObservation,
  type GameResult,
  type PlayerResult,
  type PlayerState,
  type Position,
  type PublicPlayerView,
  type TickEvent,
  type TickSnapshot,
  isAction,
  mapSizeForPlayers,
} from "./types";

const MOVE_ACTIONS = new Set<Action>([
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
]);

export class GameEngine {
  readonly mapSize: number;
  readonly maxTicks: number;
  readonly core: ReturnType<typeof coreRect>;
  tick = 0;
  players: PlayerState[];
  finished = false;
  private attackDamage = new Map<number, number[]>();

  constructor(config: GameConfig) {
    const n = config.playerCount;
    this.mapSize = mapSizeForPlayers(n);
    this.maxTicks = config.maxTicks ?? 400;
    this.core = coreRect(this.mapSize);
    const spawns = spawnPositions(n, this.mapSize);
    this.players = spawns.map((pos, id) => ({
      id,
      hp: 3,
      pos: { ...pos },
      facing: facingTowardCenter(pos, this.mapSize),
      alive: true,
      coreTicks: 0,
      kills: 0,
      deathTick: null,
      queue: ["WAIT", "WAIT"] as [Action, Action],
    }));
  }

  get safe() {
    return safeRectForTick(this.mapSize, this.tick);
  }

  aliveCount(): number {
    return this.players.filter((p) => p.alive).length;
  }

  observationFor(selfId: number): GameObservation {
    return {
      tick: this.tick,
      selfId,
      mapSize: this.mapSize,
      core: this.core,
      safe: this.safe,
      players: this.players.map(toPublicView),
    };
  }

  /**
   * One tick: queues hold [action@T, action@T+1].
   * `submitted` are secretly chosen actions for T+2.
   */
  step(submitted: Record<number, Action>): TickSnapshot {
    if (this.finished) {
      throw new Error("game already finished");
    }

    const normalized: Record<number, Action> = {};
    for (const p of this.players) {
      if (!p.alive) continue;
      const raw = submitted[p.id];
      normalized[p.id] = isAction(raw) ? raw : "WAIT";
    }

    const executed: Record<number, Action> = {};
    for (const p of this.players) {
      if (!p.alive) continue;
      executed[p.id] = p.queue[0];
    }

    const events: TickEvent[] = [];
    this.attackDamage = new Map();
    this.resolveMovement(executed, events);
    this.resolveAttack(executed, events);
    this.resolveZone(events);
    this.resolveCoreScore();
    this.resolveDeaths(events);

    for (const p of this.players) {
      if (!p.alive) continue;
      p.queue = [p.queue[1], normalized[p.id] ?? "WAIT"];
    }

    const snapshot: TickSnapshot = {
      tick: this.tick,
      executed,
      submitted: normalized,
      players: this.players.map(toPublicView),
      safe: this.safe,
      events,
    };

    this.tick += 1;
    if (this.aliveCount() <= 1 || this.tick >= this.maxTicks) {
      this.finished = true;
    }

    return snapshot;
  }

  results(): GameResult {
    const scored = this.players.map((p) => {
      const survivalTicks = p.deathTick === null ? this.tick : p.deathTick;
      const score = 3 * p.coreTicks + 10 * p.kills + 0.05 * survivalTicks;
      return {
        playerId: p.id,
        score,
        rank: 0,
        coreTicks: p.coreTicks,
        kills: p.kills,
        survivalTicks,
        deathTick: p.deathTick,
      } satisfies PlayerResult;
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

  private resolveMovement(
    executed: Record<number, Action>,
    events: TickEvent[],
  ): void {
    const alive = this.players.filter((p) => p.alive);
    const proposed = new Map<number, Position>();

    for (const p of alive) {
      const action = executed[p.id]!;
      let dest = { ...p.pos };
      if (MOVE_ACTIONS.has(action)) {
        const dir = actionToDirection(
          action as "MOVE_UP" | "MOVE_DOWN" | "MOVE_LEFT" | "MOVE_RIGHT",
        );
        const d = dirDelta(dir);
        const next = { x: p.pos.x + d.x, y: p.pos.y + d.y };
        if (
          next.x >= 0 &&
          next.y >= 0 &&
          next.x < this.mapSize &&
          next.y < this.mapSize
        ) {
          dest = next;
        }
      }
      proposed.set(p.id, dest);
    }

    for (const a of alive) {
      for (const b of alive) {
        if (a.id >= b.id) continue;
        const da = proposed.get(a.id)!;
        const db = proposed.get(b.id)!;
        if (
          da.x === b.pos.x &&
          da.y === b.pos.y &&
          db.x === a.pos.x &&
          db.y === a.pos.y
        ) {
          proposed.set(a.id, { ...a.pos });
          proposed.set(b.id, { ...b.pos });
        }
      }
    }

    const byTarget = new Map<string, number[]>();
    for (const p of alive) {
      const dest = proposed.get(p.id)!;
      const key = posKey(dest);
      const list = byTarget.get(key) ?? [];
      list.push(p.id);
      byTarget.set(key, list);
    }
    for (const ids of byTarget.values()) {
      if (ids.length <= 1) continue;
      for (const id of ids) {
        const p = this.players[id]!;
        proposed.set(id, { ...p.pos });
      }
    }

    for (const p of alive) {
      const dest = proposed.get(p.id)!;
      const action = executed[p.id]!;
      const from = { ...p.pos };
      if (dest.x !== p.pos.x || dest.y !== p.pos.y) {
        p.pos = dest;
        if (MOVE_ACTIONS.has(action)) {
          p.facing = actionToDirection(
            action as "MOVE_UP" | "MOVE_DOWN" | "MOVE_LEFT" | "MOVE_RIGHT",
          );
        }
        events.push({ type: "move", playerId: p.id, from, to: { ...dest } });
      }
    }
  }

  private resolveAttack(
    executed: Record<number, Action>,
    events: TickEvent[],
  ): void {
    const alive = this.players.filter((p) => p.alive);
    const blocking = new Set(
      alive.filter((p) => executed[p.id] === "BLOCK").map((p) => p.id),
    );

    for (const p of alive) {
      if (executed[p.id] === "BLOCK") {
        events.push({ type: "block", playerId: p.id, pos: { ...p.pos } });
      }
    }

    for (const attacker of alive) {
      if (executed[attacker.id] !== "ATTACK") continue;
      const d = dirDelta(attacker.facing);
      for (const dist of [1, 2]) {
        const cell = {
          x: attacker.pos.x + d.x * dist,
          y: attacker.pos.y + d.y * dist,
        };
        for (const target of alive) {
          if (target.id === attacker.id) continue;
          if (target.pos.x !== cell.x || target.pos.y !== cell.y) continue;
          events.push({
            type: "attack",
            playerId: attacker.id,
            targetId: target.id,
            pos: { ...cell },
          });
          if (blocking.has(target.id)) continue;
          target.hp -= 1;
          const list = this.attackDamage.get(attacker.id) ?? [];
          list.push(target.id);
          this.attackDamage.set(attacker.id, list);
        }
      }
    }
  }

  private resolveZone(events: TickEvent[]): void {
    const safe = this.safe;
    for (const p of this.players) {
      if (!p.alive) continue;
      if (!inRect(p.pos, safe)) {
        p.hp -= 1;
        events.push({ type: "zone", playerId: p.id, pos: { ...p.pos } });
      }
    }
  }

  private resolveCoreScore(): void {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (inRect(p.pos, this.core)) {
        p.coreTicks += 1;
      }
    }
  }

  private resolveDeaths(events: TickEvent[]): void {
    for (const p of this.players) {
      if (!p.alive) continue;
      if (p.hp > 0) continue;
      p.alive = false;
      p.deathTick = this.tick;
      events.push({ type: "death", playerId: p.id, pos: { ...p.pos } });

      for (const [attackerId, targets] of this.attackDamage) {
        if (!targets.includes(p.id)) continue;
        const attacker = this.players[attackerId];
        if (attacker) attacker.kills += 1;
      }
    }
  }
}

function toPublicView(p: PlayerState): PublicPlayerView {
  return {
    id: p.id,
    hp: p.hp,
    pos: { ...p.pos },
    facing: p.facing,
    alive: p.alive,
    queue: [p.queue[0], p.queue[1]],
    coreTicks: p.coreTicks,
    kills: p.kills,
  };
}

export function normalizeAction(value: unknown): Action {
  if (isAction(value)) return value;
  if (value && typeof value === "object" && "action" in value) {
    const a = (value as { action: unknown }).action;
    if (isAction(a)) return a;
  }
  return "WAIT";
}
