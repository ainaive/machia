import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Swords,
  Trophy,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { MatchReplay } from "./api";
import { Board } from "./Board";
import { RobotToken, playerColor } from "./sprites";

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
  const isBomber = (replay.gameId ?? "arena") === "bomber";
  const progress = max > 0 ? index / max : 0;

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
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-col items-start gap-5">
        <div className="w-full overflow-auto pb-1">
          <Board replay={replay} tickIndex={index} />
        </div>

        <div className="w-full max-w-[680px] space-y-3 rounded-md border border-ink/10 bg-paper/70 p-3 shadow-[0_12px_40px_-24px_rgba(26,31,22,0.5)] backdrop-blur-sm">
          <div className="relative h-2 overflow-hidden rounded-full bg-ink/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-moss to-clay transition-[width] duration-150"
              style={{ width: `${progress * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={max}
              value={index}
              aria-label="回放进度"
              onChange={(e) => {
                setPlaying(false);
                setIndex(Number(e.target.value));
              }}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ControlButton
              onClick={() => setPlaying((p) => !p)}
              primary
              label={playing ? "暂停" : "播放"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "暂停" : "播放"}
            </ControlButton>
            <ControlButton
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.max(0, i - 1));
              }}
              label="上一步"
            >
              <ChevronLeft size={16} />
            </ControlButton>
            <ControlButton
              onClick={() => {
                setPlaying(false);
                setIndex((i) => Math.min(max, i + 1));
              }}
              label="下一步"
            >
              <ChevronRight size={16} />
            </ControlButton>
            <ControlButton
              onClick={() => {
                setPlaying(false);
                setIndex(0);
              }}
              label="重头"
            >
              <RotateCcw size={15} />
            </ControlButton>

            <div className="ml-1 flex items-center gap-1.5 rounded-sm border border-ink/15 bg-paper/80 p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  className={`rounded-sm px-2 py-1 font-display text-xs font-bold transition ${
                    speed === s
                      ? "bg-moss text-paper"
                      : "text-ink/60 hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>

            <span className="ml-auto font-display text-sm font-bold tabular-nums text-ink/75">
              T{snap?.tick ?? 0}
              <span className="font-normal text-ink/40"> / {max}</span>
            </span>
          </div>
        </div>
      </div>

      <aside className="min-w-[260px] flex-1 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="group inline-flex items-center gap-1 text-sm font-medium text-moss transition hover:text-moss-deep"
        >
          <ChevronLeft
            size={16}
            className="transition group-hover:-translate-x-0.5"
          />
          返回大厅
        </button>

        <div className="overflow-hidden rounded-md border border-ink/10 bg-paper/65 shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/10 bg-moss/10 px-3 py-2">
            <Swords size={16} className="text-moss" />
            <span className="font-display text-sm font-bold">
              {isBomber ? "Bomber" : "Arena"}
            </span>
          </div>
          <p className="px-3 py-2.5 text-xs leading-relaxed text-ink/65">
            {isBomber ? (
              <>
                石墙永久、砖墙可炸。炸弹引信跳动，橙星为爆炸。菱形道具：火焰=
                火力，炸弹=弹数。残局外圈会变致死区。
              </>
            ) : (
              <>
                机器人天线方向即朝向。金格为核心区，斜纹为缩圈外。动作有{" "}
                <strong className="text-ink">2 拍延迟</strong>。
              </>
            )}
          </p>
        </div>

        <div>
          <h2 className="font-display text-lg font-bold">本局选手</h2>
          <ul className="mt-3 space-y-2">
            {replay.players.map((p) => {
              const view = snap?.players.find(
                (x) => (x as { id: number }).id === p.playerId,
              ) as
                | {
                    id: number;
                    alive?: boolean;
                    hp?: number;
                    facing?: string;
                    power?: number;
                    bombsMax?: number;
                  }
                | undefined;
              const result = replay.results.find(
                (r) => r.playerId === p.playerId,
              );
              const alive = view?.alive !== false;
              return (
                <li
                  key={p.playerId}
                  className={`flex items-center gap-3 rounded-md border px-2.5 py-2 text-sm transition ${
                    alive
                      ? "border-ink/10 bg-paper/70"
                      : "border-ink/5 bg-ink/5 opacity-70"
                  }`}
                >
                  <RobotToken
                    color={playerColor(p.playerId)}
                    size={36}
                    facing={view?.facing ?? "DOWN"}
                    accent={isBomber ? "bomber" : "arena"}
                    dim={!alive}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="truncate text-xs text-ink/55">
                      {!alive
                        ? `阵亡 @${result?.deathTick ?? "?"}`
                        : isBomber
                          ? `火力 ${view?.power ?? "-"} · 弹上限 ${view?.bombsMax ?? "-"}`
                          : `HP ${view?.hp ?? "-"} · ${view?.facing ?? ""}`}
                      {snap?.executed[p.playerId]
                        ? ` · ${snap.executed[p.playerId]}`
                        : ""}
                    </div>
                  </div>
                  {result && (
                    <div className="text-right font-display tabular-nums">
                      <div className="text-xs text-ink/45">#{result.rank}</div>
                      <div className="text-sm font-bold">
                        {result.score.toFixed(1)}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <AnimatePresence>
          {index >= max && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md border border-core/40 bg-gradient-to-br from-[#f7efd4] to-paper/80 p-3 shadow-sm"
            >
              <h3 className="flex items-center gap-2 font-display font-bold">
                <Trophy size={16} className="text-clay" />
                结算
              </h3>
              <ol className="mt-2 space-y-1.5 text-sm">
                {[...replay.results]
                  .sort((a, b) => a.rank - b.rank)
                  .map((r) => {
                    const p = replay.players.find(
                      (x) => x.playerId === r.playerId,
                    );
                    return (
                      <li
                        key={r.playerId}
                        className="flex items-baseline justify-between gap-2 border-b border-ink/5 pb-1 last:border-0"
                      >
                        <span>
                          <span className="font-display font-bold text-moss">
                            #{r.rank}
                          </span>{" "}
                          {p?.name}
                        </span>
                        <span className="tabular-nums text-ink/70">
                          {r.score.toFixed(2)}
                        </span>
                      </li>
                    );
                  })}
              </ol>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  primary,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition ${
        primary
          ? "bg-moss text-paper shadow-[0_6px_16px_-8px_rgba(61,107,79,0.8)] hover:bg-moss-deep"
          : "border border-ink/15 bg-paper/80 hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}
