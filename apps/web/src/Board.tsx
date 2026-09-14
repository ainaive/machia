import type { ReactNode } from "react";
import type { MatchReplay, Position, Rect } from "./api";
import {
  BlastBurst,
  BombSprite,
  HardWallSprite,
  PLAYER_COLORS,
  PowerupSprite,
  RobotToken,
  SoftWallSprite,
  playerColor,
} from "./sprites";

export { PLAYER_COLORS, playerColor };

function cellIn(rect: Rect, x: number, y: number) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

function stackOffset(index: number, total: number, cellPx: number) {
  if (total <= 1) return { x: 0, y: 0 };
  const spread = cellPx * 0.14;
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread };
}

function StageShell({
  children,
  size,
  cellPx,
  badge,
}: {
  children: ReactNode;
  size: number;
  cellPx: number;
  badge: string;
}) {
  const boardPx = size * cellPx;
  return (
    <div className="game-stage relative inline-block">
      <div className="absolute -top-3 left-3 z-30 rounded-sm bg-ink px-2 py-0.5 font-display text-[10px] font-bold tracking-wider text-paper uppercase shadow-md">
        {badge}
      </div>
      <div
        className="relative overflow-hidden rounded-md border-[3px] border-[#2a3328] bg-[#1e261c] p-1.5 shadow-[0_24px_60px_-18px_rgba(26,31,22,0.65),inset_0_1px_0_rgba(255,255,255,0.08)]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 30% 20%, rgba(61,107,79,0.35), transparent 55%), linear-gradient(160deg, #243028, #1a2118)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.4) 3px)",
          }}
        />
        <div
          className="relative grid gap-px overflow-hidden rounded-sm bg-[#0f140f]"
          style={{
            width: boardPx,
            height: boardPx,
            gridTemplateColumns: `repeat(${size}, ${cellPx}px)`,
            gridTemplateRows: `repeat(${size}, ${cellPx}px)`,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
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
