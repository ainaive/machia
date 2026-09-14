import { Gamepad2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchGames, type GameInfo } from "../api";
import { SiteShell } from "../SiteShell";

export function HomePage() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGames()
      .then((r) => setGames(r.games))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <SiteShell subtitle="多游戏 Bot 对战平台。选一款游戏进入大厅，加载本地 Bot，开局后自动回放。">
      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      <h2 className="mb-4 font-display text-2xl font-bold">选择游戏</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {games.map((g) => (
          <Link
            key={g.id}
            to={`/games/${g.id}`}
            className="group relative overflow-hidden rounded-md border border-ink/12 bg-paper/70 px-4 py-4 text-left transition hover:border-moss/40 hover:bg-paper hover:shadow-[0_16px_40px_-24px_rgba(61,107,79,0.45)]"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-md bg-moss/10 text-moss transition group-hover:bg-moss group-hover:text-paper">
                <Gamepad2 size={20} />
              </span>
              <div>
                <div className="font-display text-lg font-bold">{g.name}</div>
                <p className="mt-1 text-sm leading-snug text-ink/55">
                  {g.description}
                </p>
                <p className="mt-2 text-xs text-ink/40">
                  {g.minPlayers}–{g.maxPlayers} 人 · /games/{g.id}
                </p>
              </div>
            </div>
          </Link>
        ))}
        {games.length === 0 && !error && (
          <p className="text-sm text-ink/50">正在加载游戏列表…</p>
        )}
      </div>
    </SiteShell>
  );
}
