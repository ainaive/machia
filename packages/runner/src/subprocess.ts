import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import type { PlayerResult } from "@machia/game-api";
import {
  DEFAULT_BOT_TIMEOUT_MS,
  type BotManifest,
  type ServerMessage,
} from "@machia/protocol";
import type { BotHandle, BotRunner } from "./types";

export interface SubprocessRunnerOptions {
  timeoutMs?: number;
  nodePath?: string;
}

class SubprocessBotHandle implements BotHandle {
  readonly playerId: number;
  readonly botId: string;
  readonly name: string;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly timeoutMs: number;
  private readonly lines: AsyncLineQueue;
  private destroyed = false;

  constructor(args: {
    playerId: number;
    botId: string;
    name: string;
    child: ChildProcessWithoutNullStreams;
    timeoutMs: number;
  }) {
    this.playerId = args.playerId;
    this.botId = args.botId;
    this.name = args.name;
    this.child = args.child;
    this.timeoutMs = args.timeoutMs;
    this.lines = new AsyncLineQueue(args.child);
  }

  async sendStart(info: Record<string, unknown>): Promise<void> {
    this.write({ type: "game_start", ...info });
  }

  async requestAction(obs: unknown): Promise<unknown> {
    this.write({ type: "observation", ...(obs as object) });
    try {
      const line = await this.lines.next(this.timeoutMs);
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
    this.lines.close();
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          if (!this.child.killed) this.child.kill("SIGKILL");
          resolve();
        }, 500);
        this.child.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  private write(msg: ServerMessage): void {
    if (this.destroyed || !this.child.stdin.writable) return;
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }
}

class AsyncLineQueue {
  private queue: string[] = [];
  private waiters: Array<{
    resolve: (line: string) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  private closed = false;

  constructor(child: ChildProcessWithoutNullStreams) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(line);
      } else {
        this.queue.push(line);
      }
    });
    child.stderr.on("data", (buf: Buffer) => {
      const text = buf.toString().trim();
      if (text) console.error(`[bot stderr] ${text}`);
    });
    const onClose = () => {
      this.closed = true;
      for (const w of this.waiters) {
        clearTimeout(w.timer);
        w.reject(new Error("bot process closed"));
      }
      this.waiters = [];
    };
    child.on("exit", onClose);
    child.on("error", onClose);
  }

  next(timeoutMs: number): Promise<string> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }
    if (this.closed) {
      return Promise.reject(new Error("bot process closed"));
    }
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        reject(new Error("bot action timeout"));
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(new Error("bot handle destroyed"));
    }
    this.waiters = [];
  }
}

export class SubprocessRunner implements BotRunner {
  private readonly timeoutMs: number;
  private readonly nodePath: string;

  constructor(options: SubprocessRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_BOT_TIMEOUT_MS;
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
    const child = spawn(this.nodePath, [entry], {
      cwd: args.botDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        MACHIA_PLAYER_ID: String(args.playerId),
      },
    });

    return new SubprocessBotHandle({
      playerId: args.playerId,
      botId: args.botId,
      name: args.manifest.name,
      child,
      timeoutMs: this.timeoutMs,
    });
  }
}
