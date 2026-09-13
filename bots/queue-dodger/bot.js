#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });

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

function willAttackMe(enemy, selfPos) {
  // Public queue[0] executes this tick — dodge if they attack into our cell
  if (enemy.queue[0] !== "ATTACK") return false;
  return cellsAttacked(enemy.pos, enemy.facing).some(
    (c) => c.x === selfPos.x && c.y === selfPos.y,
  );
}

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

function dodge(self, mapSize) {
  const options = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
  for (const action of options.sort(() => Math.random() - 0.5)) {
    const d =
      action === "MOVE_UP"
        ? { x: 0, y: -1 }
        : action === "MOVE_DOWN"
          ? { x: 0, y: 1 }
          : action === "MOVE_LEFT"
            ? { x: -1, y: 0 }
            : { x: 1, y: 0 };
    const nx = self.pos.x + d.x;
    const ny = self.pos.y + d.y;
    if (nx >= 0 && ny >= 0 && nx < mapSize && ny < mapSize) return action;
  }
  return "BLOCK";
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

  const danger = msg.players.some(
    (p) => p.id !== self.id && p.alive && willAttackMe(p, self.pos),
  );

  let action;
  if (danger) {
    action = dodge(self, msg.mapSize);
  } else {
    const mid = (msg.mapSize - 1) / 2;
    const enemy = msg.players.find((p) => {
      if (p.id === self.id || !p.alive) return false;
      return cellsAttacked(self.pos, self.facing).some(
        (c) => c.x === p.pos.x && c.y === p.pos.y,
      );
    });
    if (enemy) action = "ATTACK";
    else action = toward(self.pos, { x: mid, y: mid });
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
