#!/usr/bin/env node
"use strict";

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

function canStep(tiles, bombs, pos, action) {
  const d =
    action === "MOVE_UP"
      ? { x: 0, y: -1 }
      : action === "MOVE_DOWN"
        ? { x: 0, y: 1 }
        : action === "MOVE_LEFT"
          ? { x: -1, y: 0 }
          : action === "MOVE_RIGHT"
            ? { x: 1, y: 0 }
            : null;
  if (!d) return false;
  const n = { x: pos.x + d.x, y: pos.y + d.y };
  if (n.y < 0 || n.x < 0 || n.y >= tiles.length || n.x >= tiles[0].length) {
    return false;
  }
  if (tiles[n.y][n.x] !== "empty") return false;
  if (bombs.some((b) => b.pos.x === n.x && b.pos.y === n.y)) return false;
  return true;
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
  const enemies = msg.players.filter((p) => p.id !== self.id && p.alive);
  const target = enemies[0] ? enemies[0].pos : { x: mid, y: mid };

  const dist =
    Math.abs(self.pos.x - target.x) + Math.abs(self.pos.y - target.y);

  // Flee if standing on / next to a live bomb
  const nearBomb = msg.bombs.some(
    (b) => Math.abs(b.pos.x - self.pos.x) + Math.abs(b.pos.y - self.pos.y) <= 1,
  );

  let action = "WAIT";
  if (nearBomb) {
    for (const m of ["MOVE_RIGHT", "MOVE_DOWN", "MOVE_LEFT", "MOVE_UP"]) {
      if (canStep(msg.tiles, msg.bombs, self.pos, m)) {
        action = m;
        break;
      }
    }
  } else if (self.bombsLeft > 0 && dist <= 2 && msg.tick % 7 === 0) {
    action = "PLACE_BOMB";
  } else {
    const move = toward(self.pos, target);
    if (move && canStep(msg.tiles, msg.bombs, self.pos, move)) {
      action = move;
    } else {
      for (const m of ["MOVE_RIGHT", "MOVE_DOWN", "MOVE_LEFT", "MOVE_UP"]) {
        if (canStep(msg.tiles, msg.bombs, self.pos, m)) {
          action = m;
          break;
        }
      }
    }
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
