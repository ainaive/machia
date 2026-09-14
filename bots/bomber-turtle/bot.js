#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });

let fleeLeft = 0;

function inBlast(bombs, pos) {
  for (const b of bombs) {
    if (b.pos.x === pos.x && b.pos.y === pos.y) return true;
    if (b.pos.y === pos.y && Math.abs(b.pos.x - pos.x) <= b.power) return true;
    if (b.pos.x === pos.x && Math.abs(b.pos.y - pos.y) <= b.power) return true;
  }
  return false;
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

function stepPos(pos, action) {
  if (action === "MOVE_UP") return { x: pos.x, y: pos.y - 1 };
  if (action === "MOVE_DOWN") return { x: pos.x, y: pos.y + 1 };
  if (action === "MOVE_LEFT") return { x: pos.x - 1, y: pos.y };
  if (action === "MOVE_RIGHT") return { x: pos.x + 1, y: pos.y };
  return pos;
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

  const moves = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
  let action = "WAIT";

  if (inBlast(msg.bombs, self.pos) || fleeLeft > 0) {
    fleeLeft = Math.max(fleeLeft - 1, 0);
    for (const m of moves) {
      if (!canStep(msg.tiles, msg.bombs, self.pos, m)) continue;
      const next = stepPos(self.pos, m);
      if (!inBlast(msg.bombs, next)) {
        action = m;
        break;
      }
    }
    if (action === "WAIT") {
      for (const m of moves) {
        if (canStep(msg.tiles, msg.bombs, self.pos, m)) {
          action = m;
          break;
        }
      }
    }
  } else if (self.bombsLeft > 0 && msg.tick > 10 && msg.tick % 12 === 0) {
    action = "PLACE_BOMB";
    fleeLeft = 3;
  } else {
    for (const m of moves) {
      if (canStep(msg.tiles, msg.bombs, self.pos, m)) {
        action = m;
        break;
      }
    }
  }

  process.stdout.write(JSON.stringify({ action }) + "\n");
});
