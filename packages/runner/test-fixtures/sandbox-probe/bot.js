// Test fixture: reports what the sandbox lets a bot see and do. Self-contained
// (a sandboxed bot can't load files outside its mount directory).
const fs = require("node:fs");
const net = require("node:net");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const canRead = (p) => { try { fs.readdirSync(p); return true; } catch { return false; } };
const canWrite = (p) => { try { fs.writeFileSync(p, "x"); return true; } catch { return false; } };

function network() {
  return new Promise((resolve) => {
    const socket = net.connect(443, "1.1.1.1");
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.on("connect", () => done("connected"));
    socket.on("error", (err) => done(err.code));
    setTimeout(() => done("timeout"), 2000);
  });
}

async function act(obs) {
  if (obs.mode === "memory") {
    const hog = [];
    for (;;) hog.push(Buffer.alloc(16 << 20, 1));
  }
  if (obs.mode === "fork") {
    let failed = 0;
    for (let i = 0; i < 100; i++) {
      try {
        spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"]).on("error", () => failed++);
      } catch {
        failed++;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
    return { failed };
  }
  return {
    cwd: process.cwd(),
    ownFolder: canRead("."),
    writeOwnFolder: canWrite("./written"),
    tmp: canWrite("/tmp/written"),
    hostPath: canRead(obs.hostPath),
    etc: canRead("/etc"),
    network: await network(),
  };
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const msg = JSON.parse(line);
  if (msg.type !== "observation") return;
  process.stdout.write(`${JSON.stringify({ action: await act(msg) })}\n`);
});
