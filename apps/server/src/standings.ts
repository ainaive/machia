export interface Pair {
  entryAId: string;
  entryBId: string;
}

export function generatePairs(entryIds: string[]): Pair[] {
  const ids = [...entryIds].sort((a, b) => a.localeCompare(b));
  const pairs: Pair[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      pairs.push({ entryAId: ids[i]!, entryBId: ids[j]! });
    }
  }
  return pairs;
}

export interface MatchOutcome {
  entryAId: string;
  entryBId: string;
  status: string;
  rankA: number | null;
  rankB: number | null;
  scoreA: number | null;
  scoreB: number | null;
  winnerEntryId: string | null;
}

export interface StandingRow {
  entryId: string;
  wins: number;
  draws: number;
  losses: number;
  scoreSum: number;
  rank: number;
}

function sameRecord(a: StandingRow, b: StandingRow): boolean {
  return a.wins === b.wins && a.draws === b.draws && a.scoreSum === b.scoreSum;
}

export function winnerFromRanks(
  entryAId: string,
  entryBId: string,
  rankA: number,
  rankB: number,
): string | null {
  if (rankA < rankB) return entryAId;
  if (rankB < rankA) return entryBId;
  return null;
}

export function computeStandings(
  entryIds: string[],
  matches: MatchOutcome[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const id of entryIds) {
    rows.set(id, {
      entryId: id,
      wins: 0,
      draws: 0,
      losses: 0,
      scoreSum: 0,
      rank: 0,
    });
  }

  for (const match of matches) {
    if (match.status !== "done") continue;
    const a = rows.get(match.entryAId);
    const b = rows.get(match.entryBId);
    if (!a || !b) continue;
    a.scoreSum += match.scoreA ?? 0;
    b.scoreSum += match.scoreB ?? 0;
    if (match.winnerEntryId === match.entryAId) {
      a.wins += 1;
      b.losses += 1;
    } else if (match.winnerEntryId === match.entryBId) {
      b.wins += 1;
      a.losses += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
    }
  }

  const sorted = [...rows.values()].sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    if (y.draws !== x.draws) return y.draws - x.draws;
    if (y.scoreSum !== x.scoreSum) return y.scoreSum - x.scoreSum;
    return x.entryId.localeCompare(y.entryId);
  });

  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i]!;
    if (i > 0 && !sameRecord(row, sorted[i - 1]!)) rank = i + 1;
    row.rank = rank;
  }
  return sorted;
}
