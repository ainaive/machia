import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeDatabase, resetDatabase } from "./db";
import { app } from "./index";
import {
  INITIAL_RATING,
  K_FACTOR,
  expectedScore,
  ratePeriod,
  type LadderRow,
  type RatedGame,
} from "./ladder";

describe("Elo", () => {
  test("expected scores", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11);
    expect(expectedScore(1600, 1450) + expectedScore(1450, 1600)).toBeCloseTo(1);
  });

  test("a win between equals moves K/2 points from loser to winner", () => {
    const ratings = new Map<string, number>();
    ratePeriod(ratings, [{ a: "x", b: "y", scoreA: 1 }]);
    expect(ratings.get("x")).toBe(INITIAL_RATING + K_FACTOR / 2);
    expect(ratings.get("y")).toBe(INITIAL_RATING - K_FACTOR / 2);
  });

  test("a draw between equals changes nothing; an upset pays more than a favourite's win", () => {
    const ratings = new Map([["x", 1500], ["y", 1500]]);
    ratePeriod(ratings, [{ a: "x", b: "y", scoreA: 0.5 }]);
    expect([...ratings.values()]).toEqual([1500, 1500]);

    const upset = new Map([["weak", 1400], ["strong", 1600]]);
    ratePeriod(upset, [{ a: "weak", b: "strong", scoreA: 1 }]);
    const expected = new Map([["weak", 1400], ["strong", 1600]]);
    ratePeriod(expected, [{ a: "strong", b: "weak", scoreA: 1 }]);
    expect(upset.get("weak")! - 1400).toBeGreaterThan(expected.get("strong")! - 1600);
  });

  test("within a period, the order of games doesn't matter and no points are created", () => {
    const games: RatedGame[] = [
      { a: "x", b: "y", scoreA: 1 },
      { a: "y", b: "x", scoreA: 0.5 },
      { a: "x", b: "z", scoreA: 0 },
      { a: "z", b: "y", scoreA: 1 },
    ];
    const forward = new Map([["x", 1550]]);
    const backward = new Map([["x", 1550]]);
    ratePeriod(forward, games);
    ratePeriod(backward, [...games].reverse());
    for (const id of ["x", "y", "z"]) expect(forward.get(id)).toBeCloseTo(backward.get(id)!);
    const total = [...forward.values()].reduce((sum, r) => sum + r, 0);
    expect(total).toBeCloseTo(1550 + 2 * INITIAL_RATING);
  });
});

describe("GET /api/ladder/:gameId", () => {
  let db: Database;

  beforeEach(async () => {
    db = await resetDatabase(path.join(mkdtempSync(path.join(tmpdir(), "machia-ladder-")), "machia.db"));
    // Not "admin": other test files leave MACHIA_ADMIN_USERNAME=admin set, which seeds that name.
    for (const name of ["host", "alice", "bob", "carol"]) {
      db.run(
        `INSERT INTO users (id, name, email, emailVerified, createdAt, updatedAt, username, role)
         VALUES (?, ?, ?, 0, '2026-01-01', '2026-01-01', ?, 'user')`,
        [`u_${name}`, name, `${name}@test.local`, name],
      );
    }
  });

  afterEach(() => closeDatabase());

  /** A contest whose games are [a, b, winner, status?] by username; winner null is a draw. */
  function contest(
    id: string,
    opts: { game?: string; status?: string; startedAt: string; finishedAt?: string },
    games: Array<[string, string, string | null, string?]>,
  ) {
    db.run(
      `INSERT INTO contests (id, title, game_id, status, created_at, started_at, finished_at, created_by)
       VALUES (?, ?, ?, ?, '2026-01-01', ?, ?, 'u_host')`,
      [id, id, opts.game ?? "arena", opts.status ?? "finished", opts.startedAt, opts.finishedAt ?? opts.startedAt],
    );
    const entry = (user: string) => `${id}_${user}`;
    const users = new Set<string>();
    for (const [a, b] of games) users.add(a).add(b);
    for (const user of users) {
      db.run(
        `INSERT INTO entries (id, contest_id, user_id, status, created_at, updated_at)
         VALUES (?, ?, ?, 'approved', '2026-01-01', '2026-01-01')`,
        [entry(user), id, `u_${user}`],
      );
    }
    games.forEach(([a, b, winner, status], i) => {
      db.run(
        `INSERT INTO contest_matches (id, contest_id, entry_a_id, entry_b_id, status, winner_entry_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, '2026-01-01')`,
        [`${id}_m${i}`, id, entry(a), entry(b), status ?? "done", winner ? entry(winner) : null],
      );
    });
  }

  async function ladder(gameId: string) {
    const res = await app.request(`/api/ladder/${gameId}`);
    return { status: res.status, body: (await res.json()) as { players: LadderRow[] } };
  }

  test("rates finished contests in the order they started, one contest at a time", async () => {
    contest("c2", { startedAt: "2026-02-01" }, [
      ["alice", "carol", null],
      ["carol", "alice", "carol"],
      ["bob", "carol", "bob"],
      ["carol", "bob", null, "error"], // failed game: not rated
    ]);
    // Started first, but a rerun finished it after c2: still rated first.
    contest("c1", { startedAt: "2026-01-15", finishedAt: "2026-03-05" }, [
      ["alice", "bob", "alice"],
      ["bob", "alice", "alice"],
    ]);
    // Not counted: still running, or another game.
    contest("c3", { status: "running", startedAt: "2026-03-01" }, [["bob", "alice", "bob"]]);
    contest("c4", { game: "tanks", startedAt: "2026-03-01" }, [["bob", "alice", "bob"]]);

    // c1 first: alice +32 (two wins as equals). Then c2 from those ratings.
    const ratings = new Map<string, number>();
    ratePeriod(ratings, [
      { a: "u_alice", b: "u_bob", scoreA: 1 },
      { a: "u_bob", b: "u_alice", scoreA: 0 },
    ]);
    expect(ratings.get("u_alice")).toBe(1532);
    ratePeriod(ratings, [
      { a: "u_alice", b: "u_carol", scoreA: 0.5 },
      { a: "u_carol", b: "u_alice", scoreA: 1 },
      { a: "u_bob", b: "u_carol", scoreA: 1 },
    ]);

    const { status, body } = await ladder("arena");
    expect(status).toBe(200);
    const byName = Object.fromEntries(body.players.map((p) => [p.username, p]));
    for (const name of ["alice", "bob", "carol"]) {
      expect(byName[name]!.rating).toBe(Math.round(ratings.get(`u_${name}`)!));
    }
    expect(byName.alice).toMatchObject({ games: 4, wins: 2, draws: 1, losses: 1, contests: 2, lastContestAt: "2026-03-05" });
    expect(byName.bob).toMatchObject({ games: 3, wins: 1, draws: 0, losses: 2, contests: 2 });
    expect(byName.carol).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, contests: 1 });
    expect(body.players.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(body.players[0]!.rating).toBeGreaterThan(body.players[1]!.rating);
  });

  test("equal ratings share a rank", async () => {
    contest("c1", { startedAt: "2026-01-15" }, [
      ["alice", "bob", null],
      ["bob", "alice", null],
    ]);
    const { body } = await ladder("arena");
    expect(body.players.map((p) => [p.rank, p.rating])).toEqual([
      [1, 1500],
      [1, 1500],
    ]);
  });

  test("an empty ladder, and unknown games", async () => {
    expect((await ladder("quoridor")).body).toEqual({ players: [] });
    expect((await ladder("chess")).status).toBe(404);
  });
});
