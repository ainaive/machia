import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  isMatchRunning,
  listBots,
  listGames,
  listReplays,
  readReplay,
  startDemoMatch,
  startMatch,
} from "./matches";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  }),
);

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
    const message = err instanceof Error ? err.message : "Failed to start match";
    const status = message.includes("already running") ? 409 : 400;
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
    const message = err instanceof Error ? err.message : "Demo failed";
    const status = message.includes("already running") ? 409 : 400;
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

console.log(`Machia server listening on http://localhost:${port}`);
