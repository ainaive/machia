#!/usr/bin/env node
"use strict";

/**
 * Queue Dodger: chase nearest foe, attack when lined up, dodge publicly queued attacks.
 */
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

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function toward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? "MOVE_RIGHT" : "MOVE_LEFT";
  }
  return dy > 0 ? "MOVE_DOWN" : "MOVE_UP";
}

function willAttackMe(enemy, selfPos) {
  for (const slot of enemy.queue) {
    if (slot !== "ATTACK") continue;
    if (
      cellsAttacked(enemy.pos, enemy.facing).some(
        (c) => c.x === selfPos.x && c.y === selfPos.y,
      )
    ) {
      return true;
    }
  }
  return false;
}

function dodge(self, mapSize, dangerFrom) {
  const options = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
  // Prefer moves that leave the attacked cells
  const bad = new Set();
  if (dangerFrom) {
    for (const c of cellsAttacked(dangerFrom.pos, dangerFrom.facing)) {
      bad.add(`${c.x},${c.y}`);
    }
  }
  for (const action of options) {
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
    if (nx < 0 || ny < 0 || nx >= mapSize || ny >= mapSize) continue;
    if (bad.has(`${nx},${ny}`)) continue;
    return action;
  }
  return "BLOCK";
}

function inFront(self, other) {
  return cellsAttacked(self.pos, self.facing).some(
    (c) => c.x === other.pos.x && c.y === other.pos.y,
  );
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

  const threats = msg.players.filter(
    (p) => p.id !== self.id && p.alive && willAttackMe(p, self.pos),
  );
  if (threats.length > 0) {
    process.stdout.write(
      JSON.stringify({ action: dodge(self, msg.mapSize, threats[0]) }) + "\n",
    );
    return;
  }

  const enemies = msg.players
    .filter((p) => p.id !== self.id && p.alive)
    .sort((a, b) => manhattan(self.pos, a.pos) - manhattan(self.pos, b.pos));
  const nearest = enemies[0];
  const mid = (msg.mapSize - 1) / 2;

  let action;
  if (nearest && inFront(self, nearest)) {
    action = "ATTACK";
  } else if (nearest) {
    action = toward(self.pos, nearest.pos) || "WAIT";
  } else {
    action = toward(self.pos, { x: mid, y: mid }) || "WAIT";
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
