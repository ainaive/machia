import type { MatchReplay, Position } from "../api";
import { BulletSprite, HardWallSprite, TankSprite, playerColor } from "../sprites";
import { StageShell, stackOffset } from "./shared";

export function BoardTanks({
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
    facing: string;
    alive: boolean;
  }>;
  const bullets =
    (snap?.bullets as Array<{
      id: number;
      ownerId: number;
      pos: Position;
      facing: string;
    }>) ?? [];
  const cellPx = Math.max(18, Math.min(36, Math.floor(640 / size)));

  return (
    <StageShell size={size} cellPx={cellPx} badge="Tanks">
      {Array.from({ length: size * size }, (_, i) => {
        const x = i % size;
        const y = Math.floor(i / size);
        const tile = tiles[y]?.[x] ?? "empty";
        const key = `${x},${y}`;
        const checker = (x + y) % 2 === 0;
        const floor = checker ? "#b0c0a0" : "#9eb090";
        const here = players.filter(
          (p) => p.alive && p.pos.x === x && p.pos.y === y,
        );
        const shot = bullets.find((b) => b.pos.x === x && b.pos.y === y);

        return (
          <div
            key={key}
            className="relative"
            style={{
              width: cellPx,
              height: cellPx,
              background: floor,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
            }}
          >
            {tile === "hard" && <HardWallSprite />}
            {shot && (
              <div className="absolute inset-0 z-[18] flex items-center justify-center">
                <BulletSprite size={cellPx} />
              </div>
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
                  <TankSprite
                    color={playerColor(p.id)}
                    size={cellPx * 0.85}
                    facing={p.facing}
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
