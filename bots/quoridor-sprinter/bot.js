#!/usr/bin/env node
"use strict";
const readline = require("node:readline");
const { decide } = require("../quoridor-lib.js");
// Fourth demo seat: same as rush with slight noise via alternate style name
const STYLE = "rush";
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== "observation") return;
  process.stdout.write(JSON.stringify({ action: decide(msg, STYLE) }) + "\n");
});
