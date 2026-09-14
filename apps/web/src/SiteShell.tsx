import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { RobotToken, playerColor } from "./sprites";

export function SiteShell({
  children,
  subtitle,
  accent = "arena",
}: {
  children: ReactNode;
  subtitle?: string;
  accent?: "arena" | "bomber" | "tanks" | "sokoban";
}) {
  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-[0.2em] text-moss uppercase">
          AI Bot Arena
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-4">
          <Link
            to="/"
            className="font-display text-5xl font-extrabold tracking-tight text-ink transition hover:text-moss sm:text-6xl"
          >
            Machia
          </Link>
          <div className="mb-1.5 flex -space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-full bg-paper/80 p-0.5 ring-2 ring-paper"
              >
                <RobotToken
                  color={playerColor(i)}
                  size={28}
                  facing={i === 0 ? "RIGHT" : i === 1 ? "DOWN" : "LEFT"}
                  accent={accent}
                />
              </div>
            ))}
          </div>
        </div>
        {subtitle ? (
          <p className="mt-3 max-w-xl text-base text-ink/70">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
