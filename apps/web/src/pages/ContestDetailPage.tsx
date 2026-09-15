import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  approveEntry,
  fetchContest,
  rejectEntry,
  startContest,
  submitContestBot,
  type ContestDetail,
  type ContestEntry,
} from "../api";
import { useAuth } from "../auth";
import { RulesPanel } from "../RulesPanel";
import { SiteShell } from "../SiteShell";
import { gameAccent } from "../gameAccent";

const STATUS_LABEL = {
  open: "报名中",
  running: "进行中",
  finished: "已结束",
  pending: "待审批",
  approved: "已通过",
  rejected: "已拒绝",
} as const;

async function readSelectedFiles(list: FileList | null): Promise<Record<string, string>> {
  if (!list || list.length === 0) {
    throw new Error("请选择 manifest.json 和 bot.js");
  }
  const files: Record<string, string> = {};
  for (const file of [...list]) {
    files[file.name] = await file.text();
  }
  return files;
}

function entryLabel(entries: ContestEntry[], id: string): string {
  const e = entries.find((x) => x.id === id);
  if (!e) return id;
  return e.botName ? `${e.username} / ${e.botName}` : e.username;
}

export function ContestDetailPage() {
  const { contestId = "" } = useParams();
  const { user } = useAuth();
  const [detail, setDetail] = useState<ContestDetail | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectWhy, setRejectWhy] = useState<Record<string, string>>({});

  async function reload() {
    const next = await fetchContest(contestId);
    setDetail(next);
    return next;
  }

  useEffect(() => {
    setDetail(undefined);
    setError(null);
    fetchContest(contestId)
      .then(setDetail)
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setDetail(null);
      });
  }, [contestId]);

  useEffect(() => {
    if (detail?.contest.status !== "running") return;
    const t = window.setInterval(() => {
      void reload().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
  }, [contestId, detail?.contest.status]);

  const accent = gameAccent(detail?.game.id ?? "arena");

  async function wrap(label: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(label);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onSubmitBot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("botfiles");
    const list = input instanceof HTMLInputElement ? input.files : null;
    await wrap("upload", async () => {
      const files = await readSelectedFiles(list);
      await submitContestBot(contestId, files);
    });
  }

  if (detail === undefined) {
    return (
      <SiteShell accent={accent}>
        <div className="flex flex-col items-center gap-3 py-24">
          <Loader2 className="animate-spin text-moss" size={28} />
          <p className="text-sm text-ink/60">加载赛事…</p>
        </div>
      </SiteShell>
    );
  }

  if (detail === null) {
    return (
      <SiteShell accent={accent}>
        <div className="rounded-md border border-clay/30 bg-[#f7e4d8] px-4 py-6">
          <h2 className="font-display text-xl font-bold text-clay">找不到赛事</h2>
          <p className="mt-2 text-sm text-ink/70">{error ?? contestId}</p>
          <Link
            to="/contests"
            className="mt-4 inline-block text-sm font-medium text-moss underline-offset-2 hover:underline"
          >
            ← 返回比赛列表
          </Link>
        </div>
      </SiteShell>
    );
  }

  const { contest, game, entries, myEntry, matches, standings } = detail;
  const approvedCount = entries.filter((e) => e.status === "approved").length;
  const canUpload =
    contest.status === "open" &&
    user &&
    myEntry?.status !== "approved";

  return (
    <SiteShell accent={accent} subtitle={`${game.name} · 1v1 循环赛，按胜场、平局、总分排名。`}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          to="/contests"
          className="text-sm font-medium text-moss underline-offset-2 hover:underline"
        >
          ← 比赛
        </Link>
        <span className="text-ink/30">/</span>
        <h2 className="font-display text-2xl font-bold">{contest.title}</h2>
        <span className="rounded-full bg-moss/10 px-2.5 py-0.5 text-xs font-medium text-moss">
          {STATUS_LABEL[contest.status]}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      <p className="mb-6 max-w-2xl text-sm text-ink/65">
        管理员审阅提交的 Node Bot 后开赛。审批视为信任源码；平台不提供隔离沙箱。
        练习场仍可免登录使用样例 Bot。
      </p>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section className="space-y-6">
          <div>
            <h3 className="mb-3 font-display text-xl font-bold">报名</h3>
            {!user && contest.status === "open" && (
              <p className="text-sm text-ink/60">
                <Link to="/login" className="text-moss hover:underline">
                  登录
                </Link>{" "}
                后即可提交 Bot。
              </p>
            )}
            {myEntry && (
              <p className="mb-3 text-sm text-ink/70">
                你的状态：{STATUS_LABEL[myEntry.status]}
                {myEntry.botName ? ` · ${myEntry.botName}` : " · 尚未提交文件"}
                {myEntry.status === "rejected" && myEntry.rejectReason
                  ? ` · ${myEntry.rejectReason}`
                  : ""}
              </p>
            )}
            {canUpload && (
              <form onSubmit={(e) => void onSubmitBot(e)} className="space-y-2">
                <input
                  name="botfiles"
                  type="file"
                  multiple
                  className="block w-full text-sm"
                />
                <p className="text-xs text-ink/50">
                  选择 <code className="font-mono">manifest.json</code> 与{" "}
                  <code className="font-mono">bot.js</code>（可附带其它 .js），总大小 ≤ 256KB。
                </p>
                <button
                  type="submit"
                  disabled={busy === "upload"}
                  className="rounded-md bg-moss px-4 py-2 text-sm font-medium text-paper hover:bg-moss-deep disabled:opacity-40"
                >
                  {myEntry ? "重新提交" : "报名并提交"}
                </button>
              </form>
            )}
            {myEntry?.status === "approved" && contest.status === "open" && (
              <p className="text-sm text-ink/60">已通过，等待管理员开赛。</p>
            )}
          </div>

          <div>
            <h3 className="mb-3 font-display text-xl font-bold">参赛者</h3>
            <ul className="space-y-2">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/10 bg-paper/60 px-3 py-2 text-sm"
                >
                  <span>
                    {e.username}
                    {e.botName ? ` · ${e.botName}` : ""}
                    <span className="ml-2 text-ink/45">{STATUS_LABEL[e.status]}</span>
                  </span>
                  {user?.role === "admin" &&
                    contest.status === "open" &&
                    e.status !== "approved" && (
                      <span className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!e.botName || busy !== null}
                          onClick={() =>
                            void wrap("approve", () =>
                              approveEntry(contest.id, e.id),
                            )
                          }
                          className="rounded-md bg-moss px-2 py-1 text-xs text-paper disabled:opacity-40"
                        >
                          通过
                        </button>
                        <input
                          value={rejectWhy[e.id] ?? ""}
                          onChange={(ev) =>
                            setRejectWhy((prev) => ({
                              ...prev,
                              [e.id]: ev.target.value,
                            }))
                          }
                          placeholder="拒绝原因"
                          className="w-32 rounded-md border border-ink/15 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void wrap("reject", () =>
                              rejectEntry(
                                contest.id,
                                e.id,
                                rejectWhy[e.id] ?? "",
                              ),
                            )
                          }
                          className="rounded-md border border-clay/40 px-2 py-1 text-xs text-clay"
                        >
                          拒绝
                        </button>
                      </span>
                    )}
                </li>
              ))}
              {entries.length === 0 && (
                <li className="text-sm text-ink/50">还没有人报名。</li>
              )}
            </ul>
          </div>

          {(contest.status === "running" || contest.status === "finished") && (
            <>
              <div>
                <h3 className="mb-3 font-display text-xl font-bold">积分榜</h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-ink/50">
                      <th className="py-1 font-medium">#</th>
                      <th className="py-1 font-medium">选手</th>
                      <th className="py-1 font-medium">胜</th>
                      <th className="py-1 font-medium">平</th>
                      <th className="py-1 font-medium">负</th>
                      <th className="py-1 font-medium">总分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s) => (
                      <tr key={s.entryId} className="border-t border-ink/10">
                        <td className="py-1.5">{s.rank}</td>
                        <td className="py-1.5">
                          {s.username}
                          {s.botName ? ` / ${s.botName}` : ""}
                        </td>
                        <td className="py-1.5">{s.wins}</td>
                        <td className="py-1.5">{s.draws}</td>
                        <td className="py-1.5">{s.losses}</td>
                        <td className="py-1.5">{s.scoreSum.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="mb-3 font-display text-xl font-bold">对阵</h3>
                <ul className="space-y-2">
                  {matches.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/10 bg-paper/50 px-3 py-2 text-sm"
                    >
                      <span>
                        {entryLabel(entries, m.entryAId)} vs{" "}
                        {entryLabel(entries, m.entryBId)}
                        <span className="ml-2 text-ink/45">{m.status}</span>
                        {m.error ? ` · ${m.error}` : ""}
                      </span>
                      {m.matchId && (
                        <Link
                          to={`/matches/${m.matchId}`}
                          className="text-moss hover:underline"
                        >
                          回放
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>

        <aside className="space-y-3">
          {user?.role === "admin" && contest.status === "open" && (
            <button
              type="button"
              disabled={approvedCount < 2 || busy !== null}
              onClick={() =>
                void wrap("start", () => startContest(contest.id))
              }
              className="w-full rounded-md bg-clay px-4 py-3 font-display font-bold text-paper shadow-[0_8px_24px_-8px_rgba(196,92,38,0.55)] disabled:opacity-40"
            >
              {busy === "start" ? "开赛中…" : "开始循环赛"}
            </button>
          )}
          <p className="text-xs text-ink/50">
            已通过 {approvedCount} / {entries.length} · 开赛后生成全部 1v1 对局，串行执行。
          </p>
          <Link
            to={`/games/${game.id}`}
            className="block text-sm text-moss hover:underline"
          >
            去练习场试试 {game.name} →
          </Link>
        </aside>
      </div>
      <RulesPanel gameId={game.id} />
    </SiteShell>
  );
}
