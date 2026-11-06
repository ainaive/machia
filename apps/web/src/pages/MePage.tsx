import { Bell, CheckCheck, Loader2, Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchGames,
  fetchMyPage,
  markNotificationsRead,
  type GameInfo,
  type MyPage,
} from "../api";
import { useAuth } from "../auth";
import { SiteShell } from "../SiteShell";

const CONTEST_STATUS: Record<string, string> = {
  open: "报名中",
  running: "进行中",
  finished: "已结束",
};

const ENTRY_STATUS: Record<string, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
};

function nextAction(contestStatus: string, entryStatus: string): string {
  if (contestStatus === "finished") return "查看结果与回放";
  if (contestStatus === "running") return "比赛进行中";
  if (entryStatus === "approved") return "等待开赛";
  if (entryStatus === "rejected") return "修改后重新提交";
  return "等待管理员审批";
}

function gameName(games: GameInfo[], id: string): string {
  return games.find((g) => g.id === id)?.name ?? id;
}

export function MeView({
  data,
  games,
  busy,
  onMarkAllRead,
}: {
  data: MyPage;
  games: GameInfo[];
  busy: boolean;
  onMarkAllRead: () => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-xl font-bold">
            <Bell size={19} className="text-moss" />
            通知
            {data.unread > 0 && (
              <span className="rounded-full bg-clay/15 px-2 py-0.5 text-xs font-medium text-clay">
                {data.unread} 条未读
              </span>
            )}
          </h3>
          {data.unread > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={onMarkAllRead}
              className="flex items-center gap-1 text-sm font-medium text-moss underline-offset-2 hover:underline disabled:opacity-40"
            >
              <CheckCheck size={15} />
              全部标为已读
            </button>
          )}
        </div>
        {data.notifications.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink/15 px-4 py-6 text-sm text-ink/50">
            还没有通知。报名赛事后，审批和开赛结果会出现在这里。
          </p>
        ) : (
          <ul className="space-y-2">
            {data.notifications.map((n) => (
              <li
                key={n.id}
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  n.readAt ? "border-ink/10 bg-paper/50" : "border-moss/25 bg-moss/5"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!n.readAt && <span className="h-2 w-2 rounded-full bg-moss" title="未读" />}
                  <span className="font-medium">{n.title}</span>
                  <span className="ml-auto text-xs text-ink/40">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                {n.body && <p className="mt-1 text-ink/65">{n.body}</p>}
                {n.contestId && (
                  <Link
                    to={`/contests/${n.contestId}`}
                    className="mt-1 inline-block text-xs font-medium text-moss hover:underline"
                  >
                    查看赛事 →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 font-display text-xl font-bold">
          <Trophy size={19} className="text-moss" />
          我的赛事
        </h3>
        {data.contests.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-sm text-ink/50">
            还没有报名任何赛事。
            <Link to="/contests" className="ml-1 text-moss hover:underline">
              去看看 →
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {data.contests.map(({ contest, entry }) => (
              <li key={entry.id}>
                <Link
                  to={`/contests/${contest.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper/70 px-4 py-3 transition hover:border-moss/40 hover:bg-paper"
                >
                  <div className="min-w-0">
                    <div className="font-display text-lg font-bold">{contest.title}</div>
                    <p className="text-xs text-ink/50">
                      {gameName(games, contest.gameId)} · {CONTEST_STATUS[contest.status] ?? contest.status}
                      {entry.botName ? ` · ${entry.botName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="rounded-full bg-moss/10 px-2.5 py-0.5 text-xs font-medium text-moss">
                      {ENTRY_STATUS[entry.status] ?? entry.status}
                    </span>
                    <span className="text-ink/55">{nextAction(contest.status, entry.status)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function MePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<MyPage>();
  const [games, setGames] = useState<GameInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    fetchMyPage()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    if (!user) return;
    reload();
    fetchGames()
      .then((r) => setGames(r.games))
      .catch(() => setGames([]));
  }, [user, reload]);

  async function markAllRead() {
    setBusy(true);
    try {
      await markNotificationsRead();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <SiteShell subtitle="加载中…">
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-moss" size={28} />
        </div>
      </SiteShell>
    );
  }

  if (!user) {
    return (
      <SiteShell subtitle="登录后查看报名状态、审批结果和比赛通知。">
        <div className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-sm text-ink/60">
          <Link to="/login" className="font-medium text-moss hover:underline">
            登录
          </Link>{" "}
          后查看你的赛事。
        </div>
      </SiteShell>
    );
  }

  return (
    <SiteShell subtitle="你的报名、审批结果和比赛通知。">
      <h2 className="mb-5 font-display text-2xl font-bold">我的</h2>
      {error ? (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      ) : null}
      {data ? (
        <MeView data={data} games={games} busy={busy} onMarkAllRead={() => void markAllRead()} />
      ) : (
        <div className="flex justify-center py-24">
          <Loader2 className="animate-spin text-moss" size={28} />
        </div>
      )}
    </SiteShell>
  );
}
