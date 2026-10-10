/**
 * Bubblewrap sandbox for bot processes (Linux).
 *
 * Each bot runs in fresh namespaces: no network, its own process tree, a
 * read-only view of the host's system directories and of one mount
 * directory (at /app: the bot's own folder for uploads, or bots/ for the
 * sample bots, which share helper files), and a private /tmp — nothing else
 * of the host, including Machia's data directory. Given a delegated cgroup v2 directory,
 * each bot also gets its own cgroup capping memory, processes/threads and
 * CPU.
 *
 * Host setup (bubblewrap, the Ubuntu 24.04+ AppArmor profile, Delegate= on
 * the unit) is in docs/deploy.md.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export interface SandboxLimits {
  memoryMb: number;
  /** Processes and threads together; a Node bot uses about a dozen. */
  pids: number;
  cpus: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = { memoryMb: 256, pids: 32, cpus: 1 };

/** How each top-level system directory appears inside the sandbox. */
export type RootLayout = Array<{ name: string; symlinkTo?: string }>;

/** /bin, /lib, ... as the host has them: real directories or (merged-/usr) symlinks. */
export function hostRootLayout(): RootLayout {
  const layout: RootLayout = [];
  for (const name of ["bin", "sbin", "lib", "lib32", "lib64"]) {
    try {
      const stat = lstatSync(`/${name}`);
      if (stat.isSymbolicLink()) layout.push({ name, symlinkTo: readlinkSync(`/${name}`) });
      else if (stat.isDirectory()) layout.push({ name });
    } catch {
      // Not present on this host.
    }
  }
  return layout;
}

/** Where the mount directory appears inside the sandbox. */
export const SANDBOX_APP_DIR = "/app";

/** bwrap options exposing only system directories and `mountDir` (at /app), starting in `cwd`. */
export function bwrapArgs(mountDir: string, layout: RootLayout, cwd = SANDBOX_APP_DIR): string[] {
  const args = ["--unshare-all", "--die-with-parent", "--new-session", "--ro-bind", "/usr", "/usr"];
  for (const dir of layout) {
    if (dir.symlinkTo) args.push("--symlink", dir.symlinkTo, `/${dir.name}`);
    else args.push("--ro-bind", `/${dir.name}`, `/${dir.name}`);
  }
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp");
  args.push("--ro-bind", mountDir, SANDBOX_APP_DIR, "--chdir", cwd);
  return args;
}

// Run by /bin/sh before bwrap: move this shell into the bot's cgroup, so the
// bot and everything it starts are limited from their first instruction.
const ENTER_CGROUP = 'echo $$ > "$1/cgroup.procs" && shift && exec "$@"';

export interface SandboxedCommand {
  command: string;
  args: string[];
  /** Kills anything left in the bot's cgroup and removes it. */
  release(): Promise<void>;
}

/** The delegated cgroup this process may manage: the parent of its own cgroup. */
export function detectDelegatedCgroup(procSelfCgroup = "/proc/self/cgroup"): string {
  const line = readFileSync(procSelfCgroup, "utf8")
    .split("\n")
    .find((l) => l.startsWith("0::"));
  if (!line) throw new Error("No cgroup v2 entry in /proc/self/cgroup");
  return path.dirname(path.join("/sys/fs/cgroup", line.slice(3)));
}

export class BwrapSandbox {
  readonly bwrapPath: string;
  /** Delegated cgroup directory; null runs bots without resource limits. */
  readonly cgroupRoot: string | null;
  readonly limits: SandboxLimits;
  private readonly layout: RootLayout;

  constructor(
    options: {
      bwrapPath?: string;
      cgroupRoot?: string | null;
      limits?: Partial<SandboxLimits>;
      layout?: RootLayout;
    } = {},
  ) {
    this.bwrapPath = options.bwrapPath ?? "bwrap";
    this.cgroupRoot = options.cgroupRoot ?? null;
    this.limits = { ...DEFAULT_SANDBOX_LIMITS, ...options.limits };
    this.layout = options.layout ?? hostRootLayout();
  }

  /** Enables the memory, pids and cpu controllers for per-bot cgroups. */
  setupCgroups(): void {
    if (!this.cgroupRoot) return;
    const controllers = "+memory +pids +cpu";
    try {
      writeFileSync(path.join(this.cgroupRoot, "cgroup.subtree_control"), controllers);
      mkdirSync(path.join(this.cgroupRoot, "bots"), { recursive: true });
      writeFileSync(path.join(this.cgroupRoot, "bots", "cgroup.subtree_control"), controllers);
    } catch (err) {
      throw new Error(
        `Cannot manage cgroups under ${this.cgroupRoot} (${(err as Error).message}). ` +
          "Run the service with Delegate=yes and DelegateSubgroup=server (docs/deploy.md).",
      );
    }
  }

  /** The command that runs `argv` inside the sandbox, with `mountDir` at /app and starting in `cwd`. */
  wrap(mountDir: string, argv: string[], cwd = SANDBOX_APP_DIR): SandboxedCommand {
    const inner = [...bwrapArgs(mountDir, this.layout, cwd), ...argv];
    if (!this.cgroupRoot) {
      return { command: this.bwrapPath, args: inner, release: async () => {} };
    }
    const cgroup = path.join(this.cgroupRoot, "bots", `bot-${randomUUID()}`);
    mkdirSync(cgroup);
    const set = (file: string, value: string) => {
      const target = path.join(cgroup, file);
      // memory.swap.max only exists with swap accounting.
      if (file !== "memory.swap.max" || existsSync(target)) writeFileSync(target, value);
    };
    set("memory.max", String(Math.floor(this.limits.memoryMb * 1024 * 1024)));
    set("memory.swap.max", "0");
    set("pids.max", String(this.limits.pids));
    set("cpu.max", `${Math.round(this.limits.cpus * 100_000)} 100000`);
    return {
      command: "/bin/sh",
      args: ["-c", ENTER_CGROUP, "sh", cgroup, this.bwrapPath, ...inner],
      release: () => removeCgroup(cgroup),
    };
  }

  /**
   * Rejects unless Node starts in the sandbox exactly as a bot would, with
   * the configured cgroup and limits. Run at boot, it catches a missing
   * bwrap or AppArmor profile, cgroups the service can't manage, limits the
   * kernel refuses, and limits too tight for Node to start.
   */
  async selfTest(nodePath = "node"): Promise<void> {
    let detail: string | null = null;
    try {
      const { command, args, release } = this.wrap("/usr", [nodePath, "-e", "process.exit(0)"]);
      const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 });
      await release();
      if (result.status !== 0) {
        detail = (result.stderr || result.error?.message || `exit ${result.status}`).trim();
      }
    } catch (err) {
      detail = (err as Error).message;
    }
    if (detail !== null) {
      throw new Error(`Bot sandbox self-test failed: ${detail} (see docs/deploy.md)`);
    }
  }
}

async function removeCgroup(cgroup: string): Promise<void> {
  try {
    // Kill anything still inside (e.g. a process that left the bot's group).
    if (existsSync(path.join(cgroup, "cgroup.kill"))) writeFileSync(path.join(cgroup, "cgroup.kill"), "1");
  } catch {
    // Already gone.
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      rmdirSync(cgroup);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return;
      if (code !== "EBUSY") return; // Not a cgroup directory (tests) or not ours.
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
