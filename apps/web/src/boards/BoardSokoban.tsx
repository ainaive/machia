import type { MatchReplay, Position } from "../api";
import { playerColor } from "../sprites";
import { StageShell } from "./shared";

export function BoardSokoban({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  const snap =
    replay.ticks[Math.min(Math.max(tickIndex, 0), replay.ticks.length - 1)];
  const width = Number(snap?.width ?? replay.mapSize);
  const height = Number(snap?.height ?? replay.mapSize);
  const cells = (snap?.cells as string[][] | undefined) ?? [];
  const goals = new Set(
    ((snap?.goals as Position[] | undefined) ?? []).map((g) => `${g.x},${g.y}`),
  );
  const players = (snap?.players ?? []) as Array<{
    id: number;
    pos: Position;
    boxes: Position[];
    boxesOnGoal: number;
    goalCount: number;
    done: boolean;
    steps: number;
  }>;
  const cellPx = Math.max(
    14,
    Math.min(28, Math.floor(280 / Math.max(width, height))),
  );

  return (
    <div className="flex flex-wrap gap-4">
      {players.map((p) => {
        const boxSet = new Set((p.boxes ?? []).map((b) => `${b.x},${b.y}`));
        return (
          <div key={p.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 px-1 font-display text-xs font-bold">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: playerColor(p.id) }}
              />
              P{p.id}
              <span className="font-normal text-ink/50">
                {p.done
                  ? `完成 · ${p.steps} 步`
                  : `${p.boxesOnGoal}/${p.goalCount} · ${p.steps} 步`}
              </span>
            </div>
            <StageShell
              size={Math.max(width, height)}
              cellPx={cellPx}
              badge=""
            >
              {Array.from({ length: Math.max(width, height) ** 2 }, (_, i) => {
                const x = i % Math.max(width, height);
                const y = Math.floor(i / Math.max(width, height));
                const outside = x >= width || y >= height;
                const cell = outside ? "wall" : (cells[y]?.[x] ?? "empty");
                const gKey = `${x},${y}`;
                const isGoal = goals.has(gKey);
                const isBox = boxSet.has(gKey);
                const isPlayer = p.pos.x === x && p.pos.y === y;
                let bg = "#c5d4b4";
                if (cell === "wall" || outside) bg = "#4a5560";
                else if (isGoal) bg = "#e8c86a";

                return (
                  <div
                    key={gKey}
                    className="relative flex items-center justify-center"
                    style={{
                      width: cellPx,
                      height: cellPx,
                      background: bg,
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                    }}
                  >
                    {isBox && (
                      <div
                        className="rounded-sm border border-ink/40"
                        style={{
                          width: cellPx * 0.62,
                          height: cellPx * 0.62,
                          background: isGoal ? "#c45c26" : "#8b6914",
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
                        }}
                      />
                    )}
                    {isPlayer && (
                      <div
                        className="absolute z-10 rounded-full border-2 border-paper"
                        style={{
                          width: cellPx * 0.45,
                          height: cellPx * 0.45,
                          background: playerColor(p.id),
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </StageShell>
          </div>
        );
      })}
    </div>
  );
}
