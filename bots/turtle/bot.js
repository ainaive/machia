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

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
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
  const nearThreat = msg.players.some(
    (p) => p.id !== self.id && p.alive && manhattan(p.pos, self.pos) <= 2,
  );

  let action = "BLOCK";
  if (!nearThreat && manhattan(self.pos, core) > 2) {
    action = toward(self.pos, core);
  } else if (nearThreat) {
    action = "BLOCK";
  } else {
    action = Math.random() < 0.3 ? "WAIT" : "BLOCK";
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
