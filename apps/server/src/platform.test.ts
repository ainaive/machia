import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app } from "./index";
import { parseBotFiles } from "./botFiles";
import { resetDatabase, closeDatabase } from "./db";
import { waitForContestWorkerIdle } from "./contests";

const WAIT_BOT = `const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type === "observation") {
    process.stdout.write(JSON.stringify({ action: "WAIT" }) + "\\n");
  }
});
`;

function arenaFiles(name: string): Record<string, string> {
  return {
    "manifest.json": JSON.stringify({
      name,
      runtime: "node",
      entry: "bot.js",
      games: ["arena"],
    }),
    "bot.js": WAIT_BOT,
  };
}

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie");
  if (!raw) throw new Error("missing Set-Cookie");
  return raw.split(";")[0]!;
}

async function json(
  pathUrl: string,
  init?: RequestInit & { cookie?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (init?.cookie) headers.set("Cookie", init.cookie);
  const res = await app.request(pathUrl, { ...init, headers });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

async function register(username: string, password = "password1") {
  const res = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as { user: { id: string; username: string; role: string }; error?: string };
  return { status: res.status, cookie: cookieFrom(res), body };
}

describe("bot file validation", () => {
  test("requires manifest and matching game", () => {
    expect(() => parseBotFiles({ "bot.js": "x" }, "arena")).toThrow(/manifest.json/);
    expect(() =>
      parseBotFiles(
        {
          "manifest.json": JSON.stringify({
            name: "X",
            runtime: "node",
            entry: "bot.js",
            games: ["bomber"],
          }),
          "bot.js": "x",
        },
        "arena",
      ),
    ).toThrow(/must include this contest/);
  });

  test("accepts a valid arena bot", () => {
    const parsed = parseBotFiles(arenaFiles("Scout"), "arena");
    expect(parsed.manifest.name).toBe("Scout");
    expect(parsed.games).toContain("arena");
  });
});

describe("auth and contests", () => {
  beforeEach(async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "machia-"));
    process.env.MACHIA_UPLOADS_DIR = path.join(dir, "uploads");
    process.env.MACHIA_CONTEST_MAX_TICKS = "8";
    delete process.env.MACHIA_ADMIN_USERNAME;
    delete process.env.MACHIA_ADMIN_PASSWORD;
    await resetDatabase(path.join(dir, "t.db"));
  });

  afterEach(async () => {
    await waitForContestWorkerIdle();
    closeDatabase();
  });

  test("register logs in; first user is admin; duplicate rejected", async () => {
    const a = await register("alice");
    expect(a.status).toBe(201);
    expect(a.body.user.role).toBe("admin");

    const me = await json("/api/auth/me", { cookie: a.cookie });
    expect(me.body.user).toMatchObject({ username: "alice", role: "admin" });

    const dup = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: "alice", password: "password1" }),
    });
    expect(dup.status).toBe(409);

    const bob = await register("bob");
    expect(bob.body.user.role).toBe("user");
  });

  test("login rejects bad password; logout clears session", async () => {
    const a = await register("alice");
    const bad = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "alice", password: "wrongpass" }),
    });
    expect(bad.status).toBe(401);

    const ok = await json("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "alice", password: "password1" }),
    });
    expect(ok.status).toBe(200);

    await json("/api/auth/logout", { method: "POST", cookie: a.cookie });
    const me = await json("/api/auth/me", { cookie: a.cookie });
    expect(me.body.user).toBeNull();
  });

  test("non-admin cannot create a contest", async () => {
    await register("alice");
    const bob = await register("bob");
    const res = await json("/api/contests", {
      method: "POST",
      cookie: bob.cookie,
      body: JSON.stringify({ title: "Cup", gameId: "arena" }),
    });
    expect(res.status).toBe(403);
  });

  test("guest cannot enter", async () => {
    const admin = await register("alice");
    const created = await json("/api/contests", {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ title: "Cup", gameId: "arena" }),
    });
    const contest = created.body.contest as { id: string };
    const res = await json(`/api/contests/${contest.id}/enter`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  test("full contest lifecycle: submit, approve, round-robin, standings", async () => {
    const admin = await register("alice");
    const bob = await register("bob");

    const created = await json("/api/contests", {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ title: "Arena Cup", gameId: "arena" }),
    });
    expect(created.status).toBe(201);
    const contestId = (created.body.contest as { id: string }).id;

    const tooSoon = await json(`/api/contests/${contestId}/start`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(tooSoon.status).toBe(400);

    const aliceBot = await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ files: arenaFiles("AliceBot") }),
    });
    expect(aliceBot.status).toBe(200);
    const aliceEntry = aliceBot.body.entry as { id: string; status: string };
    expect(aliceEntry.status).toBe("pending");

    const bobBot = await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie: bob.cookie,
      body: JSON.stringify({ files: arenaFiles("BobBot") }),
    });
    expect(bobBot.status).toBe(200);
    const bobEntry = bobBot.body.entry as { id: string };

    const reject = await json(
      `/api/contests/${contestId}/entries/${bobEntry.id}/reject`,
      {
        method: "POST",
        cookie: admin.cookie,
        body: JSON.stringify({ reason: "needs comments" }),
      },
    );
    expect(reject.status).toBe(200);
    expect((reject.body.entry as { status: string }).status).toBe("rejected");

    const bobAgain = await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie: bob.cookie,
      body: JSON.stringify({ files: arenaFiles("BobBot2") }),
    });
    expect((bobAgain.body.entry as { status: string }).status).toBe("pending");

    await json(`/api/contests/${contestId}/entries/${aliceEntry.id}/approve`, {
      method: "POST",
      cookie: admin.cookie,
    });
    await json(
      `/api/contests/${contestId}/entries/${(bobAgain.body.entry as { id: string }).id}/approve`,
      { method: "POST", cookie: admin.cookie },
    );

    const started = await json(`/api/contests/${contestId}/start`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(started.status).toBe(200);
    expect((started.body.contest as { status: string }).status).toBe("running");
    expect((started.body.matches as unknown[]).length).toBe(1);

    const locked = await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ files: arenaFiles("Nope") }),
    });
    expect(locked.status).toBe(409);

    const deadline = Date.now() + 20_000;
    let detail: Record<string, unknown> = started.body;
    while (Date.now() < deadline) {
      const poll = await json(`/api/contests/${contestId}`, {
        cookie: admin.cookie,
      });
      detail = poll.body;
      if ((detail.contest as { status: string }).status === "finished") break;
      await Bun.sleep(100);
    }

    expect((detail.contest as { status: string }).status).toBe("finished");
    const matches = detail.matches as Array<{ status: string; matchId: string | null }>;
    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe("done");
    expect(matches[0]!.matchId).toBeTruthy();
    const standings = detail.standings as Array<{ rank: number }>;
    expect(standings).toHaveLength(2);
    expect(standings[0]!.rank).toBe(1);
  }, 25_000);
});
