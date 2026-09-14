#!/usr/bin/env node
"use strict";

/**
 * Sokoban sample brain: BFS on (player, boxes) for small levels.
 * Avoids greedy corner deadlocks that made demos look brain-dead.
 */

function key(p) {
  return `${p.x},${p.y}`;
}

function boxesKey(boxes) {
  return boxes
    .map(key)
    .sort()
    .join(";");
}

function stateKey(pos, boxes) {
  return `${key(pos)}|${boxesKey(boxes)}`;
}

const ACTIONS = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
const DELTA = {
  MOVE_UP: { x: 0, y: -1 },
  MOVE_DOWN: { x: 0, y: 1 },
  MOVE_LEFT: { x: -1, y: 0 },
  MOVE_RIGHT: { x: 1, y: 0 },
};

function walkable(cells, p) {
  if (p.y < 0 || p.x < 0 || p.y >= cells.length || p.x >= cells[0].length) {
    return false;
  }
  return cells[p.y][p.x] !== "wall";
}

function boxIndex(boxes, p) {
  return boxes.findIndex((b) => b.x === p.x && b.y === p.y);
}

function applyMove(cells, pos, boxes, action) {
  const d = DELTA[action];
  const next = { x: pos.x + d.x, y: pos.y + d.y };
  if (!walkable(cells, next)) return null;
  const bi = boxIndex(boxes, next);
  let nextBoxes = boxes;
  if (bi >= 0) {
    const beyond = { x: next.x + d.x, y: next.y + d.y };
    if (!walkable(cells, beyond)) return null;
    if (boxIndex(boxes, beyond) >= 0) return null;
    nextBoxes = boxes.map((b, i) => (i === bi ? beyond : b));
  }
  return { pos: next, boxes: nextBoxes };
}

function isSolved(boxes, goals) {
  const g = new Set(goals.map(key));
  return boxes.every((b) => g.has(key(b)));
}

/** Dead simple deadlock: box in corner that is not a goal. */
function isDeadlock(cells, boxes, goals) {
  const g = new Set(goals.map(key));
  for (const b of boxes) {
    if (g.has(key(b))) continue;
    const up = !walkable(cells, { x: b.x, y: b.y - 1 });
    const down = !walkable(cells, { x: b.x, y: b.y + 1 });
    const left = !walkable(cells, { x: b.x - 1, y: b.y });
    const right = !walkable(cells, { x: b.x + 1, y: b.y });
    if ((up || down) && (left || right)) return true;
  }
  return false;
}

/**
 * BFS for next action toward a solved state.
 * Returns null if unsolvable / too large.
 */
function nextActionBfs(cells, goals, pos, boxes, preferOrder) {
  if (isSolved(boxes, goals)) return "WAIT";
  if (isDeadlock(cells, boxes, goals)) return null;

  const start = stateKey(pos, boxes);
  const visited = new Set([start]);
  const queue = [{ pos, boxes, first: null }];
  const order = preferOrder || ACTIONS;
  const limit = 8000;
  let expanded = 0;

  while (queue.length && expanded < limit) {
    const cur = queue.shift();
    expanded += 1;
    for (const action of order) {
      const nxt = applyMove(cells, cur.pos, cur.boxes, action);
      if (!nxt) continue;
      if (isDeadlock(cells, nxt.boxes, goals) && !isSolved(nxt.boxes, goals)) {
        continue;
      }
      const sk = stateKey(nxt.pos, nxt.boxes);
      if (visited.has(sk)) continue;
      visited.add(sk);
      const first = cur.first || action;
      if (isSolved(nxt.boxes, goals)) return first;
      queue.push({ pos: nxt.pos, boxes: nxt.boxes, first });
    }
  }
  return null;
}

/** Fallback: stand on the push side of a box facing a free goal, then push. */
function greedyStep(cells, goals, pos, boxes) {
  const goalSet = new Set(goals.map(key));
  const off = boxes.filter((b) => !goalSet.has(key(b)));
  const freeGoals = goals.filter((g) => !boxes.some((b) => b.x === g.x && b.y === g.y));
  if (!off.length || !freeGoals.length) return "WAIT";

  const box = off[0];
  const goal = freeGoals.slice().sort((a, b) => {
    const da = Math.abs(a.x - box.x) + Math.abs(a.y - box.y);
    const db = Math.abs(b.x - box.x) + Math.abs(b.y - box.y);
    return da - db;
  })[0];

  // Desired push direction: from box toward goal (axis-aligned preference)
  let pushAction = null;
  if (goal.x !== box.x) {
    pushAction = goal.x > box.x ? "MOVE_RIGHT" : "MOVE_LEFT";
  } else if (goal.y !== box.y) {
    pushAction = goal.y > box.y ? "MOVE_DOWN" : "MOVE_UP";
  }
  if (!pushAction) return "WAIT";

  const d = DELTA[pushAction];
  const stand = { x: box.x - d.x, y: box.y - d.y };
  if (pos.x === stand.x && pos.y === stand.y) {
    if (applyMove(cells, pos, boxes, pushAction)) return pushAction;
  }

  // BFS walk to stand cell without moving boxes (treat boxes as walls)
  const blocked = new Set(boxes.map(key));
  const q = [{ p: pos, first: null }];
  const seen = new Set([key(pos)]);
  while (q.length) {
    const cur = q.shift();
    if (cur.p.x === stand.x && cur.p.y === stand.y) return cur.first || "WAIT";
    for (const a of ACTIONS) {
      const dd = DELTA[a];
      const n = { x: cur.p.x + dd.x, y: cur.p.y + dd.y };
      const nk = key(n);
      if (seen.has(nk) || !walkable(cells, n) || blocked.has(nk)) continue;
      seen.add(nk);
      q.push({ p: n, first: cur.first || a });
    }
  }
  return "WAIT";
}

const STYLE_ORDER = {
  pusher: ["MOVE_RIGHT", "MOVE_DOWN", "MOVE_LEFT", "MOVE_UP"],
  hauler: ["MOVE_DOWN", "MOVE_LEFT", "MOVE_UP", "MOVE_RIGHT"],
  planner: ["MOVE_LEFT", "MOVE_UP", "MOVE_RIGHT", "MOVE_DOWN"],
  sprint: ["MOVE_UP", "MOVE_RIGHT", "MOVE_DOWN", "MOVE_LEFT"],
};

function decide(msg, style = "pusher") {
  const self = msg.self;
  if (!self || self.done) return "WAIT";
  const { cells, goals } = msg;
  const order = STYLE_ORDER[style] || ACTIONS;

  const bfs = nextActionBfs(cells, goals, self.pos, self.boxes, order);
  if (bfs) return bfs;

  return greedyStep(cells, goals, self.pos, self.boxes) || "WAIT";
}

module.exports = { decide };
