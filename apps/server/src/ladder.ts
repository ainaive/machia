/**
 * Elo ladder per game, built from finished contests.
 *
 * Each finished contest is one rating period: every game in it is scored
 * against the ratings players had going in, and the changes apply together
 * when it ends. Games within a contest have no meaningful order (failed ones
 * can be rerun much later), so a rating must not depend on it.
 *
 * Ratings are recomputed from contest results on each request rather than
 * stored, so a rerun game or a corrected result is always reflected.
 * Practice matches don't count: anyone can run them with any bots.
 */
import { listGames } from "@machia/runner";
import { getDb } from "./db";
import { HttpError } from "./errors";

export const INITIAL_RATING = 1500;
export const K_FACTOR = 32;

/** One game between two players; `scoreA` is 1 (A won), 0.5 (draw) or 0. */
export interface RatedGame {
  a: string;
  b: string;
  scoreA: number;
}

/** Elo's expected score for a player rated `rating` against `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Applies one rating period to `ratings` (missing players start at INITIAL_RATING). */
export function ratePeriod(ratings: Map<string, number>, games: RatedGame[]): void {
  const before = (id: string) => ratings.get(id) ?? INITIAL_RATING;
  const change = new Map<string, number>();
  for (const game of games) {
    const delta = K_FACTOR * (game.scoreA - expectedScore(before(game.a), before(game.b)));
    change.set(game.a, (change.get(game.a) ?? 0) + delta);
    change.set(game.b, (change.get(game.b) ?? 0) - delta);
  }
  for (const [id, delta] of change) ratings.set(id, before(id) + delta);
}

export interface LadderRow {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  contests: number;
  lastContestAt: string;
}

interface Tally {
  userId: string;
  username: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  contestIds: Set<string>;
  lastContestAt: string;
}

interface GameRow {
  contest_id: string;
  finished_at: string;
  winner_entry_id: string | null;
  entry_a_id: string;
  user_a: string;
  user_b: string;
  name_a: string | null;
  name_b: string | null;
}

export async function getLadder(gameId: string): Promise<LadderRow[]> {
  if (!listGames().some((g) => g.id === gameId)) {
    throw new HttpError(404, `Unknown game: ${gameId}`);
  }
  const db = await getDb();
  const rows = db
    .query<GameRow, [string]>(
      `SELECT c.id AS contest_id, c.finished_at, m.winner_entry_id, m.entry_a_id,
              ea.user_id AS user_a, eb.user_id AS user_b,
              ua.username AS name_a, ub.username AS name_b
       FROM contest_matches m
       JOIN contests c ON c.id = m.contest_id
       JOIN entries ea ON ea.id = m.entry_a_id
       JOIN entries eb ON eb.id = m.entry_b_id
       LEFT JOIN users ua ON ua.id = ea.user_id
       LEFT JOIN users ub ON ub.id = eb.user_id
       WHERE c.game_id = ? AND c.status = 'finished' AND m.status = 'done'
       ORDER BY c.finished_at, c.id`,
    )
    .all(gameId);

  const ratings = new Map<string, number>();
  const tallies = new Map<string, Tally>();
  const tally = (userId: string, username: string | null, row: GameRow, score: number) => {
    let t = tallies.get(userId);
    if (!t) {
      t = {
        userId,
        username: username ?? "?",
        games: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        contestIds: new Set(),
        lastContestAt: "",
      };
      tallies.set(userId, t);
    }
    t.games += 1;
    if (score === 1) t.wins += 1;
    else if (score === 0) t.losses += 1;
    else t.draws += 1;
    t.contestIds.add(row.contest_id);
    t.lastContestAt = row.finished_at; // rows come oldest contest first
  };

  let period: RatedGame[] = [];
  rows.forEach((row, i) => {
    const scoreA =
      row.winner_entry_id === null ? 0.5 : row.winner_entry_id === row.entry_a_id ? 1 : 0;
    period.push({ a: row.user_a, b: row.user_b, scoreA });
    tally(row.user_a, row.name_a, row, scoreA);
    tally(row.user_b, row.name_b, row, 1 - scoreA);
    if (rows[i + 1]?.contest_id !== row.contest_id) {
      ratePeriod(ratings, period);
      period = [];
    }
  });

  const ladder: LadderRow[] = [...tallies.values()]
    .map(({ contestIds, ...t }) => ({
      ...t,
      contests: contestIds.size,
      rank: 0,
      rating: Math.round(ratings.get(t.userId) ?? INITIAL_RATING),
    }))
    .sort((x, y) => y.rating - x.rating || y.games - x.games || x.username.localeCompare(y.username));
  ladder.forEach((row, i) => {
    row.rank = i > 0 && row.rating === ladder[i - 1]!.rating ? ladder[i - 1]!.rank : i + 1;
  });
  return ladder;
}
