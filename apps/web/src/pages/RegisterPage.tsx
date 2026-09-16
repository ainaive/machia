import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { authErrorMessage, signUpWithInvite } from "../auth-client";
import { SiteShell } from "../SiteShell";

const fieldClass =
  "mt-1 w-full rounded-md border border-ink/15 bg-paper/80 px-3 py-2 outline-none focus:border-moss";

function redirectAfterAuth(from: unknown): string {
  return typeof from === "string" && from.startsWith("/") ? from : "/contests";
}

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const preset = new URLSearchParams(location.search).get("code") ?? "";
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(preset);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signUpWithInvite({
        email: email.trim(),
        username: username.trim(),
        password,
        inviteCode: invite.trim(),
      });
      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(redirectAfterAuth(from), { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, "注册失败"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell subtitle="目前仅邀请码注册，暂不对公众开放。">
      <h2 className="mb-4 font-display text-2xl font-bold">注册</h2>
      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="max-w-sm space-y-3">
        <label className="block text-sm">
          <span className="text-ink/70">邀请码</span>
          <input
            value={invite}
            onChange={(e) => setInvite(e.target.value.toUpperCase())}
            autoComplete="off"
            className={fieldClass}
            required
            placeholder="由管理员发放"
          />
        </label>
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
        <label className="block text-sm">
          <span className="text-ink/70">用户名</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className={fieldClass}
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            title="3–32 位字母、数字或下划线"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">密码</span>
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
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-moss px-4 py-2.5 font-medium text-paper transition hover:bg-moss-deep disabled:opacity-40"
        >
          {busy ? "请稍候…" : "注册"}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink/60">
        已有账号？{" "}
        <Link to="/login" className="text-moss hover:underline">
          去登录
        </Link>
      </p>
    </SiteShell>
  );
}
