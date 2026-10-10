import type { ReactNode } from "react";
import type { Rect } from "../api";

export function cellIn(rect: Rect, x: number, y: number) {
  return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
}

export function stackOffset(index: number, total: number, cellPx: number) {
  if (total <= 1) return { x: 0, y: 0 };
  const spread = cellPx * 0.14;
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * spread, y: Math.sin(angle) * spread };
}

export function StageShell({
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
