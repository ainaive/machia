#!/usr/bin/env node
"use strict";

/**
 * Shared bomber helpers (copied into each bot; bots must stay single-file).
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

function isHard(tiles, p) {
  return !inBounds(tiles, p) || tiles[p.y][p.x] === "hard";
}

function isSoft(tiles, p) {
  return inBounds(tiles, p) && tiles[p.y][p.x] === "soft";
}

function isEmpty(tiles, p) {
  return inBounds(tiles, p) && tiles[p.y][p.x] === "empty";
}

function bombAt(bombs, p) {
  return bombs.some((b) => b.pos.x === p.x && b.pos.y === p.y);
}

/** Blast cells for current bombs, stopped by hard/soft walls. */
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

/** Would a bomb at `pos` with `power` hit `target`? */
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

function walkable(tiles, bombs, p, danger) {
  if (!isEmpty(tiles, p)) return false;
  if (bombAt(bombs, p)) return false;
  if (danger && danger.has(key(p))) return false;
  return true;
}

/** BFS: first action toward goal, or null. Goals = set of "x,y" or predicate. */
function bfsFirstAction(tiles, bombs, start, goalFn, avoidDanger) {
  const danger = avoidDanger ? blastSet(tiles, bombs) : new Set();
  if (goalFn(start)) return "WAIT";
  const q = [start];
  const seen = new Set([key(start)]);
  const prev = new Map();
  while (q.length) {
    const cur = q.shift();
    for (const n of neighbors(cur)) {
      const p = { x: n.x, y: n.y };
      const k = key(p);
      if (seen.has(k)) continue;
      if (!walkable(tiles, bombs, p, danger)) continue;
      seen.add(k);
      prev.set(k, { from: cur, action: n.action });
      if (goalFn(p)) {
        // walk back to first step
        let step = k;
        let action = n.action;
        while (prev.get(step)) {
          const pr = prev.get(step);
          if (key(pr.from) === key(start)) return pr.action;
          step = key(pr.from);
          action = pr.action;
        }
        return action;
      }
      q.push(p);
    }
  }
  return null;
}

function findEscape(tiles, bombs, start, extraBomb) {
  const simBombs = extraBomb ? bombs.concat([extraBomb]) : bombs;
  const danger = blastSet(tiles, simBombs);
  if (!danger.has(key(start))) return true;
  // BFS to any safe empty cell
  const q = [start];
  const seen = new Set([key(start)]);
  while (q.length) {
    const cur = q.shift();
    for (const n of neighbors(cur)) {
      const p = { x: n.x, y: n.y };
      const k = key(p);
      if (seen.has(k)) continue;
      if (!isEmpty(tiles, p) || bombAt(simBombs, p)) continue;
      seen.add(k);
      if (!danger.has(k)) return true;
      // can transit through danger briefly? only if fuse long — keep strict: only expand safe
      // Actually allow expanding into danger to reach safety beyond if path exists
      q.push(p);
    }
  }
  return false;
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

function decideHunter(msg, self) {
  const { tiles, bombs, powerups, players } = msg;
  const danger = blastSet(tiles, bombs);

  // 1. Escape blast
  if (danger.has(key(self.pos))) {
    const act = bfsFirstAction(
      tiles,
      bombs,
      self.pos,
      (p) => !danger.has(key(p)),
      false,
    );
    if (act && act !== "WAIT") return act;
    // move anywhere walkable ignoring danger map for last resort
    for (const n of neighbors(self.pos)) {
      if (isEmpty(tiles, n) && !bombAt(bombs, n)) return n.action;
    }
    return "WAIT";
  }

  // 2. Pickup nearby powerup
  if (powerups.length) {
    const act = bfsFirstAction(
      tiles,
      bombs,
      self.pos,
      (p) => powerups.some((u) => u.pos.x === p.x && u.pos.y === p.y),
      true,
    );
    if (act && act !== "WAIT") return act;
  }

  const enemy = nearestEnemy(self, players);
  const power = self.power || 1;

  // 3. Bomb if enemy in range and we can escape
  if (enemy && self.bombsLeft > 0) {
    if (bombHits(tiles, self.pos, power, enemy.pos)) {
      const fake = {
        id: -1,
        ownerId: self.id,
        pos: { ...self.pos },
        fuse: 4,
        power,
      };
      if (findEscape(tiles, bombs, self.pos, fake)) return "PLACE_BOMB";
    }
  }

  // 4. Path to enemy; if blocked by soft wall, bomb the soft wall when adjacent
  if (enemy) {
    const act = bfsFirstAction(
      tiles,
      bombs,
      self.pos,
      (p) => p.x === enemy.pos.x && p.y === enemy.pos.y,
      true,
    );
    if (act && act !== "WAIT") return act;

    // approach soft wall toward enemy
    if (self.bombsLeft > 0) {
      for (const n of neighbors(self.pos)) {
        if (!isSoft(tiles, n)) continue;
        const fake = {
          id: -1,
          ownerId: self.id,
          pos: { ...self.pos },
          fuse: 4,
          power,
        };
        if (findEscape(tiles, bombs, self.pos, fake)) return "PLACE_BOMB";
      }
    }
  }

  // 5. Clear soft walls if idle
  if (self.bombsLeft > 0 && softHitsFrom(tiles, self.pos, power) > 0) {
    const fake = {
      id: -1,
      ownerId: self.id,
      pos: { ...self.pos },
      fuse: 4,
      power,
    };
    if (findEscape(tiles, bombs, self.pos, fake)) return "PLACE_BOMB";
  }

  // roam to center
  const mid = (msg.mapSize - 1) / 2;
  const roam = bfsFirstAction(
    tiles,
    bombs,
    self.pos,
    (p) => p.x === mid && p.y === mid,
    true,
  );
  return roam && roam !== "WAIT" ? roam : "WAIT";
}

module.exports = {
  decideHunter,
  blastSet,
  bfsFirstAction,
  softHitsFrom,
  findEscape,
  bombHits,
  nearestEnemy,
  key,
  neighbors,
  isSoft,
  isEmpty,
  bombAt,
};
