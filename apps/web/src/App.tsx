import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ContestDetailPage } from "./pages/ContestDetailPage";
import { ContestListPage } from "./pages/ContestListPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { GameLobbyPage } from "./pages/GameLobbyPage";
import { HomePage } from "./pages/HomePage";
import { InvitesPage } from "./pages/InvitesPage";
import { LoginPage } from "./pages/LoginPage";
import { MatchPage } from "./pages/MatchPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";

export function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
