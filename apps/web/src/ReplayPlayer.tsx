import { useEffect, useState } from "react";
import type { MatchReplay } from "./api";
import { Board, PLAYER_COLORS } from "./Board";

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

interface ReplayPlayerProps {
  replay: MatchReplay;
  initialSpeed?: number;
  autoPlay?: boolean;
  onBack: () => void;
}

export function ReplayPlayer({
  replay,
  initialSpeed = 0.5,
  autoPlay = true,
  onBack,
}: ReplayPlayerProps) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(initialSpeed);

  const max = Math.max(0, replay.ticks.length - 1);
  const snap = replay.ticks[index];

  useEffect(() => {
    if (!playing) return;
    const ms = 400 / speed;
    const id = window.setInterval(() => {
      setIndex((i) => {
        if (i >= max) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, ms);
    return () => clearInterval(id);
  }, [playing, speed, max]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex flex-col items-start gap-4">
        <div className="overflow-auto rounded-sm bg-ink/5 p-3">
          <Board replay={replay} tickIndex={index} />
        </div>

        <div className="flex w-full max-w-[560px] flex-col gap-3">
          <input
            type="range"
            min={0}
            max={max}
            value={index}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            className="w-full accent-clay"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              className="rounded-sm bg-moss px-3 py-1.5 font-medium text-paper hover:bg-moss-deep"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button
              type="button"
              className="rounded-sm border border-ink/20 bg-paper/60 px-3 py-1.5 hover:bg-paper"
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
            >
              上一步
            </button>
            <button
              type="button"
              className="rounded-sm border border-ink/20 bg-paper/60 px-3 py-1.5 hover:bg-paper"
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.min(max, i + 1));
              }}
            >
              下一步
            </button>
            <label className="ml-2 flex items-center gap-2">
              速度
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="rounded-sm border border-ink/20 bg-paper/80 px-2 py-1"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>
                    {s}x
                  </option>
                ))}
              </select>
            </label>
            <span className="ml-auto tabular-nums text-ink/70">
              Tick {snap?.tick ?? 0} / {max}
            </span>
          </div>
        </div>
      </div>

      <aside className="min-w-[240px] flex-1 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-moss underline-offset-2 hover:underline"
        >
          ← 返回大厅
        </button>

        <p className="rounded-sm border border-ink/10 bg-paper/50 px-3 py-2 text-xs leading-relaxed text-ink/65">
          提示：动作有 <strong className="text-ink">2 拍延迟</strong>
          ，侧栏「执行」是本拍真正生效的动作；棋盘上角色可能看起来在「提前排队」。黄色为核心区，深色为缩圈外。
        </p>

        <div>
          <h2 className="font-display text-lg font-bold">本局选手</h2>
          <ul className="mt-2 space-y-2">
            {replay.players.map((p) => {
              const view = snap?.players.find((x) => x.id === p.playerId);
              const result = replay.results.find((r) => r.playerId === p.playerId);
              return (
                <li
                  key={p.playerId}
                  className="flex items-center gap-3 border-b border-ink/10 py-2 text-sm"
                >
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      background: PLAYER_COLORS[p.playerId % PLAYER_COLORS.length],
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-ink/60">
                      {view?.alive === false
                        ? `阵亡 @${view ? replay.results.find((r) => r.playerId === p.playerId)?.deathTick : "?"}`
                        : `HP ${view?.hp ?? "-"} · ${view?.facing ?? ""}`}
                      {snap?.executed[p.playerId]
                        ? ` · 执行 ${snap.executed[p.playerId]}`
                        : ""}
                    </div>
                  </div>
                  {result && (
                    <div className="text-right tabular-nums">
                      <div>#{result.rank}</div>
                      <div className="text-ink/60">{result.score.toFixed(1)}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {index >= max && (
          <div className="rounded-sm border border-moss/30 bg-paper/70 p-3">
            <h3 className="font-display font-bold">结算</h3>
            <ol className="mt-2 space-y-1 text-sm">
              {[...replay.results]
                .sort((a, b) => a.rank - b.rank)
                .map((r) => {
                  const p = replay.players.find((x) => x.playerId === r.playerId);
                  return (
                    <li key={r.playerId}>
                      #{r.rank} {p?.name} — {r.score.toFixed(2)}
                      <span className="text-ink/50">
                        {" "}
                        (core {r.coreTicks}, kills {r.kills}, surv {r.survivalTicks})
                      </span>
                    </li>
                  );
                })}
            </ol>
          </div>
        )}
      </aside>
    </div>
  );
}
