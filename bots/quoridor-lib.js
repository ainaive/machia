"use strict";

/**
 * Shared Quoridor heuristics for sample bots.
 * Styles: rush | blocker | balanced
 */

function parseLegal(obs) {
  const legal = obs.observation?.legal ?? obs.legal ?? [];
  return legal.filter((a) => a && a !== "WAIT");
}

function pathLen(from, goal, walls, size) {
  if (atGoal(from, goal, size)) return 0;
  const q = [{ x: from.x, y: from.y, d: 0 }];
  const seen = new Set(`${from.x},${from.y}`);
  const dirs = [
    [0, -1],
    [0, 1],
    [1, 0],
    [-1, 0],
  ];
  while (q.length) {
    const cur = q.shift();
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      if (edgeBlocked(cur, { x: nx, y: ny }, walls)) continue;
      if (atGoal({ x: nx, y: ny }, goal, size)) return cur.d + 1;
      seen.add(key);
      q.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
  return 999;
}

function atGoal(pos, goal, size) {
  if (goal === "N") return pos.y === 0;
  if (goal === "S") return pos.y === size - 1;
  if (goal === "E") return pos.x === size - 1;
  return pos.x === 0;
}

function edgeBlocked(from, to, walls) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  for (const w of walls) {
    if (w.orient === "H" && dy !== 0) {
      const edgeY = Math.min(from.y, to.y);
      if (edgeY === w.y && (from.x === w.x || from.x === w.x + 1)) return true;
    }
    if (w.orient === "V" && dx !== 0) {
      const edgeX = Math.min(from.x, to.x);
      if (edgeX === w.x && (from.y === w.y || from.y === w.y + 1)) return true;
    }
  }
  return false;
}

function applyMove(pos, key) {
  const m = /^(MOVE|JUMP):([NSEW]|NE|NW|SE|SW)$/.exec(key);
  if (!m) return null;
  const dir = m[2];
  const delta = {
    N: [0, -1],
    S: [0, 1],
    E: [1, 0],
    W: [-1, 0],
    NE: [1, -1],
    NW: [-1, -1],
    SE: [1, 1],
    SW: [-1, 1],
  }[dir];
  if (!delta) return null;
  return { x: pos.x + delta[0], y: pos.y + delta[1] };
}

function bestRush(obs, legal) {
  const self = obs.observation?.self ?? obs.self;
  const walls = obs.observation?.walls ?? obs.walls ?? [];
  const size = obs.observation?.mapSize ?? obs.mapSize ?? 7;
  const moves = legal.filter((a) => a.startsWith("MOVE:") || a.startsWith("JUMP:"));
  let best = moves[0] ?? "WAIT";
  let bestD = Infinity;
  for (const a of moves) {
    const land = applyMove(self.pos, a);
    if (!land) continue;
    const d = pathLen(land, self.goal, walls, size);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

function bestBlock(obs, legal) {
  const self = obs.observation?.self ?? obs.self;
  const players = obs.observation?.players ?? obs.players ?? [];
  const walls = obs.observation?.walls ?? obs.walls ?? [];
  const size = obs.observation?.mapSize ?? obs.mapSize ?? 7;
  const rivals = players.filter((p) => p.id !== self.id && !p.finished);
  if (!rivals.length || self.fences <= 0) return bestRush(obs, legal);

  const myDist = pathLen(self.pos, self.goal, walls, size);
  let threat = rivals[0];
  let threatDist = pathLen(threat.pos, threat.goal, walls, size);
  for (const r of rivals.slice(1)) {
    const d = pathLen(r.pos, r.goal, walls, size);
    if (d < threatDist) {
      threat = r;
      threatDist = d;
    }
  }

  // Only bother blocking if rival is ahead or tied
  if (threatDist > myDist + 1) return bestRush(obs, legal);

  const wallsLegal = legal.filter((a) => a.startsWith("WALL:"));
  let bestWall = null;
  let bestGain = 0;
  for (const a of wallsLegal) {
    const m = /^WALL:([HV]):(-?\d+):(-?\d+)$/.exec(a);
    if (!m) continue;
    const wall = { orient: m[1], x: Number(m[2]), y: Number(m[3]) };
    const next = walls.concat([wall]);
    const after = pathLen(threat.pos, threat.goal, next, size);
    const mineAfter = pathLen(self.pos, self.goal, next, size);
    const gain = after - threatDist - Math.max(0, mineAfter - myDist);
    if (gain > bestGain) {
      bestGain = gain;
      bestWall = a;
    }
  }
  if (bestWall && bestGain >= 1) return bestWall;
  return bestRush(obs, legal);
}

function decide(msg, style) {
  const obs = msg.observation ?? msg;
  const legal = parseLegal(obs);
  if (!legal.length) return "WAIT";
  if (style === "rush") return bestRush(obs, legal);
  if (style === "blocker") return bestBlock(obs, legal);
  // balanced: block when rival is strictly closer, else rush
  const self = obs.self ?? obs.observation?.self;
  const players = obs.players ?? obs.observation?.players ?? [];
  const walls = obs.walls ?? obs.observation?.walls ?? [];
  const size = obs.mapSize ?? obs.observation?.mapSize ?? 7;
  const myDist = pathLen(self.pos, self.goal, walls, size);
  let minRival = Infinity;
  for (const p of players) {
    if (p.id === self.id || p.finished) continue;
    minRival = Math.min(minRival, pathLen(p.pos, p.goal, walls, size));
  }
  if (minRival < myDist) return bestBlock(obs, legal);
  return bestRush(obs, legal);
}

module.exports = { decide };
