import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { packBot } from "@machia/runner";
import { app } from "./index";
import * as botFiles from "./botFiles";
import { parseBotFiles } from "./botFiles";
import { resetDatabase, closeDatabase } from "./db";
import {
  getEntryFiles,
  reviewEntry,
  startContest,
  submitBot,
  waitForContestWorkerIdle,
} from "./contests";
import type { PublicUser } from "./auth";
import { HttpError } from "./errors";
import { setMailSink } from "./mail";

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

/** Approves the way the UI does: read the bot's files, then approve that exact version. */
async function approveEntry(contestId: string, entryId: string, adminCookie: string) {
  const files = await json(`/api/contests/${contestId}/entries/${entryId}/files`, {
    cookie: adminCookie,
  });
  return json(`/api/contests/${contestId}/entries/${entryId}/approve`, {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({ hash: files.body.hash }),
  });
}

/** An arena contest with two approved WAIT bots, ready to start. */
async function readyContest(adminCookie: string, rival = "bob") {
  const bob = await register(rival);
  const created = await json("/api/contests", {
    method: "POST",
    cookie: adminCookie,
    body: JSON.stringify({ title: "Ready Cup", gameId: "arena" }),
  });
  const contestId = (created.body.contest as { id: string }).id;
  for (const [cookie, name] of [
    [adminCookie, "AliceBot"],
    [bob.cookie, "BobBot"],
  ] as const) {
    const up = await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ files: arenaFiles(name) }),
    });
    const entryId = (up.body.entry as { id: string }).id;
    await approveEntry(contestId, entryId, adminCookie);
  }
  return contestId;
}

async function waitForContest(contestId: string, cookie: string) {
  const deadline = Date.now() + 20_000;
  let detail: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    detail = (await json(`/api/contests/${contestId}`, { cookie })).body;
    if ((detail.contest as { status: string }).status === "finished") break;
    await Bun.sleep(100);
  }
  return detail;
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

  test("rejects an entry that points outside the bot folder", () => {
    for (const entry of ["../../other/bot.js", "sub/bot.js", "..\\bot.js"]) {
      expect(() =>
        parseBotFiles(
          {
            "manifest.json": JSON.stringify({
              name: "X",
              runtime: "node",
              entry,
              games: ["arena"],
            }),
            "bot.js": WAIT_BOT,
          },
          "arena",
        ),
      ).toThrow(/entry must be a file name/);
    }
  });

  test("rejects games that is not an array of strings", () => {
    expect(() =>
      parseBotFiles(
        {
          "manifest.json": JSON.stringify({
            name: "X",
            runtime: "node",
            entry: "bot.js",
            games: "arena",
          }),
          "bot.js": WAIT_BOT,
        },
        "arena",
      ),
    ).toThrow(/games must be an array/);
  });

  test("rejects code that loads files missing from the upload", () => {
    const manifest = JSON.stringify({ name: "X", runtime: "node", entry: "bot.js", games: ["arena"] });
    // A raw sample bot needs ../machia.js, which is outside the upload.
    const sample = readFileSync(path.resolve(import.meta.dir, "../../../bots/turtle/bot.js"), "utf8");
    expect(() => parseBotFiles({ "manifest.json": manifest, "bot.js": sample }, "arena")).toThrow(
      /\.\.\/machia\.js.*bun run pack/,
    );
    const usesHelper = `const h = require("./helper");\n${WAIT_BOT}`;
    expect(() => parseBotFiles({ "manifest.json": manifest, "bot.js": usesHelper }, "arena")).toThrow(
      /"\.\/helper".*not uploaded/,
    );
    expect(
      parseBotFiles(
        { "manifest.json": manifest, "bot.js": usesHelper, "helper.js": "module.exports = {};" },
        "arena",
      ).files["helper.js"],
    ).toBeDefined();
  });

  test("only actual imports count, not comments or strings", () => {
    const manifest = JSON.stringify({ name: "X", runtime: "node", entry: "bot.js", games: ["arena"] });
    const mentions = [
      '// previously require("../helper.js")',
      '/* import x from "../old.js" */',
      'const note = "see require(\'./nope\')";',
      WAIT_BOT,
    ].join("\n");
    expect(parseBotFiles({ "manifest.json": manifest, "bot.js": mentions }, "arena").files["bot.js"]).toBe(
      mentions,
    );
    expect(() =>
      parseBotFiles({ "manifest.json": manifest, "bot.js": "const = ;" }, "arena"),
    ).toThrow(/could not be parsed/);
    const shebang = `#!/usr/bin/env node\n${WAIT_BOT}`;
    expect(parseBotFiles({ "manifest.json": manifest, "bot.js": shebang }, "arena").files["bot.js"]).toBe(
      shebang,
    );
  });

  test("the approval hash tells file boundaries apart", () => {
    // NUL-joined fields made these two different uploads hash the same.
    const oneFile = [{ name: "bot.js", content: "A\0helper.js\0B" }];
    const twoFiles = [
      { name: "bot.js", content: "A" },
      { name: "helper.js", content: "B" },
    ];
    expect(botFiles.hashBotFiles(oneFile)).not.toBe(botFiles.hashBotFiles(twoFiles));
  });

  test("accepts a sample bot once it is packed", async () => {
    const out = mkdtempSync(path.join(tmpdir(), "machia-pack-"));
    await packBot(path.resolve(import.meta.dir, "../../../bots/quoridor-blocker"), out);
    const files = Object.fromEntries(
      ["manifest.json", "bot.js"].map((name) => [name, readFileSync(path.join(out, name), "utf8")]),
    );
    const parsed = parseBotFiles(files, "quoridor");
    expect(parsed.manifest.entry).toBe("bot.js");
    expect(Object.keys(parsed.files).sort()).toEqual(["bot.js", "manifest.json"]);
  });

  test("stores the validated manifest, not the raw upload", () => {
    const parsed = parseBotFiles(
      {
        "manifest.json": JSON.stringify({
          name: "  Scout  ",
          runtime: "node",
          entry: "bot.js",
          games: ["arena"],
          extra: "dropped",
        }),
        "bot.js": WAIT_BOT,
      },
      "arena",
    );
    expect(JSON.parse(parsed.files["manifest.json"]!)).toEqual({
      name: "Scout",
      runtime: "node",
      entry: "bot.js",
      games: ["arena"],
    });
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
    setMailSink(null);
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

  test("password reset email lets the user set a new password", async () => {
    await register("alice");
    let mailed = "";
    setMailSink((message) => {
      mailed = message.text;
    });

    const requested = await json("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@test.local",
        redirectTo: `${ORIGIN}/reset-password`,
      }),
    });
    expect(requested.status).toBe(200);
    expect(mailed).toContain("http");

    const tokenMatch = mailed.match(/\/reset-password\/([^?\s]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = decodeURIComponent(tokenMatch![1]!);

    const reset = await json("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword: "password2" }),
    });
    expect(reset.status).toBe(200);

    const oldPass = await json("/api/auth/sign-in/username", {
      method: "POST",
      body: JSON.stringify({ username: "alice", password: "password1" }),
    });
    expect(oldPass.status).toBe(401);

    const next = await signIn("alice", "password2");
    expect(next.status).toBe(200);
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

    await approveEntry(contestId, aliceEntry.id, admin.cookie);
    await approveEntry(contestId, (bobAgain.body.entry as { id: string }).id, admin.cookie);

    const started = await json(`/api/contests/${contestId}/start`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(started.status).toBe(200);
    expect((started.body.contest as { status: string }).status).toBe("running");
    // One pair, played from both seats.
    expect((started.body.matches as unknown[]).length).toBe(2);

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
    const matches = detail.matches as Array<{
      status: string;
      matchId: string | null;
      entryAId: string;
      entryBId: string;
    }>;
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.status === "done" && m.matchId)).toBe(true);
    expect(matches[1]!.entryAId).toBe(matches[0]!.entryBId);
    expect(matches[1]!.entryBId).toBe(matches[0]!.entryAId);
    // Identical WAIT bots finish level from both seats: two draws each.
    const standings = detail.standings as Array<{ rank: number; wins: number; draws: number }>;
    expect(standings).toHaveLength(2);
    for (const row of standings) {
      expect(row).toMatchObject({ rank: 1, wins: 0, draws: 2 });
    }
  }, 25_000);

  test("admin reads a bot's code and approves exactly that version", async () => {
    const admin = await adminSession();
    const bob = await register("bob");
    const carol = await register("carol");
    const created = await json("/api/contests", {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ title: "Review Cup", gameId: "arena" }),
    });
    const contestId = (created.body.contest as { id: string }).id;
    const up = await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie: bob.cookie,
      body: JSON.stringify({ files: arenaFiles("BobBot") }),
    });
    const entryId = (up.body.entry as { id: string }).id;
    const filesUrl = `/api/contests/${contestId}/entries/${entryId}/files`;
    const approveUrl = `/api/contests/${contestId}/entries/${entryId}/approve`;

    expect((await json(filesUrl)).status).toBe(401);
    expect((await json(filesUrl, { cookie: carol.cookie })).status).toBe(403);
    expect((await json(filesUrl, { cookie: bob.cookie })).status).toBe(200);

    const reviewed = await json(filesUrl, { cookie: admin.cookie });
    expect(reviewed.status).toBe(200);
    const files = reviewed.body.files as Array<{ name: string; content: string }>;
    expect(files.map((f) => f.name)).toEqual(["bot.js", "manifest.json"]);
    expect(files.find((f) => f.name === "bot.js")!.content).toBe(WAIT_BOT);
    const hash = reviewed.body.hash as string;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    const noHash = await json(approveUrl, { method: "POST", cookie: admin.cookie, body: "{}" });
    expect(noHash.status).toBe(400);

    // Bob swaps the code after the admin read it: the old hash no longer approves.
    await json(`/api/contests/${contestId}/bot`, {
      method: "POST",
      cookie: bob.cookie,
      body: JSON.stringify({ files: { ...arenaFiles("BobBot"), "bot.js": `${WAIT_BOT}// changed\n` } }),
    });
    const stale = await json(approveUrl, {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ hash }),
    });
    expect(stale.status).toBe(409);

    const approved = await approveEntry(contestId, entryId, admin.cookie);
    expect(approved.status).toBe(200);
    expect((approved.body.entry as { status: string }).status).toBe("approved");
  });

  test("an upload racing an approval never leaves unreviewed code approved", async () => {
    const admin = await adminSession();
    const bob = await register("bob");
    const bobUser = bob.body.user as PublicUser;
    const adminUser = { id: "", username: "admin", role: "admin" } as PublicUser;
    const created = await json("/api/contests", {
      method: "POST",
      cookie: admin.cookie,
      body: JSON.stringify({ title: "Race Cup", gameId: "arena" }),
    });
    const contestId = (created.body.contest as { id: string }).id;
    const reviewed = { ...arenaFiles("BobBot"), "bot.js": `${WAIT_BOT}// reviewed\n` };
    const swapped = { ...arenaFiles("BobBot"), "bot.js": `${WAIT_BOT}// swapped\n` };
    const entry = await submitBot(contestId, bobUser, reviewed);
    const { hash } = await getEntryFiles(contestId, entry.id, adminUser);

    // Make the approval's file read slow, so the upload lands mid-approval.
    const realRead = botFiles.readBotFiles;
    const slowRead = spyOn(botFiles, "readBotFiles").mockImplementation(async (dir) => {
      const files = await realRead(dir);
      await Bun.sleep(150);
      return files;
    });
    try {
      // Call the services directly: over HTTP the auth step staggers them.
      const approving = reviewEntry(contestId, entry.id, { action: "approve", hash });
      await Bun.sleep(20);
      await Promise.allSettled([approving, submitBot(contestId, bobUser, swapped)]);
      // The approval really went through the slowed read, so the race was exercised.
      expect(slowRead).toHaveBeenCalledTimes(1);
    } finally {
      slowRead.mockRestore();
    }

    const detail = await json(`/api/contests/${contestId}`, { cookie: admin.cookie });
    const status = (detail.body.entries as Array<{ id: string; status: string }>).find(
      (e) => e.id === entry.id,
    )!.status;
    const now = await getEntryFiles(contestId, entry.id, adminUser);
    expect(status === "approved" && now.hash !== hash).toBe(false);
  }, 30_000);

  test("each contest finishes as soon as its own games are done", async () => {
    const admin = await adminSession();
    const first = await readyContest(admin.cookie, "bob");
    const second = await readyContest(admin.cookie, "carol");
    await startContest(first);
    await startContest(second);
    const status = async (id: string) =>
      ((await json(`/api/contests/${id}`, { cookie: admin.cookie })).body.contest as {
        status: string;
      }).status;
    // The first contest's games run first; it must not wait for the second.
    let firstDoneWhileSecondRuns = false;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const [a, b] = [await status(first), await status(second)];
      if (a === "finished" && b === "running") {
        firstDoneWhileSecondRuns = true;
        break;
      }
      if (b === "finished") break;
      await Bun.sleep(5);
    }
    expect(firstDoneWhileSecondRuns).toBe(true);
  }, 30_000);

  test("admin reruns failed games; only admins see raw errors", async () => {
    const admin = await adminSession();
    const contestId = await readyContest(admin.cookie, "bob");
    const bob = await signIn("bob", "password1");
    const entries = (await json(`/api/contests/${contestId}`, { cookie: admin.cookie })).body
      .entries as Array<{ id: string; userId: string; username: string }>;
    const bobEntry = entries.find((e) => e.username === "bob")!;
    const manifestPath = path.join(
      process.env.MACHIA_UPLOADS_DIR!,
      bobEntry.userId,
      bobEntry.id,
      "manifest.json",
    );
    rmSync(manifestPath);

    await startContest(contestId);
    const failed = await waitForContest(contestId, admin.cookie);
    const adminMatches = failed.matches as Array<{ status: string; error: string | null }>;
    expect(adminMatches.map((m) => m.status)).toEqual(["error", "error"]);
    expect(adminMatches[0]!.error).toContain("manifest.json");

    const bobView = (await json(`/api/contests/${contestId}`, { cookie: bob.cookie })).body
      .matches as Array<{ error: string | null }>;
    expect(bobView.map((m) => m.error)).toEqual(["Match failed", "Match failed"]);

    const denied = await json(`/api/contests/${contestId}/rerun-failed`, {
      method: "POST",
      cookie: bob.cookie,
    });
    expect(denied.status).toBe(403);

    writeFileSync(
      manifestPath,
      JSON.stringify({ name: "BobBot", runtime: "node", entry: "bot.js", games: ["arena"] }),
    );
    const rerun = await json(`/api/contests/${contestId}/rerun-failed`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(rerun.status).toBe(200);
    expect((rerun.body.contest as { status: string }).status).toBe("running");

    const done = await waitForContest(contestId, admin.cookie);
    const matches = done.matches as Array<{ status: string; error: string | null }>;
    expect(matches.map((m) => m.status)).toEqual(["done", "done"]);
    expect(matches.every((m) => m.error === null)).toBe(true);

    const nothing = await json(`/api/contests/${contestId}/rerun-failed`, {
      method: "POST",
      cookie: admin.cookie,
    });
    expect(nothing.status).toBe(400);
  }, 30_000);

  test("concurrent starts create the fixtures once", async () => {
    const admin = await adminSession();
    const contestId = await readyContest(admin.cookie);
    // Call the service directly: over HTTP the auth check staggers the two
    // requests enough that the race never shows.
    const results = await Promise.allSettled([startContest(contestId), startContest(contestId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(HttpError);
    expect((rejected.reason as HttpError).status).toBe(409);
    const detail = await waitForContest(contestId, admin.cookie);
    expect(detail.matches as unknown[]).toHaveLength(2);
  }, 25_000);
});
