#!/usr/bin/env node
"use strict";

const readline = require("node:readline");
const { decide } = require("../tanks-lib.js");

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
  // Prefer fire when aligned; otherwise hunt
  process.stdout.write(
    JSON.stringify({ action: decide(msg, self, "hunter") }) + "\n",
  );
});
