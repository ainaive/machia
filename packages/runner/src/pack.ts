/**
 * Package a bot for contest upload:
 *
 *   bun run pack <botDir> [--out <dir>]
 *
 * Uploads are flat (manifest.json + one entry file), but a bot may be split
 * across files, share helpers like ../machia.js, or use npm packages. This
 * bundles the entry and everything it requires into a single bot.js next to
 * a normalized manifest.json — the folder whose two files you upload.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MAX_BOT_UPLOAD_BYTES, type BotManifest } from "@machia/protocol";

const ROOT = path.resolve(import.meta.dir, "../../..");

export function usage(): string {
  return [
    "Usage: bun run pack <botDir> [--out <dir>]",
    "  <botDir>     folder with manifest.json and the entry file it names",
    "  --out <dir>  where to write the upload (default: dist/bots/<botDir name>)",
  ].join("\n");
}

export interface PackedBot {
  outDir: string;
  manifest: BotManifest;
  /** Total size of the files to upload. */
  bytes: number;
}

export async function packBot(botDir: string, outDir: string): Promise<PackedBot> {
  const manifestPath = path.join(botDir, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`No manifest.json in ${botDir}`);
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<BotManifest>;
  if (typeof raw.name !== "string" || !raw.name.trim()) throw new Error("manifest.json needs a name");
  if (raw.runtime !== "node") throw new Error('manifest.json runtime must be "node"');
  if (typeof raw.entry !== "string") throw new Error("manifest.json needs an entry");

  const build = await Bun.build({
    entrypoints: [path.resolve(botDir, raw.entry)],
    target: "node",
    format: "cjs",
  });
  if (!build.success) {
    throw new Error(`Bundling failed:\n${build.logs.map(String).join("\n")}`);
  }
  const code = await build.outputs[0]!.text();
  const manifest: BotManifest = {
    name: raw.name.trim(),
    runtime: "node",
    entry: "bot.js",
    games: raw.games && raw.games.length > 0 ? raw.games : ["arena"],
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const bytes = Buffer.byteLength(code) + Buffer.byteLength(manifestText);
  if (bytes > MAX_BOT_UPLOAD_BYTES) {
    throw new Error(
      `Packed bot is ${Math.ceil(bytes / 1024)}KB; uploads are limited to ${MAX_BOT_UPLOAD_BYTES / 1024}KB`,
    );
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "bot.js"), code);
  writeFileSync(path.join(outDir, "manifest.json"), manifestText);
  return { outDir, manifest, bytes };
}

export async function main(
  argv: string[],
  print: (line: string) => void = console.log,
): Promise<number> {
  let botDir: string | undefined;
  let outDir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") outDir = argv[++i];
    else if (!botDir) botDir = argv[i];
  }
  if (!botDir) {
    print(usage());
    return 1;
  }
  const source = path.resolve(botDir);
  const target = path.resolve(outDir ?? path.join(ROOT, "dist/bots", path.basename(source)));
  try {
    const packed = await packBot(source, target);
    const rel = path.relative(process.cwd(), packed.outDir) || ".";
    print(`packed ${packed.manifest.name} (${(packed.bytes / 1024).toFixed(1)}KB) → ${rel}`);
    print(`  upload ${rel}/manifest.json and ${rel}/bot.js on the contest page`);
    print(`  try it first: bun run match ${packed.manifest.games![0]} ${rel} <opponent>`);
    return 0;
  } catch (err) {
    print((err as Error).message);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
