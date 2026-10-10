import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_BOT_UPLOAD_BYTES, type BotManifest } from "@machia/protocol";
import { HttpError } from "./errors";

const ALLOWED_EXT = new Set([".js", ".json", ".mjs"]);
const FORBIDDEN_NAMES = new Set(["package.json", "package-lock.json"]);

export interface ParsedBot {
  manifest: BotManifest;
  games: string[];
  files: Record<string, string>;
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name);
  if (!base || base !== name.replaceAll("\\", "/").split("/").pop()) {
    throw new HttpError(400, `Invalid filename: ${name}`);
  }
  if (base.startsWith(".") || base.includes("..")) {
    throw new HttpError(400, `Invalid filename: ${name}`);
  }
  if (FORBIDDEN_NAMES.has(base.toLowerCase())) {
    throw new HttpError(400, `File not allowed: ${base}`);
  }
  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    throw new HttpError(400, `Unsupported file type: ${base}`);
  }
  return base;
}

const importScanner = new Bun.Transpiler({ loader: "js" });

/**
 * Uploads are flat, so code may only load sibling files that were uploaded
 * with it. Catches the common mistake of uploading a bot unbundled (e.g. a
 * sample that needs ../machia.js) at upload time instead of mid-contest.
 * Imports come from a real parse, so comments and strings don't count.
 */
function checkLocalLoads(files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    if (!/\.m?js$/.test(name)) continue;
    let imports: Array<{ path: string }>;
    try {
      // Node allows a leading #! line; the scanner doesn't.
      imports = importScanner.scanImports(content.replace(/^#![^\n]*/, ""));
    } catch {
      throw new HttpError(400, `${name} could not be parsed as JavaScript`);
    }
    for (const { path: spec } of imports) {
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;
      const target = spec.slice(2);
      const present =
        spec.startsWith("./") &&
        !target.includes("/") &&
        [target, `${target}.js`, `${target}.mjs`, `${target}.json`].some((f) => f in files);
      if (!present) {
        const where = spec.startsWith("../") || target.includes("/")
          ? "is outside the upload"
          : "was not uploaded";
        throw new HttpError(
          400,
          `${name} loads "${spec}", which ${where}. Bundle the bot with \`bun run pack <botDir>\` and upload its output.`,
        );
      }
    }
  }
}

export function parseBotFiles(
  rawFiles: Record<string, string>,
  gameId: string,
): ParsedBot {
  const files: Record<string, string> = {};
  let total = 0;
  for (const [rawName, content] of Object.entries(rawFiles)) {
    if (typeof content !== "string") continue;
    const name = sanitizeFilename(rawName);
    files[name] = content;
    total += Buffer.byteLength(content, "utf8");
  }
  if (total === 0) throw new HttpError(400, "No bot files uploaded");
  if (total > MAX_BOT_UPLOAD_BYTES) {
    throw new HttpError(400, "Bot files exceed 256KB");
  }

  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new HttpError(400, "manifest.json is required");

  let manifest: BotManifest;
  try {
    manifest = JSON.parse(manifestRaw) as BotManifest;
  } catch {
    throw new HttpError(400, "manifest.json is not valid JSON");
  }
  if (typeof manifest.name !== "string" || !manifest.name.trim()) {
    throw new HttpError(400, "manifest.json must include a name");
  }
  if (manifest.runtime !== "node") {
    throw new HttpError(400, "Only runtime \"node\" is supported");
  }
  if (typeof manifest.entry !== "string" || !manifest.entry.trim()) {
    throw new HttpError(400, "manifest.json must include entry");
  }
  if (/[/\\]/.test(manifest.entry)) {
    throw new HttpError(400, "manifest.json entry must be a file name");
  }
  const entry = sanitizeFilename(manifest.entry);
  if (!files[entry]) {
    throw new HttpError(400, `Missing entry file: ${entry}`);
  }

  const rawGames: unknown = manifest.games;
  if (
    rawGames !== undefined &&
    (!Array.isArray(rawGames) || !rawGames.every((g) => typeof g === "string"))
  ) {
    throw new HttpError(400, "manifest.json games must be an array of strings");
  }
  const games = rawGames && rawGames.length > 0 ? rawGames : ["arena"];
  if (!games.includes(gameId)) {
    throw new HttpError(
      400,
      `Bot games must include this contest's game (${gameId})`,
    );
  }

  checkLocalLoads(files);

  // Persist only the validated manifest; the runner reads it back from disk.
  manifest = { name: manifest.name.trim(), runtime: "node", entry, games };
  files["manifest.json"] = JSON.stringify(manifest, null, 2);

  return { manifest, games, files };
}

export async function writeBotFiles(
  dir: string,
  files: Record<string, string>,
): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content, "utf8");
  }
}

export function botDirForEntry(uploadsRoot: string, userId: string, entryId: string): string {
  return path.join(uploadsRoot, userId, entryId);
}

export interface BotFile {
  name: string;
  content: string;
}

/** Content hash of a bot: every file's name and content, in name order. */
export function hashBotFiles(files: BotFile[]): string {
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : 1));
  // JSON keeps field boundaries unambiguous even if contents contain NUL.
  const encoded = JSON.stringify(sorted.map((f) => [f.name, f.content]));
  return createHash("sha256").update(encoded).digest("hex");
}

/** The files stored for an uploaded bot, in name order, with their hash. */
export async function readBotFiles(dir: string): Promise<{ hash: string; files: BotFile[] }> {
  const names = (await readdir(dir)).sort();
  const files = await Promise.all(
    names.map(async (name) => ({ name, content: await readFile(path.join(dir, name), "utf8") })),
  );
  return { hash: hashBotFiles(files), files };
}

/** Hash of a stored bot's files (as readBotFiles computes it), or null if they can't be read. */
export function hashBotDirSync(dir: string): string | null {
  try {
    const names = readdirSync(dir);
    return hashBotFiles(names.map((name) => ({ name, content: readFileSync(path.join(dir, name), "utf8") })));
  } catch {
    return null;
  }
}
