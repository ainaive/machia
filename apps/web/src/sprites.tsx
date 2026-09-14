import { useId } from "react";

/** Inline SVG game sprites — crisp at any cell size, no asset pipeline. */

export const PLAYER_COLORS = [
  "#c45c26",
  "#2f6f8f",
  "#6b4c9a",
  "#3d6b4f",
  "#b33b5a",
  "#8a6d2f",
  "#2d6a6a",
  "#5c4a3a",
] as const;

export function playerColor(id: number) {
  return PLAYER_COLORS[id % PLAYER_COLORS.length]!;
}

const FACING_ROT: Record<string, number> = {
  UP: 0,
  RIGHT: 90,
  DOWN: 180,
  LEFT: 270,
};

interface TokenProps {
  color: string;
  size: number;
  facing?: string;
  label?: string | number;
  accent?: "arena" | "bomber" | "tanks" | "sokoban" | "holdem";
  dim?: boolean;
}

/** Chunking combat bot with visor + facing antenna. */
export function RobotToken({
  color,
  size,
  facing = "DOWN",
  label,
  accent = "arena",
  dim = false,
}: TokenProps) {
  const rot = FACING_ROT[facing] ?? 180;
  const eye =
    accent === "bomber"
      ? "#ffb347"
      : accent === "tanks"
        ? "#9ad0ff"
        : accent === "sokoban"
          ? "#e8b84a"
          : accent === "holdem"
            ? "#e8efe0"
            : "#7dffb3";

  return (
    <div
      className="pointer-events-none relative flex items-center justify-center"
      style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]"
        aria-hidden
      >
        <ellipse cx="24" cy="43" rx="12" ry="3.5" fill="rgba(0,0,0,0.28)" />
        <g transform={`rotate(${rot} 24 24)`}>
          <polygon
            points="24,3 29,11 19,11"
            fill={color}
            stroke="#1a1f16"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect
            x="10"
            y="12"
            width="28"
            height="26"
            rx="8"
            fill={color}
            stroke="#1a1f16"
            strokeWidth="1.6"
          />
          <rect
            x="10"
            y="12"
            width="28"
            height="10"
            rx="8"
            fill="rgba(255,255,255,0.18)"
          />
          <rect x="14" y="18" width="20" height="10" rx="3" fill="#121612" />
          <circle cx="19" cy="23" r="2.2" fill={eye} />
          <circle cx="29" cy="23" r="2.2" fill={eye} />
          <rect
            x="16"
            y="32"
            width="16"
            height="3"
            rx="1.5"
            fill="rgba(0,0,0,0.35)"
          />
          {accent === "bomber" && (
            <circle
              cx="36"
              cy="16"
              r="4"
              fill="#1a1f16"
              stroke="#e8efe0"
              strokeWidth="1"
            />
          )}
        </g>
      </svg>
      {label != null && (
        <span
          className="absolute -right-0.5 -bottom-0.5 flex min-w-[1.1em] items-center justify-center rounded-sm bg-ink px-0.5 font-display font-bold text-paper shadow"
          style={{ fontSize: Math.max(9, size * 0.28) }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function BombSprite({ size, fuse }: { size: number; fuse: number }) {
  const urgent = fuse <= 1;
  return (
    <div
      className={`pointer-events-none relative flex items-center justify-center ${urgent ? "animate-bomb-urgent" : "animate-bomb-pulse"}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
        <ellipse cx="20" cy="36" rx="9" ry="2.5" fill="rgba(0,0,0,0.3)" />
        <circle
          cx="20"
          cy="22"
          r="12"
          fill="#1a1f16"
          stroke="#3a4038"
          strokeWidth="1.5"
        />
        <ellipse cx="16" cy="17" rx="4" ry="2.5" fill="rgba(255,255,255,0.12)" />
        <path
          d="M24 12 Q28 6 32 8"
          fill="none"
          stroke="#8a6d2f"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="32" cy="8" r="2.5" fill={urgent ? "#e85d3a" : "#e8b84a"} />
      </svg>
      <span
        className="absolute font-display font-extrabold text-paper drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
        style={{ fontSize: Math.max(10, size * 0.32), top: "42%" }}
      >
        {fuse}
      </span>
    </div>
  );
}

export function PowerupSprite({ kind, size }: { kind: string; size: number }) {
  const uid = useId().replace(/:/g, "");
  const fire = kind === "FIRE_UP";
  const gid = `pu-${uid}`;
  return (
    <div
      className="pointer-events-none animate-power-bob flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={fire ? "#ff8a3d" : "#5eb0e0"} />
            <stop offset="100%" stopColor={fire ? "#c45c26" : "#2f6f8f"} />
          </linearGradient>
        </defs>
        <polygon
          points="18,2 34,18 18,34 2,18"
          fill={`url(#${gid})`}
          stroke="#1a1f16"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        {fire ? (
          <path
            d="M18 10c2 3 5 5 5 9a5 5 0 1 1-10 0c0-4 3-6 5-9z"
            fill="#ffe6c8"
            stroke="#1a1f16"
            strokeWidth="1"
          />
        ) : (
          <g>
            <circle
              cx="18"
              cy="18"
              r="6"
              fill="#1a1f16"
              stroke="#e8efe0"
              strokeWidth="1.2"
            />
            <path
              d="M21 13 Q24 11 25 13"
              fill="none"
              stroke="#e8b84a"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

/** CSS brick — avoids duplicate SVG gradient ids across cells. */
export function SoftWallSprite() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `
          linear-gradient(180deg, rgba(255,255,255,0.18), transparent 18%, transparent 82%, rgba(0,0,0,0.28)),
          repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,0.18) 9px 10px),
          repeating-linear-gradient(0deg, transparent 0 9px, rgba(0,0,0,0.18) 9px 10px),
          linear-gradient(180deg, #c49a3c, #8b6914 55%, #5c4510)
        `,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
      }}
      aria-hidden
    />
  );
}

export function HardWallSprite() {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: `
          linear-gradient(135deg, rgba(255,255,255,0.16), transparent 40%, rgba(0,0,0,0.35)),
          linear-gradient(145deg, #6a7580, #4a5560 45%, #2f363e)
        `,
        boxShadow:
          "inset 0 0 0 2px rgba(255,255,255,0.1), inset 0 0 0 1px rgba(0,0,0,0.4)",
      }}
      aria-hidden
    />
  );
}

export function BlastBurst({ size }: { size: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center animate-blast-flash"
      style={{ background: "radial-gradient(circle, #ffec9e 0%, #e85d3a 55%, transparent 75%)" }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size * 0.9} height={size * 0.9}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <polygon
            key={deg}
            points="20,2 23,14 17,14"
            fill="#ffb347"
            transform={`rotate(${deg} 20 20)`}
          />
        ))}
        <circle cx="20" cy="20" r="6" fill="#fff3c4" />
      </svg>
    </div>
  );
}

const TANK_ROT: Record<string, number> = {
  UP: 0,
  RIGHT: 90,
  DOWN: 180,
  LEFT: 270,
};

export function TankSprite({
  color,
  size,
  facing = "DOWN",
}: {
  color: string;
  size: number;
  facing?: string;
}) {
  const rot = TANK_ROT[facing] ?? 180;
  return (
    <div
      className="pointer-events-none relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]"
        aria-hidden
      >
        <ellipse cx="24" cy="42" rx="11" ry="3" fill="rgba(0,0,0,0.3)" />
        <g transform={`rotate(${rot} 24 24)`}>
          <rect
            x="8"
            y="16"
            width="32"
            height="18"
            rx="4"
            fill={color}
            stroke="#1a1f16"
            strokeWidth="1.6"
          />
          <rect
            x="11"
            y="19"
            width="26"
            height="6"
            rx="2"
            fill="rgba(0,0,0,0.25)"
          />
          <rect
            x="20"
            y="6"
            width="8"
            height="16"
            rx="2"
            fill="#2a3328"
            stroke="#1a1f16"
            strokeWidth="1.2"
          />
          <rect x="22" y="2" width="4" height="8" rx="1" fill="#c8d0c4" />
          <circle cx="24" cy="25" r="5" fill="#1a1f16" />
          <circle cx="24" cy="25" r="2.5" fill="#9ad0ff" />
        </g>
      </svg>
    </div>
  );
}

export function BulletSprite({ size }: { size: number }) {
  return (
    <div
      className="pointer-events-none flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} aria-hidden>
        <circle cx="12" cy="12" r="5" fill="#e8b84a" stroke="#1a1f16" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="2" fill="#fff3c4" />
      </svg>
    </div>
  );
}
