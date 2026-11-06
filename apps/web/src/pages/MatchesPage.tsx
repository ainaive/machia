import { History, Loader2, Swords } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchGames,
  fetchMatches,
  type GameInfo,
  type ReplayPage,
  type ReplaySummary,
} from "../api";
import { SiteShell } from "../SiteShell";
import { gameAccent } from "../gameAccent";

const PAGE_SIZE = 20;
const MAX_OFFSET = 1_000_000;

function gameName(games: GameInfo[], id: string): string {
  return games.find((g) => g.id === id)?.name ?? id;
}

/** One line naming the winner, or saying the match was a draw. */
export function replayOutcome(match: ReplaySummary): string {
  const winners = match.results.filter((r) => r.rank === 1);
  if (winners.length !== 1) return "平局";
  const player = match.players.find((p) => p.playerId === winners[0]!.playerId);
  return `${player?.name ?? "?"} 胜`;
}

export function ReplayList({
  page,
  games,
  gameId,
  onGameChange,
  onPageChange,
}: {
  page: ReplayPage;
  games: GameInfo[];
  gameId: string;
  onGameChange: (gameId: string) => void;
  onPageChange: (offset: number) => void;
}) {
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + page.matches.length, page.total);

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterButton active={!gameId} onClick={() => onGameChange("")}>
          全部
        </FilterButton>
        {games.map((g) => (
          <FilterButton key={g.id} active={g.id === gameId} onClick={() => onGameChange(g.id)}>
            {g.name}
          </FilterButton>
        ))}
      </div>

      {page.matches.length === 0 ? (
        <p className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-sm text-ink/50">
          还没有回放。去练习场开一局吧。
        </p>
      ) : (
        <ul className="space-y-2">
          {page.matches.map((m) => (
            <li key={m.id}>
              <Link
                to={`/matches/${m.id}`}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper/70 px-4 py-3 transition hover:border-moss/40 hover:bg-paper"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-display text-lg font-bold">
                    <Swords size={16} className="text-moss" />
                    {gameName(games, m.gameId)}
                    <span className="text-sm font-medium text-ink/50">{replayOutcome(m)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-ink/60">
                    {m.players.map((p) => p.name).join(" vs ")}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/45">
                    {m.totalTicks} ticks · {new Date(m.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-moss group-hover:underline">
                  观看 →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page.total > 0 && page.matches.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/55">
          <span>
            第 {from}–{to} 条，共 {page.total} 条
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page.offset === 0}
              onClick={() => onPageChange(Math.max(0, page.offset - page.limit))}
              className="rounded-md border border-ink/15 px-3 py-1.5 font-medium text-ink/70 disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={to >= page.total}
              onClick={() => onPageChange(page.offset + page.limit)}
              className="rounded-md border border-ink/15 px-3 py-1.5 font-medium text-ink/70 disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm font-medium transition ${
        active ? "bg-moss text-paper" : "bg-paper/70 text-ink/70 hover:bg-moss/10"
      }`}
    >
      {children}
    </button>
  );
}

export function MatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const gameId = searchParams.get("game") ?? "";
  const parsedOffset = Number(searchParams.get("offset") ?? 0);
  const offset =
    Number.isInteger(parsedOffset) && parsedOffset >= 0 && parsedOffset <= MAX_OFFSET
      ? parsedOffset
      : 0;

  const [games, setGames] = useState<GameInfo[]>([]);
  const [page, setPage] = useState<ReplayPage>();
  const [error, setError] = useState<string | null>(null);
  const accent = gameAccent(gameId || "arena");

  useEffect(() => {
    fetchGames()
      .then((r) => setGames(r.games))
      .catch(() => setGames([]));
  }, []);

  useEffect(() => {
    let current = true;
    setPage(undefined);
    setError(null);
    fetchMatches({ gameId: gameId || undefined, limit: PAGE_SIZE, offset })
      .then((r) => current && setPage(r))
      .catch((e) => {
        if (!current) return;
        setError(e instanceof Error ? e.message : String(e));
        setPage(undefined);
      });
    return () => {
      current = false;
    };
  }, [gameId, offset]);

  const changeGame = useCallback(
    (next: string) => {
      const params = new URLSearchParams();
      if (next) params.set("game", next);
      setSearchParams(params);
    },
    [setSearchParams],
  );

  const changePage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams);
      if (next > 0) params.set("offset", String(next));
      else params.delete("offset");
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  // A valid but too-large offset (an old link, or the list shrank) returns an
  // empty page with a non-zero total. Go back to the first page instead of
  // showing an inverted range.
  useEffect(() => {
    if (!page || offset === 0) return;
    if (page.total > 0 && page.matches.length === 0) {
      const params = new URLSearchParams(searchParams);
      params.delete("offset");
      setSearchParams(params, { replace: true });
    }
  }, [page, offset, searchParams, setSearchParams]);

  return (
    <SiteShell
      accent={accent}
      subtitle="所有练习对局与正式比赛的回放。按游戏筛选，点进去即可逐帧观看。"
    >
      <h2 className="mb-5 flex items-center gap-2 font-display text-2xl font-bold">
        <History size={22} className="text-moss" />
        回放
      </h2>

      {error ? (
        <div className="rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      ) : page ? (
        <ReplayList
          page={page}
          games={games}
          gameId={gameId}
          onGameChange={changeGame}
          onPageChange={changePage}
        />
      ) : (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin text-moss" size={28} />
        </div>
      )}
    </SiteShell>
  );
}
