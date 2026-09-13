import type { Direction, MatchReplay, PublicPlayerView, Rect } from "./api";

const PLAYER_COLORS = [
  "#c45c26",
  "#2f6f8f",
  "#6b4c9a",
  "#3d6b4f",
  "#b33b5a",
  "#8a6d2f",
  "#2d6a6a",
  "#5c4a3a",
];

function facingAngle(facing: Direction): number {
  switch (facing) {
    case "UP":
      return -90;
    case "DOWN":
      return 90;
    case "LEFT":
      return 180;
    case "RIGHT":
      return 0;
  }
}

function cellIn(rect: Rect, x: number, y: number) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

interface BoardProps {
  replay: MatchReplay;
  tickIndex: number;
}

export function Board({ replay, tickIndex }: BoardProps) {
  const size = replay.mapSize;
  const mid = (size - 1) / 2;
  const core = {
    minX: mid - 1,
    minY: mid - 1,
    maxX: mid + 1,
    maxY: mid + 1,
  };

  const snap =
    tickIndex < 0
      ? null
      : (replay.ticks[Math.min(tickIndex, replay.ticks.length - 1)] ?? null);

  const players: PublicPlayerView[] = snap?.players ?? [];
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
              <PlayerToken
                key={p.id}
                player={p}
                color={PLAYER_COLORS[p.id % PLAYER_COLORS.length]!}
                size={cellPx}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function PlayerToken({
  player,
  color,
  size,
}: {
  player: PublicPlayerView;
  color: string;
  size: number;
}) {
  const r = Math.max(5, size * 0.32);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      title={`P${player.id} HP ${player.hp}`}
    >
      <div
        className="relative rounded-full border border-ink/30 shadow-sm transition-transform duration-200"
        style={{
          width: r * 2,
          height: r * 2,
          background: color,
          transform: `rotate(${facingAngle(player.facing)}deg)`,
        }}
      >
        <span
          className="absolute right-[-1px] top-1/2 h-0 w-0 -translate-y-1/2 border-y-[3px] border-l-[5px] border-y-transparent border-l-ink/80"
          aria-hidden
        />
      </div>
      <span className="pointer-events-none absolute bottom-0 right-0 text-[9px] font-bold leading-none text-ink/80">
        {player.hp}
      </span>
    </div>
  );
}

export { PLAYER_COLORS };
