#!/usr/bin/env node
"use strict";

function key(p) {
  return `${p.x},${p.y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

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

function boxAt(boxes, p) {
  return boxes.findIndex((b) => b.x === p.x && b.y === p.y);
}

function canMove(cells, boxes, from, action) {
  const d = DELTA[action];
  if (!d) return false;
  const next = { x: from.x + d.x, y: from.y + d.y };
  if (!walkable(cells, next)) return false;
  const bi = boxAt(boxes, next);
  if (bi < 0) return true;
  const beyond = { x: next.x + d.x, y: next.y + d.y };
  if (!walkable(cells, beyond)) return false;
  if (boxAt(boxes, beyond) >= 0) return false;
  return true;
}

function decide(msg) {
  const self = msg.self;
  if (!self || self.done) return "WAIT";
  const { cells, goals } = msg;
  const boxes = self.boxes;
  const pos = self.pos;
  const goalSet = new Set(goals.map(key));
  const offGoal = boxes.filter((b) => !goalSet.has(key(b)));
  const freeGoals = goals.filter(
    (g) => !boxes.some((b) => b.x === g.x && b.y === g.y),
  );

  // If standing ready to push a box toward a free goal, do it
  const actions = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
  let best = null;
  let bestScore = Infinity;

  for (const a of actions) {
    if (!canMove(cells, boxes, pos, a)) continue;
    const d = DELTA[a];
    const next = { x: pos.x + d.x, y: pos.y + d.y };
    const bi = boxAt(boxes, next);
    let score = manhattan(next, freeGoals[0] || goals[0]);
    if (bi >= 0 && freeGoals.length) {
      const beyond = { x: next.x + d.x, y: next.y + d.y };
      const g = freeGoals.slice().sort(
        (x, y) => manhattan(beyond, x) - manhattan(beyond, y),
      )[0];
      score = manhattan(beyond, g) - 50; // prefer pushes
      if (goalSet.has(key(beyond))) score -= 100;
    } else if (offGoal.length) {
      const target = offGoal.slice().sort(
        (x, y) => manhattan(pos, x) - manhattan(pos, y),
      )[0];
      score = manhattan(next, target);
    }
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best || "WAIT";
}

module.exports = { decide };
