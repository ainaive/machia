// Test fixture: answers tick 0 with an oversized (but valid) JSON line.
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  const reply = { action: "WAIT", tick: msg.tick };
  if (msg.tick === 0) reply.pad = "x".repeat(100 * 1024);
  process.stdout.write(`${JSON.stringify(reply)}\n`);
});
