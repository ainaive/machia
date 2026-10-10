// Test fixture: blocks for 400ms on its first observation, then echoes ticks.
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
let first = true;
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  if (first) {
    first = false;
    const end = Date.now() + 400;
    while (Date.now() < end) {}
  }
  process.stdout.write(`${JSON.stringify({ action: "WAIT", tick: msg.tick })}\n`);
});
