import { mkdir, rm, writeFile } from "node:fs/promises";
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
