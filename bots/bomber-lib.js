#!/usr/bin/env node
"use strict";

/**
 * Bomber bot brain.
 * Survival first; endgame forces engagement without A↔B tile fights / oscillation.
 */

function key(p) {
  return `${p.x},${p.y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function neighbors(pos) {
  return [
    { x: pos.x, y: pos.y - 1, action: "MOVE_UP" },
    { x: pos.x, y: pos.y + 1, action: "MOVE_DOWN" },
    { x: pos.x - 1, y: pos.y, action: "MOVE_LEFT" },
    { x: pos.x + 1, y: pos.y, action: "MOVE_RIGHT" },
  ];
}

function opposite(action) {
  return (
    {
      MOVE_UP: "MOVE_DOWN",
      MOVE_DOWN: "MOVE_UP",
      MOVE_LEFT: "MOVE_RIGHT",
      MOVE_RIGHT: "MOVE_LEFT",
    }[action] || null
  );
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

function countSoft(tiles) {
  let n = 0;
  for (const row of tiles) for (const t of row) if (t === "soft") n++;
  return n;
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
  return bombs.filter((b) => blastSet(tiles, [b]).has(key(pos)));
}

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
  for (const n of neighbors(start)) {
    const np = { x: n.x, y: n.y };
    if (isEmpty(tiles, np) && !bombAt(bombs, np)) return n.action;
  }
  return null;
}

function canEscapeAfterBomb(tiles, bombs, start, power, maxSteps = 2) {
  const fake = {
    id: -1,
    ownerId: -1,
    pos: { ...start },
    fuse: maxSteps,
    power,
  };
  const danger = blastSet(tiles, bombs.concat([fake]));
  if (!danger.has(key(start))) return true;
  return (
    escapeMove(tiles, bombs.concat([fake]), start, danger, maxSteps) != null
  );
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

function stepPos(pos, action) {
  if (action === "MOVE_UP") return { x: pos.x, y: pos.y - 1 };
  if (action === "MOVE_DOWN") return { x: pos.x, y: pos.y + 1 };
  if (action === "MOVE_LEFT") return { x: pos.x - 1, y: pos.y };
  if (action === "MOVE_RIGHT") return { x: pos.x + 1, y: pos.y };
  return pos;
}

function pickMove(options, pos, memory) {
  if (!options.length) return null;
  const scored = options.map((action) => {
    const next = stepPos(pos, action);
    let score = 0;
    if (memory.lastAction && action === opposite(memory.lastAction)) score -= 6;
    if (memory.recent.includes(key(next))) score -= 3;
    else score += 2;
    score += (action.charCodeAt(5) + (memory.salt || 0)) % 3;
    return { action, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].action;
}

function listSafeMoves(tiles, bombs, pos, danger) {
  const opts = [];
  for (const n of neighbors(pos)) {
    const p = { x: n.x, y: n.y };
    if (!isEmpty(tiles, p) || bombAt(bombs, p)) continue;
    if (danger.has(key(p))) continue;
    opts.push(n.action);
  }
  return opts;
}

function nearestEnemy(self, players) {
  const enemies = players.filter((p) => p.id !== self.id && p.alive);
  enemies.sort(
    (a, b) => manhattan(self.pos, a.pos) - manhattan(self.pos, b.pos),
  );
  return enemies[0] || null;
}

function occupied(players, selfId, p) {
  return players.some(
    (pl) =>
      pl.alive && pl.id !== selfId && pl.pos.x === p.x && pl.pos.y === p.y,
  );
}

function inHazard(p, mapSize, hazardRing) {
  if (!hazardRing || hazardRing <= 0) return false;
  const edge = hazardRing;
  return (
    p.x <= edge ||
    p.y <= edge ||
    p.x >= mapSize - 1 - edge ||
    p.y >= mapSize - 1 - edge
  );
}

const memory = {
  recent: [],
  lastAction: null,
  lastPos: null,
  stuck: 0,
  salt: Math.floor(Math.random() * 17),
  wp: null,
  wpUntil: -1,
  duelStart: null,
  lastBombTick: -999,
};

/** Cells from which we can currently blast `enemy`. */
function isFiringCell(tiles, p, power, enemy) {
  return bombHits(tiles, p, power, enemy.pos) && manhattan(p, enemy.pos) >= 1;
}

function decide(msg, self, style = "hunter") {
  const { tiles, bombs, powerups, players } = msg;
  const mapSize = msg.mapSize || tiles.length;
  const hazardRing = msg.hazardRing || 0;
  const danger = blastSet(tiles, bombs);
  const power = self.power || 1;
  const softLeft = countSoft(tiles);
  const alive = players.filter((p) => p.alive).length;
  const duel = alive <= 2;
  const endgame = softLeft <= 10 || msg.tick >= 50 || duel;
  const huntStyle = endgame ? "hunter" : style;

  const enemy = nearestEnemy(self, players);
  const allowBomb = self.bombsLeft > 0 && !hasLiveOwnBomb(bombs, self.id);

  if (duel && memory.duelStart == null) memory.duelStart = msg.tick;
  if (!duel) memory.duelStart = null;
  const duelAge =
    duel && memory.duelStart != null ? msg.tick - memory.duelStart : 0;
  const engineDuel = msg.duelTicks || 0;

  if (
    memory.lastPos &&
    key(memory.lastPos) === key(self.pos) &&
    memory.lastAction &&
    String(memory.lastAction).startsWith("MOVE")
  ) {
    memory.stuck += 1;
  } else if (memory.lastPos && key(memory.lastPos) !== key(self.pos)) {
    memory.stuck = 0;
  }
  memory.lastPos = { ...self.pos };

  const finish = (action) => {
    memory.lastAction = action;
    if (action === "PLACE_BOMB") memory.lastBombTick = msg.tick;
    return action;
  };

  const safeCell = (p) =>
    !danger.has(key(p)) && !inHazard(p, mapSize, hazardRing);

  // Escape check slightly looser in prolonged duel so someone commits
  const escapeSteps =
    duel && (duelAge >= 15 || engineDuel >= 15 || hazardRing > 0) ? 3 : 2;

  // 0) Flee shrinking hazard before anything else
  if (hazardRing > 0) {
    if (inHazard(self.pos, mapSize, hazardRing)) {
      const inward = listSafeMoves(tiles, bombs, self.pos, danger).filter(
        (a) => {
          const dest = stepPos(self.pos, a);
          return (
            !occupied(players, self.id, dest) &&
            !inHazard(dest, mapSize, hazardRing)
          );
        },
      );
      if (inward.length) return finish(pickMove(inward, self.pos, memory));
    }
    // Stay ahead of next shrink: prefer deeper center
    if (!danger.has(key(self.pos))) {
      const margin = hazardRing + 1;
      const plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) =>
          !occupied(players, self.id, p) &&
          !inHazard(p, mapSize, margin) &&
          safeCell(p),
        true,
      );
      if (plan && plan.kind === "move") {
        const dest = stepPos(self.pos, plan.action);
        if (safeCell(dest) && !occupied(players, self.id, dest)) {
          // Only pull inward when near the edge
          if (inHazard(self.pos, mapSize, margin)) {
            return finish(plan.action);
          }
        }
      }
    }
  }

  // 1) Survive
  if (danger.has(key(self.pos))) {
    const steps = movesBeforeBlast(tiles, bombs, self.pos);
    const move = escapeMove(
      tiles,
      bombs,
      self.pos,
      danger,
      Number.isFinite(steps) ? steps : 3,
    );
    return finish(move || "WAIT");
  }

  // 2) Stuck breaker
  if (memory.stuck >= 2) {
    if (
      enemy &&
      allowBomb &&
      manhattan(self.pos, enemy.pos) <= Math.max(3, power + 1) &&
      canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)
    ) {
      memory.stuck = 0;
      return finish("PLACE_BOMB");
    }
    const opts = listSafeMoves(tiles, bombs, self.pos, danger).filter((a) => {
      const dest = stepPos(self.pos, a);
      return (
        a !== memory.lastAction &&
        a !== opposite(memory.lastAction) &&
        !occupied(players, self.id, dest)
      );
    });
    const alt = pickMove(opts, self.pos, memory);
    if (alt) {
      memory.stuck = 0;
      return finish(alt);
    }
  }

  // 3) Powerups (skip in late duel — finish the fight)
  if (powerups.length && !(duel && duelAge > 10)) {
    const plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) =>
        powerups.some((u) => u.pos.x === p.x && u.pos.y === p.y) &&
        !occupied(players, self.id, p),
      true,
    );
    if (plan && plan.kind === "move") return finish(plan.action);
  }

  // 4) ——— 1v1 duel: asymmetric commit, no orbiting ———
  if (duel && enemy) {
    const dist = manhattan(self.pos, enemy.pos);
    const chaser = self.id < enemy.id; // break mirror symmetry
    const ticksSinceBomb = msg.tick - memory.lastBombTick;

    // Always bomb if we already have a shot
    if (
      allowBomb &&
      bombHits(tiles, self.pos, power, enemy.pos) &&
      canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)
    ) {
      return finish("PLACE_BOMB");
    }
    if (
      allowBomb &&
      dist === 1 &&
      canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)
    ) {
      return finish("PLACE_BOMB");
    }

    // Forced commitment if duel drags on (engine also shrinks after ~18)
    if (
      allowBomb &&
      (ticksSinceBomb >= 10 || engineDuel >= 12 || hazardRing > 0) &&
      dist <= 4 &&
      canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)
    ) {
      return finish("PLACE_BOMB");
    }

    // Chaser: close to dist 1–2; Trailer: get onto a firing line at dist 2–power
    let plan;
    if (chaser || duelAge >= 20 || engineDuel >= 20 || hazardRing > 0) {
      plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) =>
          !occupied(players, self.id, p) &&
          !inHazard(p, mapSize, hazardRing) &&
          manhattan(p, enemy.pos) >= 1 &&
          manhattan(p, enemy.pos) <= 2 &&
          (manhattan(p, enemy.pos) === 1 ||
            isFiringCell(tiles, p, power, enemy)),
        true,
      );
    } else {
      plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) =>
          !occupied(players, self.id, p) &&
          !inHazard(p, mapSize, hazardRing) &&
          isFiringCell(tiles, p, power, enemy),
        true,
      );
    }

    if (plan && plan.kind === "move") {
      const dest = stepPos(self.pos, plan.action);
      if (
        !occupied(players, self.id, dest) &&
        !danger.has(key(dest)) &&
        !inHazard(dest, mapSize, hazardRing)
      ) {
        // Avoid pure ping-pong: if reversing, and we can bomb, bomb instead
        if (
          plan.action === opposite(memory.lastAction) &&
          allowBomb &&
          dist <= 3 &&
          canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)
        ) {
          return finish("PLACE_BOMB");
        }
        return finish(plan.action);
      }
    }
    if (plan && plan.kind === "need_bomb" && allowBomb) {
      if (
        softHitsFrom(tiles, self.pos, power) > 0 &&
        canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)
      ) {
        return finish("PLACE_BOMB");
      }
    }
    if (plan && plan.kind === "at_goal" && allowBomb) {
      if (canEscapeAfterBomb(tiles, bombs, self.pos, power, escapeSteps)) {
        return finish("PLACE_BOMB");
      }
    }

    // Last resort in duel: step closer on axis toward enemy
    const towardEnemy = [];
    if (enemy.pos.x > self.pos.x) towardEnemy.push("MOVE_RIGHT");
    if (enemy.pos.x < self.pos.x) towardEnemy.push("MOVE_LEFT");
    if (enemy.pos.y > self.pos.y) towardEnemy.push("MOVE_DOWN");
    if (enemy.pos.y < self.pos.y) towardEnemy.push("MOVE_UP");
    const safe = listSafeMoves(tiles, bombs, self.pos, danger).filter((a) => {
      const dest = stepPos(self.pos, a);
      return !occupied(players, self.id, dest) && towardEnemy.includes(a);
    });
    if (safe.length) return finish(pickMove(safe, self.pos, memory));
  }

  // 5) Multi-player fight (not pure duel)
  if (enemy && !duel) {
    const dist = manhattan(self.pos, enemy.pos);
    if (dist === 1 && allowBomb) {
      if (canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)) {
        return finish("PLACE_BOMB");
      }
    }
    if (
      allowBomb &&
      bombHits(tiles, self.pos, power, enemy.pos) &&
      (huntStyle !== "sniper" || dist >= 2)
    ) {
      if (canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)) {
        return finish("PLACE_BOMB");
      }
    }
  }

  // 6) Early soft farm
  if (
    !endgame &&
    allowBomb &&
    huntStyle === "miner" &&
    softHitsFrom(tiles, self.pos, power) > 0 &&
    canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)
  ) {
    return finish("PLACE_BOMB");
  }

  // 7) Waypoints only when 3+ alive (avoid 1v1 orbit)
  if (enemy && !duel) {
    const needNewWp =
      !memory.wp ||
      msg.tick >= memory.wpUntil ||
      manhattan(memory.wp, enemy.pos) > 3 ||
      occupied(players, self.id, memory.wp) ||
      !isEmpty(tiles, memory.wp) ||
      danger.has(key(memory.wp));

    if (needNewWp) {
      const candidates = [];
      for (const n of neighbors(enemy.pos)) {
        const p = { x: n.x, y: n.y };
        if (
          isEmpty(tiles, p) &&
          !bombAt(bombs, p) &&
          !danger.has(key(p)) &&
          !occupied(players, self.id, p)
        ) {
          candidates.push(p);
        }
      }
      for (const dir of [
        { x: 2, y: 0 },
        { x: -2, y: 0 },
        { x: 0, y: 2 },
        { x: 0, y: -2 },
      ]) {
        const p = { x: enemy.pos.x + dir.x, y: enemy.pos.y + dir.y };
        if (
          isEmpty(tiles, p) &&
          !bombAt(bombs, p) &&
          !danger.has(key(p)) &&
          !occupied(players, self.id, p)
        ) {
          candidates.push(p);
        }
      }
      if (candidates.length) {
        const idx =
          (self.id * 5 + Math.floor(msg.tick / 7) + memory.salt) %
          candidates.length;
        memory.wp = candidates[idx];
      } else {
        memory.wp = null;
      }
      memory.wpUntil = msg.tick + 5 + self.id;
    }

    if (memory.wp && key(self.pos) !== key(memory.wp)) {
      const plan = planToward(
        tiles,
        bombs,
        self.pos,
        (p) => key(p) === key(memory.wp),
        true,
      );
      if (plan && plan.kind === "move") {
        const dest = stepPos(self.pos, plan.action);
        if (!occupied(players, self.id, dest) && !danger.has(key(dest))) {
          return finish(plan.action);
        }
      }
      if (plan && plan.kind === "need_bomb" && allowBomb) {
        if (
          softHitsFrom(tiles, self.pos, power) > 0 &&
          canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)
        ) {
          return finish("PLACE_BOMB");
        }
      }
    } else if (memory.wp && key(self.pos) === key(memory.wp)) {
      memory.wpUntil = msg.tick;
      if (
        allowBomb &&
        enemy &&
        bombHits(tiles, self.pos, power, enemy.pos) &&
        canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)
      ) {
        return finish("PLACE_BOMB");
      }
    }
  }

  // 8) Early soft path
  if (!endgame) {
    const plan = planToward(
      tiles,
      bombs,
      self.pos,
      (p) => isSoft(tiles, p),
      true,
    );
    if (plan && plan.kind === "move") return finish(plan.action);
    if (plan && plan.kind === "need_bomb" && allowBomb) {
      if (
        softHitsFrom(tiles, self.pos, power) > 0 &&
        canEscapeAfterBomb(tiles, bombs, self.pos, power, 2)
      ) {
        return finish("PLACE_BOMB");
      }
    }
  }

  // 9) Explore
  const opts = listSafeMoves(tiles, bombs, self.pos, danger).filter((a) => {
    const dest = stepPos(self.pos, a);
    return !occupied(players, self.id, dest);
  });
  const move = pickMove(opts, self.pos, memory);
  return finish(move || "WAIT");
}

module.exports = {
  decide,
  blastSet,
  canEscapeAfterBomb,
  escapeMove,
  bombHits,
  softHitsFrom,
};
