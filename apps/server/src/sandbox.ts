import { BwrapSandbox, DEFAULT_SANDBOX_LIMITS, detectDelegatedCgroup } from "@machia/runner";

function positive(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, not "${raw}"`);
  }
  return value;
}

/**
 * The bot sandbox the environment asks for, or null to run bots as plain
 * child processes (local development). MACHIA_SANDBOX=bwrap enables it;
 * MACHIA_SANDBOX_CGROUP is "auto" (the service's delegated cgroup), a path,
 * or "off" for no resource limits.
 */
export function sandboxFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  detectCgroup: () => string = detectDelegatedCgroup,
): BwrapSandbox | null {
  const mode = env.MACHIA_SANDBOX?.trim() || "off";
  if (mode === "off") return null;
  if (mode !== "bwrap") {
    throw new Error(`MACHIA_SANDBOX must be "bwrap" or "off", not "${mode}"`);
  }
  const cgroup = env.MACHIA_SANDBOX_CGROUP?.trim() || "auto";
  return new BwrapSandbox({
    cgroupRoot: cgroup === "off" ? null : cgroup === "auto" ? detectCgroup() : cgroup,
    limits: {
      memoryMb: positive(env, "MACHIA_BOT_MEMORY_MB", DEFAULT_SANDBOX_LIMITS.memoryMb),
      pids: positive(env, "MACHIA_BOT_PIDS", DEFAULT_SANDBOX_LIMITS.pids),
      cpus: positive(env, "MACHIA_BOT_CPUS", DEFAULT_SANDBOX_LIMITS.cpus),
    },
  });
}
