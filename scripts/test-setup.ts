import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Matches write replays to disk; send test runs to a throwaway directory.
process.env.MACHIA_REPLAYS_DIR ??= mkdtempSync(path.join(tmpdir(), "machia-replays-"));
