import type { MatchReplay, Position } from "../api";
import { RobotToken, playerColor } from "../sprites";
import { StageShell, cellIn, stackOffset } from "./shared";

export function BoardArena({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  const size = replay.mapSize;
  const mid = (size - 1) / 2;
  const core = {
    minX: mid - 1,
    minY: mid - 1,
    maxX: mid + 1,
    maxY: mid + 1,
  };
  const snap =
    replay.ticks[Math.min(Math.max(tickIndex, 0), replay.ticks.length - 1)];
  const players = (snap?.players ?? []) as Array<{
    id: number;
    hp: number;
    pos: Position;
    facing: string;
    alive: boolean;
  }>;
  const safe = snap?.safe ?? {
    minX: 0,
    minY: 0,
    maxX: size - 1,
    maxY: size - 1,
  };
  const cellPx = Math.max(18, Math.min(36, Math.floor(640 / size)));

  return (
    <StageShell size={size} cellPx={cellPx} badge="Arena">
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const inSafe = cellIn(safe, x, y);
        const inCore = cellIn(core, x, y);
        const here = players.filter(
          (p) => p.alive && p.pos.x === x && p.pos.y === y,
        );
        const checker = (x + y) % 2 === 0;

        let floor = inSafe
          ? checker
            ? "#d4e0c4"
            : "#c5d4b4"
          : checker
            ? "#a8927c"
            : "#96816c";
        if (inCore && inSafe) {
          floor = checker ? "#f2d78a" : "#e8c86a";
        }

        return (
          <div
            key={`${x}-${y}`}
            className="relative"
            style={{
              width: cellPx,
              height: cellPx,
              background: floor,
              boxShadow: inCore && inSafe
                ? "inset 0 0 0 1px rgba(196,92,38,0.25)"
                : "inset 0 0 0 1px rgba(0,0,0,0.06)",
            }}
          >
            {!inSafe && (
              <div className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,0.08)_3px,rgba(0,0,0,0.08)_4px)]" />
            )}
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
                  <RobotToken
                    color={playerColor(p.id)}
                    size={cellPx * 0.82}
                    facing={p.facing}
                    label={p.hp}
                    accent="arena"
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </StageShell>
  );
}
