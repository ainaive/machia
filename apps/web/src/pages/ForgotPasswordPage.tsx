import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { authErrorMessage, requestPasswordReset } from "../auth-client";
import { SiteShell } from "../SiteShell";

const fieldClass =
  "mt-1 w-full rounded-md border border-ink/15 bg-paper/80 px-3 py-2 outline-none focus:border-moss";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err, "发送失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell subtitle="用注册邮箱接收重置链接。若未配置发信，请联系管理员查看服务器日志。">
      <h2 className="mb-4 font-display text-2xl font-bold">忘记密码</h2>
      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}
      {done ? (
        <p className="max-w-sm text-sm text-ink/70">
          如果该邮箱已注册，你会收到一封重置邮件。没收到的话请稍等片刻，或联系管理员。
        </p>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} className="max-w-sm space-y-3">
          <label className="block text-sm">
            <span className="text-ink/70">邮箱</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={fieldClass}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-moss px-4 py-2.5 font-medium text-paper transition hover:bg-moss-deep disabled:opacity-40"
          >
            {busy ? "请稍候…" : "发送重置链接"}
          </button>
        </form>
      )}
      <p className="mt-4 text-sm text-ink/60">
        <Link to="/login" className="text-moss hover:underline">
          返回登录
        </Link>
      </p>
    </SiteShell>
  );
}
