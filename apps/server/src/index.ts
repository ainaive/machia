import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie } from "hono/cookie";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  deleteSession,
  issueSession,
  loginUser,
  registerUser,
  requireAdmin,
  requireUser,
  userFromRequest,
} from "./auth";
import {
  createContest,
  enterContest,
  getContestDetail,
  kickContestWorker,
  listContests,
  reviewEntry,
  startContest,
  submitBot,
} from "./contests";
import { HttpError } from "./errors";
import {
  isMatchRunning,
  listBots,
  listGames,
  listReplays,
  readReplay,
  startDemoMatch,
  startMatch,
} from "./matches";

export const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  }),
);

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

app.get("/api/health", (c) => c.json({ ok: true, running: isMatchRunning() }));

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

app.post("/api/auth/register", async (c) => {
  try {
    const body = await c.req.json<{ username?: string; password?: string }>();
    const user = await registerUser(body.username ?? "", body.password ?? "");
    await issueSession(c, user);
    return c.json({ user }, 201);
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/auth/login", async (c) => {
  try {
    const body = await c.req.json<{ username?: string; password?: string }>();
    const user = await loginUser(body.username ?? "", body.password ?? "");
    await issueSession(c, user);
    return c.json({ user });
  } catch (err) {
    const { message, status } = errorStatus(err);
    return c.json({ error: message }, status);
  }
});

app.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const user = await userFromRequest(c);
  return c.json({ user });
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

app.post("/api/contests/:id/entries/:entryId/approve", async (c) => {
  try {
    await requireAdmin(c);
    const entry = await reviewEntry(
      c.req.param("id"),
      c.req.param("entryId"),
      "approve",
    );
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
    const entry = await reviewEntry(
      c.req.param("id"),
      c.req.param("entryId"),
      "reject",
      reason,
    );
    return c.json({ entry });
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

app.get("/api/matches", async (c) => {
  const matches = await listReplays();
  return c.json({ matches });
});

app.post("/api/matches", async (c) => {
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

const port = Number(process.env.PORT ?? 3001);

export default {
  port,
  fetch: app.fetch,
};

if (import.meta.main) {
  kickContestWorker();
  console.log(`Machia server listening on http://localhost:${port}`);
}
