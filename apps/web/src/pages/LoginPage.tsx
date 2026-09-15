import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginAccount, registerAccount } from "../api";
import { useAuth } from "../auth";
import { SiteShell } from "../SiteShell";

function redirectAfterAuth(from: unknown): string {
  return typeof from === "string" && from.startsWith("/") ? from : "/contests";
}

export function LoginPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) await registerAccount(username, password);
      else await loginAccount(username, password);
      await refresh();
      const from = (location.state as { from?: string } | null)?.from;
      navigate(redirectAfterAuth(from), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell
      subtitle={
        isRegister
          ? "创建账号后即可报名比赛、提交 Bot。"
          : "登录后报名比赛、提交 Bot。"
      }
    >
      <h2 className="mb-4 font-display text-2xl font-bold">
        {isRegister ? "注册" : "登录"}
      </h2>
      {error && (
        <div className="mb-4 rounded-md border border-clay/40 bg-[#f7e4d8] px-3 py-2 text-sm text-clay">
          {error}
        </div>
      )}
      <form onSubmit={(e) => void onSubmit(e)} className="max-w-sm space-y-3">
        <label className="block text-sm">
          <span className="text-ink/70">用户名</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="mt-1 w-full rounded-md border border-ink/15 bg-paper/80 px-3 py-2 outline-none focus:border-moss"
            required
            minLength={3}
            maxLength={32}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? "new-password" : "current-password"}
            className="mt-1 w-full rounded-md border border-ink/15 bg-paper/80 px-3 py-2 outline-none focus:border-moss"
            required
            minLength={8}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-moss px-4 py-2.5 font-medium text-paper transition hover:bg-moss-deep disabled:opacity-40"
        >
          {busy ? "请稍候…" : isRegister ? "注册" : "登录"}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink/60">
        {isRegister ? (
          <>
            已有账号？{" "}
            <Link to="/login" className="text-moss hover:underline">
              去登录
            </Link>
          </>
        ) : (
          <>
            没有账号？{" "}
            <Link to="/register" className="text-moss hover:underline">
              注册
            </Link>
          </>
        )}
      </p>
    </SiteShell>
  );
}
