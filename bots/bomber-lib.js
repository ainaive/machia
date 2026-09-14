#!/usr/bin/env node
"use strict";

/**
 * Shared Bomber decision helpers.
 * Key anti-stuck rules:
 * - Plan paths through soft walls (bomb when next obstacle is soft).
 * - Never idle forever: if safe moves exist, take one.
 */

function key(p) {
  return `${p.x},${p.y}`;
}

function neighbors(pos) {
  return [
    { x: pos.x, y: pos.y - 1, action: "MOVE_UP" },
    { x: pos.x, y: pos.y + 1, action: "MOVE_DOWN" },
    { x: pos.x - 1, y: pos.y, action: "MOVE_LEFT" },
    { x: pos.x + 1, y: pos.y, action: "MOVE_RIGHT" },
  ];
}

function inBounds(tiles, p) {
  return p.y >= 0 && p.x >= 0 && p.y < tiles.length && p.x < tiles[0].length;
}

function tileAt(tiles, p) {
  if (!inBounds(tiles, p)) return "hard";
  return tiles[p.y][p.x];
}

function isHard(tiles, p) {
  return tileAt(tiles, p) === "hard";
}

function isSoft(tiles, p) {
  return tileAt(tiles, p) === "soft";
}

function isEmpty(tiles, p) {
  return tileAt(tiles, p) === "empty";
}

function bombAt(bombs, p) {
  return bombs.some((b) => b.pos.x === p.x && b.pos.y === p.y);
}

function blastSet(tiles, bombs) {
  const danger = new Set();
  for (const b of bombs) {
    danger.add(key(b.pos));
    for (const dir of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      for (let d = 1; d <= b.power; d++) {
        const c = { x: b.pos.x + dir.x * d, y: b.pos.y + dir.y * d };
        if (isHard(tiles, c)) break;
        danger.add(key(c));
        if (isSoft(tiles, c)) break;
      }
    }
  }
  return danger;
}

function bombHits(tiles, pos, power, target) {
  if (pos.x === target.x && pos.y === target.y) return true;
  if (pos.x !== target.x && pos.y !== target.y) return false;
  const dir =
    pos.x === target.x
      ? { x: 0, y: target.y > pos.y ? 1 : -1 }
      : { x: target.x > pos.x ? 1 : -1, y: 0 };
  const dist =
    pos.x === target.x
      ? Math.abs(target.y - pos.y)
      : Math.abs(target.x - pos.x);
  if (dist > power) return false;
  for (let d = 1; d <= dist; d++) {
    const c = { x: pos.x + dir.x * d, y: pos.y + dir.y * d };
    if (isHard(tiles, c)) return false;
    if (d < dist && isSoft(tiles, c)) return false;
  }
  return true;
}

function softHitsFrom(tiles, pos, power) {
  let n = 0;
  for (const dir of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    for (let d = 1; d <= power; d++) {
      const c = { x: pos.x + dir.x * d, y: pos.y + dir.y * d };
      if (isHard(tiles, c)) break;
      if (isSoft(tiles, c)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/** Escape within `maxSteps` moves to a non-danger cell (fuse-aware). */
function findEscape(tiles, bombs, start, extraBomb, maxSteps = 3) {
  const simBombs = extraBomb ? bombs.concat([extraBomb]) : bombs.slice();
  const danger = blastSet(tiles, simBombs);
  if (!danger.has(key(start))) return true;

  const q = [{ p: start, d: 0 }];
  const seen = new Set([key(start)]);
  while (q.length) {
    const { p, d } = q.shift();
    if (d >= maxSteps) continue;
    for (const n of neighbors(p)) {
      const np = { x: n.x, y: n.y };
      const k = key(np);
      if (seen.has(k)) continue;
      if (!isEmpty(tiles, np) || bombAt(simBombs, np)) continue;
      seen.add(k);
      if (!danger.has(k)) return true;
      q.push({ p: np, d: d + 1 });
    }
  }
  return false;
}

function canBombHere(tiles, bombs, self) {
  if (!self.bombsLeft) return false;
  if (bombAt(bombs, self.pos)) return false;
  const fake = {
    id: -1,
    ownerId: self.id,
    pos: { ...self.pos },
    fuse: 4,
    power: self.power || 1,
  };
  return findEscape(tiles, bombs, self.pos, fake, 3);
}

/**
 * BFS allowing soft cells as nodes. First step:
 * - empty -> MOVE_*
 * - soft -> PLACE_BOMB (caller must verify canBombHere) marked as needsBomb
 */
function planToward(tiles, bombs, start, goalFn, avoidDanger) {
  const danger = avoidDanger ? blastSet(tiles, bombs) : new Set();
  if (goalFn(start)) return { kind: "wait" };

  const q = [start];
  const seen = new Set([key(start)]);
  const prev = new Map();

  while (q.length) {
    const cur = q.shift();
    for (const n of neighbors(cur)) {
      const p = { x: n.x, y: n.y };
      const k = key(p);
      if (seen.has(k)) continue;
      if (isHard(tiles, p)) continue;
      if (bombAt(bombs, p)) continue;
      // may step on empty or soft (soft = break later)
      if (isEmpty(tiles, p) && avoidDanger && danger.has(k)) continue;
      // don't enter soft if we're avoiding and soft is in danger? soft isn't walkable anyway

      seen.add(k);
      prev.set(k, { from: cur, action: n.action, soft: isSoft(tiles, p) });
      if (goalFn(p)) {
        // reconstruct first edge from start
        let step = k;
        while (prev.get(step)) {
          const pr = prev.get(step);
          if (key(pr.from) === key(start)) {
            if (pr.soft) return { kind: "bomb_blocker", action: pr.action };
            return { kind: "move", action: pr.action };
          }
          step = key(pr.from);
        }
        return { kind: "wait" };
      }
      // only expand through empty (soft is goal-stop for pathing through:
      // treat soft as traversable for search so we can path beyond)
      if (isEmpty(tiles, p)) q.push(p);
      else if (isSoft(tiles, p)) {
        // also expand beyond soft as if cleared, for long-term routing
        q.push(p);
      }
    }
  }
  return null;
}

function safeMoves(tiles, bombs, pos, danger) {
  const out = [];
  for (const n of neighbors(pos)) {
    const p = { x: n.x, y: n.y };
    if (!isEmpty(tiles, p) || bombAt(bombs, p)) continue;
    if (danger.has(key(p))) continue;
    out.push(n.action);
  }
  return out;
}

function anyMove(tiles, bombs, pos) {
  for (const n of neighbors(pos)) {
    const p = { x: n.x, y: n.y };
    if (isEmpty(tiles, p) && !bombAt(bombs, p)) return n.action;
  }
  return null;
}

function nearestEnemy(self, players) {
  const enemies = players.filter((p) => p.id !== self.id && p.alive);
  enemies.sort(
    (a, b) =>
      Math.abs(a.pos.x - self.pos.x) +
      Math.abs(a.pos.y - self.pos.y) -
      (Math.abs(b.pos.x - self.pos.x) + Math.abs(b.pos.y - self.pos.y)),
  );
  return enemies[0] || null;
}

function applyPlan(plan, tiles, bombs, self) {
  if (!plan) return null;
  if (plan.kind === "move") return plan.action;
  if (plan.kind === "bomb_blocker") {
    if (canBombHere(tiles, bombs, self)) return "PLACE_BOMB";
    // can't bomb safely: step sideways if possible
    return null;
  }
  if (plan.kind === "wait") return null;
  return null;
}

/**
 * @param {"hunter"|"miner"|"ambusher"|"sniper"} style
 */
function decide(msg, self, style = "hunter") {
  const { tiles, bombs, powerups, players } = msg;
  const danger = blastSet(tiles, bombs);
  const power = self.power || 1;
  const mid = (msg.mapSize - 1) / 2;
  const enemy = nearestEnemy(self, players);

  // 1) Escape
  if (danger.has(key(self.pos))) {
    const plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => !danger.has(key(p)),
      false,
    );
    const act = applyPlan(plan, tiles, bombs, self);
    if (act) return act;
    const flee = anyMove(tiles, bombs, self.pos);
    return flee || "WAIT";
  }

  // 2) Powerups
  if (powerups.length) {
    const plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => powerups.some((u) => u.pos.x === p.x && u.pos.y === p.y),
      true,
    );
    const act = applyPlan(plan, tiles, bombs, self);
    if (act) return act;
  }

  // 3) Offensive bomb if enemy in line
  if (enemy && self.bombsLeft > 0) {
    const dist =
      Math.abs(enemy.pos.x - self.pos.x) + Math.abs(enemy.pos.y - self.pos.y);
    const wantSniper = style === "sniper" ? dist >= 2 : true;
    if (wantSniper && bombHits(tiles, self.pos, power, enemy.pos)) {
      if (canBombHere(tiles, bombs, self)) return "PLACE_BOMB";
    }
  }

  // 4) Style targets
  let plan = null;
  if (style === "miner") {
    // nearest soft (cell that is soft, or adjacent)
    plan = planToward(tiles, bombs, self.pos, (p) => isSoft(tiles, p), true);
    if (!plan) {
      plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) => neighbors(p).some((n) => isSoft(tiles, n)),
        true,
      );
    }
  } else if (style === "ambusher") {
    const onRing = Math.abs(self.pos.x - mid) + Math.abs(self.pos.y - mid) <= 3;
    if (!onRing) {
      plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) => Math.abs(p.x - mid) + Math.abs(p.y - mid) <= 2,
        true,
      );
    } else if (enemy) {
      plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) =>
          Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y) <= 2,
        true,
      );
    }
  } else if (style === "sniper" && enemy) {
    plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => {
        if (!(p.x === enemy.pos.x || p.y === enemy.pos.y)) return false;
        const d =
          Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y);
        return d >= 2 && d <= Math.max(2, power);
      },
      true,
    );
  }

  if (!plan && enemy) {
    plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => p.x === enemy.pos.x && p.y === enemy.pos.y,
      true,
    );
  }

  let act = applyPlan(plan, tiles, bombs, self);
  if (act) return act;

  // 5) If plan said bomb_blocker but couldn't, or null: bomb any soft in range
  if (self.bombsLeft > 0 && softHitsFrom(tiles, self.pos, power) > 0) {
    if (canBombHere(tiles, bombs, self)) return "PLACE_BOMB";
  }

  // 6) Approach a cell where we could bomb a soft AND escape
  const approach = planToward(
    tiles,
    bombs,
    self.pos,
    (p) => {
      if (!isEmpty(tiles, p)) return false;
      if (softHitsFrom(tiles, p, power) <= 0) return false;
      // cheap escape heuristic from p: has a neighbor not in future blast of bomb at p
      return true;
    },
    true,
  );
  act = applyPlan(approach, tiles, bombs, self);
  if (act) return act;

  // 7) Anti-stuck: never sit forever — wander safe cells
  const moves = safeMoves(tiles, bombs, self.pos, danger);
  if (moves.length) {
    // deterministic-ish roam using tick
    return moves[msg.tick % moves.length];
  }

  const fallback = anyMove(tiles, bombs, self.pos);
  return fallback || "WAIT";
}

module.exports = {
  decide,
  blastSet,
  findEscape,
  bombHits,
  nearestEnemy,
  softHitsFrom,
  canBombHere,
  planToward,
  key,
  neighbors,
  isSoft,
  isEmpty,
  bombAt,
};
