import { Trophy } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createContest,
  fetchContests,
  fetchGames,
  type ContestSummary,
  type GameInfo,
} from "../api";
import { useAuth } from "../auth";
import { SiteShell } from "../SiteShell";

const STATUS_LABEL: Record<ContestSummary["status"], string> = {
  open: "报名中",
  running: "进行中",
  finished: "已结束",
};

export function ContestListPage() {
  const { user } = useAuth();
  const [contests, setContests] = useState<ContestSummary[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [gameId, setGameId] = useState("arena");
  const [busy, setBusy] = useState(false);

  function reload() {
    fetchContests()
      .then((r) => setContests(r.contests))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    reload();
    fetchGames()
      .then((r) => {
        setGames(r.games);
        if (r.games[0]) setGameId(r.games[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createContest(title, gameId);
      setTitle("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell subtitle="正式赛事：报名、提交 Bot，管理员审批后进行 1v1 循环赛。练习场无需登录。">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold">
          <Trophy size={22} className="text-moss" />
          比赛
        </h2>
        <Link
          to="/"
          className="text-sm font-medium text-moss underline-offset-2 hover:underline"
        >
          ← 练习场
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      {user?.role === "admin" && (
        <form
          onSubmit={(e) => void onCreate(e)}
          className="mb-8 flex flex-wrap items-end gap-3 rounded-md border border-ink/10 bg-paper/60 px-4 py-3"
        >
          <label className="text-sm">
            <span className="text-ink/60">赛事名称</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-56 rounded-md border border-ink/15 bg-paper px-3 py-2 outline-none focus:border-moss"
              required
              maxLength={80}
            />
          </label>
          <label className="text-sm">
            <span className="text-ink/60">游戏</span>
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="mt-1 block rounded-md border border-ink/15 bg-paper px-3 py-2 outline-none focus:border-moss"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-moss px-4 py-2 font-medium text-paper hover:bg-moss-deep disabled:opacity-40"
          >
            创建赛事
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {contests.map((c) => (
          <li key={c.id}>
            <Link
              to={`/contests/${c.id}`}
              className="flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper/70 px-4 py-3 transition hover:border-moss/40 hover:bg-paper"
            >
              <div>
                <div className="font-display text-lg font-bold">{c.title}</div>
                <p className="text-xs text-ink/50">
                  {c.gameId} · {new Date(c.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-moss/10 px-2.5 py-0.5 text-xs font-medium text-moss">
                {STATUS_LABEL[c.status]}
              </span>
            </Link>
          </li>
        ))}
        {contests.length === 0 && (
          <li className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-sm text-ink/50">
            还没有赛事。
            {user?.role === "admin"
              ? "用上方表单创建一场。"
              : "请等待管理员创建。"}
          </li>
        )}
      </ul>
    </SiteShell>
  );
}
