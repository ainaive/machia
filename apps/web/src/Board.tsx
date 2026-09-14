import type { MatchReplay, Position, Rect } from "./api";

export const PLAYER_COLORS = [
  "#c45c26",
  "#2f6f8f",
  "#6b4c9a",
  "#3d6b4f",
  "#b33b5a",
  "#8a6d2f",
  "#2d6a6a",
  "#5c4a3a",
];

function cellIn(rect: Rect, x: number, y: number) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

export function Board({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  if ((replay.gameId ?? "arena") === "bomber") {
    return <BoardBomber replay={replay} tickIndex={tickIndex} />;
  }
  return <BoardArena replay={replay} tickIndex={tickIndex} />;
}

function BoardArena({
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
  const cellPx = Math.max(14, Math.min(28, Math.floor(560 / size)));

  return (
    <div
      className="inline-grid gap-px rounded-sm bg-ink/20 p-px shadow-[0_20px_50px_-20px_rgba(26,31,22,0.45)]"
      style={{
        gridTemplateColumns: `repeat(${size}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${size}, ${cellPx}px)`,
      }}
    >
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const inSafe = cellIn(safe, x, y);
        const inCore = cellIn(core, x, y);
        const here = players.filter((p) => p.alive && p.pos.x === x && p.pos.y === y);
        let bg = inSafe ? "bg-[#dfe8d4]" : "bg-[#b8a090]";
        if (inCore && inSafe) bg = "bg-[#f0d78c]";
        return (
          <div
            key={`${x}-${y}`}
            className={`relative ${bg}`}
            style={{ width: cellPx, height: cellPx }}
          >
            {here.map((p) => (
              <div
                key={p.id}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="rounded-full border border-ink/30"
                  style={{
                    width: cellPx * 0.55,
                    height: cellPx * 0.55,
                    background: PLAYER_COLORS[p.id % PLAYER_COLORS.length],
                  }}
                />
                <span className="absolute bottom-0 right-0 text-[9px] font-bold">
                  {p.hp}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BoardBomber({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  const size = replay.mapSize;
  const snap =
    replay.ticks[Math.min(Math.max(tickIndex, 0), replay.ticks.length - 1)];
  const tiles = (snap?.tiles as string[][] | undefined) ?? [];
  const players = (snap?.players ?? []) as Array<{
    id: number;
    pos: Position;
    alive: boolean;
  }>;
  const bombs = snap?.bombs ?? [];
  const powerups = snap?.powerups ?? [];
  const blast = new Set(
    (snap?.blast ?? []).map((p) => `${p.x},${p.y}`),
  );
  const hazardRing = Number(snap?.hazardRing ?? 0);
  const cellPx = Math.max(14, Math.min(32, Math.floor(560 / size)));

  return (
    <div
      className="inline-grid gap-px rounded-sm bg-ink/30 p-px shadow-[0_20px_50px_-20px_rgba(26,31,22,0.45)]"
      style={{
        gridTemplateColumns: `repeat(${size}, ${cellPx}px)`,
        gridTemplateRows: `repeat(${size}, ${cellPx}px)`,
      }}
    >
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const tile = tiles[y]?.[x] ?? "empty";
        const key = `${x},${y}`;
        const hazardous =
          hazardRing > 0 &&
          (x <= hazardRing ||
            y <= hazardRing ||
            x >= size - 1 - hazardRing ||
            y >= size - 1 - hazardRing);
        let bg = "bg-[#c8d6b8]";
        if (tile === "hard") bg = "bg-[#4a5560]";
        if (tile === "soft") bg = "bg-[#8b6914]";
        if (hazardous && tile === "empty") bg = "bg-[#9aa88a]";
        if (blast.has(key)) bg = "bg-[#e85d3a]";

        const bomb = bombs.find((b) => b.pos.x === x && b.pos.y === y);
        const power = powerups.find((p) => p.pos.x === x && p.pos.y === y);
        const here = players.filter((p) => p.alive && p.pos.x === x && p.pos.y === y);

        return (
          <div
            key={key}
            className={`relative flex items-center justify-center ${bg}`}
            style={{ width: cellPx, height: cellPx }}
          >
            {bomb && (
              <span
                className="absolute z-10 rounded-full bg-ink text-[8px] font-bold text-paper"
                style={{
                  width: cellPx * 0.45,
                  height: cellPx * 0.45,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {bomb.fuse}
              </span>
            )}
            {power && !bomb && (
              <span className="absolute z-10 text-[10px] font-bold text-clay">
                {power.kind === "FIRE_UP" ? "F" : "B"}
              </span>
            )}
            {here.map((p) => (
              <div
                key={p.id}
                className="absolute z-20 rounded-full border border-paper/50"
                style={{
                  width: cellPx * 0.5,
                  height: cellPx * 0.5,
                  background: PLAYER_COLORS[p.id % PLAYER_COLORS.length],
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
