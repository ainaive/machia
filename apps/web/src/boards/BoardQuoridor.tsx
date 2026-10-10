import type { MatchReplay, Position } from "../api";
import { RobotToken, playerColor } from "../sprites";
import { stackOffset } from "./shared";

export function BoardQuoridor({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  const size = replay.mapSize || 7;
  const snap =
    replay.ticks[Math.min(Math.max(tickIndex, 0), replay.ticks.length - 1)];
  const walls = (snap?.walls ?? []) as Array<{
    orient: "H" | "V";
    x: number;
    y: number;
  }>;
  const toAct = Number(snap?.toAct ?? -1);
  const players = (snap?.players ?? []) as Array<{
    id: number;
    pos: Position;
    fences: number;
    goal: string;
    finished: boolean;
  }>;
  const cellPx = Math.max(28, Math.min(44, Math.floor(520 / size)));
  const wallT = Math.max(5, Math.floor(cellPx * 0.18));

  const goalTint = (x: number, y: number) => {
    for (const p of players) {
      if (p.goal === "N" && y === 0) return playerColor(p.id);
      if (p.goal === "S" && y === size - 1) return playerColor(p.id);
      if (p.goal === "E" && x === size - 1) return playerColor(p.id);
      if (p.goal === "W" && x === 0) return playerColor(p.id);
    }
    return null;
  };

  return (
    <div className="game-stage relative inline-block">
      <div className="absolute -top-3 left-3 z-30 rounded-sm bg-ink px-2 py-0.5 font-display text-[10px] font-bold tracking-wider text-paper uppercase shadow-md">
        Quoridor
      </div>
      <div
        className="relative overflow-hidden rounded-md border-[3px] border-[#2a3328] bg-[#1e261c] p-1.5 shadow-[0_24px_60px_-18px_rgba(26,31,22,0.65)]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 70% 15%, rgba(196,140,60,0.28), transparent 50%), linear-gradient(160deg, #2a3220, #1a2118)",
        }}
      >
        <div
          className="relative overflow-hidden rounded-sm bg-[#0f140f]"
          style={{ width: size * cellPx, height: size * cellPx }}
        >
          <div
            className="grid gap-px"
            style={{
              width: size * cellPx,
              height: size * cellPx,
              gridTemplateColumns: `repeat(${size}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${size}, ${cellPx}px)`,
            }}
          >
            {Array.from({ length: size * size }, (_, i) => {
              const x = i % size;
              const y = Math.floor(i / size);
              const checker = (x + y) % 2 === 0;
              const tint = goalTint(x, y);
              const here = players.filter(
                (p) => p.pos.x === x && p.pos.y === y,
              );
              return (
                <div
                  key={`${x}-${y}`}
                  className="relative"
                  style={{
                    width: cellPx,
                    height: cellPx,
                    background: tint
                      ? checker
                        ? `color-mix(in srgb, ${tint} 28%, #d8c9a0)`
                        : `color-mix(in srgb, ${tint} 22%, #cbb892)`
                      : checker
                        ? "#d8c9a0"
                        : "#cbb892",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                  }}
                >
                  {here.map((p, idx) => {
                    const off = stackOffset(idx, here.length, cellPx);
                    return (
                      <div
                        key={p.id}
                        className="absolute inset-0 z-20 flex items-center justify-center transition-transform duration-150"
                        style={{
                          transform: `translate(${off.x}px, ${off.y}px)`,
                        }}
                      >
                        <div
                          className={`rounded-full ${toAct === p.id ? "ring-2 ring-core ring-offset-1" : ""}`}
                        >
                          <RobotToken
                            color={playerColor(p.id)}
                            size={cellPx * 0.72}
                            facing={
                              p.goal === "N"
                                ? "UP"
                                : p.goal === "S"
                                  ? "DOWN"
                                  : p.goal === "E"
                                    ? "RIGHT"
                                    : "LEFT"
                            }
                            label={p.fences}
                            accent="quoridor"
                            dim={p.finished}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {walls.map((w, i) =>
            w.orient === "H" ? (
              <div
                key={`h-${i}-${w.x}-${w.y}`}
                className="absolute z-30 rounded-sm bg-[#3a2a18] shadow-sm"
                style={{
                  left: w.x * cellPx + 1,
                  top: (w.y + 1) * cellPx - wallT / 2,
                  width: cellPx * 2 - 2,
                  height: wallT,
                }}
              />
            ) : (
              <div
                key={`v-${i}-${w.x}-${w.y}`}
                className="absolute z-30 rounded-sm bg-[#3a2a18] shadow-sm"
                style={{
                  left: (w.x + 1) * cellPx - wallT / 2,
                  top: w.y * cellPx + 1,
                  width: wallT,
                  height: cellPx * 2 - 2,
                }}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
