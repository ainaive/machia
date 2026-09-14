import { Bot, Gamepad2, Loader2, Sparkles } from "lucide-react";
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
import { RobotToken, playerColor } from "./sprites";

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
        <div className="mt-1 flex flex-wrap items-end gap-4">
          <h1 className="font-display text-5xl font-extrabold tracking-tight text-ink sm:text-6xl">
            Machia
          </h1>
          <div className="mb-1.5 flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-full bg-paper/80 p-0.5 ring-2 ring-paper"
              >
                <RobotToken
                  color={playerColor(i)}
                  size={28}
                  facing={i === 0 ? "RIGHT" : i === 1 ? "DOWN" : "LEFT"}
                  accent={gameId === "bomber" ? "bomber" : "arena"}
                />
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 max-w-xl text-base text-ink/70">
          多游戏 Bot 对战平台。选一款游戏，加载本地 Bot，开局后自动回放。
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      {view.kind === "loading" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24">
          <div className="relative">
            <RobotToken
              color={playerColor(0)}
              size={56}
              facing="RIGHT"
              accent={gameId === "bomber" ? "bomber" : "arena"}
            />
            <Loader2
              className="absolute -right-2 -bottom-2 animate-spin text-moss"
              size={22}
            />
          </div>
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
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {games.map((g) => {
              const on = gameId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGameId(g.id)}
                  className={`group relative overflow-hidden rounded-md border px-4 py-4 text-left transition ${
                    on
                      ? "border-moss bg-moss text-paper shadow-[0_16px_40px_-20px_rgba(61,107,79,0.7)]"
                      : "border-ink/12 bg-paper/70 hover:border-moss/40 hover:bg-paper"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-md ${
                        on ? "bg-paper/15" : "bg-moss/10 text-moss"
                      }`}
                    >
                      <Gamepad2 size={20} />
                    </span>
                    <div>
                      <div className="font-display text-lg font-bold">
                        {g.name}
                      </div>
                      <p
                        className={`mt-1 text-sm leading-snug ${on ? "text-paper/80" : "text-ink/55"}`}
                      >
                        {g.description}
                      </p>
                      <p
                        className={`mt-2 text-xs ${on ? "text-paper/60" : "text-ink/40"}`}
                      >
                        {g.minPlayers}–{g.maxPlayers} 人
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
                  <Bot size={22} className="text-moss" />
                  选择 Bot
                </h2>
                <span className="text-sm text-ink/50">
                  {selected.length} / {game?.maxPlayers ?? 8}
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
                          accent={gameId === "bomber" ? "bomber" : "arena"}
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
                使用 {game?.name ?? "当前游戏"} 样例 Bot · 0.75x 回放
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
