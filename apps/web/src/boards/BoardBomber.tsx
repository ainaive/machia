import type { MatchReplay, Position } from "../api";
import {
  BlastBurst,
  BombSprite,
  HardWallSprite,
  PowerupSprite,
  RobotToken,
  SoftWallSprite,
  playerColor,
} from "../sprites";
import { StageShell, stackOffset } from "./shared";

export function BoardBomber({
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
  const blast = new Set((snap?.blast ?? []).map((p) => `${p.x},${p.y}`));
  const hazardRing = Number(snap?.hazardRing ?? 0);
  const cellPx = Math.max(20, Math.min(40, Math.floor(640 / size)));

  return (
    <StageShell size={size} cellPx={cellPx} badge="Bomber">
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
        const checker = (x + y) % 2 === 0;
        const isBlast = blast.has(key);

        let floor = checker ? "#b8c9a4" : "#a8bb92";
        if (hazardous && tile === "empty") {
          floor = checker ? "#7a8a6e" : "#6a7a5e";
        }

        const bomb = bombs.find((b) => b.pos.x === x && b.pos.y === y);
        const power = powerups.find((p) => p.pos.x === x && p.pos.y === y);
        const here = players.filter(
          (p) => p.alive && p.pos.x === x && p.pos.y === y,
        );

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
            {tile === "soft" && <SoftWallSprite />}
            {hazardous && tile === "empty" && (
              <div className="absolute inset-0 bg-clay/25 mix-blend-multiply" />
            )}
            {isBlast && <BlastBurst size={cellPx} />}
            {power && !bomb && tile === "empty" && !isBlast && (
              <div className="absolute inset-0 z-[15] flex items-center justify-center">
                <PowerupSprite kind={power.kind} size={cellPx * 0.62} />
              </div>
            )}
            {bomb && (
              <div className="absolute inset-0 z-[18] flex items-center justify-center">
                <BombSprite size={cellPx * 0.72} fuse={bomb.fuse} />
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
                  <RobotToken
                    color={playerColor(p.id)}
                    size={cellPx * 0.78}
                    facing="DOWN"
                    accent="bomber"
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
