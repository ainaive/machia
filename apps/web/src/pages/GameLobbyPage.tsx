import { Bot, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  fetchBots,
  fetchGames,
  startDemo,
  startMatch,
  type BotInfo,
  type GameInfo,
} from "../api";
import { RulesPanel } from "../RulesPanel";
import { SiteShell } from "../SiteShell";
import { RobotToken, playerColor } from "../sprites";

export function GameLobbyPage() {
  const { gameId = "" } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameInfo | null | undefined>(undefined);
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const accent =
    gameId === "bomber" ? "bomber" : gameId === "tanks" ? "tanks" : "arena";

  useEffect(() => {
    setSelected([]);
    setError(null);
    setGame(undefined);
    Promise.all([fetchGames(), fetchBots(gameId)])
      .then(([gamesRes, botsRes]) => {
        const found = gamesRes.games.find((g) => g.id === gameId) ?? null;
        setGame(found);
        setBots(botsRes.bots);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setGame(null);
      });
  }, [gameId]);

  async function run(botIds: string[], speed: number, label: string) {
    setError(null);
    setLoading(label);
    try {
      const started =
        label === "demo"
          ? await startDemo(gameId)
          : await startMatch(gameId, botIds);
      navigate(`/matches/${started.matchId}`, { state: { speed } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLoading(null);
    }
  }

  function toggle(id: string) {
    const max = game?.maxPlayers ?? 8;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= max) return prev;
      return [...prev, id];
    });
  }

  if (game == null) {
    if (!error && game === undefined) {
      return (
        <SiteShell accent={accent}>
          <p className="text-sm text-ink/50">加载中…</p>
        </SiteShell>
      );
    }
    return (
      <SiteShell accent={accent}>
        <div className="rounded-md border border-clay/30 bg-[#f7e4d8] px-4 py-6">
          <h2 className="font-display text-xl font-bold text-clay">
            找不到游戏
          </h2>
          <p className="mt-2 text-sm text-ink/70">
            {error ?? (
              <>
                没有 id 为 <code className="font-mono">{gameId}</code> 的游戏。
              </>
            )}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm font-medium text-moss underline-offset-2 hover:underline"
          >
            ← 返回游戏目录
          </Link>
        </div>
      </SiteShell>
    );
  }

  const minP = game.minPlayers;

  if (loading) {
    return (
      <SiteShell
        accent={accent}
        subtitle={`${game.name} · ${loading === "demo" ? "演示对局" : "撮合对局"}`}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
          <div className="relative">
            <RobotToken
              color={playerColor(0)}
              size={56}
              facing="RIGHT"
              accent={accent}
            />
            <Loader2
              className="absolute -right-2 -bottom-2 animate-spin text-moss"
              size={22}
            />
          </div>
          <p className="text-ink/70">
            {loading === "demo" ? "正在运行演示对局…" : "正在撮合对局…"}
          </p>
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell accent={accent} subtitle={game.description}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="text-sm font-medium text-moss underline-offset-2 hover:underline"
        >
          ← 全部游戏
        </Link>
        <span className="text-ink/30">/</span>
        <h2 className="font-display text-2xl font-bold">{game.name}</h2>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h3 className="flex items-center gap-2 font-display text-2xl font-bold">
              <Bot size={22} className="text-moss" />
              选择 Bot
            </h3>
            <span className="text-sm text-ink/50">
              {selected.length} / {game.maxPlayers}
            </span>
          </div>
          <ul className="space-y-2">
            {bots.map((bot, i) => {
              const on = selected.includes(bot.id);
              return (
                <li key={bot.id}>
                  <button
                    type="button"
                    onClick={() => toggle(bot.id)}
                    className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition ${
                      on
                        ? "border-moss/40 bg-moss/10 shadow-sm"
                        : "border-ink/10 bg-paper/50 hover:border-ink/20 hover:bg-paper/80"
                    }`}
                  >
                    <RobotToken
                      color={playerColor(i)}
                      size={34}
                      facing="DOWN"
                      accent={accent}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{bot.name}</div>
                      <div className="truncate text-xs text-ink/50">
                        {bot.id}
                      </div>
                    </div>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-sm border text-xs ${
                        on
                          ? "border-moss bg-moss text-paper"
                          : "border-ink/25 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                </li>
              );
            })}
            {bots.length === 0 && (
              <li className="rounded-md border border-dashed border-ink/15 px-3 py-6 text-sm text-ink/50">
                当前游戏暂无可用 Bot
              </li>
            )}
          </ul>
        </section>

        <section className="space-y-3 lg:pt-2">
          <button
            type="button"
            onClick={() => run([], 0.75, "demo")}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-clay px-4 py-3.5 font-display text-lg font-bold text-paper shadow-[0_8px_24px_-8px_rgba(196,92,38,0.55)] transition hover:brightness-110"
          >
            <Sparkles size={18} />
            一键 Demo
          </button>
          <p className="text-xs text-ink/50">
            使用 {game.name} 样例 Bot · 0.75x 回放
          </p>
          <button
            type="button"
            disabled={selected.length < minP}
            onClick={() => run(selected, 1, "match")}
            className="w-full rounded-md bg-moss px-4 py-3 font-medium text-paper transition enabled:hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            开始对战
          </button>
          <p className="text-xs text-ink/50">
            勾选 {minP}–{game.maxPlayers} 个 Bot
          </p>
        </section>
      </div>
      <RulesPanel gameId={gameId} />
    </SiteShell>
  );
}
