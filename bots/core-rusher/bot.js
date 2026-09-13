#!/usr/bin/env node
"use strict";

/**
 * Core Rusher: always advance to center; face+attack nearby foes; stay active in core.
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

function inFront(self, other) {
  const d = delta(self.facing);
  for (const dist of [1, 2]) {
    if (
      other.pos.x === self.pos.x + d.x * dist &&
      other.pos.y === self.pos.y + d.y * dist
    ) {
      return true;
    }
  }
  return false;
}

/** Move that would face toward enemy (for next attacks after delay). */
function faceToward(from, to) {
  return toward(from, to);
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
  const enemies = msg.players.filter((p) => p.id !== self.id && p.alive);
  enemies.sort((a, b) => manhattan(self.pos, a.pos) - manhattan(self.pos, b.pos));
  const nearest = enemies[0];

  let action = "WAIT";
  if (nearest && inFront(self, nearest)) {
    action = "ATTACK";
  } else if (nearest && manhattan(self.pos, nearest.pos) <= 3) {
    // Close in / turn to face
    action = faceToward(self.pos, nearest.pos) || "WAIT";
  } else if (manhattan(self.pos, core) > 0) {
    action = toward(self.pos, core) || "WAIT";
  } else if (nearest) {
    action = faceToward(self.pos, nearest.pos) || "ATTACK";
  } else {
    // Orbit one step so we don't look frozen in the core
    action = ["MOVE_LEFT", "MOVE_UP", "MOVE_RIGHT", "MOVE_DOWN"][msg.tick % 4];
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
