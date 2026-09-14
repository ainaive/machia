#!/usr/bin/env node
"use strict";

/** Shared brain for Tanks sample bots. */

function key(p) {
  return `${p.x},${p.y}`;
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function delta(facing) {
  return (
    {
      UP: { x: 0, y: -1 },
      DOWN: { x: 0, y: 1 },
      LEFT: { x: -1, y: 0 },
      RIGHT: { x: 1, y: 0 },
    }[facing] || { x: 0, y: 0 }
  );
}

function inBounds(tiles, p) {
  return p.y >= 0 && p.x >= 0 && p.y < tiles.length && p.x < tiles[0].length;
}

function isEmpty(tiles, p) {
  return inBounds(tiles, p) && tiles[p.y][p.x] === "empty";
}

function occupied(players, selfId, p) {
  return players.some(
    (pl) =>
      pl.alive && pl.id !== selfId && pl.pos.x === p.x && pl.pos.y === p.y,
  );
}

function nearestEnemy(self, players) {
  const enemies = players.filter((p) => p.id !== self.id && p.alive);
  enemies.sort(
    (a, b) => manhattan(self.pos, a.pos) - manhattan(self.pos, b.pos),
  );
  return enemies[0] || null;
}

function clearShot(tiles, from, facing, target) {
  const d = delta(facing);
  let x = from.x + d.x;
  let y = from.y + d.y;
  for (let i = 0; i < 20; i++) {
    const p = { x, y };
    if (!inBounds(tiles, p) || tiles[y][x] === "hard") return false;
    if (p.x === target.x && p.y === target.y) return true;
    x += d.x;
    y += d.y;
  }
  return false;
}

function hasOwnBullet(bullets, id) {
  return bullets.some((b) => b.ownerId === id);
}

function bulletThreat(tiles, bullets, pos) {
  for (const b of bullets) {
    const d = delta(b.facing);
    let x = b.pos.x;
    let y = b.pos.y;
    for (let i = 0; i < 8; i++) {
      if (x === pos.x && y === pos.y) return true;
      x += d.x;
      y += d.y;
      if (!inBounds(tiles, { x, y }) || tiles[y][x] === "hard") break;
    }
  }
  return false;
}

function decide(msg, self, style = "hunter") {
  const { tiles, bullets, players } = msg;
  const enemy = nearestEnemy(self, players);
  const ownBullet = hasOwnBullet(bullets || [], self.id);

  // Dodge incoming
  if (bulletThreat(tiles, bullets || [], self.pos)) {
    const opts = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"].filter(
      (a) => {
        const d = delta(a.replace("MOVE_", ""));
        const dest = { x: self.pos.x + d.x, y: self.pos.y + d.y };
        return (
          isEmpty(tiles, dest) &&
          !occupied(players, self.id, dest) &&
          !bulletThreat(tiles, bullets || [], dest)
        );
      },
    );
    if (opts.length) return opts[Math.floor(Math.random() * opts.length)];
  }

  if (
    enemy &&
    !ownBullet &&
    clearShot(tiles, self.pos, self.facing, enemy.pos)
  ) {
    return "FIRE";
  }

  if (!enemy) return "WAIT";

  // Align to fire
  if (enemy.pos.x === self.pos.x) {
    const face = enemy.pos.y < self.pos.y ? "UP" : "DOWN";
    if (self.facing !== face) return `MOVE_${face}`;
    if (!ownBullet && clearShot(tiles, self.pos, face, enemy.pos)) return "FIRE";
  }
  if (enemy.pos.y === self.pos.y) {
    const face = enemy.pos.x < self.pos.x ? "LEFT" : "RIGHT";
    if (self.facing !== face) return `MOVE_${face}`;
    if (!ownBullet && clearShot(tiles, self.pos, face, enemy.pos)) return "FIRE";
  }

  // Approach
  const prefer = [];
  if (style !== "turtle") {
    if (enemy.pos.x > self.pos.x) prefer.push("MOVE_RIGHT");
    if (enemy.pos.x < self.pos.x) prefer.push("MOVE_LEFT");
    if (enemy.pos.y > self.pos.y) prefer.push("MOVE_DOWN");
    if (enemy.pos.y < self.pos.y) prefer.push("MOVE_UP");
  } else {
    if (enemy.pos.x > self.pos.x) prefer.push("MOVE_LEFT");
    if (enemy.pos.x < self.pos.x) prefer.push("MOVE_RIGHT");
    if (enemy.pos.y > self.pos.y) prefer.push("MOVE_UP");
    if (enemy.pos.y < self.pos.y) prefer.push("MOVE_DOWN");
  }

  for (const a of prefer) {
    const d = delta(a.replace("MOVE_", ""));
    const dest = { x: self.pos.x + d.x, y: self.pos.y + d.y };
    if (isEmpty(tiles, dest) && !occupied(players, self.id, dest)) return a;
  }

  const any = ["MOVE_UP", "MOVE_DOWN", "MOVE_LEFT", "MOVE_RIGHT"].filter(
    (a) => {
      const d = delta(a.replace("MOVE_", ""));
      const dest = { x: self.pos.x + d.x, y: self.pos.y + d.y };
      return isEmpty(tiles, dest) && !occupied(players, self.id, dest);
    },
  );
  if (any.length) return any[Math.floor(Math.random() * any.length)];
  return "WAIT";
}

module.exports = { decide };
