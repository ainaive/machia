// Test fixture: ignores SIGTERM and starts a long-lived child process.
const { spawn } = require("node:child_process");
const readline = require("node:readline");

process.on("SIGTERM", () => {});
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
});
setInterval(() => {}, 1000);

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  process.stdout.write(
    `${JSON.stringify({ action: "WAIT", pid: process.pid, childPid: child.pid })}\n`,
  );
});
