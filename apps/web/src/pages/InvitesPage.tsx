import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  createInvite,
  deleteInvite,
  fetchInvites,
  type PublicInvite,
} from "../api";
import { useAuth } from "../auth";
import { SiteShell } from "../SiteShell";

const fieldClass =
  "mt-1 w-full rounded-md border border-ink/15 bg-paper/80 px-3 py-2 outline-none focus:border-moss";

export function InvitesPage() {
  const { user, loading } = useAuth();
  const [invites, setInvites] = useState<PublicInvite[]>([]);
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    fetchInvites()
      .then((r) => setInvites(r.invites))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    if (user?.role === "admin") reload();
  }, [user]);

  if (loading) {
    return <SiteShell subtitle="加载中…">{null}</SiteShell>;
  }
  if (user?.role !== "admin") return <Navigate to="/contests" replace />;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createInvite({ note: note.trim() || undefined, maxUses });
      setNote("");
      setMaxUses(1);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite(invite: PublicInvite) {
    const url = `${window.location.origin}/register?code=${invite.code}`;
    await navigator.clipboard.writeText(`${invite.code}\n${url}`);
    setCopied(invite.id);
  }

  async function onDelete(id: string) {
    setError(null);
    try {
      await deleteInvite(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <SiteShell subtitle="生成邀请码后发给参赛者。注册暂不对公众开放。">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl font-bold">邀请码</h2>
        <Link
          to="/contests"
          className="text-sm font-medium text-moss underline-offset-2 hover:underline"
        >
          ← 比赛
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="mb-8 flex flex-wrap items-end gap-3 rounded-md border border-ink/10 bg-paper/60 px-4 py-3"
      >
        <label className="text-sm">
          <span className="text-ink/60">备注</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${fieldClass} w-56`}
            placeholder="可选"
          />
        </label>
        <label className="text-sm">
          <span className="text-ink/60">可用次数</span>
          <input
            type="number"
            min={1}
            max={1000}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            className={`${fieldClass} w-24`}
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-moss px-4 py-2 font-medium text-paper hover:bg-moss-deep disabled:opacity-40"
        >
          生成邀请码
        </button>
      </form>

      <ul className="space-y-2">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper/70 px-4 py-3"
          >
            <div>
              <div className="font-mono text-lg font-bold tracking-wide">
                {invite.code}
              </div>
              <p className="text-xs text-ink/50">
                {invite.usedCount}/{invite.maxUses} 次
                {invite.note ? ` · ${invite.note}` : ""}
                {invite.expiresAt
                  ? ` · 过期 ${new Date(invite.expiresAt).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={() => void copyInvite(invite)}
                className="text-moss underline-offset-2 hover:underline"
              >
                {copied === invite.id ? "已复制" : "复制"}
              </button>
              <button
                type="button"
                onClick={() => void onDelete(invite.id)}
                className="text-clay underline-offset-2 hover:underline"
              >
                作废
              </button>
            </div>
          </li>
        ))}
        {invites.length === 0 && (
          <li className="rounded-md border border-dashed border-ink/15 px-4 py-8 text-sm text-ink/50">
            还没有邀请码。用上方表单生成一张。
          </li>
        )}
      </ul>
    </SiteShell>
  );
}
