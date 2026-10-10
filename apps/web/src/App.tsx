import { Loader2 } from "lucide-react";
import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { HomePage } from "./pages/HomePage";
import { SiteShell } from "./SiteShell";

/** A page loaded on first visit, so the home page doesn't download every other page. */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

const ContestDetailPage = page(() => import("./pages/ContestDetailPage"), "ContestDetailPage");
const ContestListPage = page(() => import("./pages/ContestListPage"), "ContestListPage");
const ForgotPasswordPage = page(() => import("./pages/ForgotPasswordPage"), "ForgotPasswordPage");
const GameLobbyPage = page(() => import("./pages/GameLobbyPage"), "GameLobbyPage");
const InvitesPage = page(() => import("./pages/InvitesPage"), "InvitesPage");
const LoginPage = page(() => import("./pages/LoginPage"), "LoginPage");
const MatchPage = page(() => import("./pages/MatchPage"), "MatchPage");
const RegisterPage = page(() => import("./pages/RegisterPage"), "RegisterPage");
const ResetPasswordPage = page(() => import("./pages/ResetPasswordPage"), "ResetPasswordPage");

function PageLoading() {
  return (
    <SiteShell>
      <div className="flex justify-center py-24">
        <Loader2 className="animate-spin text-moss" size={28} />
      </div>
    </SiteShell>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/admin/invites" element={<InvitesPage />} />
          <Route path="/contests" element={<ContestListPage />} />
          <Route path="/contests/:contestId" element={<ContestDetailPage />} />
          <Route path="/games/:gameId" element={<GameLobbyPage />} />
          <Route path="/matches/:matchId" element={<MatchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
