import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authErrorMessage, resetPassword } from "../auth-client";
import { SiteShell } from "../SiteShell";

const fieldClass =
  "mt-1 w-full rounded-md border border-ink/15 bg-paper/80 px-3 py-2 outline-none focus:border-moss";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    if (!token) {
      setError("缺少重置令牌，请重新申请忘记密码。");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err, "重置失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell subtitle="设置新密码后即可重新登录。">
      <h2 className="mb-4 font-display text-2xl font-bold">重置密码</h2>
      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}
      {done ? (
        <p className="max-w-sm text-sm text-ink/70">
          密码已更新。{" "}
          <Link to="/login" className="text-moss hover:underline">
            去登录
          </Link>
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="max-w-sm space-y-3">
          <label className="block text-sm">
            <span className="text-ink/70">新密码</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={fieldClass}
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/70">确认密码</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={fieldClass}
              required
              minLength={8}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !token}
            className="w-full rounded-md bg-moss px-4 py-2.5 font-medium text-paper transition hover:bg-moss-deep disabled:opacity-40"
          >
            {busy ? "请稍候…" : "更新密码"}
          </button>
        </form>
      )}
    </SiteShell>
  );
}
