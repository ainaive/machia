#!/usr/bin/env node
"use strict";

/**
 * Sokoban sample brain: BFS on (player, boxes) with corner-deadlock pruning.
 * Style only changes BFS expansion order (different optimal paths / race flavor).
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

const STYLE_ORDER = {
  pusher: ["MOVE_RIGHT", "MOVE_DOWN", "MOVE_LEFT", "MOVE_UP"],
  hauler: ["MOVE_DOWN", "MOVE_LEFT", "MOVE_UP", "MOVE_RIGHT"],
  planner: ["MOVE_LEFT", "MOVE_UP", "MOVE_RIGHT", "MOVE_DOWN"],
  sprint: ["MOVE_UP", "MOVE_RIGHT", "MOVE_DOWN", "MOVE_LEFT"],
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

function isCornerDeadlock(cells, boxes, goals) {
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

function nextActionBfs(cells, goals, pos, boxes, order) {
  if (isSolved(boxes, goals)) return "WAIT";
  if (isCornerDeadlock(cells, boxes, goals)) return null;

  const visited = new Set([stateKey(pos, boxes)]);
  const queue = [{ pos, boxes, first: null }];
  const limit = 20000;
  let expanded = 0;

  while (queue.length && expanded < limit) {
    const cur = queue.shift();
    expanded += 1;
    for (const action of order) {
      const nxt = applyMove(cells, cur.pos, cur.boxes, action);
      if (!nxt) continue;
      if (
        isCornerDeadlock(cells, nxt.boxes, goals) &&
        !isSolved(nxt.boxes, goals)
      ) {
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

function decide(msg, styleName = "pusher") {
  const self = msg.self;
  if (!self || self.done) return "WAIT";
  const { cells, goals } = msg;
  const order = STYLE_ORDER[styleName] || ACTIONS;
  return (
    nextActionBfs(cells, goals, self.pos, self.boxes, order) || "WAIT"
  );
}

module.exports = { decide };
