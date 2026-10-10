import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Matches write replays to disk; always send test runs to a throwaway
// directory, even if MACHIA_REPLAYS_DIR is exported for the dev server.
process.env.MACHIA_REPLAYS_DIR = mkdtempSync(path.join(tmpdir(), "machia-replays-"));
