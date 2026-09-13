#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });

function toward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) return "MOVE_RIGHT";
    if (dx < 0) return "MOVE_LEFT";
  }
  if (dy > 0) return "MOVE_DOWN";
  if (dy < 0) return "MOVE_UP";
  return "WAIT";
}

function inFront(self, other) {
  const d =
    self.facing === "UP"
      ? { x: 0, y: -1 }
      : self.facing === "DOWN"
        ? { x: 0, y: 1 }
        : self.facing === "LEFT"
          ? { x: -1, y: 0 }
          : { x: 1, y: 0 };
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
  const enemy = msg.players.find(
    (p) => p.id !== self.id && p.alive && inFront(self, p),
  );
  let action = "WAIT";
  if (enemy) action = "ATTACK";
  else if (self.pos.x === mid && self.pos.y === mid) action = "BLOCK";
  else action = toward(self.pos, { x: mid, y: mid });

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
