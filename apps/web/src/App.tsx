import { useEffect, useState } from "react";
import {
  fetchBots,
  fetchGames,
  fetchReplay,
  startDemo,
  startMatch,
  type BotInfo,
  type GameInfo,
  type MatchReplay,
} from "./api";
import { ReplayPlayer } from "./ReplayPlayer";
import { RulesPanel } from "./RulesPanel";

type View =
  | { kind: "lobby" }
  | { kind: "loading"; label: string }
  | { kind: "replay"; replay: MatchReplay; speed: number };

export function App() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [gameId, setGameId] = useState("arena");
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "lobby" });

  const game = games.find((g) => g.id === gameId);

  useEffect(() => {
    fetchGames()
      .then((r) => {
        setGames(r.games);
        if (r.games[0] && !r.games.some((g) => g.id === gameId)) {
          setGameId(r.games[0].id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    setSelected([]);
    fetchBots(gameId)
      .then((r) => setBots(r.bots))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [gameId]);

  async function run(botIds: string[], speed: number, label: string) {
    setError(null);
    setView({ kind: "loading", label });
    try {
      const started =
        label === "demo"
          ? await startDemo(gameId)
          : await startMatch(gameId, botIds);
      const replay = await fetchReplay(started.matchId);
      setView({ kind: "replay", replay, speed });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setView({ kind: "lobby" });
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

  const minP = game?.minPlayers ?? 2;

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <header className="mb-10">
        <p className="text-sm font-medium tracking-[0.2em] text-moss uppercase">
          AI Bot Arena
        </p>
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-ink sm:text-6xl">
          Machia
        </h1>
        <p className="mt-3 max-w-xl text-base text-ink/70">
          多游戏 Bot 对战平台。选一款游戏，加载本地 Bot，开局后自动回放。
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-sm border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      {view.kind === "loading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-moss border-t-transparent" />
          <p className="text-ink/70">
            {view.label === "demo" ? "正在运行演示对局…" : "正在撮合对局…"}
          </p>
        </div>
      )}

      {view.kind === "replay" && (
        <ReplayPlayer
          replay={view.replay}
          initialSpeed={view.speed}
          autoPlay
          onBack={() => setView({ kind: "lobby" })}
        />
      )}

      {view.kind === "lobby" && (
        <>
          <div className="mb-8 flex flex-wrap gap-2">
            {games.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGameId(g.id)}
                className={`rounded-sm px-4 py-2 font-display text-sm font-bold transition ${
                  gameId === g.id
                    ? "bg-moss text-paper"
                    : "border border-ink/15 bg-paper/60 text-ink hover:bg-paper"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
          {game && (
            <p className="mb-6 text-sm text-ink/60">{game.description}</p>
          )}

          <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="font-display text-2xl font-bold">选择 Bot</h2>
                <span className="text-sm text-ink/50">
                  {selected.length} / {game?.maxPlayers ?? 8}
                </span>
              </div>
              <ul className="divide-y divide-ink/10 border-y border-ink/10">
                {bots.map((bot) => {
                  const on = selected.includes(bot.id);
                  return (
                    <li key={bot.id}>
                      <button
                        type="button"
                        onClick={() => toggle(bot.id)}
                        className={`flex w-full items-center gap-3 py-3 text-left transition-colors ${
                          on ? "bg-moss/10" : "hover:bg-paper/50"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-sm border text-xs ${
                            on
                              ? "border-moss bg-moss text-paper"
                              : "border-ink/25 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <div>
                          <div className="font-medium">{bot.name}</div>
                          <div className="text-xs text-ink/50">{bot.id}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {bots.length === 0 && (
                  <li className="py-6 text-sm text-ink/50">
                    当前游戏暂无可用 Bot
                  </li>
                )}
              </ul>
            </section>

            <section className="space-y-3 lg:pt-10">
              <button
                type="button"
                onClick={() => run([], 0.75, "demo")}
                className="w-full rounded-sm bg-clay px-4 py-3 font-display text-lg font-bold text-paper shadow-[0_8px_24px_-8px_rgba(196,92,38,0.55)] transition hover:brightness-110"
              >
                一键 Demo
              </button>
              <p className="text-xs text-ink/50">
                使用 {game?.name ?? "当前游戏"} 样例 Bot · 0.75x 回放
              </p>
              <button
                type="button"
                disabled={selected.length < minP}
                onClick={() => run(selected, 1, "match")}
                className="w-full rounded-sm bg-moss px-4 py-3 font-medium text-paper transition enabled:hover:bg-moss-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                开始对战
              </button>
              <p className="text-xs text-ink/50">
                勾选 {minP}–{game?.maxPlayers ?? 8} 个 Bot
              </p>
            </section>
          </div>
          <RulesPanel gameId={gameId} />
        </>
      )}
    </div>
  );
}
