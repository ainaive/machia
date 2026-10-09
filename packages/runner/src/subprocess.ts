import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import type { PlayerResult } from "@machia/game-api";
import {
  DEFAULT_BOT_STARTUP_TIMEOUT_MS,
  DEFAULT_BOT_TIMEOUT_MS,
  type BotManifest,
  type ServerMessage,
} from "@machia/protocol";
import type { BotHandle, BotRunner } from "./types";

export interface SubprocessRunnerOptions {
  timeoutMs?: number;
  /** Timeout for the first observation only, which also covers process startup. */
  startupTimeoutMs?: number;
  nodePath?: string;
}

class SubprocessBotHandle implements BotHandle {
  readonly playerId: number;
  readonly botId: string;
  readonly name: string;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly timeoutMs: number;
  private readonly startupTimeoutMs: number;
  private readonly replies: ReplyReader;
  private started = false;
  private destroyed = false;

  constructor(args: {
    playerId: number;
    botId: string;
    name: string;
    child: ChildProcessWithoutNullStreams;
    timeoutMs: number;
    startupTimeoutMs: number;
  }) {
    this.playerId = args.playerId;
    this.botId = args.botId;
    this.name = args.name;
    this.child = args.child;
    this.timeoutMs = args.timeoutMs;
    this.startupTimeoutMs = args.startupTimeoutMs;
    this.replies = new ReplyReader(args.child);
    // Writes can race the bot exiting; EPIPE must not crash the server.
    args.child.stdin.on("error", () => {});
    forwardStderr(args.child, args.botId);
  }

  async sendStart(info: Record<string, unknown>): Promise<void> {
    this.write({ type: "game_start", ...info });
  }

  async requestAction(obs: unknown): Promise<unknown> {
    this.write({ type: "observation", ...(obs as object) });
    const timeoutMs = this.started ? this.timeoutMs : this.startupTimeoutMs;
    this.started = true;
    try {
      const line = await this.replies.next(timeoutMs);
      return JSON.parse(line);
    } catch {
      return null;
    }
  }

  async sendEnd(results: PlayerResult[]): Promise<void> {
    this.write({ type: "game_end", results });
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.replies.close();
    // `child.killed` only means a signal was sent, so wait for the real exit.
    const exited = new Promise<void>((resolve) => {
      if (this.hasExited()) resolve();
      else this.child.once("exit", () => resolve());
    });
    this.signalGroup("SIGTERM");
    if (!(await settlesWithin(exited, KILL_GRACE_MS))) {
      this.signalGroup("SIGKILL");
      await settlesWithin(exited, KILL_GRACE_MS);
    }
    // Processes the bot started share its group and may outlive it.
    this.signalGroup("SIGKILL");
  }

  private hasExited(): boolean {
    return this.child.exitCode !== null || this.child.signalCode !== null;
  }

  private signalGroup(signal: NodeJS.Signals): void {
    const pid = this.child.pid;
    if (pid === undefined) return;
    try {
      process.kill(-pid, signal);
    } catch {
      // Group already gone.
    }
  }

  private write(msg: ServerMessage): void {
    if (this.destroyed || !this.child.stdin.writable) return;
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }
}

const KILL_GRACE_MS = 500;
const MAX_STDERR_CHARS = 8 * 1024;

/** Forwards a bounded amount of bot stderr to the server log. */
function forwardStderr(child: ChildProcessWithoutNullStreams, botId: string): void {
  let budget = MAX_STDERR_CHARS;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (budget <= 0) return;
    const text = chunk.slice(0, budget);
    budget -= chunk.length;
    const trimmed = text.trim();
    if (trimmed) console.error(`[bot ${botId} stderr] ${trimmed}`);
    if (budget <= 0) console.error(`[bot ${botId} stderr] further output suppressed`);
  });
}

function settlesWithin(promise: Promise<void>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

const MAX_LINE_CHARS = 64 * 1024;

/**
 * Pairs each observation with the bot's next stdout line. Bots must write
 * exactly one line per observation, so stdout order identifies replies: a
 * reply to a request that already timed out is discarded instead of
 * answering a later tick, and lines written when nothing is outstanding are
 * ignored.
 */
class ReplyReader {
  private pending: {
    resolve: (line: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private late = 0;
  private closed = false;
  private partial = "";
  private oversized = false;

  constructor(child: ChildProcessWithoutNullStreams) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onData(chunk));
    const onClose = () => this.fail(new Error("bot process closed"));
    child.on("exit", onClose);
    child.on("error", onClose);
  }

  next(timeoutMs: number): Promise<string> {
    if (this.closed) return Promise.reject(new Error("bot process closed"));
    if (this.pending) return Promise.reject(new Error("a reply is already pending"));
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        this.late++;
        reject(new Error("bot action timeout"));
      }, timeoutMs);
      this.pending = { resolve, reject, timer };
    });
  }

  close(): void {
    this.fail(new Error("bot handle destroyed"));
  }

  private onData(chunk: string): void {
    let start = 0;
    for (let nl = chunk.indexOf("\n"); nl !== -1; nl = chunk.indexOf("\n", start)) {
      const line = this.partial + chunk.slice(start, nl);
      // An oversized line still uses up one reply, as an invalid one.
      this.onLine(this.oversized || line.length > MAX_LINE_CHARS ? "" : line);
      this.partial = "";
      this.oversized = false;
      start = nl + 1;
    }
    if (this.oversized) return;
    this.partial += chunk.slice(start);
    if (this.partial.length > MAX_LINE_CHARS) {
      this.partial = "";
      this.oversized = true;
    }
  }

  private onLine(line: string): void {
    if (this.late > 0) {
      this.late--;
      return;
    }
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);
    pending.resolve(line);
  }

  private fail(err: Error): void {
    this.closed = true;
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
  }
}

// Bots are untrusted: never hand them the server's secrets (auth, SMTP, admin).
const BOT_ENV_PASSTHROUGH = ["PATH", "LANG", "TZ"] as const;

function botEnv(playerId: number): Record<string, string> {
  const env: Record<string, string> = { MACHIA_PLAYER_ID: String(playerId) };
  for (const key of BOT_ENV_PASSTHROUGH) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export class SubprocessRunner implements BotRunner {
  private readonly timeoutMs: number;
  private readonly startupTimeoutMs: number;
  private readonly nodePath: string;

  constructor(options: SubprocessRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_BOT_TIMEOUT_MS;
    this.startupTimeoutMs = Math.max(
      this.timeoutMs,
      options.startupTimeoutMs ?? DEFAULT_BOT_STARTUP_TIMEOUT_MS,
    );
    this.nodePath = options.nodePath ?? "node";
  }

  async spawn(args: {
    playerId: number;
    botId: string;
    botDir: string;
    manifest: BotManifest;
  }): Promise<BotHandle> {
    if (args.manifest.runtime !== "node") {
      throw new Error(`Unsupported runtime: ${args.manifest.runtime}`);
    }
    const entry = path.resolve(args.botDir, args.manifest.entry);
    const rel = path.relative(path.resolve(args.botDir), entry);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Bot entry must stay inside its folder: ${args.manifest.entry}`);
    }
    const child = spawn(this.nodePath, [entry], {
      cwd: args.botDir,
      // Own process group, so destroy() can signal the bot and its children.
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: botEnv(args.playerId),
    });

    return new SubprocessBotHandle({
      playerId: args.playerId,
      botId: args.botId,
      name: args.manifest.name,
      child,
      timeoutMs: this.timeoutMs,
      startupTimeoutMs: this.startupTimeoutMs,
    });
  }
}
