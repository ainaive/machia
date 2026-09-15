import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ContestDetailPage } from "./pages/ContestDetailPage";
import { ContestListPage } from "./pages/ContestListPage";
import { GameLobbyPage } from "./pages/GameLobbyPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MatchPage } from "./pages/MatchPage";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage mode="login" />} />
        <Route path="/register" element={<LoginPage mode="register" />} />
        <Route path="/contests" element={<ContestListPage />} />
        <Route path="/contests/:contestId" element={<ContestDetailPage />} />
        <Route path="/games/:gameId" element={<GameLobbyPage />} />
        <Route path="/matches/:matchId" element={<MatchPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
