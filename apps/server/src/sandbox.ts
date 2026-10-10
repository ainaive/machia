import { BwrapSandbox, DEFAULT_SANDBOX_LIMITS, detectDelegatedCgroup } from "@machia/runner";

function limit(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  rule: { integer?: boolean; min: number },
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < rule.min || (rule.integer && !Number.isInteger(value))) {
    const kind = rule.integer ? "a whole number" : "a number";
    throw new Error(`${name} must be ${kind} of at least ${rule.min}, not "${raw}"`);
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
    // Bounds the kernel enforces: pids.max is a whole number and cpu.max
    // needs a quota of at least 1000µs per 100000µs period.
    limits: {
      memoryMb: limit(env, "MACHIA_BOT_MEMORY_MB", DEFAULT_SANDBOX_LIMITS.memoryMb, { min: 1 }),
      pids: limit(env, "MACHIA_BOT_PIDS", DEFAULT_SANDBOX_LIMITS.pids, { integer: true, min: 1 }),
      cpus: limit(env, "MACHIA_BOT_CPUS", DEFAULT_SANDBOX_LIMITS.cpus, { min: 0.01 }),
    },
  });
}
