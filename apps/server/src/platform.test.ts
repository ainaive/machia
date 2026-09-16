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

const ORIGIN = "http://localhost:3001";
const ADMIN_PASSWORD = "adminpass1";

function cookieFrom(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const list = headers.getSetCookie?.() ?? [];
  if (list.length > 0) {
    return list.map((c) => c.split(";")[0]!).join("; ");
  }
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
  if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
  if (init?.cookie) headers.set("Cookie", init.cookie);
  const url = pathUrl.startsWith("http") ? pathUrl : `${ORIGIN}${pathUrl}`;
  const res = await app.request(url, { ...init, headers });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { status: res.status, body };
}

async function signIn(username: string, password: string) {
  const headers = {
    "Content-Type": "application/json",
    Origin: ORIGIN,
  };
  const res = await app.request(`${ORIGIN}/api/auth/sign-in/username`, {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return {
    status: res.status,
    cookie: res.headers.get("set-cookie") ? cookieFrom(res) : "",
    body,
  };
}

async function adminSession() {
  return signIn("admin", ADMIN_PASSWORD);
}

async function createInviteCode(cookie: string, extra?: { maxUses?: number }) {
  const created = await json("/api/admin/invites", {
    method: "POST",
    cookie,
    body: JSON.stringify(extra ?? {}),
  });
  const invite = created.body.invite as { id: string; code: string };
  return { status: created.status, invite };
}

async function register(
  username: string,
  opts?: { password?: string; email?: string; invite?: string; cookie?: string },
) {
  let invite = opts?.invite;
  if (!invite) {
    const admin = await adminSession();
    invite = (await createInviteCode(admin.cookie)).invite.code;
  }
  const raw = await app.request(`${ORIGIN}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "x-invite-code": invite,
    },
    body: JSON.stringify({
      email: opts?.email ?? `${username}@test.local`,
      password: opts?.password ?? "password1",
      name: username,
      username,
    }),
  });
  const body = (await raw.json()) as {
    user?: { id: string; username: string; role: string };
    message?: string;
  };
  return { status: raw.status, cookie: raw.headers.get("set-cookie") ? cookieFrom(raw) : "", body };
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
    process.env.MACHIA_ADMIN_EMAIL = "admin@test.local";
    process.env.MACHIA_ADMIN_USERNAME = "admin";
    process.env.MACHIA_ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.MACHIA_AUTH_RATE_LIMIT = "0";
    process.env.MACHIA_PUBLIC_URL = ORIGIN;
    process.env.MACHIA_AUTH_SECRET = "test-secret-test-secret-test-secr";
    await resetDatabase(path.join(dir, "t.db"));
  });

  afterEach(async () => {
    await waitForContestWorkerIdle();
    closeDatabase();
  });

  test("rejects signup without a valid invite", async () => {
    const res = await json("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@test.local",
        password: "password1",
        name: "alice",
        username: "alice",
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body).toLowerCase()).toContain("invite");
  });

  test("invite signup logs in; duplicate email rejected; invite is single-use", async () => {
    const admin = await adminSession();
    expect(admin.status).toBe(200);
    const me = await json("/api/auth/me", { cookie: admin.cookie });
    expect(me.body.user).toMatchObject({ username: "admin", role: "admin" });

    const { invite } = await createInviteCode(admin.cookie);
    const alice = await register("alice", { invite: invite.code });
    expect(alice.status).toBe(200);
    expect(alice.body.user).toMatchObject({ username: "alice", role: "user" });

    const reuse = await register("bob", { invite: invite.code, email: "bob@test.local" });
    expect(reuse.status).toBeGreaterThanOrEqual(400);

    const dup = await register("alice2", { email: "alice@test.local" });
    expect(dup.status).toBeGreaterThanOrEqual(400);
  });

  test("login rejects bad password; logout clears session", async () => {
    await register("alice");
    const bad = await json("/api/auth/sign-in/username", {
      method: "POST",
      body: JSON.stringify({ username: "alice", password: "wrongpass" }),
    });
    expect(bad.status).toBe(401);

    const ok = await json("/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email: "alice@test.local", password: "password1" }),
    });
    expect(ok.status).toBe(200);

    const alice = await signIn("alice", "password1");
    await json("/api/auth/sign-out", { method: "POST", cookie: alice.cookie });
    const me = await json("/api/auth/me", { cookie: alice.cookie });
    expect(me.body.user).toBeNull();
  });

  test("non-admin cannot create a contest or invite", async () => {
    const bob = await register("bob");
    const contest = await json("/api/contests", {
      method: "POST",
      cookie: bob.cookie,
      body: JSON.stringify({ title: "Cup", gameId: "arena" }),
    });
    expect(contest.status).toBe(403);

    const invite = await json("/api/admin/invites", {
      method: "POST",
      cookie: bob.cookie,
      body: "{}",
    });
    expect(invite.status).toBe(403);
  });

  test("guest cannot enter", async () => {
    const admin = await adminSession();
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
    const admin = await adminSession();
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
