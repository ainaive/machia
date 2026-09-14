#!/usr/bin/env node
"use strict";

/**
 * Bomber bot brain — prioritizes not dying to own bombs.
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

function bombsThreatening(tiles, bombs, pos) {
  const danger = blastSet(tiles, bombs);
  if (!danger.has(key(pos))) return [];
  return bombs.filter((b) => {
    const one = blastSet(tiles, [b]);
    return one.has(key(pos));
  });
}

/** Moves left before the soonest threatening bomb explodes (observation-time fuse). */
function movesBeforeBlast(tiles, bombs, pos) {
  const th = bombsThreatening(tiles, bombs, pos);
  if (!th.length) return Infinity;
  return Math.min(...th.map((b) => b.fuse));
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

/**
 * First MOVE that leads to a non-danger cell within maxSteps.
 * Never returns PLACE_BOMB.
 */
function escapeMove(tiles, bombs, start, danger, maxSteps) {
  if (!danger.has(key(start))) return null;
  const q = [{ p: start, d: 0, first: null }];
  const seen = new Set([key(start)]);
  while (q.length) {
    const { p, d, first } = q.shift();
    if (d >= maxSteps) continue;
    for (const n of neighbors(p)) {
      const np = { x: n.x, y: n.y };
      const k = key(np);
      if (seen.has(k)) continue;
      if (!isEmpty(tiles, np) || bombAt(bombs, np)) continue;
      seen.add(k);
      const firstAction = first || n.action;
      if (!danger.has(k)) return firstAction;
      q.push({ p: np, d: d + 1, first: firstAction });
    }
  }
  // no full escape — step to any neighbor that reduces… or any open neighbor
  for (const n of neighbors(start)) {
    const np = { x: n.x, y: n.y };
    if (isEmpty(tiles, np) && !bombAt(bombs, np)) return n.action;
  }
  return null;
}

/** After placing a bomb here, can we reach safety in `maxSteps` moves? */
function canEscapeAfterBomb(tiles, bombs, start, power, maxSteps = 3) {
  const fake = {
    id: -1,
    ownerId: -1,
    pos: { ...start },
    fuse: maxSteps,
    power,
  };
  const danger = blastSet(tiles, bombs.concat([fake]));
  if (!danger.has(key(start))) return true;
  return escapeMove(tiles, bombs.concat([fake]), start, danger, maxSteps) != null;
}

function hasLiveOwnBomb(bombs, selfId) {
  return bombs.some((b) => b.ownerId === selfId);
}

function planToward(tiles, bombs, start, goalFn, avoidDanger) {
  const danger = avoidDanger ? blastSet(tiles, bombs) : new Set();
  if (goalFn(start)) return { kind: "at_goal" };

  const q = [start];
  const seen = new Set([key(start)]);
  const prev = new Map();

  while (q.length) {
    const cur = q.shift();
    for (const n of neighbors(cur)) {
      const p = { x: n.x, y: n.y };
      const k = key(p);
      if (seen.has(k)) continue;
      if (isHard(tiles, p) || bombAt(bombs, p)) continue;
      if (isEmpty(tiles, p) && avoidDanger && danger.has(k)) continue;

      seen.add(k);
      prev.set(k, { from: cur, action: n.action, soft: isSoft(tiles, p) });
      if (goalFn(p)) {
        let step = k;
        while (prev.get(step)) {
          const pr = prev.get(step);
          if (key(pr.from) === key(start)) {
            if (pr.soft) return { kind: "need_bomb" };
            return { kind: "move", action: pr.action };
          }
          step = key(pr.from);
        }
        return { kind: "at_goal" };
      }
      if (isEmpty(tiles, p) || isSoft(tiles, p)) q.push(p);
    }
  }
  return null;
}

function safeRoam(tiles, bombs, pos, danger, tick) {
  const opts = [];
  for (const n of neighbors(pos)) {
    const p = { x: n.x, y: n.y };
    if (!isEmpty(tiles, p) || bombAt(bombs, p)) continue;
    if (danger.has(key(p))) continue;
    opts.push(n.action);
  }
  if (!opts.length) return null;
  return opts[tick % opts.length];
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

/**
 * @param {"hunter"|"miner"|"ambusher"|"sniper"} style
 */
function decide(msg, self, style = "hunter") {
  const { tiles, bombs, powerups, players } = msg;
  const danger = blastSet(tiles, bombs);
  const power = self.power || 1;
  const mid = (msg.mapSize - 1) / 2;
  const enemy = nearestEnemy(self, players);
  const ownBombLive = hasLiveOwnBomb(bombs, self.id);

  // ——— Survival first ———
  if (danger.has(key(self.pos))) {
    const steps = movesBeforeBlast(tiles, bombs, self.pos);
    const move = escapeMove(
      tiles,
      bombs,
      self.pos,
      danger,
      Number.isFinite(steps) ? steps : 3,
    );
    if (move) return move;
    return "WAIT";
  }

  // While our bomb is live: do not place another; stay out of its blast (already out)
  // Prefer picking powerups / positioning, never bomb.
  const allowBomb = self.bombsLeft > 0 && !ownBombLive;

  // Powerups (safe path only)
  if (powerups.length) {
    const plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => powerups.some((u) => u.pos.x === p.x && u.pos.y === p.y),
      true,
    );
    if (plan && plan.kind === "move") return plan.action;
  }

  // Offensive / farming bomb — only if clear escape in 3 moves
  if (allowBomb) {
    const hitsEnemy =
      enemy && bombHits(tiles, self.pos, power, enemy.pos);
    const hitsSoft = softHitsFrom(tiles, self.pos, power) > 0;

    let wantBomb = false;
    if (style === "sniper") {
      wantBomb =
        hitsEnemy &&
        Math.abs(enemy.pos.x - self.pos.x) +
          Math.abs(enemy.pos.y - self.pos.y) >=
          2;
    } else if (style === "miner") {
      wantBomb = hitsSoft || hitsEnemy;
    } else if (style === "ambusher") {
      wantBomb = hitsEnemy || (hitsSoft && msg.tick % 4 === 0);
    } else {
      // hunter: enemy preferred, soft only if blocking
      wantBomb = hitsEnemy || hitsSoft;
    }

    if (wantBomb && canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)) {
      return "PLACE_BOMB";
    }
  }

  // Path toward style goal (through soft = need_bomb at current cell only if we can escape)
  let goalFn = null;
  if (style === "miner") {
    goalFn = (p) => isSoft(tiles, p);
  } else if (style === "ambusher") {
    const onRing = Math.abs(self.pos.x - mid) + Math.abs(self.pos.y - mid) <= 3;
    if (!onRing) {
      goalFn = (p) => Math.abs(p.x - mid) + Math.abs(p.y - mid) <= 2;
    } else if (enemy) {
      goalFn = (p) =>
        Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y) <= 2;
    }
  } else if (style === "sniper" && enemy) {
    goalFn = (p) => {
      if (!(p.x === enemy.pos.x || p.y === enemy.pos.y)) return false;
      const d = Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y);
      return d >= 2 && d <= Math.max(2, power);
    };
  }
  if (!goalFn && enemy) {
    goalFn = (p) => p.x === enemy.pos.x && p.y === enemy.pos.y;
  }

  if (goalFn) {
    const plan = planToward(tiles, bombs, self.pos, goalFn, true);
    if (plan && plan.kind === "move") return plan.action;
    if (plan && plan.kind === "need_bomb" && allowBomb) {
      if (
        softHitsFrom(tiles, self.pos, power) > 0 &&
        canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)
      ) {
        return "PLACE_BOMB";
      }
      // can't bomb safely — sidestep to a better angle
      const roam = safeRoam(tiles, bombs, self.pos, danger, msg.tick);
      if (roam) return roam;
    }
    if (plan && plan.kind === "at_goal" && allowBomb) {
      // standing on goal (e.g. next to soft via soft cell goal) — try farm bomb
      if (
        softHitsFrom(tiles, self.pos, power) > 0 &&
        canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)
      ) {
        return "PLACE_BOMB";
      }
    }
  }

  // Approach a safe bombing tile (soft in range + escape)
  if (allowBomb) {
    const plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => {
        if (!isEmpty(tiles, p)) return false;
        if (softHitsFrom(tiles, p, power) <= 0) return false;
        return canEscapeAfterBomb(tiles, bombs, p, power, 2);
      },
      true,
    );
    if (plan && plan.kind === "move") return plan.action;
  }

  // Roam without entering danger
  const roam = safeRoam(tiles, bombs, self.pos, danger, msg.tick + self.id);
  if (roam) return roam;

  return "WAIT";
}

module.exports = {
  decide,
  blastSet,
  canEscapeAfterBomb,
  escapeMove,
  bombHits,
  softHitsFrom,
};
