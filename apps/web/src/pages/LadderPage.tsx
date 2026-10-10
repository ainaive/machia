import { Loader2, Medal } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { fetchGames, fetchLadder, type GameInfo, type LadderPlayer } from "../api";
import { SiteShell } from "../SiteShell";

export function LadderTable({ players }: { players: LadderPlayer[] }) {
  if (players.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-sm text-ink/50">
        还没有已结束的比赛。比赛结束后，参赛者会出现在这里。
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-ink/50">
            <th className="py-1 font-medium">#</th>
            <th className="py-1 font-medium">选手</th>
            <th className="py-1 font-medium">积分</th>
            <th className="py-1 font-medium">胜</th>
            <th className="py-1 font-medium">平</th>
            <th className="py-1 font-medium">负</th>
            <th className="py-1 font-medium">比赛</th>
            <th className="py-1 font-medium">最近</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.userId} className="border-t border-ink/10">
              <td className="py-1.5">{p.rank}</td>
              <td className="py-1.5 font-medium">{p.username}</td>
              <td className="py-1.5 font-display font-bold tabular-nums">{p.rating}</td>
              <td className="py-1.5">{p.wins}</td>
              <td className="py-1.5">{p.draws}</td>
              <td className="py-1.5">{p.losses}</td>
              <td className="py-1.5">{p.contests}</td>
              <td className="py-1.5 text-ink/50">
                {p.lastContestAt ? new Date(p.lastContestAt).toLocaleDateString() : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LadderPage() {
  const { gameId } = useParams();
  const [games, setGames] = useState<GameInfo[]>();
  const [players, setPlayers] = useState<LadderPlayer[]>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGames()
      .then((r) => setGames(r.games))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!gameId) return;
    let current = true;
    setPlayers(undefined);
    setError(null);
    fetchLadder(gameId)
      .then((r) => current && setPlayers(r.players))
      .catch((e) => current && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [gameId]);

  if (!gameId && games?.[0]) return <Navigate to={`/ladder/${games[0].id}`} replace />;

  return (
    <SiteShell subtitle="各游戏的 Elo 天梯，只统计已结束的正式比赛（练习场不计）。">
      <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-bold">
        <Medal size={22} className="text-moss" />
        天梯
      </h2>

      <div className="mb-5 flex flex-wrap gap-2">
        {games?.map((g) => (
          <Link
            key={g.id}
            to={`/ladder/${g.id}`}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              g.id === gameId ? "bg-moss text-paper" : "bg-paper/70 text-ink/70 hover:bg-moss/10"
            }`}
          >
            {g.name}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      ) : players === undefined ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-moss" size={24} />
        </div>
      ) : (
        <LadderTable players={players} />
      )}

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink/50">
        初始 1500 分，K = 32。每场比赛结束时结算一次：每局按赛前积分算期望得分（胜 1、平 0.5、负 0），
        整场的变化一起生效，所以局的先后顺序不影响结果。一场比赛最多按 16 局计：局数更多的大型比赛，每局的 K 按比例缩小。按用户计分，与提交的是哪个 Bot 无关。
      </p>
    </SiteShell>
  );
}
