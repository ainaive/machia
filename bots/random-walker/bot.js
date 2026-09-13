#!/usr/bin/env node
"use strict";

const ACTIONS = [
  "MOVE_UP",
  "MOVE_DOWN",
  "MOVE_LEFT",
  "MOVE_RIGHT",
  "ATTACK",
  "BLOCK",
  "WAIT",
];

const readline = require("node:readline");

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.type === "game_start" || msg.type === "game_end") return;
  if (msg.type === "observation") {
    const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
    process.stdout.write(JSON.stringify({ action }) + "\n");
  }
});
