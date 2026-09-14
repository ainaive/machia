import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { fetchReplay, type MatchReplay } from "../api";
import { ReplayPlayer } from "../ReplayPlayer";
import { SiteShell } from "../SiteShell";

type LocationState = { speed?: number } | null;

export function MatchPage() {
  const { matchId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const speed = (location.state as LocationState)?.speed ?? 1;

  const [replay, setReplay] = useState<MatchReplay | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReplay(undefined);
    setError(null);
    fetchReplay(matchId)
      .then((r) => setReplay(r))
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setReplay(null);
      });
  }, [matchId]);

  if (replay === undefined) {
    return (
      <SiteShell>
        <div className="flex flex-col items-center gap-3 py-24">
          <Loader2 className="animate-spin text-moss" size={28} />
          <p className="text-sm text-ink/60">加载回放…</p>
        </div>
      </SiteShell>
    );
  }

  if (replay === null) {
    return (
      <SiteShell>
        <div className="rounded-md border border-clay/30 bg-[#f7e4d8] px-4 py-6">
          <h2 className="font-display text-xl font-bold text-clay">
            找不到对局
          </h2>
          <p className="mt-2 text-sm text-ink/70">
            {error ?? `没有 id 为 ${matchId} 的回放。`}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm font-medium text-moss underline-offset-2 hover:underline"
          >
            ← 返回游戏目录
          </Link>
        </div>
      </SiteShell>
    );
  }

  const gameId = replay.gameId ?? "arena";
  const accent =
    gameId === "bomber" ? "bomber" : gameId === "tanks" ? "tanks" : "arena";

  return (
    <SiteShell accent={accent}>
      <ReplayPlayer
        replay={replay}
        initialSpeed={speed}
        autoPlay
        onBack={() => navigate(`/games/${gameId}`)}
      />
    </SiteShell>
  );
}
