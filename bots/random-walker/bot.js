#!/usr/bin/env node
"use strict";

/**
 * Scout: keeps moving with short directional streaks (no random ATTACK/BLOCK spam).
 * Looks like purposeful roaming toward/around the map.
 */
const { run } = require("../machia.js");

const MOVES = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"];
let streakDir = null;
let streakLeft = 0;

function toward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) === 0 && Math.abs(dy) === 0) return null;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? "MOVE_RIGHT" : "MOVE_LEFT";
  }
  return dy > 0 ? "MOVE_DOWN" : "MOVE_UP";
}

function applyMove(pos, action, mapSize) {
  const next = { ...pos };
  if (action === "MOVE_UP") next.y -= 1;
  if (action === "MOVE_DOWN") next.y += 1;
  if (action === "MOVE_LEFT") next.x -= 1;
  if (action === "MOVE_RIGHT") next.x += 1;
  if (next.x < 0 || next.y < 0 || next.x >= mapSize || next.y >= mapSize) {
    return null;
  }
  return next;
}

run({
  act(msg) {
    const self = msg.players.find((p) => p.id === msg.selfId);
    if (!self?.alive) {
      return "WAIT";
    }

    const mid = (msg.mapSize - 1) / 2;
    // Bias toward core so scouts eventually meet others
    const target = {
      x: mid + Math.round((Math.random() - 0.5) * 4),
      y: mid + Math.round((Math.random() - 0.5) * 4),
    };

    if (streakLeft <= 0 || !streakDir || !applyMove(self.pos, streakDir, msg.mapSize)) {
      streakDir =
        Math.random() < 0.55
          ? toward(self.pos, target) || MOVES[Math.floor(Math.random() * 4)]
          : MOVES[Math.floor(Math.random() * 4)];
      if (!applyMove(self.pos, streakDir, msg.mapSize)) {
        streakDir = MOVES.find((m) => applyMove(self.pos, m, msg.mapSize)) || "WAIT";
      }
      streakLeft = 3 + Math.floor(Math.random() * 4);
    }

    streakLeft -= 1;
    return streakDir;
  },
});
