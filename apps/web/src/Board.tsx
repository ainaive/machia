import type { ReactNode } from "react";
import type { MatchReplay, Position, Rect } from "./api";
import {
  BlastBurst,
  BombSprite,
  BulletSprite,
  HardWallSprite,
  PLAYER_COLORS,
  PowerupSprite,
  RobotToken,
  SoftWallSprite,
  TankSprite,
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
      {badge ? (
        <div className="absolute -top-3 left-3 z-30 rounded-sm bg-ink px-2 py-0.5 font-display text-[10px] font-bold tracking-wider text-paper uppercase shadow-md">
          {badge}
        </div>
      ) : null}
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
  const gameId = replay.gameId ?? "arena";
  if (gameId === "bomber") {
    return <BoardBomber replay={replay} tickIndex={tickIndex} />;
  }
  if (gameId === "tanks") {
    return <BoardTanks replay={replay} tickIndex={tickIndex} />;
  }
  if (gameId === "sokoban") {
    return <BoardSokoban replay={replay} tickIndex={tickIndex} />;
  }
  if (gameId === "holdem") {
    return <BoardHoldem replay={replay} tickIndex={tickIndex} />;
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

function BoardTanks({
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

function BoardSokoban({
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

function PlayingCard({ id }: { id: string }) {
  const hidden = !id || id === "??";
  const rank = hidden ? "?" : id[0];
  const suit = hidden ? "" : id[1];
  const red = suit === "h" || suit === "d";
  const suitMark =
    suit === "h" ? "♥" : suit === "d" ? "♦" : suit === "s" ? "♠" : suit === "c" ? "♣" : "";
  return (
    <div
      className={`flex h-14 w-10 flex-col justify-between rounded-md border px-1 py-0.5 font-display text-xs font-bold shadow-sm ${
        hidden
          ? "border-ink/30 bg-[#2a4a36] text-paper/40"
          : "border-ink/20 bg-paper text-ink"
      }`}
      style={{ color: hidden ? undefined : red ? "#b33b5a" : "#1a1f16" }}
    >
      <span>{rank}</span>
      <span className="self-center text-base">{hidden ? "✦" : suitMark}</span>
      <span className="self-end rotate-180">{rank}</span>
    </div>
  );
}

function BoardHoldem({
  replay,
  tickIndex,
}: {
  replay: MatchReplay;
  tickIndex: number;
}) {
  const snap =
    replay.ticks[Math.min(Math.max(tickIndex, 0), replay.ticks.length - 1)];
  const community = (snap?.community as string[] | undefined) ?? [];
  const pot = Number(snap?.pot ?? 0);
  const street = String(snap?.street ?? "preflop");
  const toAct = Number(snap?.toAct ?? -1);
  const players = (snap?.players ?? []) as Array<{
    id: number;
    stack: number;
    bet: number;
    folded: boolean;
    allIn: boolean;
    hole: string[];
  }>;

  return (
    <div className="w-full max-w-xl rounded-xl border-[3px] border-[#2a3328] bg-gradient-to-b from-[#2f5a3d] to-[#1e3a28] p-5 shadow-[0_24px_60px_-18px_rgba(26,31,22,0.65)]">
      <div className="mb-4 flex items-center justify-between text-sm text-paper/80">
        <span className="font-display font-bold uppercase tracking-wide">
          {street}
        </span>
        <span className="rounded-full bg-ink/40 px-3 py-1 font-display font-bold text-core">
          Pot {pot}
        </span>
      </div>

      <div className="mb-6 flex min-h-16 items-center justify-center gap-2">
        {community.length === 0 ? (
          <span className="text-sm text-paper/50">等待公共牌…</span>
        ) : (
          community.map((c, i) => <PlayingCard key={`${c}-${i}`} id={c} />)
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {players.map((p) => {
          const visible = p.hole?.length ? p.hole : ["??", "??"];
          return (
            <div
              key={p.id}
              className={`rounded-lg border px-3 py-2 ${
                p.folded
                  ? "border-ink/20 bg-ink/20 opacity-60"
                  : toAct === p.id
                    ? "border-core bg-paper/15 ring-2 ring-core/40"
                    : "border-paper/20 bg-ink/25"
              }`}
            >
              <div className="mb-2 flex items-center gap-2 text-sm text-paper">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: playerColor(p.id) }}
                />
                <span className="font-display font-bold">P{p.id}</span>
                <span className="text-paper/60">
                  {p.folded ? "弃牌" : p.allIn ? "All-in" : `栈 ${p.stack}`}
                </span>
                {p.bet > 0 && (
                  <span className="ml-auto text-core">注 {p.bet}</span>
                )}
              </div>
              <div className="flex gap-1.5">
                {visible.map((c, i) => (
                  <PlayingCard key={i} id={c} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
