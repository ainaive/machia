import { describe, expect, test } from "bun:test";
import { sandboxFromEnv } from "./sandbox";

const detect = () => "/sys/fs/cgroup/system.slice/machia.service";

describe("sandbox configuration", () => {
  test("bots run unsandboxed unless MACHIA_SANDBOX=bwrap", () => {
    expect(sandboxFromEnv({}, detect)).toBeNull();
    expect(sandboxFromEnv({ MACHIA_SANDBOX: "off" }, detect)).toBeNull();
  });

  test("bwrap uses the delegated cgroup and default limits", () => {
    const sandbox = sandboxFromEnv({ MACHIA_SANDBOX: "bwrap" }, detect)!;
    expect(sandbox.cgroupRoot).toBe("/sys/fs/cgroup/system.slice/machia.service");
    expect(sandbox.limits).toEqual({ memoryMb: 256, pids: 32, cpus: 1 });
  });

  test("cgroup and limits can be set or turned off", () => {
    const sandbox = sandboxFromEnv(
      {
        MACHIA_SANDBOX: "bwrap",
        MACHIA_SANDBOX_CGROUP: "off",
        MACHIA_BOT_MEMORY_MB: "512",
        MACHIA_BOT_PIDS: "64",
        MACHIA_BOT_CPUS: "0.5",
      },
      detect,
    )!;
    expect(sandbox.cgroupRoot).toBeNull();
    expect(sandbox.limits).toEqual({ memoryMb: 512, pids: 64, cpus: 0.5 });
    expect(sandboxFromEnv({ MACHIA_SANDBOX: "bwrap", MACHIA_SANDBOX_CGROUP: "/x" }, detect)!.cgroupRoot).toBe(
      "/x",
    );
  });

  test("rejects unknown modes and bad limits", () => {
    expect(() => sandboxFromEnv({ MACHIA_SANDBOX: "docker" }, detect)).toThrow(/MACHIA_SANDBOX/);
    expect(() => sandboxFromEnv({ MACHIA_SANDBOX: "bwrap", MACHIA_BOT_PIDS: "lots" }, detect)).toThrow(
      /MACHIA_BOT_PIDS/,
    );
    expect(() => sandboxFromEnv({ MACHIA_SANDBOX: "bwrap", MACHIA_BOT_MEMORY_MB: "0" }, detect)).toThrow(
      /MACHIA_BOT_MEMORY_MB/,
    );
  });
});
