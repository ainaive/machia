import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMatch } from "./index";
import { main, packBot } from "./pack";

const bots = path.resolve(import.meta.dir, "../../../bots");

describe("pack", () => {
  test("bundles a sample bot and its shared helpers into one flat bot.js", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "machia-pack-"));
    const packed = await packBot(path.join(bots, "bomber-rusher"), out);

    expect(readdirSync(out).sort()).toEqual(["bot.js", "manifest.json"]);
    expect(JSON.parse(readFileSync(path.join(out, "manifest.json"), "utf8"))).toEqual({
      name: "Hunter",
      runtime: "node",
      entry: "bot.js",
      games: ["bomber"],
    });
    const code = readFileSync(path.join(out, "bot.js"), "utf8");
    // Only Node built-ins may still be required at runtime.
    const requires = [...code.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(requires.every((r) => r!.startsWith("node:"))).toBe(true);
    expect(packed.bytes).toBe(Buffer.byteLength(code) + readFileSync(path.join(out, "manifest.json")).length);

    const spec = { botId: "packed", botDir: out, manifest: packed.manifest };
    const replay = await runMatch({ id: "packed", gameId: "bomber", seed: 3, maxTicks: 40, players: [spec, spec] });
    expect(replay.players.map((p) => p.stats.crashed || p.stats.invalidReplies > 0)).toEqual([false, false]);
  }, 30_000);

  test("main prints where the upload folder is, and fails clearly", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "machia-pack-"));
    const lines: string[] = [];
    expect(await main([path.join(bots, "turtle"), "--out", out], (l) => lines.push(l))).toBe(0);
    expect(lines.join("\n")).toContain("manifest.json");

    const errors: string[] = [];
    expect(await main(["no/such/bot"], (l) => errors.push(l))).toBe(1);
    expect(errors.join("\n")).toMatch(/manifest\.json/);
    expect(await main([], (l) => errors.push(l))).toBe(1);
    expect(errors.join("\n")).toMatch(/Usage: bun run pack/);
  }, 30_000);
});
