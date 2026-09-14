#!/usr/bin/env node
"use strict";

/**
 * Sniper: keep distance, only bomb when enemy is exactly in line and escape is clear.
 */
const readline = require("node:readline");
const {
  blastSet,
  bfsFirstAction,
  softHitsFrom,
  findEscape,
  bombHits,
  nearestEnemy,
  key,
  neighbors,
  isSoft,
  isEmpty,
  bombAt,
} = require("../bomber-lib.js");

function decide(msg, self) {
  const { tiles, bombs, powerups, players } = msg;
  const danger = blastSet(tiles, bombs);
  const power = self.power || 1;

  if (danger.has(key(self.pos))) {
    const act = bfsFirstAction(
      tiles,
      bombs,
      self.pos,
      (p) => !danger.has(key(p)),
      false,
    );
    if (act && act !== "WAIT") return act;
    for (const n of neighbors(self.pos)) {
      if (isEmpty(tiles, n) && !bombAt(bombs, n)) return n.action;
    }
    return "WAIT";
  }

  if (powerups.length) {
    const act = bfsFirstAction(
      tiles,
      bombs,
      self.pos,
      (p) => powerups.some((u) => u.pos.x === p.x && u.pos.y === p.y),
      true,
    );
    if (act && act !== "WAIT") return act;
  }

  const enemy = nearestEnemy(self, players);
  if (enemy) {
    const dist =
      Math.abs(enemy.pos.x - self.pos.x) + Math.abs(enemy.pos.y - self.pos.y);

    if (
      self.bombsLeft > 0 &&
      bombHits(tiles, self.pos, power, enemy.pos) &&
      dist >= 2
    ) {
      const fake = {
        id: -1,
        ownerId: self.id,
        pos: { ...self.pos },
        fuse: 4,
        power,
      };
      if (findEscape(tiles, bombs, self.pos, fake)) return "PLACE_BOMB";
    }

    // Get into same row/col at power range
    const lined =
      enemy.pos.x === self.pos.x || enemy.pos.y === self.pos.y;
    if (!lined || dist > power) {
      const goal = bfsFirstAction(
        tiles,
        bombs,
        self.pos,
        (p) => {
          if (!(p.x === enemy.pos.x || p.y === enemy.pos.y)) return false;
          const d =
            Math.abs(p.x - enemy.pos.x) + Math.abs(p.y - enemy.pos.y);
          return d >= 2 && d <= power;
        },
        true,
      );
      if (goal && goal !== "WAIT") return goal;
    }

    if (self.bombsLeft > 0) {
      for (const n of neighbors(self.pos)) {
        if (!isSoft(tiles, n)) continue;
        const fake = {
          id: -1,
          ownerId: self.id,
          pos: { ...self.pos },
          fuse: 4,
          power,
        };
        if (findEscape(tiles, bombs, self.pos, fake)) return "PLACE_BOMB";
      }
    }
  }

  if (self.bombsLeft > 0 && softHitsFrom(tiles, self.pos, power) > 0) {
    const fake = {
      id: -1,
      ownerId: self.id,
      pos: { ...self.pos },
      fuse: 4,
      power,
    };
    if (findEscape(tiles, bombs, self.pos, fake)) return "PLACE_BOMB";
  }

  return "WAIT";
}

const rl = readline.createInterface({ input: process.stdin });
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
  process.stdout.write(JSON.stringify({ action: decide(msg, self) }) + "\n");
});
