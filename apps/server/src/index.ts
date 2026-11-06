import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import {
  authSecret,
  corsOrigins,
  getAuth,
  requireAdmin,
  requireUser,
  userFromRequest,
} from "./auth";
import {
  createContest,
  deleteContest,
  enterContest,
  getContestDetail,
  getEntryFiles,
  getMyContests,
  kickContestWorker,
  listContests,
  rerunFailedMatches,
  reviewEntry,
  startContest,
  submitBot,
  unapproveEntry,
  withdrawEntry,
} from "./contests";
import { SubprocessRunner } from "@machia/runner";
import { getDb } from "./db";
import { sandboxFromEnv, sandboxModeFromEnv } from "./sandbox";
import { HttpError } from "./errors";
import { createInvite, deleteInvite, listInvites } from "./invites";
import { getLadder } from "./ladder";
import { INVITE_HEADER } from "./invite-code";
import {
  isMatchRunning,
  listBots,
  listGames,
  listReplays,
  readReplay,
  setBotRunner,
  startDemoMatch,
  startMatch,
} from "./matches";
import {
  createRateLimiter,
  practiceClientKey,
  practiceLimitFromEnv,
} from "./practice-limit";
import { listNotifications, markNotificationsRead } from "./notifications";

export const app = new Hono();

const practiceLimit = practiceLimitFromEnv();
const practiceLimiter = practiceLimit
  ? createRateLimiter(practiceLimit.limit, practiceLimit.windowMs)
  : null;

function practiceRateLimited(c: Context): Response | null {
  const verdict = practiceLimiter?.check(practiceClientKey(c.req.raw.headers));
  if (!verdict || verdict.allowed) return null;
  c.header("Retry-After", String(Math.max(1, Math.ceil(verdict.retryAfterMs / 1000))));
  return c.json({ error: "Too many practice matches; try again shortly" }, 429);
}

app.use(
  "/api/*",
  cors({
    origin: corsOrigins(),
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", INVITE_HEADER],
    allowMethods: ["POST", "GET", "DELETE", "OPTIONS"],
  }),
);

app.use("/api/*", async (c, next) => {
  const pathName = c.req.path;
  if (
    pathName.startsWith("/api/auth") ||
    pathName.startsWith("/api/admin") ||
    pathName.startsWith("/api/contests") ||
    pathName.startsWith("/api/me") ||
    pathName.startsWith("/api/notifications")
  ) {
    await getDb();
  }
  await next();
});

function queryInteger(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${name} must be an integer from ${min} to ${max}`);
  }
  return n;
}

function errorStatus(err: unknown): { message: string; status: 400 | 401 | 403 | 404 | 409 | 500 } {
  if (err instanceof HttpError) {
    return { message: err.message, status: err.status };
  }
  const message = err instanceof Error ? err.message : "Request failed";
  const status = message.includes("already running") ? 409 : 400;
  return { message, status };
}

async function readBotFiles(c: {
  req: { header: (name: string) => string | undefined; json: <T>() => Promise<T>; formData: () => Promise<FormData> };
}): Promise<Record<string, string>> {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await c.req.json<{ files?: Record<string, string> }>();
    if (!body.files || typeof body.files !== "object") {
      throw new HttpError(400, "files object required");
    }
    return body.files;
  }
  const form = await c.req.formData();
  const files: Record<string, string> = {};
  for (const [, value] of form.entries()) {
    if (!isUploadedFile(value)) continue;
    files[value.name] = await value.text();
  }
  return files;
}

function isUploadedFile(
  value: unknown,
): value is { name: string; text: () => Promise<string> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "text" in value &&
    typeof (value as { text: unknown }).text === "function"
  );
}

app.get("/api/health", (c) =>
  c.json({ ok: true, running: isMatchRunning(), sandbox: sandboxModeFromEnv() }),
);

app.get("/api/games", (c) => c.json({ games: listGames() }));

app.get("/api/bots", async (c) => {
  const gameId = c.req.query("game") ?? undefined;
  const bots = await listBots(gameId);
  return c.json({
    bots: bots.map(({ id, name, runtime, games }) => ({
      id,
      name,
      runtime,
      games,
    })),
  });
});

app.get("/api/auth/me", async (c) => {
  const user = await userFromRequest(c);
  return c.json({ user });
});

app.all("/api/auth/*", (c) => getAuth().handler(c.req.raw));

app.get("/api/me", async (c) => {
  try {
    const user = await requireUser(c);
    const limit = queryInteger(c.req.query("notificationsLimit"), "notificationsLimit", 30, 1, 100);
    const offset = queryInteger(
      c.req.query("notificationsOffset"),
      "notificationsOffset",
      0,
      0,
      1_000_000,
    );
    const [contests, notices] = await Promise.all([
      getMyContests(user.id),
      listNotifications(user.id, limit, offset),
    ]);
    const { total, ...noticePage } = notices;
    return c.json({ contests, ...noticePage, notificationsTotal: total });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/notifications/read", async (c) => {
  try {
    const user = await requireUser(c);
    let id: string | undefined;
    const raw = await c.req.text();
    if (raw.trim()) {
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        throw new HttpError(400, "Invalid JSON body");
      }
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new HttpError(400, "Body must be an object");
      }
      const value = (body as Record<string, unknown>).id;
      if (value !== undefined) {
        if (typeof value !== "string" || !value.trim()) {
          throw new HttpError(400, "id must be a non-empty string");
        }
        id = value;
      }
    }
    // An empty body or {} keeps the convenience of marking everything read.
    const unread = await markNotificationsRead(user.id, id);
    return c.json({ ok: true, unread });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/admin/invites", async (c) => {
  try {
    await requireAdmin(c);
    const invites = await listInvites();
    return c.json({ invites });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/admin/invites", async (c) => {
  try {
    const admin = await requireAdmin(c);
    let body: { note?: string; maxUses?: number; expiresAt?: string | null } = {};
    try {
      body = await c.req.json();
    } catch {
      // empty body
    }
    const invite = await createInvite({
      createdBy: admin.id,
      note: body.note,
      maxUses: body.maxUses,
      expiresAt: body.expiresAt,
    });
    return c.json({ invite }, 201);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/admin/invites/:id", async (c) => {
  try {
    await requireAdmin(c);
    await deleteInvite(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/contests", async (c) => {
  try {
    const contests = await listContests();
    return c.json({ contests });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests", async (c) => {
  try {
    const admin = await requireAdmin(c);
    const body = await c.req.json<{ title?: string; gameId?: string }>();
    const contest = await createContest(admin, body.title ?? "", body.gameId ?? "");
    return c.json({ contest }, 201);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/contests/:id", async (c) => {
  try {
    const viewer = await userFromRequest(c);
    const detail = await getContestDetail(c.req.param("id"), viewer);
    return c.json(detail);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/enter", async (c) => {
  try {
    const user = await requireUser(c);
    const entry = await enterContest(c.req.param("id"), user);
    return c.json({ entry });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/bot", async (c) => {
  try {
    const user = await requireUser(c);
    const files = await readBotFiles(c);
    const entry = await submitBot(c.req.param("id"), user, files);
    return c.json({ entry });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/contests/:id/entries/:entryId/files", async (c) => {
  try {
    const viewer = await requireUser(c);
    const files = await getEntryFiles(c.req.param("id"), c.req.param("entryId"), viewer);
    return c.json(files);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/entries/:entryId/approve", async (c) => {
  try {
    await requireAdmin(c);
    let hash: string | undefined;
    try {
      hash = (await c.req.json<{ hash?: string }>()).hash;
    } catch {
      // empty body
    }
    const entry = await reviewEntry(c.req.param("id"), c.req.param("entryId"), {
      action: "approve",
      hash,
    });
    return c.json({ entry });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/entries/:entryId/reject", async (c) => {
  try {
    await requireAdmin(c);
    let reason = "";
    try {
      const body = await c.req.json<{ reason?: string }>();
      reason = body.reason ?? "";
    } catch {
      // empty body
    }
    const entry = await reviewEntry(c.req.param("id"), c.req.param("entryId"), {
      action: "reject",
      reason,
    });
    return c.json({ entry });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/entries/:entryId/withdraw", async (c) => {
  try {
    const user = await requireUser(c);
    await withdrawEntry(c.req.param("id"), c.req.param("entryId"), user);
    return c.json({ ok: true });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/entries/:entryId/unapprove", async (c) => {
  try {
    await requireAdmin(c);
    const entry = await unapproveEntry(c.req.param("id"), c.req.param("entryId"));
    return c.json({ entry });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/contests/:id", async (c) => {
  try {
    await requireAdmin(c);
    await deleteContest(c.req.param("id"));
    return c.json({ ok: true });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/start", async (c) => {
  try {
    await requireAdmin(c);
    const detail = await startContest(c.req.param("id"));
    return c.json(detail);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/contests/:id/rerun-failed", async (c) => {
  try {
    const admin = await requireAdmin(c);
    const detail = await rerunFailedMatches(c.req.param("id"), admin);
    return c.json(detail);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/ladder/:gameId", async (c) => {
  try {
    const players = await getLadder(c.req.param("gameId"));
    return c.json({ players });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/matches", async (c) => {
  try {
    const gameId = c.req.query("game")?.trim() || undefined;
    if (gameId && !listGames().some((g) => g.id === gameId)) {
      throw new HttpError(400, `Unknown game: ${gameId}`);
    }
    const limit = queryInteger(c.req.query("limit"), "limit", 20, 1, 100);
    const offset = queryInteger(c.req.query("offset"), "offset", 0, 0, 1_000_000);
    const page = await listReplays({ gameId, limit, offset });
    return c.json(page);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/matches", async (c) => {
  const limited = practiceRateLimited(c);
  if (limited) return limited;
  try {
    const body = await c.req.json<{ botIds?: string[]; gameId?: string }>();
    const gameId = body.gameId ?? "arena";
    const botIds = body.botIds ?? [];
    const replay = await startMatch(gameId, botIds);
    return c.json({
      matchId: replay.id,
      gameId: replay.gameId,
      results: replay.results,
      totalTicks: replay.totalTicks,
    });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/matches/demo", async (c) => {
  const limited = practiceRateLimited(c);
  if (limited) return limited;
  try {
    let gameId = "arena";
    try {
      const body = await c.req.json<{ gameId?: string }>();
      if (body.gameId) gameId = body.gameId;
    } catch {
      // empty body ok
    }
    const replay = await startDemoMatch(gameId);
    return c.json({
      matchId: replay.id,
      gameId: replay.gameId,
      results: replay.results,
      totalTicks: replay.totalTicks,
    });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.get("/api/matches/:id", async (c) => {
  const replay = await readReplay(c.req.param("id"));
  if (!replay) return c.json({ error: "Not found" }, 404);
  return c.json({
    id: replay.id,
    gameId: replay.gameId ?? "arena",
    createdAt: replay.createdAt,
    mapSize: replay.mapSize,
    players: replay.players,
    results: replay.results,
    totalTicks: replay.totalTicks,
  });
});

app.get("/api/matches/:id/replay", async (c) => {
  const replay = await readReplay(c.req.param("id"));
  if (!replay) return c.json({ error: "Not found" }, 404);
  return c.json(replay);
});

export function serverListenConfig(env: NodeJS.ProcessEnv = process.env): {
  port: number;
  hostname?: string;
} {
  const port = Number(env.PORT ?? 3001);
  const hostname = env.HOST?.trim();
  return hostname ? { port, hostname } : { port };
}

const listen = serverListenConfig();

export default {
  ...listen,
  fetch: app.fetch,
};

if (import.meta.main) {
  // Refuse to boot a public deployment on the built-in dev secret.
  authSecret();
  // Refuse to boot with a sandbox that is configured but doesn't work.
  const sandbox = sandboxFromEnv();
  if (sandbox) {
    sandbox.setupCgroups();
    await sandbox.selfTest();
    setBotRunner(new SubprocessRunner({ sandbox }));
    const { memoryMb, pids, cpus } = sandbox.limits;
    console.log(
      sandbox.cgroupRoot
        ? `Bots run sandboxed (bwrap; ${memoryMb}MB, ${pids} tasks, ${cpus} CPU each)`
        : "Bots run sandboxed (bwrap; no resource limits)",
    );
  }
  kickContestWorker();
  const host = listen.hostname ?? "localhost";
  console.log(`Machia server listening on http://${host}:${listen.port}`);
}
