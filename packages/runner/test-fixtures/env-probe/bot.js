// Test fixture: reports which environment variables the bot can see.
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  process.stdout.write(`${JSON.stringify({ action: "WAIT", env: Object.keys(process.env) })}\n`);
});
