"use strict";

/**
 * Machia bot SDK — handles the stdin/stdout protocol so a bot only decides.
 *
 *   const { run, log } = require("./machia.js");
 *
 *   run({
 *     start(info) {},              // optional: game_start (playerId, mapSize, ...)
 *     act(obs) { return "WAIT"; }, // every observation; may be async
 *     end(results) {},             // optional: game_end results
 *   });
 *
 * Exactly one reply is written per observation, in order, even if act()
 * throws or returns nothing (the reply is then "WAIT"). Use log() — never
 * console.log — for debugging: stdout is reserved for replies.
 *
 * Copy this file next to your bot.js, or let `bun run pack` bundle it.
 * Protocol details: docs/bot-protocol.md.
 */

const readline = require("node:readline");

function log(...args) {
  console.error(...args);
}

function reply(action) {
  process.stdout.write(`${JSON.stringify({ action })}\n`);
}

async function handle(line, handlers) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.type === "game_start") {
    if (handlers.start) await handlers.start(msg);
    return;
  }
  if (msg.type === "game_end") {
    if (handlers.end) await handlers.end(msg.results);
    return;
  }
  if (msg.type !== "observation") return;
  let action = "WAIT";
  try {
    const chosen = await handlers.act(msg);
    if (chosen !== undefined) action = chosen;
  } catch (err) {
    log("act() failed:", err);
  }
  reply(action);
}

function run(handlers) {
  if (!handlers || typeof handlers.act !== "function") {
    throw new TypeError("run() needs an act(observation) function");
  }
  const rl = readline.createInterface({ input: process.stdin });
  // Handle messages strictly in order, even when act() is async.
  let queue = Promise.resolve();
  rl.on("line", (line) => {
    queue = queue.then(() => handle(line, handlers)).catch((err) => log(err));
  });
}

module.exports = { run, log };
