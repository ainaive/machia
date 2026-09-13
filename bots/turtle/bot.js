#!/usr/bin/env node
"use strict";

/**
 * Turtle: walk into the core ring, then orbit; BLOCK only when an attack is queued at us.
 */
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });

function toward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? "MOVE_RIGHT" : "MOVE_LEFT";
  }
  return dy > 0 ? "MOVE_DOWN" : "MOVE_UP";
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function delta(facing) {
  if (facing === "UP") return { x: 0, y: -1 };
  if (facing === "DOWN") return { x: 0, y: 1 };
  if (facing === "LEFT") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function cellsAttacked(pos, facing) {
  const d = delta(facing);
  return [1, 2].map((n) => ({ x: pos.x + d.x * n, y: pos.y + d.y * n }));
}

function attackIncoming(msg, self) {
  return msg.players.some((p) => {
    if (p.id === self.id || !p.alive) return false;
    // Public queue: actions that will hit this/next tick
    for (const slot of p.queue) {
      if (slot !== "ATTACK") continue;
      if (
        cellsAttacked(p.pos, p.facing).some(
          (c) => c.x === self.pos.x && c.y === self.pos.y,
        )
      ) {
        return true;
      }
    }
    return false;
  });
}

function orbit(self, mid) {
  // Clockwise around core center
  const dx = self.pos.x - mid;
  const dy = self.pos.y - mid;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dy >= 0 ? "MOVE_LEFT" : "MOVE_RIGHT";
  }
  return dx >= 0 ? "MOVE_DOWN" : "MOVE_UP";
}

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.type !== "observation") return;

  const self = msg.players.find((p) => p.id === msg.selfId);
  if (!self || !self.alive) {
    process.stdout.write(JSON.stringify({ action: "WAIT" }) + "\n");
    return;
  }

  const mid = (msg.mapSize - 1) / 2;
  const core = { x: mid, y: mid };
  const dist = manhattan(self.pos, core);

  let action;
  if (attackIncoming(msg, self)) {
    action = "BLOCK";
  } else if (dist > 2) {
    action = toward(self.pos, core) || "WAIT";
  } else {
    // Keep moving on the core fringe so the demo isn't frozen
    action = orbit(self, mid);
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
