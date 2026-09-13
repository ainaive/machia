const procs = [
  Bun.spawn(["bun", "run", "dev:server"], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }),
  Bun.spawn(["bun", "run", "dev:web"], {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  }),
];

function shutdown() {
  for (const p of procs) {
    try {
      p.kill();
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.all(procs.map((p) => p.exited));
