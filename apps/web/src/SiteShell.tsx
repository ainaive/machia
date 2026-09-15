import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "./auth";
import { RobotToken, playerColor } from "./sprites";

export function SiteShell({
  children,
  subtitle,
  accent = "arena",
}: {
  children: ReactNode;
  subtitle?: string;
  accent?: "arena" | "bomber" | "tanks" | "sokoban" | "holdem" | "quoridor";
}) {
  const { user, logout } = useAuth();

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
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
          </div>
          <nav className="mt-1 flex flex-wrap items-center gap-3 text-sm font-medium">
            <Link
              to="/"
              className="text-ink/70 underline-offset-2 hover:text-moss hover:underline"
            >
              练习场
            </Link>
            <Link
              to="/contests"
              className="text-ink/70 underline-offset-2 hover:text-moss hover:underline"
            >
              比赛
            </Link>
            {user ? (
              <>
                <span className="text-ink/45">
                  {user.username}
                  {user.role === "admin" ? " · 管理员" : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-ink/70 underline-offset-2 hover:text-clay hover:underline"
                >
                  退出
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="text-ink/70 underline-offset-2 hover:text-moss hover:underline"
              >
                登录
              </Link>
            )}
          </nav>
        </div>
        {subtitle ? (
          <p className="mt-3 max-w-xl text-base text-ink/70">{subtitle}</p>
        ) : null}
      </header>
      {children}
    </div>
  );
}
