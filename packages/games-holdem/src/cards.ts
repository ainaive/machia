export type Suit = "c" | "d" | "h" | "s";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  rank: Rank;
  suit: Suit;
}

const SUITS: Suit[] = ["c", "d", "h", "s"];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function cardId(c: Card): string {
  const r =
    c.rank === 14
      ? "A"
      : c.rank === 13
        ? "K"
        : c.rank === 12
          ? "Q"
          : c.rank === 11
            ? "J"
            : c.rank === 10
              ? "T"
              : String(c.rank);
  return `${r}${c.suit}`;
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

export function shuffle<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Higher score is better. Category in high bits. */
export function evaluateFive(cards: Card[]): number {
  if (cards.length !== 5) throw new Error("need 5 cards");
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0]! - uniq[4]! === 4) straightHigh = uniq[0]!;
    // wheel A-5
    if (uniq.join(",") === "14,5,4,3,2") straightHigh = 5;
  }
  const straight = straightHigh > 0;
  const c0 = byCount[0]![1];
  const c1 = byCount[1]?.[1] ?? 0;

  const kick = (...rs: number[]) =>
    rs.reduce((acc, r, i) => acc + r * 15 ** (4 - i), 0);

  if (straight && flush) return 8e9 + straightHigh * 1e6;
  if (c0 === 4) {
    return 7e9 + byCount[0]![0]! * 1e6 + byCount[1]![0]! * 1e3;
  }
  if (c0 === 3 && c1 === 2) {
    return 6e9 + byCount[0]![0]! * 1e6 + byCount[1]![0]! * 1e3;
  }
  if (flush) return 5e9 + kick(...ranks);
  if (straight) return 4e9 + straightHigh * 1e6;
  if (c0 === 3) {
    const kicks = byCount.slice(1).map((x) => x[0]!);
    return 3e9 + byCount[0]![0]! * 1e6 + kick(...kicks, 0, 0);
  }
  if (c0 === 2 && c1 === 2) {
    const hi = Math.max(byCount[0]![0]!, byCount[1]![0]!);
    const lo = Math.min(byCount[0]![0]!, byCount[1]![0]!);
    const kicker = byCount[2]![0]!;
    return 2e9 + hi * 1e6 + lo * 1e3 + kicker;
  }
  if (c0 === 2) {
    const kicks = byCount.slice(1).map((x) => x[0]!);
    return 1e9 + byCount[0]![0]! * 1e6 + kick(...kicks, 0);
  }
  return kick(...ranks);
}

export function bestHand(hole: Card[], board: Card[]): number {
  const all = [...hole, ...board];
  if (all.length < 5) return evaluateFive(padToFive(all));
  let best = 0;
  const n = all.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            const score = evaluateFive([
              all[a]!,
              all[b]!,
              all[c]!,
              all[d]!,
              all[e]!,
            ]);
            if (score > best) best = score;
          }
        }
      }
    }
  }
  return best;
}

function padToFive(cards: Card[]): Card[] {
  const out = [...cards];
  let r: Rank = 2;
  while (out.length < 5) {
    out.push({ rank: r, suit: "c" });
    r = (r + 1) as Rank;
  }
  return out.slice(0, 5);
}
