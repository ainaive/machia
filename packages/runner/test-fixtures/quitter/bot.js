// Test fixture: answers one observation, then exits.
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  process.stdout.write(`${JSON.stringify({ action: "WAIT" })}\n`, () => process.exit(0));
});
