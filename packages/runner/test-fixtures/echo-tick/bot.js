// Test fixture: answers every observation with the tick it was asked about.
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  process.stdout.write(`${JSON.stringify({ action: "WAIT", tick: msg.tick })}\n`);
});
